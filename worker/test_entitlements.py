"""Runnable check for the cost floor: `python test_entitlements.py`.

Everything here guards spend, so the assertions are about what did NOT happen: no job row,
no pipeline call. A quota check that returns 402 *after* handing the video to Gemini has
already cost the money it exists to save.

  spend cap (all plans, internal included) -> free hard wall -> paid soft cap -> run

No pytest, no fixtures — the Supabase client is faked to the handful of chained calls the
endpoint actually makes, so this runs offline.
"""

import sys
import types

from fastapi.testclient import TestClient

import config

config.ALLOWED_ORIGINS = ["http://localhost:5173"]

import main  # noqa: E402
import pipeline  # noqa: E402

OWNER = "owner-uid"
MEMBER = "member-uid"
KB_ID = "kb-1"
VIDEO = f"{KB_ID}/recording.mp4"


class _Result:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class _Query:
    def __init__(self, db, table):
        self.db, self.table_name = db, table
        self._count = False
        self._insert = None
        self._eq = {}

    def select(self, *_a, **kw):
        self._count = kw.get("count") == "exact"
        return self

    def insert(self, payload):
        self._insert = payload
        return self

    def eq(self, col, val):
        self._eq[col] = val
        return self

    def gte(self, *_a):
        return self

    def in_(self, *_a):
        # The TestClient lifespan starts the real domain re-check loop; give it an empty
        # answer so its noise stays out of this file's output.
        self.table_name = "_sweep"
        return self

    def maybe_single(self):
        return self

    # The trial sweep runs in the background during these tests and chains `.not_.is_()`.
    # Without it every run prints a real-looking traceback for a query nothing here tests.
    @property
    def not_(self):
        return self

    def limit(self, *_a):
        return self

    def lt(self, *_a):
        return self

    def or_(self, *_a):
        return self

    def is_(self, *_a):
        return self

    def execute(self):
        if self._insert is not None:
            self.db.inserted.append(self._insert)
            return _Result([{"id": "job-new"}])
        if self.table_name == "_sweep":
            return _Result([])
        if self.table_name == "profiles":
            return _Result({"plan": self.db.plan})
        if self.table_name == "knowledge_bases":
            return _Result({"owner_id": OWNER})
        if self.table_name == "kb_members":
            # An active membership row exists only for whoever _FakeDb was told about.
            return _Result([{"user_id": self._eq.get("user_id")}]
                           if self._eq.get("user_id") == self.db.member else [])
        # jobs: either the quota count or the spend scan
        if self._count:
            return _Result([], count=self.db.runs_used)
        return _Result([{"est_cost_usd": self.db.spend_today}])


class _FakeDb:
    def __init__(self, plan="free", runs_used=0, spend_today=0.0, member=None):
        self.plan, self.runs_used, self.spend_today = plan, runs_used, spend_today
        self.member = member
        self.inserted: list[dict] = []

    def table(self, name):
        return _Query(self, name)


def _install(db, as_user=OWNER):
    pipeline.db = lambda: db
    main._auth_uid = lambda _auth: as_user
    # The pipeline itself is out of scope here — what matters is whether we got far enough
    # to schedule it at all.
    pipeline.run = lambda *a, **k: ran.append(a)
    return db


ran: list = []


def _generate(c):
    # Two-tier context since 0027: the product half is the KB's, the recording half is this
    # file's. Both go into jobs.context so a retry re-grounds on what the run actually used.
    return c.post(
        "/api/generate",
        json={
            "kb_id": KB_ID,
            "video_path": VIDEO,
            "product": {"product_name": "Acme"},
            "recording": "",
        },
    )


def run() -> None:
    # --- free tier, under the cap: proceeds
    db = _install(_FakeDb(plan="free", runs_used=2))
    with TestClient(main.app) as c:
        assert _generate(c).status_code == 200
    assert len(db.inserted) == 1, "an allowed run must create its ledger row"
    assert db.inserted[0]["user_id"] == OWNER, "the ledger is keyed by OWNER, not by KB"
    assert db.inserted[0]["billed_to_user_id"] == OWNER
    assert db.inserted[0]["over_cap"] is False

    # --- a MEMBER presses the button: allowed, and the run is billed to the OWNER.
    # Entitlements resolve through the KB owner, never the caller — a free-plan admin
    # inside a paid help center spends the owner's runs, not their own (team-access §4).
    db = _install(_FakeDb(plan="free", runs_used=2, member=MEMBER), as_user=MEMBER)
    with TestClient(main.app) as c:
        assert _generate(c).status_code == 200
    assert db.inserted[0]["user_id"] == MEMBER, "who pressed the button"
    assert db.inserted[0]["billed_to_user_id"] == OWNER, "who pays"

    # --- a stranger with a valid session is still refused: no membership row, no run.
    ran.clear()
    db = _install(_FakeDb(plan="free", member=MEMBER), as_user="stranger-uid")
    with TestClient(main.app) as c:
        assert _generate(c).status_code == 403
    assert not db.inserted and not ran, "a non-member must not reach the ledger"

    # --- free tier, at the cap: HARD wall, and nothing is spent reaching it
    ran.clear()
    db = _install(_FakeDb(plan="free", runs_used=3))
    with TestClient(main.app) as c:
        r = _generate(c)
        assert r.status_code == 402, r.status_code
        assert r.json()["detail"]["code"] == "quota_exceeded", r.text
    assert db.inserted == [], "a refused run must not create a job row"
    assert ran == [], "a refused run must never reach the pipeline"

    # --- a hand-edited plan lifts the cap with no other change (the manual upgrade path)
    db = _install(_FakeDb(plan="starter", runs_used=99))
    with TestClient(main.app) as c:
        assert _generate(c).status_code == 200
    assert len(db.inserted) == 1

    # --- paid over the monthly cap: SOFT. It proceeds, flagged, rather than blocking a
    # paying customer mid-fill in week one.
    db = _install(_FakeDb(plan="starter", runs_used=config.PLANS["starter"]["monthly_runs"]))
    with TestClient(main.app) as c:
        assert _generate(c).status_code == 200
    assert db.inserted[0]["over_cap"] is True, "an over-cap paid run must be flagged"

    # --- the circuit breaker is global and plan-independent. `internal` is unlimited by
    # PLANS and must STILL be refused: a runaway loop on our own account is exactly the
    # bill this exists to stop.
    for plan in ("free", "starter", "internal"):
        ran.clear()
        db = _install(_FakeDb(plan=plan, spend_today=config.DAILY_SPEND_CAP_USD))
        with TestClient(main.app) as c:
            r = _generate(c)
            assert r.status_code == 503, f"{plan}: {r.status_code}"
            assert r.json()["detail"]["code"] == "spend_cap", r.text
        assert db.inserted == [], f"{plan}: spend cap must not create a job row"
        assert ran == [], f"{plan}: spend cap must not reach the pipeline"

    # --- a video path outside the KB we just proved ownership of is refused. Objects are
    # keyed by KB, so this is what stops one KB's job reading another's recording.
    db = _install(_FakeDb(plan="starter"))
    with TestClient(main.app) as c:
        r = c.post(
            "/api/generate",
            json={
                "kb_id": KB_ID,
                "video_path": "other-kb/steal.mp4",
                "product": {"product_name": "Acme"},
            },
        )
        assert r.status_code == 403, r.status_code
    assert db.inserted == []

    print("entitlements self-check OK")


if __name__ == "__main__":
    if not isinstance(pipeline, types.ModuleType):  # pragma: no cover
        sys.exit("pipeline import failed")
    run()
