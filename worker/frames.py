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


def _thumbs(video_path: Path, start: float, span: float) -> list[bytes]:
    """Greyscale thumbnails across [start, start+span], one ffmpeg pass, held in memory.

    Raw greyscale rather than WebP on disk: these frames are only ever compared to each
    other, never shown, so every byte spent on colour or compression is wasted — and
    rawvideo means nothing has to decode them on the way back in.

    Scaled to a FIXED width AND height so the byte stream splits on a known frame size.
    The aspect ratio is deliberately not preserved: the same distortion applies to every
    frame, so it cancels out of every comparison, and guessing the height back out of the
    stream length is a bug waiting to happen.
    """
    w, h = config.SETTLE_THUMB_WIDTH, config.SETTLE_THUMB_HEIGHT
    proc = subprocess.run(
        [
            "ffmpeg", "-v", "error",
            "-ss", f"{start:.3f}",
            "-t", f"{span:.3f}",
            "-i", str(video_path),
            "-vf", f"fps={config.SETTLE_SAMPLE_FPS},scale={w}:{h}",
            "-pix_fmt", "gray",
            "-f", "rawvideo", "pipe:1",
        ],
        capture_output=True,
    )
    if proc.returncode != 0 or not proc.stdout:
        return []
    size = w * h
    raw = proc.stdout
    return [raw[i:i + size] for i in range(0, len(raw) - size + 1, size)]


def _changed_fraction(a: bytes, b: bytes) -> float:
    """Fraction of pixels that visibly changed between two thumbnails.

    A COUNT, not a mean. UI changes are small and local — a character, a checkbox, a menu
    sliding in — so averaging them across the whole frame buries them under the codec's
    own noise floor. Counting how many pixels moved at all is what makes a keystroke and a
    still screen different numbers.

    Pure stdlib: a 160x90 greyscale frame is 14,400 bytes, so a numpy dependency would
    cost more to install than the loop it replaces.
    """
    delta = config.SETTLE_PIXEL_DELTA
    return sum(1 for x, y in zip(a, b) if abs(x - y) > delta) / len(a)


def pick_settled_second(video_path: Path, seconds: float, duration: float) -> float:
    """Nudge a step's timestamp forward to the nearest moment the screen has STOPPED moving.

    Stage 1 can only name whole seconds (Gemini samples video at 1fps), so a timestamp that
    is right to the second still lands mid-keystroke or mid-transition — the two misses the
    2026-08-22 eval had left after the prompt fix. This is the sub-second half, and it is
    deliberately code rather than a third model call.

    Forward only, and only SETTLE_WINDOW_SECONDS: searching backwards leads to the screen
    BEFORE the action, which is the failure the prompt rewrite exists to fix, and a wide
    window lands on a different screen entirely.

    NEVER RAISES and never returns a worse answer than it was given. A frame that is only
    slightly blurred still shows the right screen; a step with no image at all is a hole in
    the article. So every failure path — ffmpeg unavailable, an unreadable stretch, a
    timestamp at the very end of the recording — returns `seconds` unchanged.
    """
    span = min(config.SETTLE_WINDOW_SECONDS, max(0.0, duration - seconds))
    # Less than two sample intervals of runway: nothing to compare, nothing to choose.
    if span < 2.0 / config.SETTLE_SAMPLE_FPS:
        return seconds

    try:
        thumbs = _thumbs(video_path, seconds, span)
    except Exception:
        return seconds
    if len(thumbs) < 3:
        return seconds

    # Activity = how much this frame differs from BOTH neighbours. A frame mid-transition
    # scores high on at least one side; a settled screen scores near zero on both. Taking
    # the max rather than the sum means a frame cannot hide a big change on one side behind
    # stillness on the other — which is exactly the last frame of a transition.
    step = 1.0 / config.SETTLE_SAMPLE_FPS
    activity = [
        max(
            _changed_fraction(thumbs[i - 1], thumbs[i]),
            _changed_fraction(thumbs[i], thumbs[i + 1]),
        )
        for i in range(1, len(thumbs) - 1)
    ]

    # The EARLIEST settled candidate, not the stillest. Once the screen has stopped moving
    # every later frame is equally still, and drifting to the end of the window for no gain
    # is how a screenshot ends up on the next action.
    for i, score in enumerate(activity):
        if score < config.SETTLE_STILL_FRACTION:
            return round(seconds + (i + 1) * step, 3)

    # Nothing in the window ever settles — continuous typing, a video playing on screen,
    # a spinner. Take the quietest moment available rather than giving up on it.
    best = min(range(len(activity)), key=activity.__getitem__)
    return round(seconds + (best + 1) * step, 3)


def _demo() -> None:
    """`python frames.py` — proves the settle-pick moves off a transition and stays put
    when the screen is already still.

    Builds its own clip with ffmpeg (no fixture file): 1s static, 0.5s where a SMALL
    region churns, then 1s static again with that region changed.

    The small region is the point. The first version of this test used a full-frame
    `testsrc` and passed against a metric that could only see whole-screen changes — so it
    certified a function that, measured on real recordings, moved timestamps by 0.1s and
    did nothing. Real UI transitions are local: a character, a checkbox, a menu. If this
    fixture ever goes back to changing the whole frame, it stops testing anything.
    """
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        clip = d / "clip.mp4"
        # A small WHITE box on black: strong luminance change over a small area, which is
        # what a real UI edit looks like to a greyscale comparison. (`testsrc` is the wrong
        # fixture twice over — it fills the frame, and its colour bars flatten to nearly
        # uniform grey, so it registered 5 changed pixels out of 14,400.)
        box = 24
        _run(
            [
                "ffmpeg", "-y", "-v", "error",
                "-f", "lavfi", "-i", "color=black:s=320x180:r=30:d=1",
                "-f", "lavfi", "-i", "color=black:s=320x180:r=30:d=0.5",
                "-f", "lavfi", "-i", f"color=white:s={box}x{box}:r=30:d=0.5",
                "-f", "lavfi", "-i", "color=black:s=320x180:r=30:d=1",
                "-f", "lavfi", "-i", f"color=white:s={box}x{box}:r=30:d=1",
                "-filter_complex",
                # Middle: the box SLIDES, so consecutive frames genuinely differ.
                "[1:v][2:v]overlay=x='10+t*200':y=10[mid];"
                # Tail: the box parked where the slide ended — still, and different from
                # the opening frame, exactly like a settled screen after a change.
                "[3:v][4:v]overlay=110:10[end];"
                "[0:v][mid][end]concat=n=3:v=1[v]",
                "-map", "[v]", "-pix_fmt", "yuv420p",
                str(clip),
            ],
            "demo clip",
        )
        duration = probe_duration(clip)
        assert duration > 2.4, duration

        # The metric must SEE a small local change. Asserted directly, because everything
        # below is meaningless if a still frame and a churning one score the same.
        still = _thumbs(clip, 0.1, 0.3)
        moving = _thumbs(clip, 1.05, 0.3)
        assert len(still) >= 2 and len(moving) >= 2
        quiet = _changed_fraction(still[0], still[1])
        busy = _changed_fraction(moving[0], moving[1])
        assert quiet < config.SETTLE_STILL_FRACTION, f"a static screen must read as still: {quiet}"
        assert busy > config.SETTLE_STILL_FRACTION, (
            f"a small changing region must read as motion: {busy} — this is the assertion "
            "a frame-wide MEAN silently fails"
        )

        # Landing ON the churn: must move forward, out of it, into the still tail.
        moved = pick_settled_second(clip, 1.0, duration)
        assert moved > 1.0, f"a timestamp inside a transition must move: {moved}"
        assert moved <= 1.0 + config.SETTLE_WINDOW_SECONDS, f"never past the window: {moved}"
        assert moved >= 1.5, f"must clear the churn (ends at 1.5s), got {moved}"

        # Already still: the first candidate qualifies, so it barely moves. The common
        # case, and the one where moving would do harm.
        held = pick_settled_second(clip, 0.2, duration)
        assert held < 0.5, f"a settled timestamp must stay put, got {held}"

        # No runway left: nothing to compare, hand back exactly what came in.
        assert pick_settled_second(clip, duration, duration) == duration
        assert pick_settled_second(clip, duration - 0.05, duration) == duration - 0.05

        # An unreadable file degrades to the input rather than raising. A step with a
        # slightly-off frame is an article; a step with no frame is a hole in one.
        junk = d / "junk.mp4"
        junk.write_bytes(b"not a video")
        assert pick_settled_second(junk, 5.0, 30.0) == 5.0

    print("frames settle-pick OK")


if __name__ == "__main__":
    _demo()
