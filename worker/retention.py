"""Source-video retention.

TWO sweeps, because there are two reasons a recording stops being worth keeping.

  sweep_source_videos()  SUCCEEDED runs. The recording is kept for
                         PLANS[owner plan]["video_retention_days"] and then collected.
                         `None` on every paid tier means "for the life of the article".

  sweep()                FAILED runs. A failed job never makes an article, so there is no
                         article lifetime to hang its recording on — it gets its own flat
                         FAILED_VIDEO_RETENTION_DAYS window, long enough that a retry
                         without a re-upload still works.

THE REVERSAL (PRD "Context & AI Editing" §8). Publishing used to be the collection event:
first publish deleted the recording. Video-grounded editing re-reads it long after that, so
that rule would have removed the one editing capability a general chat model cannot copy,
at the exact moment the user finished their first article. Retention replaces it, and
retention is also the METER — "Check the recording" is available for a window on free and
for the life of the article on paid, which maps to a real cost rather than an invented unit.

Both are STATE QUERIES, never scheduled events: "in this state, older than this ceiling,
not yet purged". A tick missed to a deploy or an idle-instance recycle self-heals on the
next one, and running either twice is harmless.
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
            # A job WAITING FOR THE USER is not hung (PRD §5.4, migration 0043). The
            # pipeline is sitting in _await_answers by design, and the screen says
            # "waiting for you" — failing it would blame us for their pause and throw
            # away a completed read plus every screenshot. The in-process deadline
            # excludes the same interval; this is the other half of that rule, for the
            # case where the process died while paused.
            .eq("awaiting_input", False)
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

def _purge_video(job_id: str, path: str, article_id: str | None) -> bool:
    """Delete one recording and forget it. Returns whether it was collected.

    ORDER IS LOAD-BEARING (§10f). Delete the object, THEN null the columns naming it. The
    reverse strands the object with nothing pointing at it — invisible to both sweeps and
    to the article-delete path, which is the orphaned-storage bug all over again.

    Two columns name one recording: `jobs.video_path` (recorded at job creation, because a
    job that dies before Stage 1 never makes an article) and `articles.source_video_path`.
    `jobs.video_purged_at` is the marker rather than nulling video_path, because the SPA
    reads it to choose between "retry" and "upload it again" without a round trip.
    """
    import pipeline

    try:
        pipeline.db().storage.from_(config.BUCKET_VIDEOS).remove([path])
    except Exception:
        # Leave the marker unset so the next sweep tries again. An object that is already
        # gone still marks below — remove() does not raise on a missing key.
        log.exception("could not delete %s for job %s", path, job_id)
        return False

    pipeline.db().table("jobs").update(
        {"video_purged_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", job_id).execute()
    if article_id:
        pipeline.db().table("articles").update({"source_video_path": None}).eq(
            "id", article_id
        ).execute()
    return True


def _retention_days_by_owner(owner_ids: set[str]) -> dict[str, int | None]:
    """{owner_id: window}, resolved through PLANS. Absent or unknown plan -> the free tier.

    Entitlements resolve through the KB's OWNER (§10j), which for a job is
    `billed_to_user_id` — stamped at creation and never re-derived by joining through
    kb_id, so a claimed demo's recordings keep the window they were made under.

    Read as a separate query rather than a PostgREST embed on purpose: `jobs` has TWO
    foreign keys into profiles (user_id and billed_to_user_id), so a bare embed is
    ambiguous (PGRST201) — the same trap kb_members set for knowledge_bases (§10j).
    """
    import pipeline

    if not owner_ids:
        return {}
    rows = (
        pipeline.db()
        .table("profiles")
        .select("id, plan")
        .in_("id", sorted(owner_ids))
        .execute()
    ).data or []
    plans = {r["id"]: r.get("plan") for r in rows}
    return {
        uid: config.PLANS.get(plans.get(uid) or "", config.PLANS[config.DEFAULT_PLAN])[
            "video_retention_days"
        ]
        for uid in owner_ids
    }


def sweep_source_videos() -> int:
    """Collect the recordings of SUCCEEDED runs past their plan's retention window.

    The window is per tier, so the cutoff cannot live in the query — it depends on a plan
    the `jobs` row does not carry. The query selects every un-purged recording from a
    finished run older than the LONGEST finite window, and Python drops the ones whose
    owner is still inside theirs. Nothing with a `None` window is ever collected.

    Deliberately keyed on the JOB, not the article: `jobs.video_path` is the one column
    that exists for every run, and jobs.video_purged_at is the marker the SPA already
    reads. An article that has since been deleted took its own recording with it
    (articles.deleteArticle), and this sweep then finds an object that is already gone —
    which is harmless, and still marks.
    """
    import pipeline

    windows = [
        p["video_retention_days"]
        for p in config.PLANS.values()
        if p["video_retention_days"] is not None
    ]
    if not windows:
        return 0  # every tier keeps recordings for the life of the article
    cutoff = datetime.now(timezone.utc) - timedelta(days=min(windows))

    try:
        res = (
            pipeline.db()
            .table("jobs")
            .select("id, article_id, video_path, billed_to_user_id, finished_at, created_at")
            .eq("status", "done")
            .not_.is_("video_path", "null")
            .is_("video_purged_at", "null")
            .lt("created_at", cutoff.isoformat())
            .limit(200)
            .execute()
        )
    except Exception:
        log.exception("source-video retention sweep query failed")
        return 0

    rows = res.data or []
    by_owner = _retention_days_by_owner({r["billed_to_user_id"] for r in rows if r["billed_to_user_id"]})

    purged = 0
    now = datetime.now(timezone.utc)
    for job in rows:
        # No owner on the row is not a licence to delete: `billed_to_user_id` is
        # `on delete set null`, so this is a run whose payer closed their account. Their
        # content is deleted by purge.py, not quietly by a retention sweep that cannot
        # tell which plan it was made under.
        days = by_owner.get(job["billed_to_user_id"]) if job["billed_to_user_id"] else None
        if days is None:
            continue
        # The clock starts when the run FINISHED — that is when the article the recording
        # backs came into existence. created_at is the fallback for rows written before
        # finished_at existed.
        stamp = job.get("finished_at") or job["created_at"]
        if (now - datetime.fromisoformat(stamp)).days < days:
            continue
        if _purge_video(job["id"], job["video_path"], job.get("article_id")):
            purged += 1

    if purged:
        log.info("purged %s source recording(s) past their retention window", purged)
    return purged


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

    # A failed job has no article to null, so article_id is always None here — the shared
    # helper is used anyway so the delete-then-mark order lives in exactly one place.
    purged = sum(
        1 for job in res.data or [] if _purge_video(job["id"], job["video_path"], None)
    )

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

    # --- the retention-policy sweep: the window is per PLAN ------------------
    # The whole risk here is deleting a paying customer's recording, which takes away the
    # editing capability they are paying for and cannot be undone. So the assertion that
    # matters is not "free was collected" — it is that the two rows it must not touch were
    # not touched.
    old = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    recent = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    rows = [
        {"id": "free-old", "article_id": "a1", "video_path": "kb/free-old.mp4",
         "billed_to_user_id": "u-free", "finished_at": old, "created_at": old},
        {"id": "paid-old", "article_id": "a2", "video_path": "kb/paid-old.mp4",
         "billed_to_user_id": "u-paid", "finished_at": old, "created_at": old},
        {"id": "free-new", "article_id": "a3", "video_path": "kb/free-new.mp4",
         "billed_to_user_id": "u-free", "finished_at": recent, "created_at": recent},
        {"id": "orphan", "article_id": "a4", "video_path": "kb/orphan.mp4",
         "billed_to_user_id": None, "finished_at": old, "created_at": old},
    ]
    profiles = [{"id": "u-free", "plan": "free"}, {"id": "u-paid", "plan": "starter"}]

    class _Q2(_Q):
        def execute(self):
            if self.tbl == "profiles":
                return type("R", (), {"data": profiles})()
            if self.tbl == "jobs" and calls and calls[-1][0] != "update":
                return type("R", (), {"data": rows})()
            return type("R", (), {"data": []})()

    class _Db2(_Db):
        def table(self, name):
            return _Q2(name)

    calls.clear()
    pipeline.db = lambda: _Db2()
    collected = sweep_source_videos()

    assert ("eq", "status", "done") in calls, "only SUCCEEDED runs have an article lifetime"
    assert ("is", "video_purged_at", "null") in calls, "must skip already-purged jobs"
    removed = {c[1][0] for c in calls if c[0] == "remove"}
    assert removed == {"kb/free-old.mp4"}, f"only the expired free row: {removed}"
    assert collected == 1
    # The article's own pointer is nulled too, or the editor keeps offering a recording
    # that no longer exists.
    assert ("update", {"source_video_path": None}) in calls, "must null articles.source_video_path"

    pipeline.db = lambda: _Db()  # the timeout checks below expect the single-row fake

    # --- the timeout sweep: two clocks, two codes (slice 3i) -----------------
    # Correctness is entirely in which rows each half picks. Too broad and it kills healthy
    # in-flight runs; too narrow and the abandoned row nobody is working on stays at
    # 'running' forever, which is the single worst state the product can be in. And since
    # lanes, a third way to get it wrong: measuring a queued job's WAIT as if it were WORK.
    calls.clear()
    closed = sweep_timeouts()

    # HUNG — running only, measured from started_at.
    assert ("eq", "status", "running") in calls, "the hung sweep considers RUNNING jobs only"
    assert ("eq", "awaiting_input", False) in calls, (
        "a job waiting for the user is not hung — failing it blames us for their pause"
    )
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
