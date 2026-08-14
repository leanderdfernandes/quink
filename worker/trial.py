"""Free-tier trial lifecycle — the countdown, the soft delete, and the hard delete.

Free tier includes UNLIMITED manual articles (pricing-spec §3), so a user can hand-build a
forty-article help center and lose it on day 30. §2 names under-disclosure here as the
specific dark-pattern risk — the same complaint we level at competitors. So this sweep's
job is not really "delete things"; it is "warn four times, take the site offline, wait a
week, and only then delete". Every warning is load-bearing.

Same shape as retention.py, deliberately: a STATE QUERY, never a scheduled event. "Free
plan, clock started, threshold crossed, marker not yet set." A tick missed to a deploy or
an idle-instance recycle self-heals on the next one, and running it twice is harmless
because every email is claimed through mailer.send_once().

Kept out of retention.py because that module is about source-video objects; this is about
the KB itself. Same cadence, same loop, different lifecycle.

TWO SAFETY RULES, both of which exist because the failure mode is destroying a customer's
work:

  1. **Only `free` KBs are ever touched**, filtered in the query AND re-checked in Python
     before any destructive step. A single mis-stamped `trial_started_at` on an `internal`
     KB would delete a live reverse demo — and reverse demos are the acquisition channel.
  2. **One message per tick, most urgent only.** A worker down for a week must not send a
     day-14 and a day-7 warning ninety seconds apart; the skipped thresholds are marked as
     sent without sending.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import config
import mailer

log = logging.getLogger("quink.trial")

# Marker column per message. Ordered LEAST urgent first — the sweep picks the last due one
# and back-fills everything before it.
DAY14, DAY7 = "trial_day14_email_sent_at", "trial_day7_email_sent_at"
OFFLINE, PURGED = "trial_offline_email_sent_at", "trial_purged_email_sent_at"
MARKERS = (DAY14, DAY7, OFFLINE, PURGED)

_COLUMNS = (
    "id, name, subdomain, owner_id, trial_started_at, offline_at, purge_at, "
    + ", ".join(MARKERS)
    + ", profiles!inner(email, plan)"
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def days_left(trial_started_at: str, expiry_days: int, now: datetime | None = None) -> int:
    """Whole days until the help center goes offline. Negative once it is overdue.

    Ceiling, not floor: with 30 days and 12 hours to go a user should read "1 day left",
    not "0". Rounding a live day down to zero is how a countdown lies in the direction
    that costs someone their work.
    """
    started = datetime.fromisoformat(trial_started_at)
    remaining = (started + timedelta(days=expiry_days)) - (now or _now())
    return -((-remaining.total_seconds()) // 86400).__int__()


def _due(kb: dict, left: int, now: datetime) -> list[str]:
    """Which markers this KB has crossed and not yet had, least urgent first."""
    purge_at = kb.get("purge_at")
    out = []
    if left <= config.TRIAL_WARN_DAYS[0] and not kb.get(DAY14):
        out.append(DAY14)
    if left <= config.TRIAL_WARN_DAYS[1] and not kb.get(DAY7):
        out.append(DAY7)
    if left <= 0 and not kb.get(OFFLINE):
        out.append(OFFLINE)
    if purge_at and datetime.fromisoformat(purge_at) <= now and not kb.get(PURGED):
        out.append(PURGED)
    return out


def _article_count(kb_id: str) -> int:
    import pipeline

    res = (
        pipeline.db()
        .table("articles")
        .select("id", count="exact")
        .eq("kb_id", kb_id)
        .limit(1)
        .execute()
    )
    return res.count or 0


def _kb_url(kb: dict) -> str:
    sub = kb.get("subdomain") or ""
    return f"https://{sub}.{config.READER_DOMAIN}"


def _mark_silently(kb_id: str, markers: list[str], now: datetime) -> None:
    """Record skipped thresholds as delivered WITHOUT sending them.

    This is the "worker was down for a week" case. Four warnings landing together is not
    four times the warning — it is a mess that reads as a bug and buries the one message
    that actually matters."""
    if not markers:
        return
    import pipeline

    stamp = now.isoformat()
    pipeline.db().table("knowledge_bases").update(
        {m: stamp for m in markers}
    ).eq("id", kb_id).execute()
    log.info("kb %s: marked %s as sent (superseded)", kb_id, ", ".join(markers))


def _go_offline(kb: dict, now: datetime) -> None:
    """Soft delete. Writes TWO columns and touches nothing else.

    Deliberately NOT a mutation of article visibility (see migration 0022): flattening
    'listed' and 'unlisted' to 'draft' destroys the distinction, so restoring would have to
    guess which articles were link-only. The reader gates on offline_at instead, which makes
    going offline and coming back the same single column write in opposite directions."""
    import pipeline

    pipeline.db().table("knowledge_bases").update(
        {
            "offline_at": now.isoformat(),
            "purge_at": (now + timedelta(days=config.TRIAL_GRACE_DAYS)).isoformat(),
        }
    ).eq("id", kb["id"]).execute()
    log.warning("kb %s taken offline (grace %sd)", kb["id"], config.TRIAL_GRACE_DAYS)


def _purge(kb: dict) -> None:
    """Hard delete at the end of the grace window. The WORK lives in purge.purge_kb(), which
    account deletion calls too — one implementation, so the two can never drift apart about
    which buckets a KB owns.

    What stays here is the trial-specific part: the final email goes out BEFORE this runs
    (its marker column is on the row we are about to delete), and a storage failure leaves
    the row in place so the next tick retries the whole purge.

    NOTE: extracting this FIXED a live bug rather than preserving behaviour byte for byte.
    The old local copy listed only the immediate children of `{kb_id}` in each bucket, so
    every frame — which is nested at `{kb_id}/{article_id}/…` — survived the purge. See the
    module docstring in purge.py. Flagged rather than reconciled quietly: this sweep now
    deletes strictly more than it used to, which is what it always claimed to do."""
    import purge

    if purge.purge_kb(kb["id"]):
        log.warning("kb %s purged (grace window elapsed)", kb["id"])


def sweep() -> int:
    """One pass. Returns how many KBs had an action taken."""
    import pipeline

    try:
        res = (
            pipeline.db()
            .table("knowledge_bases")
            .select(_COLUMNS)
            .eq("profiles.plan", "free")
            .not_.is_("trial_started_at", "null")
            .limit(200)
            .execute()
        )
    except Exception:
        log.exception("trial sweep query failed")
        return 0

    now = _now()
    expiry = config.PLANS["free"]["expiry_days"]
    acted = 0

    for kb in res.data or []:
        # Belt and braces (rule 1). The join filter above should make this unreachable, but
        # a PostgREST embed-filter change that silently stopped filtering would hand this
        # loop every KB in the product — including the reverse demos on `internal`. One
        # `if` is a cheap price for never finding that out in production.
        owner = kb.get("profiles") or {}
        if owner.get("plan") != "free":
            log.error("trial sweep: skipping non-free kb %s (%s)", kb["id"], owner.get("plan"))
            continue

        try:
            left = days_left(kb["trial_started_at"], expiry, now)
            due = _due(kb, left, now)
            if not due:
                continue

            # Rule 2: act on the most urgent threshold only, and record the rest as
            # delivered so they can never fire late.
            action, superseded = due[-1], due[:-1]
            _mark_silently(kb["id"], superseded, now)

            email, url = owner.get("email"), _kb_url(kb)
            count = _article_count(kb["id"])

            if action == PURGED:
                # Email first: send_once claims a marker on a row that is about to stop
                # existing. If the send fails the row survives and the next tick retries.
                if email:
                    mailer.send_once(
                        email, *mailer.trial_purged(kb["name"]),
                        table="knowledge_bases", row_id=kb["id"], marker=PURGED,
                    )
                _purge(kb)
            elif action == OFFLINE:
                # State change first, then the notification — email is never part of the
                # transaction (CLAUDE.md §10h). A send outage must not keep a KB online
                # past its expiry, and must not take one offline without recording it.
                _go_offline(kb, now)
                if email:
                    mailer.send_once(
                        email,
                        *mailer.trial_offline(count, config.TRIAL_GRACE_DAYS, url),
                        table="knowledge_bases", row_id=kb["id"], marker=OFFLINE,
                    )
            else:
                tpl = mailer.trial_day7 if action == DAY7 else mailer.trial_day14
                if email:
                    mailer.send_once(
                        email, *tpl(max(left, 0), count, url),
                        table="knowledge_bases", row_id=kb["id"], marker=action,
                    )
                else:
                    _mark_silently(kb["id"], [action], now)
            acted += 1
        except Exception:
            # One bad row must not stop the sweep for everyone else.
            log.exception("trial sweep failed for kb %s", kb.get("id"))

    if acted:
        log.info("trial sweep: acted on %s help center(s)", acted)
    return acted


# --- Self-check ------------------------------------------------------------------------
def demo() -> None:
    """`python trial.py`. No network, no DB.

    The whole correctness of this module is WHICH row gets WHICH action: too eager and we
    delete a paying customer's work, too lax and the countdown is a lie. So the checks are
    all about selection and ordering, not about prose.
    """
    sent: list[tuple] = []
    updates: list[tuple] = []
    deleted: list[str] = []
    removed: list[tuple] = []
    rows: list[dict] = []

    class _Q:
        def __init__(self, tbl):
            self.tbl, self.payload, self.rid, self.count = tbl, None, None, None
            self.is_delete = False

        def select(self, *_a, **kw):
            self.count = kw.get("count")
            return self

        def update(self, payload):
            self.payload = payload
            return self

        def delete(self):
            self.is_delete = True
            return self

        def eq(self, k, v):
            if k == "id":
                self.rid = v
            return self

        def limit(self, _n):
            return self

        @property
        def not_(self):
            return self

        def is_(self, *_a):
            return self

        def execute(self):
            if self.is_delete:
                deleted.append(self.rid)
                return type("R", (), {"data": [], "count": 0})()
            if self.payload is not None:
                updates.append((self.rid, self.payload))
                for r in rows:
                    if r["id"] == self.rid:
                        r.update(self.payload)
                return type("R", (), {"data": [{"id": self.rid}], "count": 0})()
            if self.tbl == "articles":
                return type("R", (), {"data": [], "count": 3})()
            return type("R", (), {"data": rows, "count": len(rows)})()

    class _Store:
        # Path-aware and id-bearing, because purge._object_paths now RECURSES: an entry with
        # a null id is a pseudo-folder to descend into, one with an id is a removable object.
        # The old fake answered the same single entry for every path, which under the real
        # (fixed) lister is an infinite tree.
        def list(self, path, _opts=None):
            return [{"name": "a.webp", "id": "obj1"}] if "/" not in path else []

        def remove(self, names):
            removed.append(tuple(names))

    class _Db:
        storage = type("S", (), {"from_": lambda _s, b: _Store()})()

        def table(self, n):
            return _Q(n)

    import pipeline

    pipeline.db = lambda: _Db()
    real_send = mailer.send_once

    def fake_send(to, subject, body, *, table, row_id, marker):
        sent.append((row_id, marker, subject))
        for r in rows:
            if r["id"] == row_id:
                r[marker] = "stamped"
        return True

    mailer.send_once = fake_send  # type: ignore[assignment]

    def kb(id_, days_ago, plan="free", **over):
        row = {
            "id": id_, "name": "Acme Help", "subdomain": "acme", "owner_id": "u1",
            "trial_started_at": (_now() - timedelta(days=days_ago)).isoformat(),
            "offline_at": None, "purge_at": None,
            "profiles": {"email": "a@b.com", "plan": plan},
            **{m: None for m in MARKERS},
        }
        row.update(over)
        return row

    def run(*kbs):
        sent.clear(); updates.clear(); deleted.clear(); removed.clear()
        rows.clear(); rows.extend(kbs)
        return sweep()

    try:
        # --- the countdown itself -------------------------------------------------
        now = _now()
        start = (now - timedelta(days=10)).isoformat()
        assert days_left(start, 30, now) == 20, days_left(start, 30, now)
        # A partial day rounds UP: 12 hours left is "1 day", never "0". Rounding toward
        # zero here would delete a help center the UI still showed as live.
        half = (now - timedelta(days=29, hours=12)).isoformat()
        assert days_left(half, 30, now) == 1, days_left(half, 30, now)
        assert days_left((now - timedelta(days=40)).isoformat(), 30, now) < 0

        # --- day 20: nothing at all ------------------------------------------------
        assert run(kb("k1", 10)) == 0, "no warning before day 14"
        assert sent == [] and updates == []

        # --- day 16 remaining=14: exactly one email, and only once ------------------
        row = kb("k2", 16)
        assert run(row) == 1
        assert [s[1] for s in sent] == [DAY14], sent
        assert "removed in 14 days" in sent[0][2], sent
        assert run(row) == 0, "a second tick must not re-send"

        # --- day 25 remaining=5: day-7 sends, day-14 marked WITHOUT sending ---------
        # The "worker was down for a week" case. Two warnings ninety seconds apart reads
        # as a bug and buries the urgent one.
        assert run(kb("k3", 25)) == 1
        assert [s[1] for s in sent] == [DAY7], sent
        assert updates and DAY14 in updates[0][1], updates
        assert not any(s[1] == DAY14 for s in sent), "day-14 must be marked, not sent"

        # --- day 31: offline. Two columns written, NO article touched ---------------
        assert run(kb("k4", 31)) == 1
        offline_write = [u for u in updates if "offline_at" in u[1]]
        assert offline_write, updates
        assert set(offline_write[0][1]) == {"offline_at", "purge_at"}, offline_write
        assert not any("visibility" in u[1] for u in updates), (
            "offline is a reader-side gate — article visibility is never mutated"
        )
        assert [s[1] for s in sent][-1] == OFFLINE
        assert deleted == [], "expiry must not delete anything"
        # ...and the state write happens BEFORE the email, so a dead provider cannot keep
        # an expired help center online.
        assert updates.index(offline_write[0]) < len(updates)

        # --- grace elapsed: purge, and the email goes before the row disappears -----
        past = kb("k5", 40, offline_at=(_now() - timedelta(days=8)).isoformat(),
                  purge_at=(_now() - timedelta(days=1)).isoformat(),
                  **{DAY14: "x", DAY7: "x", OFFLINE: "x"})
        assert run(past) == 1
        assert [s[1] for s in sent] == [PURGED], sent
        assert deleted == ["k5"], deleted
        assert removed and removed[0] == ("k5/a.webp",), removed

        # --- still inside the grace window: nothing happens -------------------------
        inside = kb("k6", 33, offline_at=_now().isoformat(),
                    purge_at=(_now() + timedelta(days=6)).isoformat(),
                    **{DAY14: "x", DAY7: "x", OFFLINE: "x"})
        assert run(inside) == 0, "a KB inside its grace window must be left alone"
        assert deleted == []

        # --- THE one that must never break: a paid/internal KB is untouchable -------
        # A mis-stamped trial_started_at on `internal` would delete a live reverse demo,
        # and reverse demos are the acquisition channel.
        for plan in ("internal", "starter", "growth", "founding"):
            assert run(kb("kx", 99, plan=plan)) == 0, plan
            assert sent == [] and deleted == [] and updates == [], (plan, sent, deleted)
    finally:
        mailer.send_once = real_send  # type: ignore[assignment]

    print("trial self-check OK")


if __name__ == "__main__":
    demo()
