"""Frame extraction — FFmpeg, NOT a model call.

CLAUDE.md §5 step 2: one raw frame per step at its timestamp_seconds, plus a 1fps dense
set for the Tier-1 filmstrip. Convert all to WebP. No cropping.
"""

import subprocess
from pathlib import Path

import ffmpeg

import config
import failures


def probe_duration(video_path: Path) -> float:
    """Total duration in seconds. Passed into the Stage 1 prompt for grounding —
    without it the model emits timestamps in a unit it invented (LEARNINGS #2).

    This is also the read that decides whether the file is usable at all: ffprobe failing
    is the ONE failure in the taxonomy we can honestly attribute to the user's recording
    (`video_unreadable` — corrupted, or a truncated upload).
    """
    try:
        info = ffmpeg.probe(str(video_path))
    except ffmpeg.Error as e:
        raise failures.Failed(
            failures.VIDEO_UNREADABLE, f"ffprobe failed: {e.stderr.decode(errors='replace')}"
        ) from e

    duration = info.get("format", {}).get("duration")
    if duration is None:
        raise failures.Failed(
            failures.VIDEO_UNREADABLE, "ffprobe returned no duration for this recording."
        )
    return float(duration)


def _run(args: list[str], what: str) -> None:
    """Never cut error handling on FFmpeg calls (CLAUDE.md §10).

    Classified `frame_extraction_failed`, but note the caller decides whether that is
    fatal: ONE step failing to render is a text-only step the user can fix, and only a
    total wipeout is a real failure (see pipeline.py).
    """
    proc = subprocess.run(args, capture_output=True)
    if proc.returncode != 0:
        raise failures.Failed(
            failures.FRAME_EXTRACTION_FAILED,
            f"{what} failed: {proc.stderr.decode(errors='replace')[-800:]}",
        )


def extract_frame(video_path: Path, seconds: float, out_path: Path) -> Path:
    """One frame at `seconds`, as WebP. No cropping.

    -ss before -i is the fast input seek. FFmpeg was confirmed innocent of the
    opening-frame bug — it seeks correctly; the model was emitting bad units.
    """
    out_path.parent.mkdir(parents=True, exist_ok=True)
    _run(
        [
            "ffmpeg", "-y", "-v", "error",
            "-ss", f"{seconds:.3f}",
            "-i", str(video_path),
            "-frames:v", "1",
            "-c:v", "libwebp",
            "-quality", str(config.WEBP_QUALITY),
            str(out_path),
        ],
        f"frame extraction at {seconds:.2f}s",
    )
    if not out_path.exists():
        raise failures.Failed(
            failures.FRAME_EXTRACTION_FAILED, f"ffmpeg produced no frame at {seconds:.2f}s"
        )
    return out_path


def extract_dense_set(video_path: Path, out_dir: Path) -> list[tuple[int, Path]]:
    """The 1fps dense set backing the Tier-1 filmstrip (±3s of candidate frames).

    Returns [(second, path)]. Pure ffmpeg, no model call — "code does everything
    deterministic". One pass over the video, not one invocation per frame.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    pattern = out_dir / "%05d.webp"
    _run(
        [
            "ffmpeg", "-y", "-v", "error",
            "-i", str(video_path),
            "-vf", f"fps={config.DENSE_FRAME_FPS}",
            "-c:v", "libwebp",
            "-quality", str(config.WEBP_QUALITY),
            str(pattern),
        ],
        "dense frame extraction",
    )

    # fps=1 emits frame 1 at t≈0, frame 2 at t≈1 ... so second = index - 1.
    out: list[tuple[int, Path]] = []
    for path in sorted(out_dir.glob("*.webp")):
        out.append((int(path.stem) - 1, path))
    if not out:
        raise failures.Failed(
            failures.FRAME_EXTRACTION_FAILED, "dense frame extraction produced no frames"
        )
    return out
