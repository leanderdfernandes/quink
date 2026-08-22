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


# --- Trial lifecycle (pricing-spec §7) -------------------------------------------------
# The wording below is §7 VERBATIM. It was written against the disclosure argument in §2 —
# free tier includes unlimited manual articles, so someone can hand-build forty of them and
# lose the lot — and reviewed on that basis. Do not reword it to sound softer; the whole
# defence of this deletion is that it was over-disclosed.
#
# Each email says the same number the app is showing at that moment. A user who reads "11
# days" on screen and "9 days" in their inbox stops believing either.
#
# `articles` is the count, `days` the number in the message.


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def _sign_off(cta: str) -> str:
    return f"\n\n{cta}\n\nReply to this email and we'll sort it out — it reaches a person.\n\n— Quink"


def trial_day14(days: int, articles: int, url: str) -> tuple[str, str]:
    return (
        f"Your help center is removed in {days} days",
        f"Free help centers are removed 30 days after your first article. Choose a plan "
        f"to keep {_plural(articles, 'article')} live — nothing changes except the "
        f"countdown stops.\n\nYour help center: {url}"
        + _sign_off("To keep it, reply and we'll get you on a plan."),
    )


def trial_day7(days: int, articles: int, url: str) -> tuple[str, str]:
    return (
        f"{days} days left — your {_plural(articles, 'article')} and help center will be removed",
        f"{days} days left — your {_plural(articles, 'article')} and help center will be "
        f"removed.\n\nNothing is deleted the moment the countdown ends: your articles stay "
        f"recoverable for a further 7 days.\n\nYour help center: {url}"
        + _sign_off("To keep it, reply and we'll get you on a plan."),
    )


def trial_offline(articles: int, grace_days: int, url: str) -> tuple[str, str]:
    return (
        "Your help center is offline",
        f"Your {_plural(articles, 'article')} are safe for {grace_days} more days. Choose "
        f"a plan to bring them back — nothing was lost.\n\nYour readers see nothing at "
        f"{url} until it's restored. You can still sign in and edit everything."
        + _sign_off("Reply with \"restore\" and we'll put it back."),
    )


def trial_purged(kb_name: str) -> tuple[str, str]:
    # Not in §7 — §7 stops at the restore screen. Kept deliberately plain and factual: this
    # arrives after four warnings, and anything persuasive at this point reads as a taunt.
    return (
        "Your help center has been removed",
        f"The 7-day recovery window for {kb_name} has passed, so it and its articles have "
        f"now been deleted. We don't keep a copy.\n\nYou can start a new help center any "
        f"time — writing articles by hand is free and unlimited."
        + _sign_off("If this is a mistake, reply today and we'll see what we can do."),
    )


# --- Team invites (team-access-spec §9.3) ----------------------------------------------
def team_invite(
    inviter: str,
    kb_name: str,
    url: str,
    color: str | None,
    logo_url: str | None,
) -> tuple[str, str, str]:
    """The one email in this file that is not from Quink about Quink.

    It is about somebody's colleague and their help center, so it wears THEIR mark and
    THEIR colour — the same branding the recipient meets on the accept screen and inside
    the app. An invite that looks like a SaaS announcement gets read as one.

    Returns (subject, text, html). The text half is not a fallback nobody reads: it is what
    every plain-text client, every screen reader in text mode, and every spam filter
    actually sees, so it carries the whole message and the whole link.
    """
    subject = f"{inviter} invited you to {kb_name}"
    text = (
        f"{inviter} invited you to help maintain {kb_name}, their help center on "
        f"Quink.\n\n"
        f"You'll be able to write, edit and publish guides there.\n\n"
        f"Accept the invite: {url}\n\n"
        f"This link expires in 14 days, and only works for the address it was "
        f"sent to.\n\n"
        f"If you weren't expecting this, you can ignore it - nothing happens until "
        f"you accept.\n\n- Quink"
    )
    brand = color or "#0e5c6b"
    mark = (
        f'<img src="{logo_url}" alt="" width="44" height="44" '
        f'style="display:block;margin:0 auto 18px;border-radius:12px">'
        if logo_url
        else f'<div style="width:44px;height:44px;border-radius:12px;background:{brand};'
        f'color:#fff;font:700 17px/44px Helvetica,Arial,sans-serif;text-align:center;'
        f'margin:0 auto 18px">{(kb_name or "Q")[:1].upper()}</div>'
    )
    # Table-free, inline-styled and single-column: every rule here has to survive Gmail,
    # Outlook and a phone. No web fonts — a font that fails to load is worse than one that
    # was never asked for.
    html = (
        f'<div style="background:#f2efea;padding:32px 16px;'
        f'font-family:Helvetica,Arial,sans-serif;color:#211f1b">'
        f'<div style="max-width:440px;margin:0 auto;background:#fff;border:1px solid #e6e1d9;'
        f'border-radius:16px;padding:32px 30px;text-align:center">'
        f"{mark}"
        f'<h1 style="font-size:19px;line-height:1.35;font-weight:600;margin:0 0 10px">'
        f"{inviter} invited you to help maintain {kb_name}</h1>"
        f'<p style="font-size:14px;line-height:1.6;color:#5c574e;margin:0 0 24px">'
        f"You'll be able to write, edit and publish guides in this help center.</p>"
        f'<a href="{url}" style="display:inline-block;background:{brand};color:#fff;'
        f'text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;'
        f'border-radius:8px">Accept invite</a>'
        f'<p style="font-size:11.5px;line-height:1.6;color:#8a8377;margin:22px 0 0">'
        f"This link expires in 14 days and only works for the address it was sent to. "
        f"If you weren't expecting it, ignore this email.</p>"
        f"</div></div>"
    )
    return subject, text, html


# --- Account deletion (DPDP right to withdraw consent) ---------------------------------
def account_deleted(kb_names: list[str], articles: int) -> tuple[str, str]:
    """Confirmation that a self-serve deletion completed.

    Names what went, so the mail is a RECEIPT rather than a notification — someone who
    deleted the wrong account of two needs to be able to tell from the subject line. It does
    not try to win them back: they already left, and a pitch here reads as a company that
    did not accept the instruction it just carried out.

    The "we don't keep a copy" line is literally true and load-bearing: we are not on
    Supabase Pro, so there is no point-in-time recovery to restore from. It is the same
    sentence the confirmation dialog shows before the deletion, on purpose.
    """
    named = ", ".join(kb_names) if kb_names else "your help center"
    return (
        "Your Quink account has been deleted",
        f"{named} and {_plural(articles, 'article')} have been deleted, along with every "
        f"screenshot and recording.\n\nThis is permanent — we don't keep a copy and there "
        f"is no backup to restore from. Any custom domain you had connected has been "
        f"released, so you can point it wherever you like.\n\nIf this wasn't you, or it was "
        f"a mistake, reply to this email today.\n\n— Quink",
    )


# --- The one send path ----------------------------------------------------------------
def send_once(
    to: str,
    subject: str,
    body: str,
    *,
    marker: str | None,
    table: str | None = None,
    row_id: str | None = None,
    html: str | None = None,
) -> bool:
    """Send `subject`/`body` to `to`, at most once for `table`.`row_id`.

    `marker` is a timestamptz column on that row. It is claimed first and released only
    if the provider itself fails, so a restart, a second worker, or a user hammering the
    "check again" button cannot produce a second email.

    `html` is optional and additive: when given it rides ALONGSIDE `body`, never instead of
    it, so every message still has a real plain-text half. Only the invite uses it, because
    only the invite is about somebody else's brand rather than ours.

    `marker=None` — THE ONE EXCEPTION, and it is still a required keyword so nobody
    reaches it by forgetting. It is for a send that fires ONCE, from a user action, with no
    row left to mark and no possible retry: today that is exactly the account-deletion
    confirmation, which goes out after `auth.users` is gone and so has no surviving row
    anywhere in the database. Claiming a marker on a deleted row silently matches zero rows
    and sends nothing, which is worse than no marker at all.

    §10h says send_once is the only public send and must not grow a second send path — so
    this is that one function with the marker made explicitly optional, NOT a sibling. The
    rule it actually protects ("every email from a LOOP OR A SWEEP needs a persisted
    marker") is untouched: a caller inside a loop still cannot leave the keyword out.

    Returns True if this call delivered (or logged, when sending is disabled), False if
    it was already sent or the provider refused. NEVER raises.
    """
    try:
        import pipeline  # lazy: keeps the heavy pipeline module out of import time

        if marker is not None:
            if not (table and row_id):
                log.error("send_once: marker=%r given without table/row_id", marker)
                return False
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

        # The staging catch-all, applied at the send boundary and nowhere else: templates,
        # markers and triggers are untouched, so staging exercises the SAME code production
        # runs. Unset (production) this is two comparisons and the payload is unchanged.
        recipient, line = to, subject
        if config.EMAIL_REDIRECT_TO:
            recipient, line = config.EMAIL_REDIRECT_TO, f"[→ {to}] {subject}"

        try:
            r = httpx.post(
                RESEND_URL,
                headers={"Authorization": f"Bearer {config.RESEND_API_KEY}"},
                json={
                    "from": config.EMAIL_FROM,
                    "to": [recipient],
                    "reply_to": config.EMAIL_REPLY_TO,
                    "subject": line,
                    "text": body,
                    **({"html": html} if html else {}),
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
        if marker is not None:
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
    redirect_to = config.EMAIL_REDIRECT_TO

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
        # The baseline is PRODUCTION shape. A developer's .env may set the staging
        # catch-all; these assertions are about what production puts on the wire.
        config.EMAIL_REDIRECT_TO = ""

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

        # --- EMAIL_REDIRECT_TO: staging delivers everything to one inbox -------------
        # The real recipient has to survive into the SUBJECT, or a staging inbox holding
        # four trial warnings is four identical messages with no way to tell which
        # fixture account each belongs to.
        rows.clear()
        redirect = config.EMAIL_REDIRECT_TO
        try:
            config.EMAIL_REDIRECT_TO = "dev@example.com"
            assert send() is True
            sent = posts[-1]
            assert sent["to"] == ["dev@example.com"], sent
            assert sent["subject"].startswith("[→ a@b.com] "), sent
            assert "Your custom domain is live" in sent["subject"], sent
            assert "docs.acme.com" in sent["text"], "the body is NOT rewritten"
        finally:
            config.EMAIL_REDIRECT_TO = redirect

        # Unset, the payload is byte-identical to what production sends.
        rows.clear()
        config.EMAIL_REDIRECT_TO = ""
        assert send() is True
        assert posts[-1]["to"] == ["a@b.com"] and posts[-1]["subject"] == domain_live("x")[0]

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
        config.EMAIL_REDIRECT_TO = redirect_to
        httpx.post = real_post  # type: ignore[assignment]

    print("mailer self-check OK")


if __name__ == "__main__":
    demo()
