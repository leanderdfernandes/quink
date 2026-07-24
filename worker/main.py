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
import re
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

import config
import domain
import pipeline
import prompts
from models import (
    DomainConnectRequest,
    DomainKbRequest,
    DomainStubRequest,
    GenerateRequest,
    GenerateResponse,
)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("quink")

# A hostname label chain: docs.acme.com, acme.io. Not exhaustive — a trust-boundary sanity
# check so junk never reaches the state machine.
DOMAIN_RE = re.compile(r"^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Build the hosting client up front: a deploy missing VERCEL_TOKEN should fail here,
    # not silently accept domains that can never go live.
    domain.hosting()
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


def _require_owner(authorization: str | None, kb_id: str) -> str:
    """401 if unauthenticated, 403 if the caller doesn't own kb_id. Returns the uid."""
    uid = _auth_uid(authorization)
    res = (
        pipeline.db()
        .table("knowledge_bases")
        .select("owner_id")
        .eq("id", kb_id)
        .maybe_single()
        .execute()
    )
    if not res or not res.data or res.data["owner_id"] != uid:
        raise HTTPException(status_code=403, detail="Not your knowledge base")
    return uid


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


@app.post("/api/generate", response_model=GenerateResponse)
def generate(
    req: GenerateRequest,
    background: BackgroundTasks,
    authorization: str | None = Header(default=None),
) -> GenerateResponse:
    """Create the job row, hand the work to the background, return the id immediately."""
    uid = _require_owner(authorization, req.kb_id)
    # The worker downloads the video with the service role (bypassing Storage RLS), so
    # a valid owner could otherwise point video_path at ANOTHER user's storage prefix and
    # have their private recording processed into this KB. Videos are keyed "<uid>/..."
    # (see App.tsx uploadVideo) — pin the path to the caller's own prefix.
    if not req.video_path.startswith(f"{uid}/"):
        raise HTTPException(status_code=403, detail="That recording isn't yours.")
    try:
        res = (
            pipeline.db()
            .table("jobs")
            .insert({"kb_id": req.kb_id, "status": "queued", "stage": config.STAGE_ANALYZING})
            .execute()
        )
    except Exception as e:
        log.exception("could not create job row")
        raise HTTPException(status_code=500, detail=f"Could not start the job: {e}") from e

    job_id = res.data[0]["id"]
    background.add_task(pipeline.run, job_id, req.kb_id, req.video_path, req.context())
    return GenerateResponse(job_id=job_id)


# --- Custom domain (build spec §4) ------------------------------------------
KB_DOMAIN_COLUMNS = "id, subdomain, custom_domain, domain_status, domain_attempts, plan"


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
    _require_owner(authorization, req.kb_id)
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
    # checkout exists — see DOMAIN_REQUIRES_PAID_PLAN.
    if config.DOMAIN_REQUIRES_PAID_PLAN and kb.get("plan") not in config.PAID_PLANS:
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
    static SPA can't emit a per-KB dynamic sitemap. Free-tier KBs get an empty urlset (they
    render noindex), so nothing free is advertised to crawlers."""
    kb = (
        pipeline.db()
        .table("knowledge_bases")
        .select("id, subdomain, custom_domain, domain_status, plan")
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
    if k.get("plan") != "free":
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
