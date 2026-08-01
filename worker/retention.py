"""Source-video retention — the collection path publishing can't reach.

ux-spec §9: the recording is kept until the article is first published, then deleted. The
SPA does that on publish. But a job that FAILED never produces an article and never reaches
a publish event, so its upload would sit in Storage forever — and the promise on the upload
screen ("we delete the source video once your article is published") would quietly not
apply to exactly the users whose run went wrong.

Written as a STATE QUERY, not a scheduled event: "every failed job older than N days whose
video hasn't been purged". A missed tick self-heals on the next one, running it twice is
harmless, and there is no moment anything has to fire at.
"""

import logging
from datetime import datetime, timedelta, timezone

import config
import failures

log = logging.getLogger("quink.retention")


def sweep_timeouts() -> int:
    """Fail jobs that have been in flight far too long. Returns how many were closed.

    TWO cases, two clocks, two codes — because they are two different things (slice 3i):

      HUNG      status='running', measured from `started_at`. The pipeline checks its own
                deadline at every stage boundary, so this only fires when that check could
                not run: the worker process died mid-run — a deploy, an idle-instance
                recycle, an OOM — leaving the row at 'running' with nobody to write to it.
                That row is the stuck spinner the SPA polls forever.

      NEVER RAN status='queued', measured from `created_at`, against a much longer ceiling.
                A job waiting on a lane (slice 3c) is a capacity problem, not a hung
                process. Sharing JOB_TIMEOUT_MIN with the case above meant that on the free
                tier's single lane, the fourth of four dropped recordings was failed as a
                TIMEOUT for waiting its turn — and told "no worker progress", which is not
                what happened.

    Both are STATE queries ("in this state, older than this ceiling"), never scheduled
    events, so a missed tick self-heals and running it twice is harmless.
    `counted_against_quota` is untouched by either — neither ever burns a run.
    """
    return _sweep_hung() + _sweep_never_started()


def _close(job_id: str, code: str, detail: str) -> bool:
    import pipeline

    try:
        pipeline.fail(job_id, code, detail)
        return True
    except Exception:
        log.exception("could not close in-flight job %s", job_id)
        return False


def _sweep_hung() -> int:
    """Running, but nothing has moved it for JOB_TIMEOUT_MIN + grace."""
    import pipeline

    ceiling = config.JOB_TIMEOUT_MIN + config.JOB_TIMEOUT_GRACE_MIN
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=ceiling)).isoformat()
    try:
        res = (
            pipeline.db()
            .table("jobs")
            .select("id")
            .eq("status", "running")
            # started_at is null on rows written before migration 0028; fall back to
            # created_at for those rather than leaving them un-sweepable forever.
            .or_(f"started_at.lt.{cutoff},and(started_at.is.null,created_at.lt.{cutoff})")
            .limit(200)
            .execute()
        )
    except Exception:
        log.exception("job timeout sweep query failed")
        return 0

    closed = sum(
        _close(
            job["id"],
            failures.TIMEOUT,
            f"no worker progress for {ceiling} min since started_at - swept "
            "(the worker process most likely died mid-run)",
        )
        for job in res.data or []
    )
    if closed:
        log.warning("timeout sweep closed %s hung job(s)", closed)
    return closed


def _sweep_never_started() -> int:
    """Queued far past any legitimate wait for a lane. No work was attempted, so this is
    NOT a timeout: the copy on the other side says it never ran and offers a plain retry."""
    import pipeline

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=config.QUEUE_TIMEOUT_MIN)
    try:
        res = (
            pipeline.db()
            .table("jobs")
            .select("id")
            .eq("status", "queued")
            .lt("created_at", cutoff.isoformat())
            .limit(200)
            .execute()
        )
    except Exception:
        log.exception("queued-job sweep query failed")
        return 0

    closed = sum(
        _close(
            job["id"],
            failures.NEVER_STARTED,
            f"queued for over {config.QUEUE_TIMEOUT_MIN} min without acquiring a lane - "
            "swept (no work was attempted and nothing was spent)",
        )
        for job in res.data or []
    )
    if closed:
        log.warning("queue sweep closed %s job(s) that never started", closed)
    return closed

def sweep() -> int:
    """Purge recordings from long-dead jobs. Returns how many were collected."""
    import pipeline

    cutoff = datetime.now(timezone.utc) - timedelta(days=config.FAILED_VIDEO_RETENTION_DAYS)
    try:
        res = (
            pipeline.db()
            .table("jobs")
            .select("id, video_path")
            .eq("status", "error")
            .not_.is_("video_path", "null")
            .is_("video_purged_at", "null")
            .lt("created_at", cutoff.isoformat())
            .limit(200)
            .execute()
        )
    except Exception:
        log.exception("failed-video sweep query failed")
        return 0

    purged = 0
    for job in res.data or []:
        path = job["video_path"]
        try:
            # Delete the object FIRST, then mark it. The other order would strand the
            # object with nothing left pointing at it, so nothing would ever retry.
            pipeline.db().storage.from_(config.BUCKET_VIDEOS).remove([path])
        except Exception:
            # Leave the marker unset so the next sweep tries again. An object that is
            # already gone still marks below — remove() does not raise on a missing key.
            log.exception("could not delete %s for job %s", path, job["id"])
            continue

        pipeline.db().table("jobs").update(
            {"video_purged_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", job["id"]).execute()
        purged += 1

    if purged:
        log.info("purged %s source recording(s) from failed jobs", purged)
    return purged


def demo() -> None:
    """Self-check for the query shape: `python retention.py`.

    The sweep's correctness is entirely in WHICH rows it selects — a wrong filter either
    deletes a live recording or never collects anything. No network: a fake client records
    the filters and replays a fixed row set.
    """
    calls: list[tuple] = []

    class _Q:
        def __init__(self, tbl):
            self.tbl = tbl
            self.f = {}

        def select(self, *_a):
            return self

        def eq(self, k, v):
            self.f[k] = v
            calls.append(("eq", k, v))
            return self

        def lt(self, k, v):
            self.f["lt." + k] = v
            calls.append(("lt", k, v))
            return self

        def is_(self, k, v):
            self.f["is." + k] = v
            calls.append(("is", k, v))
            return self

        def in_(self, k, v):
            self.f["in." + k] = v
            calls.append(("in", k, tuple(v)))
            return self

        def or_(self, expr):
            calls.append(("or", expr))
            return self

        @property
        def not_(self):
            calls.append(("not",))
            return _Not(self)

        def limit(self, _n):
            return self

        def update(self, payload):
            calls.append(("update", payload))
            return self

        def execute(self):
            if self.tbl == "jobs" and "update" not in [c[0] for c in calls[-1:]]:
                return type("R", (), {"data": [{"id": "j1", "video_path": "kb/v.mp4"}]})()
            return type("R", (), {"data": []})()

    class _Not:
        def __init__(self, q):
            self.q = q

        def is_(self, k, v):
            calls.append(("not.is", k, v))
            return self.q

    class _Storage:
        def from_(self, _b):
            return self

        def remove(self, paths):
            calls.append(("remove", tuple(paths)))

    class _Db:
        storage = _Storage()

        def table(self, name):
            return _Q(name)

    import pipeline

    pipeline.db = lambda: _Db()
    purged = sweep()

    assert ("eq", "status", "error") in calls, "must only ever consider FAILED jobs"
    assert ("not.is", "video_path", "null") in calls, "must skip jobs with no recording"
    assert ("is", "video_purged_at", "null") in calls, "must skip already-purged jobs"
    lt = [c for c in calls if c[0] == "lt" and c[1] == "created_at"]
    assert lt, "must filter on age, not fire on a schedule"
    age = datetime.now(timezone.utc) - datetime.fromisoformat(lt[0][2])
    assert (
        abs(age.days - config.FAILED_VIDEO_RETENTION_DAYS) <= 1
    ), f"cutoff should be ~{config.FAILED_VIDEO_RETENTION_DAYS}d ago, got {age}"

    rm = [c for c in calls if c[0] == "remove"]
    assert rm == [("remove", ("kb/v.mp4",))], f"one delete of the job's video: {rm}"
    assert calls.index(("remove", ("kb/v.mp4",))) < [
        i for i, c in enumerate(calls) if c[0] == "update"
    ][0], "must delete the object BEFORE marking it purged"
    assert purged == 1

    # --- the timeout sweep: two clocks, two codes (slice 3i) -----------------
    # Correctness is entirely in which rows each half picks. Too broad and it kills healthy
    # in-flight runs; too narrow and the abandoned row nobody is working on stays at
    # 'running' forever, which is the single worst state the product can be in. And since
    # lanes, a third way to get it wrong: measuring a queued job's WAIT as if it were WORK.
    calls.clear()
    closed = sweep_timeouts()

    # HUNG — running only, measured from started_at.
    assert ("eq", "status", "running") in calls, "the hung sweep considers RUNNING jobs only"
    ors = [c for c in calls if c[0] == "or"]
    assert ors, "hung jobs must be selected on started_at, not created_at"
    assert "started_at.lt." in ors[0][1], f"measure work from started_at: {ors[0][1]}"
    assert "created_at.lt." in ors[0][1], (
        "rows written before migration 0028 have no started_at and must still be sweepable"
    )

    # NEVER RAN — queued only, on its own much longer clock.
    assert ("eq", "status", "queued") in calls, "the queue sweep considers QUEUED jobs only"
    lt = [c for c in calls if c[0] == "lt" and c[1] == "created_at"]
    assert lt, "must filter on age, not fire on a schedule"
    qcut = datetime.fromisoformat(lt[-1][2])
    qage = (datetime.now(timezone.utc) - qcut).total_seconds() / 60
    assert abs(qage - config.QUEUE_TIMEOUT_MIN) < 1, (
        f"queue cutoff should be ~{config.QUEUE_TIMEOUT_MIN}min ago, got {qage:.1f}min"
    )

    # THE BUG THIS FIXES. On one lane, four dropped recordings put the last one well past
    # the RUNNING ceiling before it starts. It must not be swept for waiting its turn.
    waited = config.JOB_TIMEOUT_MIN + config.JOB_TIMEOUT_GRACE_MIN + 5
    assert waited < config.QUEUE_TIMEOUT_MIN, "the two ceilings must not overlap"
    queued_at = datetime.now(timezone.utc) - timedelta(minutes=waited)
    assert queued_at > qcut, (
        f"a job queued {waited}min ago — past the hung ceiling, under the queue ceiling — "
        "must NOT be swept: it is waiting on a lane, not hung"
    )

    # Two different things get two different codes, because the recovery differs.
    written = [c[1] for c in calls if c[0] == "update"]
    codes = [w.get("failure_code") for w in written]
    assert failures.TIMEOUT in codes, codes
    assert failures.NEVER_STARTED in codes, codes
    assert all("counted_against_quota" not in w for w in written), (
        "neither a timeout nor a never-started job ever burns a run"
    )
    assert closed == 2, closed

    print("retention self-check OK")


if __name__ == "__main__":
    demo()
