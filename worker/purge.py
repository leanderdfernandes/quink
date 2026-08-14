"""Destroying data — the ONE implementation, shared by every path that deletes.

Two callers, and there must never be a third implementation:

  * `trial.sweep()` — the day-37 hard delete at the end of the free-trial wind-down.
  * `delete_account()` — self-serve account deletion (DPDP right to withdraw consent),
    driven by POST /api/account/delete.

Why one function rather than two obvious ones: two deletion paths drift, and the one that
drifts is the one that leaves a customer's video in a bucket after we told them it was gone.
The buckets to clear and the prefix to clear them under are decided in exactly one place
(`config.KB_BUCKETS` + `purge_kb`), so a fourth bucket added later is handled by both paths
without either being edited.

This runs on the worker, never the client. Deleting `auth.users` and deleting storage
objects both need the service role, and the browser must never hold that key.

WHY THE RECURSIVE LISTER EXISTS — this was a live bug, not a refactor flourish. The previous
purge did `store.list(kb_id)` and removed whatever came back. Storage's list returns the
IMMEDIATE children of a prefix, and frames are nested three deep:

    frames/{kb_id}/{article_id}/step-3.webp
    frames/{kb_id}/{article_id}/dense/00042.webp

so every top-level entry under a KB's frames prefix is a pseudo-folder, and `remove()` on a
folder name deletes nothing. Verified against live Storage: every frame of every KB survived
the purge. `videos` and `branding` are flat and did get cleared, which is precisely why the
gap was invisible — the paths people check by hand were the working ones. The list call is
also capped at 100 entries per page with no auto-pagination, so even the flat buckets
truncated for any KB with more than 100 objects.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx

import config

log = logging.getLogger("quink.purge")

# Storage list pages at 100 by default and does not auto-paginate. Named because the loop
# below uses it as its own "was that the last page?" test.
_PAGE = 100

# Storage remove() takes a list; a KB with a few thousand frames would otherwise go out as
# one enormous request body. Chunked purely so the request stays a sane size.
_REMOVE_CHUNK = 100

# Jobs columns wiped when their owner is deleted. Everything NOT listed here survives on
# purpose — see delete_account().
#
# `user_id` / `kb_id` / `article_id` are absent deliberately: their FKs are already
# `on delete set null` (0014/0017/0022), so the database nulls them itself. Listing them
# here too would be a second mechanism doing the same job, and the FK is the one that also
# covers the trial purge and every future deletion path.
_JOB_SCRUB = {
    # Log-only, never exposed to clients (0020) — but it can quote a filename or a model
    # response, which is the user's content.
    "failure_detail": None,
    # The grounding they typed: product name, description, audience. Free text about their
    # own product, which is squarely "anything personal" under the rule this scrub follows.
    "context": None,
    # Names an object under {kb_id}/ that this deletion just removed. Retaining the string
    # is harmless but it is a pointer to deleted data, and cost history does not need it.
    "video_path": None,
}


class Refused(Exception):
    """The deletion was declined before anything was destroyed. The message is shown to the
    user verbatim, so it always says what to do next."""


def _db():
    import pipeline  # lazy: keeps the heavy pipeline module out of import time

    return pipeline.db()


# --- Operator alerts --------------------------------------------------------------------
def notify_ops(text: str) -> bool:
    """Fire-and-forget Telegram ping. NEVER raises — an alert failing must not fail the
    operation it is reporting on, for the same reason email is never part of a transaction
    (§10h). Returns True if it went out (or was logged, when sending is disabled).

    Unconfigured it logs at WARNING, so a dev run exercises this call path without needing a
    bot. Same consent shape as EMAIL_ENABLED: both env vars, or nothing is sent.
    """
    if not (config.TELEGRAM_BOT_TOKEN and config.TELEGRAM_CHAT_ID):
        log.warning("OPS ALERT (not sent: no TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID): %s", text)
        return True
    try:
        r = httpx.post(
            f"https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": config.TELEGRAM_CHAT_ID, "text": text},
            timeout=10,
        )
        if r.status_code >= 300:
            log.error("telegram refused alert (%s): %s", r.status_code, r.text[:200])
            return False
        return True
    except Exception:
        log.exception("could not send ops alert")
        return False


# --- The shared purge -------------------------------------------------------------------
def _object_paths(bucket: str, prefix: str) -> list[str]:
    """Every real OBJECT under `prefix`, recursively, fully paginated.

    Storage has no true directories: an entry with a null `id` is a pseudo-folder inferred
    from a path segment, and only entries WITH an id are removable objects. Getting that
    discriminator wrong in either direction is bad — treating folders as files silently
    deletes nothing (the old bug), treating files as folders recurses forever.
    """
    store = _db().storage.from_(bucket)
    found: list[str] = []
    stack = [prefix]
    while stack:
        path = stack.pop()
        offset = 0
        while True:
            page = store.list(path, {"limit": _PAGE, "offset": offset}) or []
            for entry in page:
                child = f"{path}/{entry['name']}"
                (found if entry.get("id") else stack).append(child)
            if len(page) < _PAGE:
                break
            offset += _PAGE
    return found


def purge_kb_storage(kb_id: str) -> bool:
    """Delete every object this KB owns, in every bucket. True only if ALL of it went.

    Returns False rather than raising: both callers need to keep the KB row alive on a
    failure so the objects stay reachable and the next attempt can find them. An orphaned
    object is a cost we can still fix; a deleted row with live objects is unreachable
    garbage we keep paying for and — the part that matters after telling someone their data
    is gone — still hold.
    """
    for bucket in config.KB_BUCKETS:
        try:
            paths = _object_paths(bucket, kb_id)
            store = _db().storage.from_(bucket)
            for i in range(0, len(paths), _REMOVE_CHUNK):
                store.remove(paths[i : i + _REMOVE_CHUNK])
            if paths:
                log.info("purge: cleared %s object(s) from %s/%s", len(paths), bucket, kb_id)
        except Exception:
            log.exception("purge: could not clear %s/%s", bucket, kb_id)
            return False
    return True


def purge_kb(kb_id: str) -> bool:
    """THE hard delete for one help center: storage objects, then the row.

    Articles, steps and folders go with the row via their existing cascades; the `jobs`
    ledger keeps its rows and has `kb_id` nulled by its own FK (§10i — the day-37 purge is
    the first path that deletes a KB, and under the old cascade it handed back every free
    run that owner had ever spent).

    Order is not stylistic. The KB row is what names the storage prefix, so deleting it
    first strands the objects with nothing pointing at them — invisible to both collection
    paths, exactly the way retention.py deletes an object BEFORE nulling its path.

    Returns False (and leaves the row intact) if storage could not be cleared.
    """
    if not purge_kb_storage(kb_id):
        return False
    _db().table("knowledge_bases").delete().eq("id", kb_id).execute()
    return True


# --- Account deletion -------------------------------------------------------------------
def _refuse_if_not_deletable(uid: str) -> dict:
    """Every reason to decline, checked before ANYTHING is destroyed. Returns the profile."""
    res = (
        _db()
        .table("profiles")
        .select("id, email, plan, is_admin")
        .eq("id", uid)
        .maybe_single()
        .execute()
    )
    profile = (res.data if res else None) or {}
    if not profile:
        raise Refused("That account no longer exists.")

    plan = profile.get("plan") or config.DEFAULT_PLAN
    if plan not in config.SELF_DELETE_PLANS:
        # TODO(payments): once subscription state is webhook-driven this becomes "cancel the
        # mandate, wait for the webhook to land, THEN delete" — the check moves from `plan`
        # to the absence of an active mandate, because a cancelled-in-our-DB subscription
        # whose webhook has not arrived is still debiting the customer.
        raise Refused(
            "Cancel your subscription first, or email "
            f"{config.SUPPORT_EMAIL} and we'll do both."
        )

    if profile.get("is_admin"):
        raise Refused("Admin accounts can't be deleted from here.")

    kbs = (
        _db()
        .table("knowledge_bases")
        .select("id, name, subdomain, custom_domain, domain_status")
        .eq("owner_id", uid)
        .execute()
    ).data or []

    # A job writing rows into a KB being deleted underneath it crashes the worker and
    # strands the frames it had already uploaded — after the prefix was walked, so nothing
    # ever collects them. Both non-terminal statuses count: `queued` has a lane waiting and
    # will start on its own.
    if kbs:
        running = (
            _db()
            .table("jobs")
            .select("id", count="exact")
            .in_("kb_id", [k["id"] for k in kbs])
            .in_("status", ["queued", "running"])
            .limit(1)
            .execute()
        )
        if running.count:
            raise Refused(
                "One of your recordings is still being turned into an article. "
                "Wait for it to finish, then try again."
            )
    return {**profile, "kbs": kbs}


def delete_account(uid: str) -> dict:
    """Delete this account and everything it owns. `uid` comes from the caller's JWT and
    from nowhere else — see main.py.

    THE ORDER IS THE DESIGN. Each step destroys the key the previous one needed:

      1. read and hold — after step 6 the email address, the KB ids and the domains are
         unrecoverable, so nothing may be looked up lazily after that point;
      2. detach custom domains — if this is skipped the domain stays claimed on our Vercel
         project forever and NOBODY, including the owner, can ever attach it again. It runs
         first among the destructive steps because it is the only one that can fail while
         everything is still intact, so aborting here is free;
      3. scrub the jobs ledger — MUST precede steps 4/5: `jobs` is found BY `user_id`, and
         deleting the profile nulls it. After that the rows exist and are unfindable;
      4. storage objects, then rows, one KB at a time, through the shared `purge_kb`;
      5. `auth.users`. Leave it and they can still sign in to an empty account, which looks
         exactly like data loss rather than deletion;
      6. confirmation email LAST, to the address held since step 1. Sending it earlier
         would announce a deletion that steps 3-5 could still fail to perform.
    """
    profile = _refuse_if_not_deletable(uid)
    email, kbs = profile.get("email"), profile["kbs"]
    kb_ids = [k["id"] for k in kbs]
    kb_names = [k.get("name") or "Untitled" for k in kbs]
    domains = [k["custom_domain"] for k in kbs if k.get("custom_domain")]
    articles = 0
    if kb_ids:
        articles = (
            _db().table("articles").select("id", count="exact").in_("kb_id", kb_ids).execute()
        ).count or 0

    # --- 2. Vercel. Abort the whole deletion on failure; nothing is destroyed yet. -------
    # hosting().detach() deliberately swallows its own errors (a failed detach must not
    # break /api/domain/disconnect), so a return value proves nothing here — the read-back
    # is what makes "aborts on failure" true rather than aspirational. `servable` is on the
    # Hosting protocol, so this works against the stub as well as Vercel.
    import domain as domain_mod

    for d in domains:
        try:
            domain_mod.hosting().detach(d)
            if domain_mod.hosting().servable(d):
                raise RuntimeError("still attached after detach")
        except Exception as e:
            log.exception("account %s: aborting deletion, could not release %s", uid, d)
            raise Refused(
                f"We couldn't release {d} from our hosting, so nothing was deleted. "
                f"Try again in a few minutes, or email {config.SUPPORT_EMAIL}."
            ) from e

    # --- 3. Anonymise the run ledger (§10b: append-only, drives the spend breaker) -------
    # Kept, not deleted: `created_at`, `status`, `failure_code`, `est_cost_usd`,
    # `counted_against_quota` and the timings are our own cost history, and deleting them
    # would silently rewrite it. The identifying columns are nulled by their FKs a moment
    # from now; what the FKs cannot reach is the free text, which is what this update is for.
    #
    # BILLING RECORDS ARE DELIBERATELY NOT IN SCOPE HERE. There is no billing table yet, so
    # there is nothing to exclude today — but Indian tax law requires books of account to be
    # retained for years after the transaction, and a deletion request cannot erase an
    # invoice already filed. When `subscriptions` / invoices land, they do NOT get swept in
    # by this function, and the privacy policy must say so.
    if kb_ids:
        _db().table("jobs").update(_JOB_SCRUB).eq("user_id", uid).execute()

    # --- 4. Storage, then rows — one KB at a time, through the shared purge --------------
    for kb_id in kb_ids:
        if not purge_kb(kb_id):
            raise Refused(
                "We couldn't delete all of your files, so the account was left in place. "
                f"Try again, or email {config.SUPPORT_EMAIL} and we'll finish it by hand."
            )

    # --- 5. The auth user last. Cascades profiles -> anything the loop above missed. -----
    _db().auth.admin.delete_user(uid)

    log.warning(
        "account %s deleted: %s kb(s), %s article(s), %s domain(s)",
        uid, len(kb_ids), articles, len(domains),
    )

    # --- 6. The confirmation, AFTER the deletion, to the address held since step 1 -------
    # Sending first bought nothing — the address is already in memory — and a failure
    # anywhere in steps 3-5 would have told someone their account was gone while they could
    # still sign in. That is the worst thing a deletion email can be wrong about.
    #
    # `marker=None`: there is no row left to mark. The profile is gone, so a marker claim
    # would match zero rows and send nothing at all. It is also unnecessary — this fires
    # once, from a user action, and cannot be retried because the account no longer exists.
    #
    # And because it cannot be retried, a failed send is UNRECOVERABLE: nothing in the
    # database will ever again know this address existed. So the alert below is not a nicety,
    # it is the only surviving record that a deletion happened and the confirmation did not
    # land — the one thing someone would need to send it by hand.
    if email:
        import mailer

        if not mailer.send_once(
            email, *mailer.account_deleted(kb_names, articles), marker=None
        ):
            log.error("account %s deleted but the confirmation email did NOT send", uid)
            notify_ops(
                "DELETION CONFIRMATION FAILED — send this by hand\n"
                f"{email}\n"
                f"deleted: {len(kb_ids)} help center(s) ({', '.join(kb_names) or '—'}), "
                f"{articles} article(s), {len(domains)} domain(s) released\n"
                "The account is gone. This alert is the only record of the address."
            )

    notify_ops(
        "Account deleted\n"
        f"{email or '(no email)'}\n"
        f"plan: {profile.get('plan')}\n"
        f"{len(kb_ids)} help center(s): {', '.join(kb_names) or '—'}\n"
        f"{articles} article(s), {len(domains)} custom domain(s) released\n"
        f"{datetime.now(timezone.utc).isoformat(timespec='seconds')}"
    )
    return {"deleted": True, "knowledge_bases": len(kb_ids), "articles": articles}


# --- Self-check -------------------------------------------------------------------------
def demo() -> None:
    """`python purge.py`. No network, no DB.

    The one thing worth proving with fakes is the lister, because that is where the real bug
    was and it is invisible in production: it deletes nothing and logs nothing wrong.
    """
    # A three-level frames tree, the shape live Storage actually returns. Folders have a
    # null id; objects have one.
    tree = {
        "kb1": [{"name": "art1", "id": None}, {"name": "art2", "id": None}],
        "kb1/art1": [
            {"name": "dense", "id": None},
            {"name": "step-1.webp", "id": "o1"},
            {"name": "step-2.webp", "id": "o2"},
        ],
        "kb1/art1/dense": [{"name": f"{i:05d}.webp", "id": f"d{i}"} for i in range(150)],
        "kb1/art2": [{"name": "step-1.webp", "id": "o3"}],
    }
    removed: list[str] = []

    class _Store:
        def __init__(self, bucket):
            self.bucket = bucket

        def list(self, path, opts=None):
            opts = opts or {}
            off, lim = opts.get("offset", 0), opts.get("limit", _PAGE)
            return tree.get(path, [])[off : off + lim]

        def remove(self, names):
            assert len(names) <= _REMOVE_CHUNK, "remove() must be chunked"
            removed.extend(names)

    class _Db:
        storage = type("S", (), {"from_": lambda _s, b: _Store(b)})()

    import pipeline

    real_db = pipeline.db
    pipeline.db = lambda: _Db()  # type: ignore[assignment]
    try:
        found = _object_paths("frames", "kb1")

        # THE regression: pseudo-folders are recursed into, never "removed". A lister that
        # returns art1/art2 here is the old bug, and it deletes every frame of nothing.
        assert "kb1/art1" not in found and "kb1/art2" not in found, found[:5]
        assert "kb1/art1/step-1.webp" in found, found[:5]
        assert "kb1/art2/step-1.webp" in found, found[:5]
        # Three levels deep, and PAST the 100-entry page boundary — 150 dense frames means
        # the second page has to be fetched or a third of them silently survive.
        assert "kb1/art1/dense/00000.webp" in found
        assert "kb1/art1/dense/00149.webp" in found, "pagination stopped at the first page"
        assert len(found) == 3 + 150, len(found)

        assert purge_kb_storage("kb1") is True
        # Every object, in every bucket, exactly once each.
        assert len(removed) == len(found) * len(config.KB_BUCKETS), len(removed)

        # A storage failure must NOT go on to delete the row: the objects would become
        # unreachable garbage that neither collection path can ever find again.
        deleted: list[str] = []

        class _BoomStore(_Store):
            def list(self, path, opts=None):
                raise RuntimeError("storage down")

        class _BoomDb:
            storage = type("S", (), {"from_": lambda _s, b: _BoomStore(b)})()

            def table(self, _n):
                raise AssertionError("must not touch the row when storage failed")

        pipeline.db = lambda: _BoomDb()  # type: ignore[assignment]
        logging.disable(logging.ERROR)  # the failure below is deliberate; don't print it
        try:
            assert purge_kb("kb1") is False
        finally:
            logging.disable(logging.NOTSET)
        assert deleted == []
    finally:
        pipeline.db = real_db  # type: ignore[assignment]

    print("purge self-check OK")


if __name__ == "__main__":
    demo()
