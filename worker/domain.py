"""Custom-domain state machine + verifier (build spec §4).

The state transitions are the hard part and they're identical whether DNS is real or
stubbed, so the verifier lives behind an interface with two implementations:

  StubVerifier    — driven manually in local dev (/api/domain/stub); no real DNS.
  RealDnsVerifier — a genuine CNAME lookup.

Selected by DOMAIN_VERIFIER (config). Nothing else in the flow knows which is in use —
no `if dev` checks scattered around.

States on the KB: none -> pending -> verifying -> live (plus failed). The free subdomain
({subdomain}.quink.site) is always live and never touched here, so adding a custom domain
can never take a KB offline. Once live, the reader 301s the subdomain to the custom domain
(handled at the edge/reader; the DB flag is the source of truth).
"""

from __future__ import annotations

import logging
import threading
from typing import Protocol

import config

log = logging.getLogger("quink.domain")


# --- CNAME record shown to the user ----------------------------------------------------
def cname_host(domain: str) -> str:
    """docs.acme.com -> 'docs'. Apex (acme.com) -> '@' (a CNAME on the apex is invalid at
    most registrars; we surface '@' honestly rather than pretend). Auto-derived so the
    user never hand-parses one copyable blob (build spec §4)."""
    labels = domain.strip().lower().strip(".").split(".")
    if len(labels) <= 2:
        return "@"
    return ".".join(labels[:-2])


def cname_record(domain: str, subdomain: str) -> dict:
    """The single DNS record the user adds. One record only; SSL is automatic and never
    mentioned (build spec §4)."""
    return {
        "type": "CNAME",
        "host": cname_host(domain),
        "value": f"{subdomain}.{config.READER_DOMAIN}",
        "ttl": config.DOMAIN_CNAME_TTL,
    }


# --- Verifier interface + implementations ----------------------------------------------
class Verifier(Protocol):
    def resolves(self, domain: str, expected_target: str) -> bool: ...


class StubVerifier:
    """Resolves only domains explicitly flipped on via /api/domain/stub. Lets us drive
    every transition manually in local dev with no DNS."""

    def __init__(self) -> None:
        self._resolving: set[str] = set()
        self._lock = threading.Lock()

    def set(self, domain: str, resolves: bool) -> None:
        with self._lock:
            if resolves:
                self._resolving.add(domain.lower())
            else:
                self._resolving.discard(domain.lower())

    def resolves(self, domain: str, expected_target: str) -> bool:
        with self._lock:
            return domain.lower() in self._resolving


class RealDnsVerifier:
    """A genuine CNAME lookup: does `domain` point (directly or via chain) at the KB's
    quink.site subdomain? dnspython is imported lazily so the stub path needs no DNS deps."""

    def resolves(self, domain: str, expected_target: str) -> bool:
        try:
            import dns.resolver  # type: ignore
        except ImportError:
            log.error("RealDnsVerifier needs dnspython (pip install dnspython)")
            return False
        target = expected_target.rstrip(".").lower()
        try:
            answers = dns.resolver.resolve(domain, "CNAME")
            return any(str(r.target).rstrip(".").lower() == target for r in answers)
        except Exception:
            return False


_verifier: Verifier | None = None


def verifier() -> Verifier:
    global _verifier
    if _verifier is None:
        _verifier = StubVerifier() if config.DOMAIN_VERIFIER == "stub" else RealDnsVerifier()
        log.info("domain verifier: %s", type(_verifier).__name__)
    return _verifier


def stub() -> StubVerifier:
    """The stub, for the manual dev driver. Raises if the real verifier is active."""
    v = verifier()
    if not isinstance(v, StubVerifier):
        raise RuntimeError("stub controls unavailable: DOMAIN_VERIFIER is not 'stub'")
    return v


# --- Email on success ------------------------------------------------------------------
# DNS can take hours; users won't sit on the page, so we email when it resolves (build
# spec §4). Behind an interface like the verifier — a real SMTP sender is deferred.
class Emailer(Protocol):
    def send(self, to: str, subject: str, body: str) -> None: ...


class LogEmailer:
    def send(self, to: str, subject: str, body: str) -> None:
        # ponytail: logs instead of sending. Swap for an SMTP/Resend sender when email
        # ships; the call site never changes.
        log.info("EMAIL -> %s | %s | %s", to, subject, body)


_emailer: Emailer = LogEmailer()


# --- State transitions -----------------------------------------------------------------
# In-memory per-KB attempt counter driving the backoff. Resets on worker restart — fine
# for local dev; a persisted counter is the upgrade if this ever needs to survive deploys.
# ponytail: in-memory attempts, persist to a column if it must survive restarts.
_attempts: dict[str, int] = {}


def _backoff_seconds(attempts: int) -> float:
    return min(config.DOMAIN_CHECK_INTERVAL_SECONDS * (2 ** attempts), 3600)


def check_once(kb: dict) -> str:
    """Run the verifier against one KB and advance its state. Returns the new status."""
    from datetime import datetime, timezone

    import pipeline  # lazy: avoids importing the heavy pipeline module at startup

    kb_id = kb["id"]
    domain = kb.get("custom_domain")
    subdomain = kb.get("subdomain")
    if not domain or not subdomain:
        return kb.get("domain_status", "none")

    now = datetime.now(timezone.utc).isoformat()
    expected = f"{subdomain}.{config.READER_DOMAIN}"

    if verifier().resolves(domain, expected):
        pipeline.db().table("knowledge_bases").update(
            {
                "domain_status": "live",
                "domain_error": None,
                "domain_last_checked_at": now,
                "is_published": True,
            }
        ).eq("id", kb_id).execute()
        _attempts.pop(kb_id, None)
        _notify_live(kb_id, domain)
        return "live"

    attempts = _attempts.get(kb_id, 0) + 1
    _attempts[kb_id] = attempts
    if attempts >= config.DOMAIN_MAX_ATTEMPTS:
        pipeline.db().table("knowledge_bases").update(
            {
                "domain_status": "failed",
                "domain_error": "We couldn't find the DNS record. Check it and try again.",
                "domain_last_checked_at": now,
            }
        ).eq("id", kb_id).execute()
        return "failed"

    pipeline.db().table("knowledge_bases").update(
        {"domain_status": "verifying", "domain_last_checked_at": now}
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
            _emailer.send(
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
            .select("id, custom_domain, subdomain, domain_status, domain_last_checked_at")
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
            if elapsed < _backoff_seconds(_attempts.get(kb["id"], 0)):
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
    """Runnable check for the pure logic (no DB): `python domain.py`."""
    assert cname_host("docs.acme.com") == "docs"
    assert cname_host("a.b.acme.com") == "a.b"
    assert cname_host("acme.com") == "@"  # apex: CNAME invalid, surfaced honestly
    r = cname_record("docs.acme.com", "acme")
    assert r == {"type": "CNAME", "host": "docs", "value": "acme.quink.online", "ttl": 3600}, r
    v = StubVerifier()
    assert not v.resolves("x.com", "t")
    v.set("x.com", True)
    assert v.resolves("X.COM", "t")  # case-insensitive
    # backoff is monotonic non-decreasing and capped
    b = [_backoff_seconds(n) for n in range(0, 12)]
    assert b == sorted(b) and b[-1] <= 3600, b
    print("domain self-check OK")


if __name__ == "__main__":
    _selfcheck()
