"""Outbound email — one send path, one place every template lives.

NOT named `email.py` on purpose: the worker runs with its own directory first on
sys.path, so that filename shadows the STDLIB `email` package, which httpx, supabase and
google-genai all import. The failure is an import error deep inside a dependency that
looks nothing like an email bug.

Three rules, in order of how much damage breaking them does:

  1. **Email is never part of a transaction.** A domain that went live went live. Every
     send is wrapped and returns a bool; nothing here can raise into its caller.
  2. **A send that fires from a loop or a sweep needs a persisted marker.** The worker
     restarts on every deploy, so an in-memory "already sent" set is no protection at
     all. `send_once` is therefore the ONLY public send — the marker is a required
     keyword argument, so a caller cannot forget it.
  3. **Non-production never sends.** A real send needs EMAIL_ENABLED *and*
     RESEND_API_KEY, both off by default, so running the test suite (or a dev worker
     with a copied .env) cannot mail a customer.

The marker is CLAIMED before the send — a conditional update that only wins if the
column is still null — so two ticks racing each other can't both send. If the provider
then fails, the claim is released so the next sweep retries. The order matters: the
reverse (send, then mark) duplicates under concurrency, which is the failure a paying
customer actually notices.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx

import config

log = logging.getLogger("quink.mailer")

RESEND_URL = "https://api.resend.com/emails"
SEND_TIMEOUT_SECONDS = 15


def sending_enabled() -> bool:
    """Both, always. The key alone is not consent — a developer with production secrets
    in their .env must still not be able to mail a customer from their laptop."""
    return bool(config.EMAIL_ENABLED and config.RESEND_API_KEY)


# --- Templates ------------------------------------------------------------------------
# Every template lives here so there is one place to audit the words we send, and one
# place the trial-lifecycle nudges get added later. hello@ and support@ are real,
# monitored mailboxes — the copy invites a reply rather than forbidding one.


def domain_live(domain: str) -> tuple[str, str]:
    return (
        "Your custom domain is live",
        f"{domain} is now serving your help center.\n\n"
        "Links to your old address redirect there automatically, so nothing you've "
        "already shared breaks.\n\n"
        "Just reply to this email if anything looks off — it reaches us.\n\n"
        "— Quink",
    )


# --- The one send path ----------------------------------------------------------------
def send_once(
    to: str,
    subject: str,
    body: str,
    *,
    table: str,
    row_id: str,
    marker: str,
) -> bool:
    """Send `subject`/`body` to `to`, at most once for `table`.`row_id`.

    `marker` is a timestamptz column on that row. It is claimed first and released only
    if the provider itself fails, so a restart, a second worker, or a user hammering the
    "check again" button cannot produce a second email.

    Returns True if this call delivered (or logged, when sending is disabled), False if
    it was already sent or the provider refused. NEVER raises.
    """
    try:
        import pipeline  # lazy: keeps the heavy pipeline module out of import time

        now = datetime.now(timezone.utc).isoformat()
        claimed = (
            pipeline.db()
            .table(table)
            .update({marker: now})
            .eq("id", row_id)
            .is_(marker, "null")
            .execute()
        )
        if not (claimed.data or []):
            log.debug("%s already sent for %s.%s — not sending again", marker, table, row_id)
            return False

        if not sending_enabled():
            # The documented dev fallback. It logs the WHOLE payload so the message is
            # reviewable, and it still consumes the marker — a dev run must exercise the
            # same once-only path production does.
            log.info(
                "EMAIL (not sent: %s) -> %s | %s | %s",
                "EMAIL_ENABLED unset" if not config.EMAIL_ENABLED else "no RESEND_API_KEY",
                to,
                subject,
                body,
            )
            return True

        try:
            r = httpx.post(
                RESEND_URL,
                headers={"Authorization": f"Bearer {config.RESEND_API_KEY}"},
                json={
                    "from": config.EMAIL_FROM,
                    "to": [to],
                    "reply_to": config.EMAIL_REPLY_TO,
                    "subject": subject,
                    "text": body,
                },
                timeout=SEND_TIMEOUT_SECONDS,
            )
            ok = r.status_code < 300
            detail = r.json().get("id") if ok else r.text[:300]
        except Exception as e:
            ok, detail = False, repr(e)

        if ok:
            # An email we think we sent and didn't is worse than one we never tried to
            # send, so the provider's own id is what gets logged, not "sent".
            log.info("email sent to %s (resend id %s): %s", to, detail, subject)
            return True

        # Release the claim so the next sweep retries. This is the one case where a
        # duplicate is possible, and it is the case where we WANT another attempt.
        log.error("resend refused mail to %s (%s): %s", to, subject, detail)
        pipeline.db().table(table).update({marker: None}).eq("id", row_id).execute()
        return False
    except Exception:
        log.exception("send_once failed for %s.%s", table, row_id)
        return False


# --- Self-check -----------------------------------------------------------------------
def demo() -> None:
    """`python mailer.py`. No network, no DB.

    Everything worth checking here is once-only-ness and the never-raise guarantee: the
    words are prose, but a second email to a paying customer is a bug, and an exception
    escaping into check_once would fail a domain that already went live.
    """
    rows: dict[str, dict] = {}
    posts: list[dict] = []

    class _Q:
        def __init__(self, tbl):
            self.tbl, self.payload, self.rid, self.require_null = tbl, {}, None, None

        def update(self, payload):
            self.payload = payload
            return self

        def eq(self, _k, v):
            self.rid = v
            return self

        def is_(self, k, v):
            assert v == "null", v
            self.require_null = k
            return self

        def execute(self):
            row = rows.setdefault(self.rid, {})
            if self.require_null and row.get(self.require_null) is not None:
                return type("R", (), {"data": []})()
            row.update(self.payload)
            return type("R", (), {"data": [row]})()

    class _Db:
        def table(self, name):
            return _Q(name)

    import pipeline

    pipeline.db = lambda: _Db()
    enabled, key, real_post = config.EMAIL_ENABLED, config.RESEND_API_KEY, httpx.post

    def send(**kw):
        return send_once(
            "a@b.com", *domain_live("docs.acme.com"),
            table="knowledge_bases", row_id="kb1", marker="domain_live_email_sent_at", **kw
        )

    try:
        # --- default is SAFE. A test run must never be able to mail anyone. -----------
        config.EMAIL_ENABLED, config.RESEND_API_KEY = False, "re_realkey"
        assert not sending_enabled(), "the API key alone must not enable sending"
        config.EMAIL_ENABLED, config.RESEND_API_KEY = True, ""
        assert not sending_enabled(), "EMAIL_ENABLED alone must not enable sending"

        # --- log-only mode still consumes the marker ---------------------------------
        # Otherwise local dev never exercises the once-only path and the duplicate only
        # shows up in production, to a customer.
        config.EMAIL_ENABLED, config.RESEND_API_KEY = False, ""
        assert send() is True
        assert rows["kb1"]["domain_live_email_sent_at"], rows
        assert send() is False, "a second call must not send again"

        # --- real send: payload shape ------------------------------------------------
        rows.clear()
        config.EMAIL_ENABLED, config.RESEND_API_KEY = True, "re_k"

        def _ok(url, **kw):
            posts.append(kw["json"])
            return type("R", (), {"status_code": 200, "json": lambda _s: {"id": "msg_1"}})()

        httpx.post = _ok  # type: ignore[assignment]
        assert send() is True
        sent = posts[-1]
        assert sent["from"] == config.EMAIL_FROM and "@quink.online" in sent["from"], sent
        assert sent["reply_to"] == config.EMAIL_REPLY_TO, "replies must reach support@"
        assert sent["to"] == ["a@b.com"] and "docs.acme.com" in sent["text"], sent
        assert "do not reply" not in sent["text"].lower(), "these mailboxes are monitored"

        # --- the loop/restart case: the marker is on the ROW, not in memory ----------
        before = len(posts)
        assert send() is False
        assert len(posts) == before, "a re-check of a live row must not re-send"

        # --- provider failure releases the claim so the next sweep retries ------------
        rows.clear()
        httpx.post = lambda url, **kw: type(  # type: ignore[assignment]
            "R", (), {"status_code": 500, "text": "upstream boom", "json": lambda _s: {}}
        )()
        assert send() is False
        assert rows["kb1"]["domain_live_email_sent_at"] is None, "a failed send must retry"

        # --- and a raising transport still never escapes into the caller -------------
        def _boom(url, **kw):
            raise httpx.ConnectError("resend unreachable")

        httpx.post = _boom  # type: ignore[assignment]
        assert send() is False, "a dead provider must not fail the thing that triggered it"
        assert rows["kb1"]["domain_live_email_sent_at"] is None

        # --- a broken DB is still not an exception --------------------------------
        class _Boom:
            def table(self, _n):
                raise RuntimeError("db down")

        pipeline.db = lambda: _Boom()
        assert send() is False, "send_once must never raise"
    finally:
        # Restore, so importing this check can't leave httpx or the flags patched for the
        # rest of the process.
        config.EMAIL_ENABLED, config.RESEND_API_KEY = enabled, key
        httpx.post = real_post  # type: ignore[assignment]

    print("mailer self-check OK")


if __name__ == "__main__":
    demo()
