"""The pipeline: two model calls + one deterministic step (CLAUDE.md §5).

  Stage 1  VIDEO_MODEL  video + context -> JSON blueprint (MM:SS timestamps)
  Frames   FFmpeg       one frame per step + a 1fps dense set -> WebP -> Storage
  Stage 2  TEXT_MODEL   polish grammar/tone/terminology, same schema in and out

The video model drafts, the cheap model polishes, code does everything deterministic.
Do NOT add a model call anywhere else.
"""

import logging
import tempfile
import time
from datetime import datetime, timezone
from collections.abc import Callable
from pathlib import Path

from google.genai import types
from supabase import Client, create_client

import config
import failures
import frames as frames_mod
import gemini
import lanes as lanes_mod
import prompts
from models import Blueprint, canonical_body, format_mmss, parse_mmss

log = logging.getLogger("quink.pipeline")

_db: Client | None = None


def db() -> Client:
    global _db
    if _db is None:
        if not (config.SUPABASE_URL and config.SUPABASE_SERVICE_ROLE_KEY):
            raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.")
        _db = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY)
    return _db


def set_stage(job_id: str, stage: str, started: float | None = None) -> None:
    """Progress labels reflect the REAL stage, in order. Polling this row is what keeps
    the four labels honest instead of a timer-driven lie (LEARNINGS #3).

    Also the deadline check. Every stage boundary passes through here, so this is the one
    place a wedged run can notice it is wedged — and noticing in-process means the worker
    STOPS, rather than racing retention.sweep_timeouts() and writing a success over a row
    the sweep already failed.
    """
    if started is not None and time.monotonic() - started > config.JOB_TIMEOUT_MIN * 60:
        raise failures.Failed(
            failures.TIMEOUT,
            f"job exceeded JOB_TIMEOUT_MIN ({config.JOB_TIMEOUT_MIN} min) before '{stage}'",
        )
    db().table("jobs").update({"stage": stage, "status": "running"}).eq("id", job_id).execute()


def fail(job_id: str, code: str, detail: str) -> None:
    """Record the failure, classified.

    `counted_against_quota` is deliberately NOT touched: a failed generation must never
    burn a run (CLAUDE.md §10b). `failure_detail` is internal — migration 0020 revokes the
    column from anon and authenticated so it cannot reach a client even by accident. The
    SPA renders copy chosen by `failure_code` alone.
    """
    log.error("job %s failed [%s]: %s", job_id, code, detail)
    res = (
        db()
        .table("jobs")
        .update(
            {
                "status": "error",
                "failure_code": code,
                "failure_detail": detail[:2000],
                "finished_at": _now(),
            }
        )
        .eq("id", job_id)
        .execute()
    )

    # Bring the article to a terminal state too, if this run got far enough to make one.
    #
    # Only the success path used to write 'ready', so any failure after Stage 1 stranded a
    # fully populated, editable article wearing the "Generating" badge forever — nothing
    # anywhere else in the system writes this column. The steps exist and they are editable:
    # that is a DRAFT, not a failure, and degrade-before-fail (CLAUDE.md §10g) already says
    # so for every other partial result.
    #
    # It lives in fail() rather than at the raise sites because there are five of those and
    # a sixth will be added by someone who does not read this comment.
    article_id = (res.data or [{}])[0].get("article_id")
    if article_id:
        db().table("articles").update({"status": "ready"}).eq("id", article_id).execute()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _storage_retry[T](what: str, call: "Callable[[], T]") -> T:
    """Run one Storage transfer, retrying transient transport failures.

    A run moves a video in and ~50+ frames out over one HTTP/2 connection, and the
    server will occasionally reset a stream mid-flight (observed: StreamReset
    error_code:1 on upload, WinError 10035 on download). Without a retry, one blip
    discards a whole run — so retry the TRANSFER rather than the job. Fails loudly
    after the last attempt.
    """
    for attempt in range(config.STORAGE_RETRY_ATTEMPTS):
        try:
            return call()
        except Exception as e:
            if attempt == config.STORAGE_RETRY_ATTEMPTS - 1:
                raise RuntimeError(f"{what} failed after "
                                   f"{config.STORAGE_RETRY_ATTEMPTS} attempts: {e}") from e
            log.warning("%s failed (attempt %s), retrying: %s", what, attempt + 1, e)
            time.sleep(config.STORAGE_RETRY_BACKOFF_SECONDS * (attempt + 1))
    raise RuntimeError("unreachable")


def _upload_frame(local: Path, storage_path: str) -> str:
    data = local.read_bytes()
    _storage_retry(
        f"upload of {storage_path}",
        lambda: db().storage.from_(config.BUCKET_FRAMES).upload(
            storage_path,
            data,
            {"content-type": "image/webp", "upsert": "true"},
        ),
    )
    return storage_path


def run(
    job_id: str,
    kb_id: str,
    video_path: str,
    context: dict,
    # The KB's OWNER, not whoever pressed the button: lanes are an account-level cost
    # control, and the account with the money on it is the owner's.
    owner_id: str | None = None,
    lanes: int = 1,
) -> None:
    """Execute the pipeline. Any raised error is classified onto the job row and re-raised
    for the server log — a job must never silently sit at 'running' forever.

    The lane is acquired OUTSIDE _run so the queueing time does not count against
    JOB_TIMEOUT_MIN: `started` is stamped inside, once this job is actually running. A job
    waiting for a lane sits at 'queued', which is what the dock renders as "in line".
    """
    try:
        with lanes_mod.Lane(owner_id, lanes):
            # Queue time ends HERE. The timeout sweep measures a running job from this
            # stamp, never from created_at — otherwise a job that waited its turn behind
            # other runs gets failed as "hung" for the crime of being in the queue (3i).
            # Written in the same `with` that takes the semaphore because that is the one
            # place that already knows the difference.
            db().table("jobs").update({"started_at": _now()}).eq("id", job_id).execute()
            _run(job_id, kb_id, video_path, context)
    except failures.Failed as e:
        fail(job_id, e.code, str(e))
        raise
    except Exception as e:
        # Unclassified: Storage went away, an insert lost a race. It is ours, and the copy
        # for internal_error says exactly that. The alternative — no code at all — is the
        # stuck spinner this whole slice exists to remove.
        fail(job_id, failures.INTERNAL_ERROR, f"{type(e).__name__}: {e}")
        raise


def _run(job_id: str, kb_id: str, video_path: str, context: dict) -> None:
    started = time.monotonic()
    # Degraded outcomes: the article ships anyway, so these are NOT failure codes and they
    # do not stop the run counting. Recorded so "how often does Stage 2 fall over" is one
    # query (CLAUDE.md §10g).
    degraded: list[str] = []

    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)

        # --- Stage: analyzing --------------------------------------------------
        set_stage(job_id, config.STAGE_ANALYZING, started)

        # Retried like every other Storage transfer. This was the ONE network hop in the
        # pipeline with no retry: Gemini retries, frame uploads retry, and the fetch of the
        # recording itself did not — so a transient socket reset killed the run at Stage 1
        # and told the user "something went wrong while building your article. This one's
        # on us." Cost a video in the 2026-08-22 eval baseline (WinError 10035).
        video_bytes = _storage_retry(
            f"download of {video_path}",
            lambda: db().storage.from_(config.BUCKET_VIDEOS).download(video_path),
        )
        if len(video_bytes) > config.MAX_INLINE_BYTES:
            # The File API fallback isn't built. Fail loudly rather than silently
            # truncate or hang (CLAUDE.md §5). The SPA rejects oversize files at the
            # dropzone, so reaching here means it was bypassed — still ours, not theirs.
            raise failures.Failed(
                failures.INTERNAL_ERROR,
                f"Recording is {len(video_bytes) / 1e6:.1f}MB; the inline limit is "
                f"{config.MAX_INLINE_BYTES / 1e6:.0f}MB. The File API fallback is not built yet.",
            )

        local_video = tmpdir / "source.mp4"
        local_video.write_bytes(video_bytes)

        duration = frames_mod.probe_duration(local_video)
        if duration > config.MAX_VIDEO_MINUTES * 60:
            raise failures.Failed(
                failures.VIDEO_TOO_LONG,
                f"{duration / 60:.1f} min exceeds MAX_VIDEO_MINUTES "
                f"({config.MAX_VIDEO_MINUTES}).",
            )

        # Record the estimated spend NOW, not at the end. The circuit breaker sums today's
        # est_cost_usd, so a run still in flight has to be visible to it — otherwise
        # concurrent jobs all read the same stale total and pass the cap together.
        db().table("jobs").update(
            {
                "video_duration_seconds": int(duration),
                "est_cost_usd": round(
                    (duration / 60.0) * config.EST_COST_USD_PER_VIDEO_MINUTE, 4
                ),
            }
        ).eq("id", job_id).execute()

        # --- Stage: detecting (Stage 1 — the model that saw the video drafts) ---
        set_stage(job_id, config.STAGE_DETECTING, started)

        draft_prompt = prompts.build_draft_prompt(
            duration_mmss=format_mmss(duration),
            duration_seconds=int(duration),
            context_block=prompts.build_context_block(context),
        )

        blueprint = gemini.generate_json(
            model=config.VIDEO_MODEL,
            contents=[
                types.Part.from_bytes(data=video_bytes, mime_type="video/mp4"),
                draft_prompt,
            ],
            schema=Blueprint,
        )
        if not blueprint.steps:
            # Stage 1 is the one model call with nothing to fall back on — there is no
            # article to degrade to. A real failure (spec: "Total ffmpeg failure, or
            # Stage 1 failure → a real failure. There is nothing to give the user.").
            raise failures.Failed(
                failures.MODEL_BAD_OUTPUT, "Stage 1 returned an article with no steps."
            )

        # Clamp: a model timestamp past the end would make ffmpeg emit nothing.
        seconds_by_step = {
            s.step_number: min(parse_mmss(s.timestamp), max(duration - 0.1, 0))
            for s in blueprint.steps
        }

        article_id = _create_article(kb_id, blueprint, video_path)
        db().table("jobs").update({"article_id": article_id}).eq("id", job_id).execute()

        # The steps land NOW, from Stage 1, with no screenshots yet — not after Stage 2.
        # Between Stage 1 and the end of a run there used to be no row, no jsonb and no
        # cache holding the step array, so a process that died in the middle left an
        # articles row with a title, zero steps and status='generating' that nothing
        # cleaned up. These rows are also the channel the client watches the article
        # assemble through: frames fill in during `capturing`, text is polished in place
        # during `writing`, and the row IDS survive the whole run.
        step_ids = _insert_steps(article_id, blueprint, seconds_by_step)

        # --- Stage: capturing (FFmpeg — deterministic, not a model) ------------
        set_stage(job_id, config.STAGE_CAPTURING, started)

        # A step whose frame won't render is a step with no image — which the editor
        # already handles: StepCard shows "+ Add image" whenever screenshot_url is null.
        # So one bad frame costs the user one click, while failing the whole run costs
        # them the article. Only a TOTAL wipeout is a real failure.
        screenshots: dict[int, str] = {}
        for step in blueprint.steps:
            seconds = seconds_by_step[step.step_number]
            try:
                # The sub-second half of choosing a moment. Stage 1 can only name whole
                # seconds — Gemini samples video at 1fps — so a timestamp that is right to
                # the second still lands mid-keystroke or mid-transition. This nudges it
                # forward to where the screen stopped moving, and cannot make it worse: it
                # never raises and returns `seconds` unchanged on every failure path.
                seconds = frames_mod.pick_settled_second(local_video, seconds, duration)
                local = frames_mod.extract_frame(
                    local_video, seconds, tmpdir / f"step-{step.step_number}.webp"
                )
                path = _upload_frame(
                    local, f"{kb_id}/{article_id}/step-{step.step_number}.webp"
                )
                # One write per frame, as it lands, so the step stops being text-only the
                # moment its screenshot exists rather than at the end of the run. Recorded
                # in `screenshots` only AFTER the row has it: this dict decides both the
                # total-wipeout failure and the frames_partial degrade, so a step whose
                # write failed has to count as missing, not as done.
                #
                # `seconds` goes with it: the row must say where the picture actually came
                # from, or the frame picker centres its filmstrip on a moment that is not
                # the one on screen — and the eval scores alignment against the same column.
                _set_screenshot(step_ids, step.step_number, path, seconds)
                screenshots[step.step_number] = path
            except Exception as e:
                log.warning("job %s: step %s frame failed: %s", job_id, step.step_number, e)

        if not screenshots:
            # Every frame failed: ffmpeg cannot read this file at all. There is no
            # article worth giving anyone — a wall of text with no screenshots is not
            # the product.
            raise failures.Failed(
                failures.FRAME_EXTRACTION_FAILED,
                f"all {len(blueprint.steps)} step frames failed to extract",
            )
        if len(screenshots) < len(blueprint.steps):
            degraded.append(failures.DEGRADED_FRAMES)

        # --- Stage: writing (Stage 2 — the cheap model polishes) ---------------
        set_stage(job_id, config.STAGE_WRITING, started)

        # Stage 2 only improves prose. If it dies, Stage 1's text is rougher but the steps
        # and screenshots are already correct — and editing rough text is the product.
        # Ship the article; never show a failure screen over the polish pass.
        try:
            polished = gemini.generate_json(
                model=config.TEXT_MODEL,
                contents=[
                    prompts.build_polish_prompt(
                        context_block=prompts.build_context_block(context),
                        article_json=blueprint.model_dump_json(indent=2),
                    )
                ],
                schema=Blueprint,
            )
        except Exception as e:
            log.warning("job %s: Stage 2 failed, shipping unpolished Stage 1 text: %s", job_id, e)
            polished = blueprint
            degraded.append(failures.DEGRADED_STAGE2)

        # Stage 2 is blind to the video. If it dropped, added or RENUMBERED a step despite
        # being told not to, trust Stage 1's structure over Stage 2's text — silently
        # shipping a merged/invented step is the exact failure the collapse rule and
        # the faithfulness fix exist to prevent.
        #
        # This compares the step numbers themselves, not just how many there are: the polish
        # is now applied to existing rows MATCHED ON step_number, so a Stage 2 that returned
        # the right count under different numbers would write step 3's prose onto step 4's
        # screenshot. A count check cannot see that.
        if [s.step_number for s in polished.steps] != [s.step_number for s in blueprint.steps]:
            polished = blueprint

        # In place, on the rows Stage 1 already created — never delete-and-reinsert. The row
        # ids have to survive the run: they are what the client is holding.
        _polish_steps(step_ids, polished)

        db().table("articles").update(
            {
                "title": polished.title,
                "subtitle": polished.subtitle,
                "status": "ready",
                # Written at Stage 1 too (see _create_article), then overwritten here with
                # the polished text. It is the only passive measure of how far a published
                # article drifts from what we generated — and if Stage 2 dies, the Stage 1
                # baseline is exactly what "discard changes" needs to restore to, for the
                # articles most likely to need editing.
                "generated_snapshot": polished.model_dump(),
            }
        ).eq("id", article_id).execute()

        # The run is charged HERE and nowhere else: on success only. Everything above this
        # line can fail without costing the user a run.
        #
        # A DEGRADED run is a success and DOES count — they got an editable article, which
        # is the thing they paid a run for. Only the paths that reach `fail()` are free.
        db().table("jobs").update(
            {
                "status": "done",
                "counted_against_quota": True,
                "degraded": ",".join(sorted(set(degraded))) or None,
                "finished_at": _now(),
            }
        ).eq("id", job_id).execute()

        # --- After the finish line: the 1fps dense set --------------------------
        # This backs the frame picker and NOTHING the user sees on arrival. It used to run
        # inside `capturing` — the longest stretch of the run — for a feature that is opened
        # later and rarely, which meant every user waited on it and most never used it.
        #
        # It runs here, past `done`, so the article is deliverable first. The cost of that is
        # a real window where a generated article has no filmstrip, and CLAUDE.md §10f is
        # explicit that a timing change like this ships with its degradation in the same
        # commit: FramePicker asks the job whether frames are still coming ("Still pulling
        # frames…") or never will ("We couldn't pull the frames…") instead of claiming the
        # article has no video.
        #
        # `frames_ready_at` (migration 0030) is what it asks. It CANNOT ask `status`: status
        # is already `done` on the line above, so the picker read a healthy run as a failed
        # extraction for the whole length of this loop — 3.5 minutes and 114 objects on a
        # six-minute recording. This is the marker that closes that window, so it is stamped
        # in a `finally`: the question it answers is "is anything still coming?", and the
        # answer is no either way.
        try:
            for second, local in frames_mod.extract_dense_set(local_video, tmpdir / "dense"):
                _upload_frame(local, f"{kb_id}/{article_id}/dense/{second:05d}.webp")
        except Exception as e:
            log.warning("job %s: dense frame set failed, picker degrades to upload: %s", job_id, e)
            degraded.append(failures.DEGRADED_FRAMES)
            # A second write, because the row was already closed out above. The run stays a
            # success — losing the filmstrip is not losing the article.
            db().table("jobs").update(
                {"degraded": ",".join(sorted(set(degraded))) or None}
            ).eq("id", job_id).execute()
        finally:
            db().table("jobs").update({"frames_ready_at": _now()}).eq("id", job_id).execute()


def _create_article(kb_id: str, blueprint: Blueprint, video_path: str) -> str:
    res = (
        db()
        .table("articles")
        .insert(
            {
                "kb_id": kb_id,
                "title": blueprint.title,
                "subtitle": blueprint.subtitle,
                "status": "generating",
                # Kept until first publish, then deleted (CLAUDE.md §8) — the Tier-2
                # frame-picker scrubs this during editing. No publish flow yet, so
                # videos persist. Wire the delete-on-publish hook when publishing ships.
                "source_video_path": video_path,
                # The Stage 1 baseline, written before Stage 2 can fail. Left null until
                # after Stage 2 (as it was), a run whose polish pass died gave
                # discardChanges nothing to restore to — on exactly the articles whose
                # text is roughest and most likely to be edited.
                "generated_snapshot": blueprint.model_dump(),
            }
        )
        .execute()
    )
    # `source` is stamped by a DB trigger off source_video_path (migration 0014), not here:
    # there is more than one article-creation call site and a trigger is the only version a
    # future one cannot forget. The same trigger starts the KB's trial clock.
    return res.data[0]["id"]


def _insert_steps(
    article_id: str,
    article: Blueprint,
    seconds_by_step: dict[int, float],
) -> dict[int, str]:
    """Insert Stage 1's steps and return {step_number: row id}.

    Screenshots are null here and filled in one at a time as ffmpeg produces them. The
    returned ids are how the rest of the run addresses these rows — keyed by step_number
    from the response rather than by position, because nothing guarantees the order rows
    come back in.
    """
    rows = [
        {
            "article_id": article_id,
            "step_number": s.step_number,
            "heading": s.heading,
            # Stored as HTML, not as the raw sentence the model returned. The editor and the
            # reader both render this as markup, so writing prose here left the database and
            # the editor disagreeing about the same step -- which surfaced as a phantom
            # "N unpublished edits" on articles nobody had touched. See canonical_body.
            "body_text": canonical_body(s.body_text),
            # Centres the Tier-1 filmstrip and lets the eval judge score alignment.
            "timestamp_seconds": seconds_by_step.get(s.step_number),
            # is_edited stays false: this frame was machine-picked. A human pick flips
            # it, and a re-run must then not overwrite it (CLAUDE.md §8).
        }
        for s in article.steps
    ]
    res = db().table("steps").insert(rows).execute()
    ids = {int(r["step_number"]): r["id"] for r in (res.data or [])}
    if len(ids) != len(rows):
        # Without every id, the frame pass and the polish pass would silently no-op and
        # ship an article of unpolished, image-less steps marked 'ready'. Fail loudly —
        # `internal_error` says it is on us and offers the retry.
        raise RuntimeError(f"steps insert returned {len(ids)} ids for {len(rows)} rows")
    return ids


def _set_screenshot(
    step_ids: dict[int, str], step_number: int, path: str, seconds: float
) -> None:
    """The frame and the moment it came from, written together.

    They are one fact. `timestamp_seconds` centres the Tier-1 filmstrip and is what the
    eval scores alignment against, so a row whose timestamp disagrees with its own
    screenshot sends the frame picker to the wrong part of the recording.
    """
    sid = step_ids.get(step_number)
    if sid:
        db().table("steps").update(
            {"screenshot_url": path, "timestamp_seconds": seconds}
        ).eq("id", sid).execute()


def _polish_steps(step_ids: dict[int, str], article: Blueprint) -> None:
    """Stage 2's text onto the rows Stage 1 created. Prose only — screenshot_url,
    timestamp_seconds and is_edited belong to the frame pass and are not Stage 2's to
    touch."""
    for s in article.steps:
        sid = step_ids.get(s.step_number)
        if sid:
            db().table("steps").update(
                {"heading": s.heading, "body_text": canonical_body(s.body_text)}
            ).eq("id", sid).execute()
