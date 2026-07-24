"""Runnable check for the custom-domain endpoints: `python test_domain_api.py`.

The state machine's pure logic is covered by `python domain.py`. What this covers is the
part that only exists in the endpoint — the ORDER of the guards in /api/domain/connect.
Every one of them has to run before we register anything with the hosting provider:

  bad domain -> reserved host -> paid plan -> already taken -> attach -> write the row

Reorder any of those and the failure is silent and expensive: free accounts registering
domains on our Vercel project, or a KB left in `pending` against a domain we never attached.
So the assertions are about which calls happened, not just the status code.

No pytest, no fixtures — the Supabase client is faked to the handful of chained calls the
endpoints actually make, so this runs offline.
"""

import sys
import types

from fastapi.testclient import TestClient

import config

config.DOMAIN_VERIFIER = "stub"

import domain  # noqa: E402
import main  # noqa: E402
import pipeline  # noqa: E402

OWNER = "owner-uid"
KB_ID = "kb-1"


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    """Just enough of the postgrest fluent chain: select/eq/neq/in_/update/maybe_single."""

    def __init__(self, db, table):
        self.db, self.table_name = db, table
        self._filters = {}
        self._update = None

    def select(self, *_a, **_k):
        return self

    def update(self, payload):
        self._update = payload
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def neq(self, col, val):
        self._filters[f"not.{col}"] = val
        return self

    def in_(self, col, vals):
        # Used by the background sweep, which the TestClient lifespan starts for real.
        self._filters[f"in.{col}"] = vals
        return self

    def maybe_single(self):
        return self

    def single(self):
        return self

    def execute(self):
        if self._update is not None:
            self.db.updates.append(self._update)
            self.db.rows[0].update(self._update)
            return _Result([self.db.rows[0]])
        def keep(r):
            for c, v in self._filters.items():
                if c.startswith("not."):
                    if r.get(c[4:]) == v:
                        return False
                elif c.startswith("in."):
                    if r.get(c[3:]) not in v:
                        return False
                elif r.get(c) != v:
                    return False
            return True

        matched = [r for r in self.db.rows if keep(r)]
        return _Result(matched[0] if "id" in self._filters and matched else matched)


class _FakeDb:
    def __init__(self, **kb):
        row = {
            "id": KB_ID,
            "owner_id": OWNER,
            "subdomain": "acme",
            "custom_domain": None,
            "domain_status": "none",
            "domain_attempts": 0,
            "plan": "free",
        }
        row.update(kb)
        self.rows = [row]
        self.updates = []

    def table(self, name):
        return _Query(self, name)


def _install(db):
    pipeline.db = lambda: db
    # The JWT check is a separate concern (it has its own guard in main); stub it so this
    # test is about the domain guards only.
    main._auth_uid = lambda _auth: OWNER
    return db


def _client():
    return TestClient(main.app)


def _connect(c, d):
    return c.post("/api/domain/connect", json={"kb_id": KB_ID, "domain": d})


def run() -> None:
    calls: list[tuple[str, str]] = []
    real_attach, real_detach = domain.StubHosting.attach, domain.StubHosting.detach
    domain.StubHosting.attach = lambda self, d: (calls.append(("attach", d)), real_attach(self, d))[1]
    domain.StubHosting.detach = lambda self, d: (calls.append(("detach", d)), real_detach(self, d))[1]
    domain._hosting = None

    # --- junk never reaches the state machine
    db = _install(_FakeDb(plan="starter"))
    with _client() as c:
        assert _connect(c, "not a domain").status_code == 400
        assert _connect(c, "http://acme.com").status_code == 400

        # --- our own hosts are not claimable: reader_kb resolves a host to whichever KB
        # claims it, so this would hand over the app's traffic.
        assert _connect(c, f"app.{config.READER_DOMAIN}").status_code == 400
        assert _connect(c, config.READER_DOMAIN).status_code == 400
        assert calls == [], f"rejected domains must never be registered: {calls}"
        assert db.updates == [], "rejected domains must never touch the row"

    # --- paid wall OFF (the shipped default: no checkout exists yet) — a free KB connects
    assert config.DOMAIN_REQUIRES_PAID_PLAN is False, "shipped default should be off"
    db = _install(_FakeDb(plan="free"))
    with _client() as c:
        assert _connect(c, "docs.acme.com").status_code == 200
    assert calls == [("attach", "docs.acme.com")], calls

    # --- paid wall ON (flipped when payments land): it must run BEFORE we register
    # anything, or free accounts burn domains on our hosting project.
    calls.clear()
    config.DOMAIN_REQUIRES_PAID_PLAN = True
    try:
        db = _install(_FakeDb(plan="free"))
        with _client() as c:
            r = _connect(c, "docs.acme.com")
            assert r.status_code == 402, r.status_code
            assert calls == [], f"free plan must not reach the hosting provider: {calls}"
            assert db.updates == []
        # ...and a paid KB still gets through.
        db = _install(_FakeDb(plan="starter"))
        with _client() as c:
            assert _connect(c, "docs.acme.com").status_code == 200
    finally:
        config.DOMAIN_REQUIRES_PAID_PLAN = False
    calls.clear()

    # --- happy path: registered first, then the row is written
    db = _install(_FakeDb(plan="starter"))
    with _client() as c:
        r = _connect(c, "docs.acme.com")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "pending"
        assert body["records"][0]["type"] == "CNAME"
        assert calls == [("attach", "docs.acme.com")], calls
        assert db.updates[-1]["custom_domain"] == "docs.acme.com"
        assert db.updates[-1]["domain_attempts"] == 0

        # --- records survive a reload without re-registering state
        r = c.post("/api/domain/records", json={"kb_id": KB_ID})
        assert r.status_code == 200 and r.json()["records"], r.text

    # --- swapping domains releases the old one, or it serves this KB forever
    calls.clear()
    db = _install(_FakeDb(plan="starter", custom_domain="old.acme.com", domain_status="live"))
    with _client() as c:
        assert _connect(c, "new.acme.com").status_code == 200
    assert calls == [("attach", "new.acme.com"), ("detach", "old.acme.com")], calls

    # --- a domain held by another KB is refused with something a human can act on
    calls.clear()
    db = _install(_FakeDb(plan="starter"))
    db.rows.append({"id": "kb-2", "owner_id": "someone", "custom_domain": "taken.acme.com"})
    with _client() as c:
        assert _connect(c, "taken.acme.com").status_code == 409
    assert calls == [], "a taken domain must not be registered"

    # --- disconnect releases the host as well as clearing the row
    calls.clear()
    db = _install(_FakeDb(plan="starter", custom_domain="docs.acme.com", domain_status="live"))
    with _client() as c:
        assert c.post("/api/domain/disconnect", json={"kb_id": KB_ID}).status_code == 200
    assert calls == [("detach", "docs.acme.com")], calls
    assert db.updates[-1]["custom_domain"] is None

    domain.StubHosting.attach, domain.StubHosting.detach = real_attach, real_detach
    print("domain API self-check OK")


if __name__ == "__main__":
    if not isinstance(pipeline, types.ModuleType):  # pragma: no cover
        sys.exit("pipeline import failed")
    run()
