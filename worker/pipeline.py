"""The pipeline: two model calls + one deterministic step (CLAUDE.md §5).

  Stage 1  VIDEO_MODEL  video + context -> JSON blueprint (MM:SS timestamps)
  Frames   FFmpeg       one frame per step + a 1fps dense set -> WebP -> Storage
  Stage 2  TEXT_MODEL   polish grammar/tone/terminology, same schema in and out

The video model drafts, the cheap model polishes, code does everything deterministic.
Do NOT add a model call anywhere else.
"""

import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

from google.genai import types
from supabase import Client, create_client

import config
import frames as frames_mod
import gemini
import prompts
from models import Blueprint, format_mmss, parse_mmss

_db: Client | None = None


def db() -> Client:
    global _db
    if _db is None:
        if not (config.SUPABASE_URL and config.SUPABASE_SERVICE_ROLE_KEY):
            raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.")
        _db = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY)
    return _db


def set_stage(job_id: str, stage: str) -> None:
    """Progress labels reflect the REAL stage, in order. Polling this row is what keeps
    the four labels honest instead of a timer-driven lie (LEARNINGS #3)."""
    db().table("jobs").update({"stage": stage, "status": "running"}).eq("id", job_id).execute()


def fail(job_id: str, message: str) -> None:
    """Record the failure. `counted_against_quota` is deliberately NOT touched: a failed
    generation must never burn a run (mvp-dev-plan §3)."""
    db().table("jobs").update(
        {
            "status": "error",
            "error": message[:2000],
            "failure_detail": message[:2000],
            "finished_at": _now(),
        }
    ).eq("id", job_id).execute()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _upload_frame(local: Path, storage_path: str) -> str:
    """Upload one WebP frame, retrying transient transport failures.

    A run uploads ~50+ frames back to back over one HTTP/2 connection and the server
    will occasionally reset a stream mid-flight (observed: StreamReset error_code:1).
    Without a retry, one blip discards a completed ~60s Gemini run — so retry the
    upload rather than the whole job. Fails loudly after the last attempt.
    """
    data = local.read_bytes()
    for attempt in range(config.UPLOAD_RETRY_ATTEMPTS):
        try:
            db().storage.from_(config.BUCKET_FRAMES).upload(
                storage_path,
                data,
                {"content-type": "image/webp", "upsert": "true"},
            )
            return storage_path
        except Exception as e:
            if attempt == config.UPLOAD_RETRY_ATTEMPTS - 1:
                raise RuntimeError(f"upload of {storage_path} failed: {e}") from e
            time.sleep(config.UPLOAD_RETRY_BACKOFF_SECONDS * (attempt + 1))
    return storage_path  # unreachable; keeps the type checker happy


def run(job_id: str, kb_id: str, video_path: str, context: dict) -> None:
    """Execute the pipeline. Any raised error is recorded on the job row and re-raised
    for the server log — a job must never silently sit at 'running' forever."""
    try:
        _run(job_id, kb_id, video_path, context)
    except Exception as e:
        fail(job_id, str(e))
        raise


def _run(job_id: str, kb_id: str, video_path: str, context: dict) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)

        # --- Stage: analyzing --------------------------------------------------
        set_stage(job_id, config.STAGE_ANALYZING)

        video_bytes = db().storage.from_(config.BUCKET_VIDEOS).download(video_path)
        if len(video_bytes) > config.MAX_INLINE_BYTES:
            # The File API fallback isn't built. Fail loudly rather than silently
            # truncate or hang (CLAUDE.md §5).
            raise RuntimeError(
                f"Recording is {len(video_bytes) / 1e6:.1f}MB; the inline limit is "
                f"{config.MAX_INLINE_BYTES / 1e6:.0f}MB. The File API fallback is not built yet."
            )

        local_video = tmpdir / "source.mp4"
        local_video.write_bytes(video_bytes)

        duration = frames_mod.probe_duration(local_video)

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
        set_stage(job_id, config.STAGE_DETECTING)

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
            raise RuntimeError("Stage 1 returned an article with no steps.")

        article_id = _create_article(kb_id, blueprint, video_path)
        db().table("jobs").update({"article_id": article_id}).eq("id", job_id).execute()

        # --- Stage: capturing (FFmpeg — deterministic, not a model) ------------
        set_stage(job_id, config.STAGE_CAPTURING)

        screenshots: dict[int, str] = {}
        seconds_by_step: dict[int, float] = {}
        for step in blueprint.steps:
            seconds = parse_mmss(step.timestamp)
            # Clamp: a model timestamp past the end would make ffmpeg emit nothing.
            seconds = min(seconds, max(duration - 0.1, 0))
            seconds_by_step[step.step_number] = seconds
            local = frames_mod.extract_frame(
                local_video, seconds, tmpdir / f"step-{step.step_number}.webp"
            )
            screenshots[step.step_number] = _upload_frame(
                local, f"{kb_id}/{article_id}/step-{step.step_number}.webp"
            )

        # The 1fps dense set backing the Tier-1 filmstrip (±3s candidates).
        for second, local in frames_mod.extract_dense_set(local_video, tmpdir / "dense"):
            _upload_frame(local, f"{kb_id}/{article_id}/dense/{second:05d}.webp")

        # --- Stage: writing (Stage 2 — the cheap model polishes) ---------------
        set_stage(job_id, config.STAGE_WRITING)

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

        # Stage 2 is blind to the video. If it dropped or added a step despite being
        # told not to, trust Stage 1's structure over Stage 2's text — silently
        # shipping a merged/invented step is the exact failure the collapse rule and
        # the faithfulness fix exist to prevent.
        if len(polished.steps) != len(blueprint.steps):
            polished = blueprint

        _write_steps(article_id, polished, screenshots, seconds_by_step)

        db().table("articles").update(
            {
                "title": polished.title,
                "subtitle": polished.subtitle,
                "status": "ready",
                # Written once, here, and never updated. It is the only passive measure of
                # how far a published article drifts from what we generated — uncapturable
                # after the fact, which is why it ships ahead of the rest of the metrics.
                "generated_snapshot": polished.model_dump(),
            }
        ).eq("id", article_id).execute()

        # The run is charged HERE and nowhere else: on success only. Everything above this
        # line can fail without costing the user a run.
        db().table("jobs").update(
            {"status": "done", "counted_against_quota": True, "finished_at": _now()}
        ).eq("id", job_id).execute()


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
            }
        )
        .execute()
    )
    # `source` is stamped by a DB trigger off source_video_path (migration 0014), not here:
    # there is more than one article-creation call site and a trigger is the only version a
    # future one cannot forget. The same trigger starts the KB's trial clock.
    return res.data[0]["id"]


def _write_steps(
    article_id: str,
    article: Blueprint,
    screenshots: dict[int, str],
    seconds_by_step: dict[int, float],
) -> None:
    rows = [
        {
            "article_id": article_id,
            "step_number": s.step_number,
            "heading": s.heading,
            "body_text": s.body_text,
            "screenshot_url": screenshots.get(s.step_number),
            # Centres the Tier-1 filmstrip and lets the eval judge score alignment.
            "timestamp_seconds": seconds_by_step.get(s.step_number),
            # is_edited stays false: this frame was machine-picked. A human pick flips
            # it, and a re-run must then not overwrite it (CLAUDE.md §8).
        }
        for s in article.steps
    ]
    db().table("steps").insert(rows).execute()
