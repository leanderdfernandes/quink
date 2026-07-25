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

log = logging.getLogger("quink.retention")


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
    print("retention self-check OK")


if __name__ == "__main__":
    demo()
