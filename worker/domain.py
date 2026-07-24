"""Custom-domain state machine + hosting registration (build spec §4).

A CNAME alone does NOT make a custom domain work. The SPA is served by Vercel, and Vercel
refuses any Host it doesn't know: the request 404s and — worse — no TLS certificate is
issued, so the browser errors before it ever reaches us. So "connect a domain" is two
things, and both live here:

  1. register the host on the Vercel project (that's what buys routing + auto-SSL), and
  2. watch until Vercel reports the customer's DNS is correct and the cert can issue.

Because (2) is Vercel's own answer to "can I serve this yet", we never do our own CNAME
lookup: a DNS check can say "pointed at us" while the cert is still missing, which is
exactly the failure that looks live in our UI and broken in the customer's browser.

Both live behind one interface with two implementations:

  StubHosting   — driven manually in local dev (/api/domain/stub); no Vercel, no DNS.
  VercelHosting — the real thing.

Selected by DOMAIN_VERIFIER (config). Nothing else in the flow knows which is in use.

States on the KB: none -> pending -> verifying -> live (plus failed). The free subdomain
({subdomain}.quink.online) is always live and never touched here, so adding a custom domain
can never take a KB offline. Once live, the reader canonicalizes the subdomain to the
custom domain (the DB flag is the source of truth).
"""

from __future__ import annotations

import logging
import threading
from typing import Protocol

import httpx

import config

log = logging.getLogger("quink.domain")


class DomainError(Exception):
    """A user-fixable problem with the domain itself (already in use, not allowed).
    main.py turns this into a 4xx with the message shown as-is."""


# --- DNS record shown to the user ------------------------------------------------------
def record_host(domain: str, apex: str | None = None) -> str:
    """The `Host`/`Name` field the user types at their registrar, i.e. `domain` relative to
    its apex. docs.acme.com (apex acme.com) -> 'docs'; the apex itself -> '@'.

    `apex` comes from the hosting provider when we have it, because guessing it needs the
    public-suffix list (acme.co.uk is an apex; naive "last two labels" calls it a subdomain
    of co.uk). Without it we fall back to that naive split, which is right for .com/.io and
    the only option in stub mode."""
    d = domain.strip().lower().strip(".")
    if apex:
        a = apex.strip().lower().strip(".")
        if d == a:
            return "@"
        if d.endswith("." + a):
            return d[: -(len(a) + 1)]
    labels = d.split(".")
    return "@" if len(labels) <= 2 else ".".join(labels[:-2])


def _rec(type_: str, host: str, value: str) -> dict:
    return {"type": type_, "host": host, "value": value, "ttl": config.DOMAIN_CNAME_TTL}


# --- Hosting interface + implementations -----------------------------------------------
class Hosting(Protocol):
    def attach(self, domain: str) -> list[dict]:
        """Register the host so it can be served, and return the DNS records the user must
        add. Idempotent: re-attaching an already-attached domain returns its records."""

    def detach(self, domain: str) -> None: ...

    def servable(self, domain: str) -> bool:
        """True once the host is verified AND its DNS is correct AND a cert can issue."""


class StubHosting:
    """Resolves only domains explicitly flipped on via /api/domain/stub. Lets us drive every
    transition manually in local dev with no Vercel account and no DNS."""

    def __init__(self) -> None:
        self._resolving: set[str] = set()
        self._lock = threading.Lock()

    def set(self, domain: str, resolves: bool) -> None:
        with self._lock:
            if resolves:
                self._resolving.add(domain.lower())
            else:
                self._resolving.discard(domain.lower())

    def attach(self, domain: str) -> list[dict]:
        host = record_host(domain)
        return [
            _rec("A", host, config.STUB_A_VALUE)
            if host == "@"
            else _rec("CNAME", host, config.STUB_CNAME_VALUE)
        ]

    def detach(self, domain: str) -> None:
        self.set(domain, False)

    def servable(self, domain: str) -> bool:
        with self._lock:
            return domain.lower() in self._resolving


class VercelHosting:
    """Registers customer domains on the Vercel project that serves the SPA, and asks Vercel
    whether each one is ready. Vercel issues and renews the certificate itself — that is why
    we never mention SSL to the user (build spec §4)."""

    def __init__(self) -> None:
        if not config.VERCEL_TOKEN or not config.VERCEL_PROJECT_ID:
            raise RuntimeError(
                "DOMAIN_VERIFIER=vercel needs VERCEL_TOKEN and VERCEL_PROJECT_ID"
            )
        self._client = httpx.Client(
            base_url="https://api.vercel.com",
            headers={"Authorization": f"Bearer {config.VERCEL_TOKEN}"},
            timeout=config.VERCEL_TIMEOUT_SECONDS,
        )
        # Personal accounts have no team; sending an empty teamId 400s, so only send it
        # when it's set.
        self._params = {"teamId": config.VERCEL_TEAM_ID} if config.VERCEL_TEAM_ID else {}

    def _req(self, method: str, path: str, **kw) -> httpx.Response:
        return self._client.request(method, path, params=self._params, **kw)

    @property
    def _project(self) -> str:
        return config.VERCEL_PROJECT_ID

    # -- project domain --------------------------------------------------------------
    def _get(self, domain: str) -> dict | None:
        r = self._req("GET", f"/v9/projects/{self._project}/domains/{domain}")
        return r.json() if r.status_code == 200 else None

    def attach(self, domain: str) -> list[dict]:
        r = self._req(
            "POST", f"/v10/projects/{self._project}/domains", json={"name": domain}
        )
        if r.status_code == 409:
            # Held by another Vercel project/account — we genuinely cannot serve it, and
            # no DNS record the user adds will change that. Say so instead of parking them
            # in a "waiting for DNS" state that can never end.
            raise DomainError(
                "That domain is already connected to another site. Remove it there first."
            )
        if r.status_code == 403:
            raise DomainError("That domain can't be used here.")
        info = r.json() if r.status_code == 200 else None
        if info is None:
            # 400 also means "already on this project" — the reconnect path. Re-read before
            # treating it as an error so reconnecting is idempotent.
            info = self._get(domain)
            if info is None:
                detail = _detail(r)
                log.error("vercel attach failed (%s): %s", r.status_code, detail)
                raise DomainError(detail or "We couldn't set up that domain. Try again.")
        return self.records(domain, info)

    def detach(self, domain: str) -> None:
        r = self._req("DELETE", f"/v9/projects/{self._project}/domains/{domain}")
        # 404 = already gone, which is the state we wanted.
        if r.status_code not in (200, 404):
            log.error("vercel detach failed (%s): %s", r.status_code, _detail(r))

    # -- records to show -------------------------------------------------------------
    def records(self, domain: str, info: dict) -> list[dict]:
        """The routing record, plus any ownership challenge Vercel wants first. Values come
        from Vercel rather than hardcoded so a change on their side can't strand users on a
        stale record."""
        apex = info.get("apexName")
        host = record_host(domain, apex)
        out: list[dict] = []

        # Ownership challenge: only when the apex is already claimed on another account.
        if not info.get("verified", False):
            for c in info.get("verification") or []:
                if c.get("type") and c.get("value"):
                    out.append(
                        _rec(
                            c["type"].upper(),
                            record_host(c.get("domain", domain), apex),
                            c["value"],
                        )
                    )

        cfg = self.config(domain)
        if host == "@":
            # A CNAME on an apex is invalid at most registrars, so an A record is the only
            # honest answer there.
            out.append(_rec("A", host, _first(cfg.get("recommendedIPv4")) or config.VERCEL_A_FALLBACK))
        else:
            out.append(
                _rec("CNAME", host, _first(cfg.get("recommendedCNAME")) or config.VERCEL_CNAME_FALLBACK)
            )
        return out

    def config(self, domain: str) -> dict:
        r = self._req(
            "GET",
            f"/v6/domains/{domain}/config",
            params={**self._params, "projectIdOrName": self._project},
        )
        return r.json() if r.status_code == 200 else {}

    # -- readiness -------------------------------------------------------------------
    def servable(self, domain: str) -> bool:
        info = self._get(domain)
        if info is None:
            # Not on the project at all (removed out-of-band, or a failed attach). Nothing
            # can go live; re-attach on the next connect.
            log.warning("domain %s is not attached to the project", domain)
            return False
        if not info.get("verified", False):
            r = self._req(
                "POST", f"/v9/projects/{self._project}/domains/{domain}/verify"
            )
            if r.status_code != 200 or not r.json().get("verified", False):
                return False
        # `misconfigured` is Vercel's own "DNS is right AND I can issue the cert" — the only
        # answer that means the customer's browser will actually load the page.
        cfg = self.config(domain)
        return cfg.get("misconfigured") is False


def _first(recommended: list | None) -> str | None:
    """Vercel returns recommendations as ranked entries; take the preferred value. The item
    shape is documented loosely (object or bare string), so handle both."""
    for item in recommended or []:
        if isinstance(item, str):
            return item
        if isinstance(item, dict):
            v = item.get("value")
            if isinstance(v, list):
                v = v[0] if v else None
            if isinstance(v, str):
                return v
    return None


def _detail(r: httpx.Response) -> str:
    try:
        return (r.json().get("error") or {}).get("message", "")
    except Exception:
        return ""


_hosting: Hosting | None = None


def hosting() -> Hosting:
    global _hosting
    if _hosting is None:
        _hosting = StubHosting() if config.DOMAIN_VERIFIER == "stub" else VercelHosting()
        log.info("domain hosting: %s", type(_hosting).__name__)
    return _hosting


def stub() -> StubHosting:
    """The stub, for the manual dev driver. Raises if real hosting is active."""
    h = hosting()
    if not isinstance(h, StubHosting):
        raise RuntimeError("stub controls unavailable: DOMAIN_VERIFIER is not 'stub'")
    return h


# --- Email on success ------------------------------------------------------------------
# DNS can take hours; users won't sit on the page, so we email when it resolves (build
# spec §4).
class Emailer(Protocol):
    def send(self, to: str, subject: str, body: str) -> None: ...


class LogEmailer:
    def send(self, to: str, subject: str, body: str) -> None:
        log.info("EMAIL -> %s | %s | %s", to, subject, body)


class ResendEmailer:
    def send(self, to: str, subject: str, body: str) -> None:
        r = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {config.RESEND_API_KEY}"},
            json={"from": config.EMAIL_FROM, "to": [to], "subject": subject, "text": body},
            timeout=config.VERCEL_TIMEOUT_SECONDS,
        )
        if r.status_code >= 300:
            log.error("resend failed (%s): %s", r.status_code, r.text[:300])


def emailer() -> Emailer:
    return ResendEmailer() if config.RESEND_API_KEY else LogEmailer()


# --- State transitions -----------------------------------------------------------------
def _backoff_seconds(attempts: int) -> float:
    return min(config.DOMAIN_CHECK_INTERVAL_SECONDS * (2**attempts), config.DOMAIN_MAX_BACKOFF_SECONDS)


def check_once(kb: dict) -> str:
    """Run the readiness check against one KB and advance its state. Returns the new status.

    The attempt count lives on the row, not in memory: the worker restarts on every deploy
    and a resettable counter would mean a dead domain retries forever and never reaches
    `failed` (so the user is never told to fix it)."""
    from datetime import datetime, timezone

    import pipeline  # lazy: avoids importing the heavy pipeline module at startup

    kb_id = kb["id"]
    domain = kb.get("custom_domain")
    if not domain:
        return kb.get("domain_status", "none")

    now = datetime.now(timezone.utc).isoformat()

    try:
        ready = hosting().servable(domain)
    except Exception:
        # A provider outage must not burn an attempt or fail the domain — leave the state
        # alone and let the next sweep retry.
        log.exception("readiness check failed for %s", domain)
        return kb.get("domain_status", "pending")

    if ready:
        pipeline.db().table("knowledge_bases").update(
            {
                "domain_status": "live",
                "domain_error": None,
                "domain_last_checked_at": now,
                "domain_attempts": 0,
                "is_published": True,
            }
        ).eq("id", kb_id).execute()
        _notify_live(kb_id, domain)
        return "live"

    attempts = (kb.get("domain_attempts") or 0) + 1
    if attempts >= config.DOMAIN_MAX_ATTEMPTS:
        pipeline.db().table("knowledge_bases").update(
            {
                "domain_status": "failed",
                "domain_error": "We couldn't find the DNS record. Check it and try again.",
                "domain_last_checked_at": now,
                "domain_attempts": attempts,
            }
        ).eq("id", kb_id).execute()
        return "failed"

    pipeline.db().table("knowledge_bases").update(
        {"domain_status": "verifying", "domain_last_checked_at": now, "domain_attempts": attempts}
    ).eq("id", kb_id).execute()
    return "verifying"


def _notify_live(kb_id: str, domain: str) -> None:
    import pipeline

    try:
        row = (
            pipeline.db()
            .table("knowledge_bases")
            .select("owner_id, profiles(email)")
            .eq("id", kb_id)
            .single()
            .execute()
        )
        email = (row.data or {}).get("profiles", {}).get("email")
        if email:
            emailer().send(
                email,
                "Your custom domain is live",
                f"{domain} is now serving your help center. Links to your old address "
                f"redirect automatically.",
            )
    except Exception:
        log.exception("could not send domain-live email")


def sweep() -> None:
    """Check every KB that's mid-verification, honoring per-KB backoff."""
    from datetime import datetime, timezone

    import pipeline

    try:
        res = (
            pipeline.db()
            .table("knowledge_bases")
            .select("id, custom_domain, subdomain, domain_status, domain_last_checked_at, domain_attempts")
            .in_("domain_status", ["pending", "verifying"])
            .execute()
        )
    except Exception:
        log.exception("domain sweep query failed")
        return

    now = datetime.now(timezone.utc)
    for kb in res.data or []:
        last = kb.get("domain_last_checked_at")
        if last:
            elapsed = (now - datetime.fromisoformat(last)).total_seconds()
            if elapsed < _backoff_seconds(kb.get("domain_attempts") or 0):
                continue
        check_once(kb)


async def run_loop() -> None:
    """Background re-checker. Started from the app lifespan; ends on shutdown."""
    import asyncio

    log.info("domain re-check loop started (interval %ss)", config.DOMAIN_CHECK_INTERVAL_SECONDS)
    while True:
        await asyncio.to_thread(sweep)
        await asyncio.sleep(config.DOMAIN_CHECK_INTERVAL_SECONDS)


def _selfcheck() -> None:
    """Runnable check for the pure logic (no DB, no network): `python domain.py`."""
    # Host is relative to the apex the provider reports — including multi-label suffixes,
    # which the naive fallback gets wrong.
    assert record_host("docs.acme.com", "acme.com") == "docs"
    assert record_host("acme.com", "acme.com") == "@"
    assert record_host("acme.co.uk", "acme.co.uk") == "@"
    assert record_host("docs.acme.co.uk", "acme.co.uk") == "docs"
    assert record_host("a.b.acme.com", "acme.com") == "a.b"
    # Fallback (stub mode / no apex known)
    assert record_host("docs.acme.com") == "docs"
    assert record_host("acme.com") == "@"

    # Vercel's ranked recommendations, in both documented shapes.
    assert _first([{"rank": 1, "value": "cname.vercel-dns.com"}]) == "cname.vercel-dns.com"
    assert _first([{"rank": 1, "value": ["76.76.21.21"]}]) == "76.76.21.21"
    assert _first(["cname.vercel-dns.com"]) == "cname.vercel-dns.com"
    assert _first([]) is None and _first(None) is None

    h = StubHosting()
    assert not h.servable("x.com")
    h.set("x.com", True)
    assert h.servable("X.COM")  # case-insensitive
    h.detach("x.com")
    assert not h.servable("x.com")
    assert h.attach("docs.acme.com")[0]["type"] == "CNAME"
    assert h.attach("acme.com")[0]["type"] == "A"  # apex can't CNAME

    # backoff is monotonic non-decreasing and capped
    b = [_backoff_seconds(n) for n in range(0, 20)]
    assert b == sorted(b) and b[-1] <= config.DOMAIN_MAX_BACKOFF_SECONDS, b
    print("domain self-check OK")


if __name__ == "__main__":
    _selfcheck()
