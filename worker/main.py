"""Quink pipeline worker — the ONLY custom backend.

It exists because the pipeline needs FFmpeg (a native binary, unavailable in Supabase
Edge Functions) and runs a ~90s+ job (fragile inside an edge function's wall clock).
Keep it thin: everything else is client<->Supabase (CLAUDE.md §4).

Job pattern (LEARNINGS #3): POST /api/generate returns a job_id immediately; the SPA
polls the Postgres `jobs` row via Supabase directly, so there is no poll endpoint here.
A blocking POST would force the four progress labels to be a timer-driven lie.

It also owns the custom-domain state machine (build spec §4): the transitions + email +
background re-check that can't live in the client. Verification is behind a swappable
interface (real DNS vs stub) so the whole flow is testable locally with no DNS.
"""

import asyncio
import logging
import os
import re
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

import config
import domain
import failures
import lanes
import mailer
import pipeline
import prompts
import purge
from models import (
    DomainConnectRequest,
    DomainKbRequest,
    DomainStubRequest,
    GenerateRequest,
    GenerateResponse,
    InviteEmailRequest,
    RetryRequest,
)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("quink")

# A hostname label chain: docs.acme.com, acme.io. Not exhaustive — a trust-boundary sanity
# check so junk never reaches the state machine.
DOMAIN_RE = re.compile(r"^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$")


ALLOWED_ENVS = ("production", "staging")

# What a non-production worker may spend in a day. Not in config.py: it is a ceiling ON
# a config value, not a setting anyone deploys.
STAGING_SPEND_CAP_USD = 2.0


def _assert_env_coherent() -> None:
    """Refuse to boot into a configuration that can hurt a customer. Raises on the first
    problem, naming the variable AND the environment.

    A worker that does not boot is a page in Render's log. A worker that boots into the
    wrong configuration mails real customers from a staging deploy, or swallows every
    production email into a developer's inbox, and looks healthy the whole time.

    Every rule here is one that CANNOT be caught later: by the time the trial sweep sends,
    the message is already gone.
    """
    env = config.APP_ENV
    if env not in ALLOWED_ENVS:
        raise RuntimeError(
            f"APP_ENV={env!r} is not one of {ALLOWED_ENVS}. Set it on this deploy — "
            "there is no default, because the default would have to be a guess."
        )

    # The staging catch-all. Non-production without it can reach a real address; production
    # WITH it silently redirects every customer email to one inbox, which is the worse of
    # the two and the one nobody notices for a month.
    if not config.IS_PRODUCTION and not config.EMAIL_REDIRECT_TO:
        raise RuntimeError(
            f"EMAIL_REDIRECT_TO is unset on APP_ENV={env!r}. A non-production worker must "
            "not be able to mail a customer — set it to your own address."
        )
    if config.IS_PRODUCTION and config.EMAIL_REDIRECT_TO:
        raise RuntimeError(
            f"EMAIL_REDIRECT_TO={config.EMAIL_REDIRECT_TO!r} is set on APP_ENV={env!r}. "
            "Every customer email would be delivered to that address instead. Unset it."
        )

    # Razorpay. Read from the environment rather than a constant so this rule is armed
    # BEFORE payments land: whatever the key is eventually called, a live key on a
    # non-production deploy takes a real payment. Skipped entirely while none is set.
    if not config.IS_PRODUCTION:
        live = [
            k
            for k, v in os.environ.items()
            if k.startswith("RAZORPAY") and v.startswith("rzp_") and not v.startswith("rzp_test_")
        ]
        if live:
            raise RuntimeError(
                f"{live[0]} is not an rzp_test_ key on APP_ENV={env!r}. A non-production "
                "deploy must never hold a live payment key."
            )

        if config.DAILY_SPEND_CAP_USD > STAGING_SPEND_CAP_USD:
            raise RuntimeError(
                f"DAILY_SPEND_CAP_USD={config.DAILY_SPEND_CAP_USD} exceeds "
                f"{STAGING_SPEND_CAP_USD} on APP_ENV={env!r}. Staging spends real Gemini "
                "money against the same key — cap it low."
            )


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Nothing else runs until the environment is coherent — not the hosting client, not the
    # sweeps. This is the only check whose failure mode is invisible in production.
    _assert_env_coherent()

    # Build the hosting client up front: a deploy missing VERCEL_TOKEN should fail here,
    # not silently accept domains that can never go live.
    domain.hosting()

    # Same failure shape, one layer over: with sending off, mailer logs the payload and
    # returns — which is right in dev and is a broken promise in production ("we'll email
    # you the moment it's live"). It went unnoticed precisely because nothing said so. If
    # we're serving anything but localhost, say which setting is missing, loudly.
    if not mailer.sending_enabled() and any(
        not domain._is_local_origin(o) for o in config.ALLOWED_ORIGINS
    ):
        log.warning(
            "EMAIL IS NOT BEING SENT (%s) while serving %s — the domain-live email is "
            "only logged. Set both on this deploy.",
            "EMAIL_ENABLED unset" if not config.EMAIL_ENABLED else "RESEND_API_KEY unset",
            ", ".join(config.ALLOWED_ORIGINS),
        )

    task = asyncio.create_task(domain.run_loop())
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(title="Quink pipeline worker", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Auth (broken-access-control guard) -------------------------------------
# The worker holds the SERVICE ROLE key, which bypasses every RLS policy. So each
# kb-scoped endpoint MUST prove the caller (a) has a valid Supabase session and
# (b) owns the kb_id it names — otherwise any anon request could drive the pipeline
# or the domain state machine against ANY customer's KB. RLS protects the SPA's
# anon-key path; nothing but these checks protects the worker's service-role path.
def _auth_uid(authorization: str | None) -> str:
    """Validate the Supabase JWT from `Authorization: Bearer <token>` and return the
    user id. get_user() checks the token against the Auth server (LEARNINGS: presence
    of a token is not proof it's valid — always validate server-side)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization[7:].strip()
    try:
        res = pipeline.db().auth.get_user(token)
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid or expired session") from e
    if not res or not res.user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return res.user.id


def _app_origin() -> str:
    """Where the SPA lives, for links we put in email.

    ALLOWED_ORIGINS is the same list CORS is built from, so a link can never point somewhere
    the app does not actually answer. The first NON-local entry wins: a dev worker with both
    configured must still not mail somebody a localhost link.
    """
    for o in config.ALLOWED_ORIGINS:
        if not domain._is_local_origin(o):
            return o
    return config.ALLOWED_ORIGINS[0] if config.ALLOWED_ORIGINS else f"https://{config.READER_DOMAIN}"


def _branding_url(path: str | None) -> str | None:
    """Public URL for a logo. The branding bucket is public by design (migration 0007),
    which is what lets an email client — signed into nothing — render it."""
    if not path:
        return None
    return f"{config.SUPABASE_URL}/storage/v1/object/public/{config.BUCKET_BRANDING}/{path}"


def _kb_owner(kb_id: str) -> str | None:
    res = (
        pipeline.db()
        .table("knowledge_bases")
        .select("owner_id")
        .eq("id", kb_id)
        .maybe_single()
        .execute()
    )
    return (res.data or {}).get("owner_id") if res else None


def _require_owner(authorization: str | None, kb_id: str) -> str:
    """401 if unauthenticated, 403 if the caller doesn't own kb_id. Returns the uid.

    Still the gate for the custom domain: an admin changing the CNAME takes a paying
    customer's help center off the internet, so that stays with the person accountable
    for it. Everything that makes ARTICLES uses _require_editor instead.
    """
    uid = _auth_uid(authorization)
    if _kb_owner(kb_id) != uid:
        raise HTTPException(status_code=403, detail="Not your knowledge base")
    return uid


def _require_editor(authorization: str | None, kb_id: str) -> tuple[str, str]:
    """401 if unauthenticated, 403 if the caller can't edit kb_id. Returns (uid, owner_id).

    The SQL mirror of public.can_edit_kb(): owner, or an active kb_members row. Written
    out here rather than called as an rpc because the worker holds the service role and
    auth.uid() is null in that context — the function would answer for nobody.

    Returns the OWNER too, because every entitlement resolves through them and the caller
    is not necessarily them (team-access-spec §4). A free-plan admin inside a paid help
    center spends the owner's runs, not their own.
    """
    uid = _auth_uid(authorization)
    owner = _kb_owner(kb_id)
    if owner is None:
        raise HTTPException(status_code=403, detail="Not your knowledge base")
    if owner != uid:
        member = (
            pipeline.db()
            .table("kb_members")
            .select("user_id")
            .eq("kb_id", kb_id)
            .eq("user_id", uid)
            .is_("removed_at", "null")
            .execute()
        )
        if not member.data:
            raise HTTPException(status_code=403, detail="Not your knowledge base")
    return uid, owner


# --- Entitlements (mvp-dev-plan §4) -----------------------------------------
# One resolver, one config table. Plan is owner-level, so everything keys on the uid the
# auth guard above already established — never on the KB.
def _plan(user_id: str) -> str:
    res = (
        pipeline.db().table("profiles").select("plan").eq("id", user_id).maybe_single().execute()
    )
    plan = (res.data or {}).get("plan") if res else None
    # An unknown plan string falls back to the most restrictive tier rather than crashing
    # or, worse, defaulting open.
    return plan if plan in config.PLANS else config.DEFAULT_PLAN


def _limits(user_id: str) -> dict:
    return config.PLANS[_plan(user_id)]


def _spend_today_usd() -> float:
    """Estimated Gemini spend across ALL users since midnight UTC.

    Reads est_cost_usd, which the pipeline writes as soon as the video duration is known —
    not at the end — so runs still in flight count against the cap. Without that, a burst of
    concurrent jobs all read the same stale total and sail past it together.
    """
    midnight = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    res = (
        pipeline.db()
        .table("jobs")
        .select("est_cost_usd")
        .gte("created_at", midnight.isoformat())
        .execute()
    )
    # ponytail: sums today's rows client-side. Bounded by the cap itself (~250 rows/day at
    # 2¢); move to a SQL aggregate if the cap is ever raised into the thousands.
    return sum(float(r.get("est_cost_usd") or 0) for r in (res.data or []))


def _runs_used(user_id: str, since: datetime | None = None) -> int:
    """Count of runs CHARGED to this user. The ONLY quota query in the codebase.

    count(*) over an append-only ledger, never a decrementing counter: no drift, no repair
    scripts, and deleting an article can't hand a run back (the FK is `set null`, so the
    row survives its article).

    Keys on billed_to_user_id, not user_id: with a second editor, user_id is who pressed
    the button and the two are no longer the same person. Stamped at creation rather than
    joined through kb_id, so an ownership claim never re-bills history to the new owner.
    """
    q = (
        pipeline.db()
        .table("jobs")
        .select("id", count="exact")
        .eq("billed_to_user_id", user_id)
        .eq("counted_against_quota", True)
    )
    if since is not None:
        q = q.gte("created_at", since.isoformat())
    return q.execute().count or 0


@app.get("/health")
def health() -> dict:
    """Identity of the running pipeline, not just liveness — which is why the prompts ride
    along with the model IDs. The eval runner reads them here and logs them into its
    run.json, because its rule is that it never imports pipeline internals
    (eval/README.md). Note this endpoint is unauthenticated: the prompt text is readable
    by anyone who can reach the worker. Deliberate — /health already discloses the model
    IDs, and a reproducible eval record was judged worth more than the secrecy."""
    return {
        "ok": True,
        "video_model": config.VIDEO_MODEL,
        "text_model": config.TEXT_MODEL,
        "domain_verifier": config.DOMAIN_VERIFIER,
        "prompts": prompts.as_sent(),
    }


def _start_run(
    uid: str,
    owner_id: str,
    kb_id: str,
    video_path: str,
    context: dict,
    retry_of: str | None = None,
) -> str:
    """Enforce entitlements, create the job row, return its id.

    Shared by /api/generate and /api/retry so there is exactly ONE gate in front of the
    only path that costs money. A retry that skipped this would be a free run for anyone
    willing to make a job fail first.
    """
    # The worker downloads the video with the service role (bypassing Storage RLS), so
    # a valid owner could otherwise point video_path at ANOTHER KB's storage prefix and
    # have someone else's private recording processed into this one. Objects are keyed
    # "<kb_id>/..." (migration 0014) — pin the path to the KB we just proved they own.
    if not video_path.startswith(f"{kb_id}/"):
        raise HTTPException(status_code=403, detail="That recording isn't yours.")

    # Entitlements resolve through the KB's OWNER, never the caller. `uid` is only who
    # pressed the button.
    limits = _limits(owner_id)

    # 1. Global circuit breaker, before any per-user rule and before any spend. Applies to
    #    `internal` too: a runaway loop on an unlimited account is exactly how the bill we
    #    are protecting against gets run up.
    if _spend_today_usd() >= config.DAILY_SPEND_CAP_USD:
        log.error("DAILY SPEND CAP hit (%s USD) — refusing generations", config.DAILY_SPEND_CAP_USD)
        raise HTTPException(
            status_code=503,
            detail={
                "code": failures.SPEND_CAP,
                "message": "We've hit a temporary processing limit. Nothing's wrong with "
                "your file — try again shortly.",
            },
        )

    # 2. Free tier: a HARD wall. No relationship to protect yet, and the whole ceiling is
    #    ~11 cents. Refused before the job row exists, so no cost is incurred and the
    #    ledger stays a record of runs actually spent.
    if limits["lifetime_runs"] is not None:
        if _runs_used(owner_id) >= limits["lifetime_runs"]:
            # NOT a failure — the SPA turns this into the upgrade modal (pricing-spec §7),
            # never a failure screen. The dropzone checks the same counter before the
            # upload even starts, so reaching here should be rare.
            raise HTTPException(
                status_code=402,
                detail={
                    "code": failures.QUOTA_EXCEEDED,
                    "message": f"You've used all {limits['lifetime_runs']} free video "
                    "guides. You can still write articles by hand, unlimited.",
                },
            )

    # 3. Paid tiers: SOFT. Blocking a paying customer mid-fill in week one is the exact
    #    failure pricing-spec §3 warns about — usage is front-loaded. The run proceeds and
    #    is flagged; at this volume Lee is the overage system.
    over_cap = False
    if limits["monthly_runs"] is not None:
        # ponytail: calendar month, not a per-customer billing anchor. Fine while overage
        # is a conversation rather than an invoice line.
        month_start = datetime.now(timezone.utc).replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        if _runs_used(owner_id, since=month_start) >= limits["monthly_runs"]:
            over_cap = True
            log.warning(
                "owner %s is over their monthly run cap (%s) — allowing, flagged over_cap",
                owner_id,
                limits["monthly_runs"],
            )

    try:
        res = (
            pipeline.db()
            .table("jobs")
            .insert(
                {
                    "kb_id": kb_id,
                    "user_id": uid,
                    # Who pays, stamped once and never recomputed. The KB's owner at THIS
                    # moment — a later ownership claim must not move these runs onto the
                    # new owner's meter.
                    "billed_to_user_id": owner_id,
                    "status": "queued",
                    "stage": config.STAGE_ANALYZING,
                    "over_cap": over_cap,
                    # Recorded HERE, at creation, because a job that fails before Stage 1
                    # never creates an article — and articles.source_video_path is the only
                    # other place this path is kept. Without it a failed upload is stranded
                    # in Storage with nothing in the database naming it.
                    "video_path": video_path,
                    # Persisted so a retry can re-run Stage 1 with the SAME grounding the
                    # user typed. Without it a retry would silently produce a different
                    # article from the same recording.
                    "context": context,
                    "retry_of": retry_of,
                }
            )
            .execute()
        )
    except Exception as e:
        log.exception("could not create job row")
        raise HTTPException(status_code=500, detail=f"Could not start the job: {e}") from e

    return res.data[0]["id"]


@app.post("/api/generate", response_model=GenerateResponse)
def generate(
    req: GenerateRequest,
    background: BackgroundTasks,
    authorization: str | None = Header(default=None),
) -> GenerateResponse:
    """Create the job row, hand the work to the background, return the id immediately.

    This is the ONLY path that costs money, so it is the only place entitlements are
    enforced. The SPA reads the same counters for display, never for permission.
    """
    uid, owner_id = _require_editor(authorization, req.kb_id)
    context = req.context()
    job_id = _start_run(uid, owner_id, req.kb_id, req.video_path, context)
    # user_id + lanes: the background task queues behind this account's other runs rather
    # than joining anyio's 40-wide pool unbounded (lanes.py).
    background.add_task(
        pipeline.run,
        job_id,
        req.kb_id,
        req.video_path,
        context,
        owner_id,
        lanes.lanes_for(_plan(owner_id)),
    )
    return GenerateResponse(job_id=job_id)


def _video_exists(path: str) -> bool:
    """Is the recording still in Storage? CHECKED, never assumed.

    The 7-day sweep may have collected it, or a purge may have taken it early. Asking
    Storage is the only answer that is true right now — and a retry that assumes and then
    dies produces a signed-URL error in the user's face instead of "upload it again"."""
    folder, _, name = path.rpartition("/")
    try:
        objects = pipeline.db().storage.from_(config.BUCKET_VIDEOS).list(folder, {"search": name})
    except Exception:
        log.exception("could not list %s while checking for a retry source", folder)
        return False
    return any((o or {}).get("name") == name for o in objects or [])


@app.post("/api/retry", response_model=GenerateResponse)
def retry(
    req: RetryRequest,
    background: BackgroundTasks,
    authorization: str | None = Header(default=None),
) -> GenerateResponse:
    """Re-run a failed job from the recording already in Storage.

    No re-upload, no new video object, no second file prompt. Entitlements go through
    _start_run like any other run, so a retry is charged exactly like a first attempt —
    which is to say, only if it succeeds.

    The new attempt is its OWN ledger row (`retry_of` points back). That is what keeps
    "one article, one run" true: the failed row never had counted_against_quota set and
    never will, so only the row that actually produces an article can carry the charge.
    """
    job = (
        pipeline.db()
        .table("jobs")
        .select("id, kb_id, status, video_path, video_purged_at, context")
        .eq("id", req.job_id)
        .maybe_single()
        .execute()
    )
    if not job or not job.data:
        # Same answer whether it never existed or isn't ours — a job id must not be a probe.
        raise HTTPException(status_code=404, detail="No such job.")
    j = job.data

    # Ownership is checked against the KB, not jobs.user_id: after an ownership claim the
    # ledger row deliberately stays with the original owner (CLAUDE.md §10d), but the
    # article this produces lands in the CLAIMER's KB and is charged to them.
    uid, owner_id = _require_editor(authorization, j["kb_id"])

    if j["status"] != "error":
        raise HTTPException(status_code=409, detail="That job didn't fail.")

    if not j["video_path"] or j["video_purged_at"] or not _video_exists(j["video_path"]):
        # Past the retention window. Not an error — a clean state with one clear action.
        raise HTTPException(
            status_code=409,
            detail={
                "code": failures.VIDEO_PURGED,
                "message": "This recording is no longer stored — please upload it again.",
            },
        )

    context = j.get("context") or {}
    job_id = _start_run(uid, owner_id, j["kb_id"], j["video_path"], context, retry_of=j["id"])
    background.add_task(
        pipeline.run,
        job_id,
        j["kb_id"],
        j["video_path"],
        context,
        owner_id,
        lanes.lanes_for(_plan(owner_id)),
    )
    return GenerateResponse(job_id=job_id)


# --- Custom domain (build spec §4) ------------------------------------------
KB_DOMAIN_COLUMNS = "id, owner_id, subdomain, custom_domain, domain_status, domain_attempts"


def _kb(kb_id: str) -> dict:
    res = (
        pipeline.db()
        .table("knowledge_bases")
        .select(KB_DOMAIN_COLUMNS)
        .eq("id", kb_id)
        .maybe_single()
        .execute()
    )
    if not res or not res.data:
        raise HTTPException(status_code=404, detail="KB not found")
    return res.data


@app.post("/api/domain/connect")
def domain_connect(
    req: DomainConnectRequest, authorization: str | None = Header(default=None)
) -> dict:
    """Attach a custom domain and enter `pending`. Never touches the free subdomain, so the
    KB stays online throughout (build spec §4). Returns the DNS records to add."""
    uid = _require_owner(authorization, req.kb_id)
    d = req.domain.strip().lower().rstrip(".")
    if not DOMAIN_RE.match(d):
        raise HTTPException(status_code=400, detail="That doesn't look like a domain.")
    # Our own hosts are not up for grabs: reader_kb resolves a request host to whichever KB
    # claims it, so letting someone register app.quink.online would hand them the app's
    # traffic. The free {subdomain}.quink.online is already theirs and needs no connecting.
    if d == config.READER_DOMAIN or d.endswith(f".{config.READER_DOMAIN}"):
        raise HTTPException(
            status_code=400,
            detail=f"{config.READER_DOMAIN} addresses are built in — use your own domain.",
        )

    kb = _kb(req.kb_id)
    # Custom domains are the paid wall (pricing-spec §Free: "No custom domain"). Off until
    # checkout exists — see DOMAIN_REQUIRES_PAID_PLAN. The entitlement is the owner's, read
    # from the one PLANS table.
    if config.DOMAIN_REQUIRES_PAID_PLAN and not _limits(uid)["custom_domain"]:
        raise HTTPException(
            status_code=402, detail="Connecting your own domain is part of a paid plan."
        )
    # `custom_domain` is unique, so the DB is the real referee; check first only to answer
    # with something a human can act on instead of a constraint violation.
    taken = (
        pipeline.db()
        .table("knowledge_bases")
        .select("id")
        .eq("custom_domain", d)
        .neq("id", req.kb_id)
        .execute()
    )
    if taken.data:
        raise HTTPException(status_code=409, detail="That domain is already connected.")

    # Register with the host BEFORE touching the DB: if this fails the KB is untouched
    # rather than parked in `pending` against a domain that can never go live.
    previous = kb.get("custom_domain")
    try:
        records = domain.hosting().attach(d)
    except domain.DomainError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

    try:
        pipeline.db().table("knowledge_bases").update(
            {
                "custom_domain": d,
                "domain_status": "pending",
                "domain_error": None,
                "domain_last_checked_at": None,
                "domain_attempts": 0,
            }
        ).eq("id", req.kb_id).execute()
    except Exception as e:
        # Lost the race on the unique index between the check above and here.
        domain.hosting().detach(d)
        log.exception("could not save custom domain")
        raise HTTPException(status_code=409, detail="That domain is already connected.") from e

    # Swapping domains: release the old one, or it keeps serving this KB forever. Only once
    # the row is committed — releasing it first would take a live domain down if the write
    # then lost the race on the unique index.
    if previous and previous != d:
        domain.hosting().detach(previous)
    return {"status": "pending", "records": records}


@app.post("/api/invite/email")
def invite_email(
    req: InviteEmailRequest,
    authorization: str | None = Header(default=None),
) -> dict:
    """Mail a team invite that has ALREADY been created.

    Creating the invite is `invite_to_kb()`, an rpc the SPA calls with the user's own
    session — which is what proves who is inviting and enforces the owner's plan. This
    endpoint deliberately cannot create one: the worker holds the service role, so
    `auth.uid()` is null here and any invite it wrote would be an invite nobody authorised.
    It only delivers.

    That split is also §10h's rule about email never being part of a transaction: the row
    is committed before this is called, and a refusal here loses a message, never a member.
    """
    uid, _owner = _require_editor(authorization, req.kb_id)
    address = req.email.strip().lower()

    invite = (
        pipeline.db()
        .table("kb_invites")
        .select("id, token, expires_at")
        .eq("kb_id", req.kb_id)
        .eq("email", address)
        .is_("accepted_at", "null")
        .is_("revoked_at", "null")
        .execute()
    )
    row = (invite.data or [None])[0]
    if not row:
        # Nothing live to send. Not an error worth a screen: the People list is about to be
        # re-read anyway and will show the truth.
        raise HTTPException(status_code=404, detail="No live invite for that address.")

    kb = (
        pipeline.db()
        .table("knowledge_bases")
        .select("name, primary_color, logo_path")
        .eq("id", req.kb_id)
        .maybe_single()
        .execute()
    )
    k = (kb.data or {}) if kb else {}

    # Who it is FROM, in the recipient's words. The address is the only name we reliably
    # have — profiles carries no display name — so the local part is the fallback, exactly
    # as the People screen renders it.
    sender = (
        pipeline.db().table("profiles").select("email").eq("id", uid).maybe_single().execute()
    )
    inviter_email = ((sender.data or {}) if sender else {}).get("email") or ""
    inviter = inviter_email.split("@")[0] or "A teammate"

    subject, text, html = mailer.team_invite(
        inviter=inviter,
        kb_name=k.get("name") or "a help center",
        url=f"{_app_origin()}/invite/{row['token']}",
        color=k.get("primary_color"),
        logo_url=_branding_url(k.get("logo_path")),
    )
    # marker=None: this is a user action that must be repeatable — "Resend" exists precisely
    # because the first mail gets lost, filtered or deleted. A persisted marker here would
    # make the button a lie. The once-only rule it is exempt from covers sends that fire
    # from a LOOP or a sweep (§10h); nothing loops over invites.
    sent = mailer.send_once(address, subject, text, marker=None, html=html)
    return {"sent": sent}


@app.post("/api/domain/records")
def domain_records(
    req: DomainKbRequest, authorization: str | None = Header(default=None)
) -> dict:
    """The DNS records for the already-connected domain. Connect returns them once, but DNS
    takes hours — the user will close the tab and come back, and the instructions have to
    still be there. attach() is idempotent, so this is a re-read, not a re-registration."""
    _require_owner(authorization, req.kb_id)
    kb = _kb(req.kb_id)
    d = kb.get("custom_domain")
    if not d:
        raise HTTPException(status_code=400, detail="No domain connected.")
    try:
        return {"status": kb.get("domain_status"), "records": domain.hosting().attach(d)}
    except domain.DomainError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e


@app.post("/api/domain/check")
def domain_check(
    req: DomainKbRequest, authorization: str | None = Header(default=None)
) -> dict:
    """Run the readiness check once now (the "check again" button). The background loop does
    this on a backoff anyway, but users want an immediate answer."""
    _require_owner(authorization, req.kb_id)
    kb = _kb(req.kb_id)
    if not kb.get("custom_domain"):
        raise HTTPException(status_code=400, detail="No domain to check.")
    return {"status": domain.check_once(kb)}


@app.post("/api/domain/disconnect")
def domain_disconnect(
    req: DomainKbRequest, authorization: str | None = Header(default=None)
) -> dict:
    _require_owner(authorization, req.kb_id)
    kb = _kb(req.kb_id)
    if kb.get("custom_domain"):
        # Release the host too — otherwise it stays bound to our project, keeps serving,
        # and blocks the owner from connecting it anywhere else.
        domain.hosting().detach(kb["custom_domain"])
    pipeline.db().table("knowledge_bases").update(
        {
            "custom_domain": None,
            "domain_status": "none",
            "domain_error": None,
            "domain_attempts": 0,
        }
    ).eq("id", req.kb_id).execute()
    return {"status": "none"}


@app.post("/api/account/delete")
def account_delete(authorization: str | None = Header(default=None)) -> dict:
    """Delete the CALLER's account and everything it owns (DPDP right to withdraw consent).

    THE ENDPOINT TAKES NO BODY. Not an oversight — the account being deleted is derived from
    the JWT and there is deliberately no parameter that could name a different one. §10e.1:
    a privileged operation that accepts the acting identity as an argument hands the caller
    the exact thing the check exists to prove, and that has been the root cause of two
    escalation holes here already. A body is still accepted and ignored by FastAPI, so
    posting someone else's user id deletes YOUR account — which is the intended answer.

    Refusals come back as 409 with a message written for the user: every one of them says
    what to do next, because the alternative to self-serve deletion is a support ticket and
    a dead end teaches people to send one anyway.
    """
    uid = _auth_uid(authorization)
    try:
        return purge.delete_account(uid)
    except purge.Refused as e:
        raise HTTPException(status_code=409, detail=str(e)) from e


@app.post("/api/domain/stub")
def domain_stub(req: DomainStubRequest) -> dict:
    """DEV ONLY: make the stub verifier report `domain` as resolving (or not), so every
    transition is drivable by hand locally. 400s if the real DNS verifier is active."""
    try:
        domain.stub().set(req.domain.strip().lower(), req.resolves)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"ok": True, "domain": req.domain, "resolves": req.resolves}


@app.get("/reader/{slug}/sitemap.xml")
def sitemap(slug: str) -> Response:
    """Sitemap from LISTED articles only (build spec §3). Served by the worker because a
    static SPA can't emit a per-KB dynamic sitemap. Noindexed KBs get an empty urlset, so
    nothing free (or any internal demo) is advertised to crawlers."""
    kb = (
        pipeline.db()
        .table("knowledge_bases")
        .select("id, owner_id, subdomain, custom_domain, domain_status")
        .eq("subdomain", slug)
        .maybe_single()
        .execute()
    )
    if not kb or not kb.data:
        raise HTTPException(status_code=404, detail="Unknown help center")
    k = kb.data
    base_host = (
        k["custom_domain"]
        if k.get("domain_status") == "live" and k.get("custom_domain")
        else f"{k['subdomain']}.{config.READER_DOMAIN}"
    )
    urls: list[str] = []
    if not _limits(k["owner_id"])["noindex"]:
        arts = pipeline.db().rpc("reader_articles", {"p_kb_id": k["id"]}).execute()
        for a in arts.data or []:
            urls.append(f"  <url><loc>https://{base_host}/{a['slug']}</loc></url>")
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls)
        + "\n</urlset>\n"
    )
    return Response(content=body, media_type="application/xml")
