"""Runnable check for the failure taxonomy: `python test_failures.py`.

Two things are worth testing here and nothing else is:

  1. DEGRADE BEFORE YOU FAIL. Stage 2 dying and some frames dying must both still produce
     an article — and must still count against quota, because the user got one. Getting
     this backwards is invisible in code review and obvious to a customer.
  2. A REAL failure never charges for the run, and lands the RIGHT code. A user told their
     recording is corrupt when Gemini was down re-records, fails again, and leaves.

No pytest, no fixtures. The Supabase client, ffmpeg and Gemini are faked to the handful of
calls the pipeline actually makes, so this runs offline and in about a second.
"""

import sys
import types
from pathlib import Path

import config
import failures
import pipeline
from models import Blueprint, BlueprintStep

JOB = "job-1"
KB = "kb-1"
VIDEO = f"{KB}/recording.mp4"
CONTEXT = {"product_name": "Acme", "audience": "", "tone": "", "description": ""}


def _blueprint(n: int) -> Blueprint:
    return Blueprint(
        title="T",
        subtitle="S",
        steps=[
            BlueprintStep(step_number=i, heading=f"H{i}", body_text=f"B{i}", timestamp="00:0%d" % i)
            for i in range(1, n + 1)
        ],
    )


class _Result:
    def __init__(self, data, count=0):
        self.data = data
        self.count = count


class _Query:
    def __init__(self, db, table):
        self.db, self.table = db, table
        self._op = None
        self._payload = None

    def insert(self, payload):
        self._op, self._payload = "insert", payload
        return self

    def update(self, payload):
        self._op, self._payload = "update", payload
        return self

    def eq(self, *_a):
        return self

    def execute(self):
        self.db.calls.append((self.table, self._op, self._payload))
        if self.table == "articles" and self._op == "insert":
            return _Result([{"id": "article-1"}])
        return _Result([])


class _Storage:
    def from_(self, _bucket):
        return self

    def download(self, _path):
        return b"fake-video-bytes"


class _Db:
    def __init__(self):
        self.calls: list[tuple] = []
        self.storage = _Storage()

    def table(self, name):
        return _Query(self, name)

    # --- assertions the tests read the recording through -------------------
    def job_updates(self) -> list[dict]:
        return [p for t, op, p in self.calls if t == "jobs" and op == "update"]

    def final_job(self) -> dict:
        """The merged view of what landed on the job row."""
        merged: dict = {}
        for u in self.job_updates():
            merged.update(u)
        return merged

    def steps_inserted(self) -> list[dict]:
        for t, op, p in self.calls:
            if t == "steps" and op == "insert":
                return p
        return []

    def article_created(self) -> bool:
        return any(t == "articles" and op == "insert" for t, op, _ in self.calls)


class _Frames:
    """ffmpeg stand-in. `bad_steps` is the set of step numbers whose frame won't render."""

    def __init__(self, duration=60.0, probe_error=None, bad_steps=(), dense_error=None):
        self.duration = duration
        self.probe_error = probe_error
        self.bad_steps = set(bad_steps)
        self.dense_error = dense_error

    def probe_duration(self, _path):
        if self.probe_error:
            raise self.probe_error
        return self.duration

    def extract_frame(self, _video, seconds, out_path: Path):
        # step-N.webp -> N
        n = int(out_path.stem.split("-")[1])
        if n in self.bad_steps:
            raise failures.Failed(failures.FRAME_EXTRACTION_FAILED, f"no frame at {seconds}")
        return out_path

    def extract_dense_set(self, _video, out_dir: Path):
        if self.dense_error:
            raise self.dense_error
        return [(0, out_dir / "00001.webp")]


class _Gemini:
    """Two calls, in order: Stage 1 then Stage 2. Either can be told to blow up."""

    def __init__(self, stage1=None, stage2=None, stage1_error=None, stage2_error=None):
        self.stage1 = stage1
        self.stage2 = stage2
        self.stage1_error = stage1_error
        self.stage2_error = stage2_error
        self.n = 0

    def generate_json(self, *, model, contents, schema):
        self.n += 1
        if self.n == 1:
            if self.stage1_error:
                raise self.stage1_error
            return self.stage1
        if self.stage2_error:
            raise self.stage2_error
        return self.stage2


def _run(frames_stub, gemini_stub) -> _Db:
    """Run the pipeline against fakes and return the recorded database calls."""
    db = _Db()
    pipeline.db = lambda: db
    pipeline.frames_mod = frames_stub
    pipeline.gemini = gemini_stub
    # Upload is not what this file is about; keep it offline and return the path.
    pipeline._upload_frame = lambda _local, storage_path: storage_path
    try:
        pipeline.run(JOB, KB, VIDEO, CONTEXT)
    except Exception:
        pass  # run() re-raises for the server log; the job row is what we assert on
    return db


# ---------------------------------------------------------------------------
# Degrade before you fail
# ---------------------------------------------------------------------------
def test_stage2_failure_ships_an_editable_article():
    bp = _blueprint(3)
    db = _run(
        _Frames(),
        _Gemini(stage1=bp, stage2_error=failures.Failed(failures.MODEL_UNAVAILABLE, "503")),
    )
    job = db.final_job()

    assert job["status"] == "done", f"Stage 2 must not fail the run: {job}"
    assert job["counted_against_quota"] is True, "they got an article — it counts"
    assert failures.DEGRADED_STAGE2 in (job["degraded"] or ""), job["degraded"]
    assert "failure_code" not in job, "a degraded run is not a failure"
    # Stage 1's own text shipped, unpolished.
    assert [s["body_text"] for s in db.steps_inserted()] == ["B1", "B2", "B3"]


def test_partial_frame_failure_ships_text_only_steps():
    bp = _blueprint(3)
    db = _run(_Frames(bad_steps=[2]), _Gemini(stage1=bp, stage2=bp))
    job = db.final_job()

    assert job["status"] == "done", f"one bad frame must not fail the run: {job}"
    assert job["counted_against_quota"] is True
    assert failures.DEGRADED_FRAMES in (job["degraded"] or ""), job["degraded"]

    shots = {s["step_number"]: s["screenshot_url"] for s in db.steps_inserted()}
    assert shots[2] is None, "the failed step renders text-only, with '+ Add image'"
    assert shots[1] and shots[3], "the steps that worked keep their screenshots"


def test_dense_set_failure_only_costs_the_filmstrip():
    bp = _blueprint(2)
    db = _run(
        _Frames(dense_error=failures.Failed(failures.FRAME_EXTRACTION_FAILED, "no dense")),
        _Gemini(stage1=bp, stage2=bp),
    )
    job = db.final_job()
    assert job["status"] == "done", "losing the filmstrip is not losing the article"
    assert job["counted_against_quota"] is True


# ---------------------------------------------------------------------------
# Real failures: right code, and never charged
# ---------------------------------------------------------------------------
def _assert_failed(db: _Db, code: str):
    job = db.final_job()
    assert job["status"] == "error", job
    assert job["failure_code"] == code, f"expected {code}, got {job.get('failure_code')}"
    assert "counted_against_quota" not in job, "a FAILED run must never burn a run"
    assert job.get("failure_detail"), "the detail is logged, even though it is never shown"
    assert "error" not in job, "the `error` column was dropped in 0020 — do not resurrect it"


def test_unreadable_video():
    db = _run(
        _Frames(probe_error=failures.Failed(failures.VIDEO_UNREADABLE, "ffprobe blew up")),
        _Gemini(),
    )
    _assert_failed(db, failures.VIDEO_UNREADABLE)
    assert not db.article_created()


def test_video_too_long():
    db = _run(_Frames(duration=config.MAX_VIDEO_MINUTES * 60 + 1), _Gemini())
    _assert_failed(db, failures.VIDEO_TOO_LONG)


def test_stage1_failure_is_a_real_failure():
    db = _run(
        _Frames(),
        _Gemini(stage1_error=failures.Failed(failures.MODEL_UNAVAILABLE, "Gemini 503")),
    )
    _assert_failed(db, failures.MODEL_UNAVAILABLE)
    assert not db.article_created(), "nothing to give the user"


def test_total_frame_failure_is_a_real_failure():
    bp = _blueprint(3)
    db = _run(_Frames(bad_steps=[1, 2, 3]), _Gemini(stage1=bp, stage2=bp))
    _assert_failed(db, failures.FRAME_EXTRACTION_FAILED)


def test_unclassified_exception_still_lands_a_code():
    """The stuck-spinner guard: an unexpected error must never leave failure_code null."""
    db = _run(_Frames(), _Gemini(stage1_error=ValueError("something nobody predicted")))
    _assert_failed(db, failures.INTERNAL_ERROR)


def test_timeout_is_classified_at_the_stage_boundary():
    bp = _blueprint(2)
    db = _Db()
    pipeline.db = lambda: db
    pipeline.frames_mod = _Frames()
    pipeline.gemini = _Gemini(stage1=bp, stage2=bp)
    pipeline._upload_frame = lambda _l, p: p
    # Pretend the clock jumped past the ceiling while Stage 1 was running.
    real_monotonic = pipeline.time.monotonic
    calls = {"n": 0}

    def creeping():
        calls["n"] += 1
        return real_monotonic() + (config.JOB_TIMEOUT_MIN * 60 + 1 if calls["n"] > 2 else 0)

    pipeline.time.monotonic = creeping
    try:
        pipeline.run(JOB, KB, VIDEO, CONTEXT)
    except Exception:
        pass
    finally:
        pipeline.time.monotonic = real_monotonic
    _assert_failed(db, failures.TIMEOUT)


# ---------------------------------------------------------------------------
# A blocked response is not malformed JSON
# ---------------------------------------------------------------------------
def test_safety_block_is_not_reported_as_bad_output():
    """model_blocked offers support; model_bad_output offers a retry button. Confusing the
    two hands the user a button that cannot possibly work."""
    import gemini as gemini_mod

    blocked = types.SimpleNamespace(
        prompt_feedback=None,
        candidates=[types.SimpleNamespace(finish_reason="FinishReason.SAFETY")],
    )
    assert gemini_mod.blocked_reason(blocked), "a SAFETY finish_reason must be detected"

    fine = types.SimpleNamespace(
        prompt_feedback=None,
        candidates=[types.SimpleNamespace(finish_reason="FinishReason.STOP")],
    )
    assert gemini_mod.blocked_reason(fine) is None, "a normal STOP is not a block"


# ---------------------------------------------------------------------------
# Retry: re-runs from Storage, never re-asks for the file
# ---------------------------------------------------------------------------
class _RetryDb:
    """Just enough Supabase for POST /api/retry: the job lookup, the object check, and
    the entitlement reads _start_run makes on the way to the insert."""

    def __init__(self, *, status="error", video_path=VIDEO, purged_at=None, object_exists=True):
        self.job = {
            "id": JOB,
            "kb_id": KB,
            "status": status,
            "video_path": video_path,
            "video_purged_at": purged_at,
            "context": CONTEXT,
        }
        self.object_exists = object_exists
        self.inserted: list[dict] = []
        self.storage = self._Storage(self)

    class _Storage:
        def __init__(self, db):
            self.db = db

        def from_(self, _bucket):
            return self

        def list(self, folder, opts):
            name = opts["search"]
            self.db.listed = (folder, name)
            return [{"name": name}] if self.db.object_exists else []

    class _Q:
        def __init__(self, db, table):
            self.db, self.table = db, table
            self._insert = None
            self._count = False
            self._single = False

        def select(self, *_a, **kw):
            self._count = kw.get("count") == "exact"
            return self

        def insert(self, payload):
            self._insert = payload
            return self

        def eq(self, *_a):
            return self

        def gte(self, *_a):
            return self

        def in_(self, *_a):
            # Silence the background sweeps' queries.
            self.table = "_sweep"
            return self

        def lt(self, *_a):
            return self

        def limit(self, *_a):
            return self

        def maybe_single(self):
            self._single = True
            return self

        def execute(self):
            if self._insert is not None:
                self.db.inserted.append(self._insert)
                return _Result([{"id": "job-2"}])
            if self.table == "_sweep":
                return _Result([])
            if self.table == "profiles":
                return _Result({"plan": "free"})
            if self.table == "knowledge_bases":
                return _Result({"owner_id": "owner"})
            if self.table == "jobs":
                if self._single:
                    return _Result(self.db.job)  # the retry lookup
                return _Result([])  # the spend scan / the quota count
            return _Result([])

    def table(self, name):
        return self._Q(self, name)


def _retry(db):
    """POST /api/retry against `db`. Returns the response.

    Restores pipeline.run afterwards — leaving the stub installed silently disarms every
    pipeline test that runs after this one alphabetically.
    """
    from fastapi.testclient import TestClient

    config.ALLOWED_ORIGINS = ["http://localhost:5173"]
    import main

    pipeline.db = lambda: db
    main._require_owner = lambda _auth, _kb: "owner"
    started.clear()
    real_run = pipeline.run
    pipeline.run = lambda *a, **k: started.append(a)
    try:
        with TestClient(main.app) as c:
            return c.post("/api/retry", json={"job_id": JOB})
    finally:
        pipeline.run = real_run


started: list = []


def test_retry_reruns_from_storage_without_a_reupload():
    db = _RetryDb()
    r = _retry(db)
    assert r.status_code == 200, r.text

    row = db.inserted[0]
    assert row["video_path"] == VIDEO, "retry must re-use the stored recording, not a new one"
    assert row["context"] == CONTEXT, "the same grounding, or it builds a different article"
    assert row["retry_of"] == JOB, "the attempt must point back at what it retries"
    assert row.get("counted_against_quota") is not True, "nothing is charged until it succeeds"
    assert started and started[0][2] == VIDEO, "the pipeline runs against the SAME object"


def test_retry_after_the_purge_says_upload_it_again():
    """Past 7 days the sweep has taken the recording. The user must get a clean
    'upload it again', never a signed-URL error."""
    # Marked purged in the ledger — answered without touching Storage.
    r = _retry(_RetryDb(purged_at="2026-01-01T00:00:00Z"))
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["code"] == failures.VIDEO_PURGED, r.text

    # And the object is CHECKED, not assumed: gone from Storage with the marker unset
    # (an early purge, a failed sweep) must reach the same state.
    db = _RetryDb(object_exists=False)
    r = _retry(db)
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["code"] == failures.VIDEO_PURGED, r.text
    assert db.listed == (KB, "recording.mp4"), "must actually ask Storage"
    assert db.inserted == [], "no job row for a run that cannot happen"


def test_retry_of_a_job_that_did_not_fail_is_refused():
    r = _retry(_RetryDb(status="done"))
    assert r.status_code == 409, r.text


def test_every_code_has_copy_on_the_other_side():
    """The worker's codes and the SPA's copy are two lists that must not drift.

    A code with no entry in web/src/lib/failures.ts falls back to the internal_error
    screen — which is a real screen, so nothing crashes and nobody notices that
    `video_too_long` has silently started telling users it's our fault.
    """
    ts = Path(__file__).resolve().parents[1] / "web" / "src" / "lib" / "failures.ts"
    if not ts.exists():  # the worker can be deployed on its own
        return
    text = ts.read_text(encoding="utf-8")

    codes = {
        v
        for k, v in vars(failures).items()
        if k.isupper() and isinstance(v, str) and not k.startswith("DEGRADED")
    }
    # quota_exceeded is exported by the SPA but deliberately NOT in the copy map: it is
    # the upgrade modal, and rendering it as a failure is the bug this excludes.
    for code in sorted(codes):
        assert f"{code}:" in text or f"'{code}'" in text, (
            f"{code} has no copy in web/src/lib/failures.ts — it would silently render "
            "the generic 'this one's on us' screen"
        )


def run():
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
    print("failure taxonomy self-check OK")


if __name__ == "__main__":
    if not isinstance(pipeline, types.ModuleType):  # pragma: no cover
        sys.exit("pipeline import failed")
    run()
