"""The failure taxonomy — one code per way generation can go wrong.

Classification happens AT THE SOURCE (frames.py, gemini.py, pipeline.py), never by
pattern-matching an exception string afterwards. The moment a code is inferred from a
message, a reworded upstream error silently reclassifies itself as something else and the
user gets told their file is bad when the fault was ours.

`detail` is for the server log and the `jobs.failure_detail` column ONLY. It is never
returned to a client and never rendered — migration 0020 revokes the column from anon and
authenticated so that stays true even if a future select forgets. The CODE is the entire
contract with the SPA; the user-facing copy lives in web/src/lib/failures.ts, mirrored the
same way PLANS is. If the two lists drift, that's a bug.

The first rule of the copy on the other side: never blame the user's file when it's ours.
"""

# --- Their file ------------------------------------------------------------
VIDEO_UNREADABLE = "video_unreadable"          # ffprobe can't read it
VIDEO_TOO_LONG = "video_too_long"              # over MAX_VIDEO_MINUTES

# --- Ours ------------------------------------------------------------------
MODEL_UNAVAILABLE = "model_unavailable"        # Gemini 5xx / 429 / dropped transport
MODEL_BAD_OUTPUT = "model_bad_output"          # unparseable JSON after the retry
MODEL_BLOCKED = "model_blocked"                # safety filter
FRAME_EXTRACTION_FAILED = "frame_extraction_failed"   # TOTAL ffmpeg failure only
TIMEOUT = "timeout"                            # exceeded JOB_TIMEOUT_MIN
SPEND_CAP = "spend_cap"                        # global circuit breaker
# Not in the spec's table, and deliberately added: without it an unexpected exception
# (Storage down, a bad insert) lands with NO code and the SPA has nothing to render but a
# stuck spinner. Shares model_bad_output's "this one's on us" copy — the honest thing to
# say — but keeps its own code so the logs don't lie about which path broke.
INTERNAL_ERROR = "internal_error"

# --- Not failures ----------------------------------------------------------
# Refused in POST /api/generate before a job row exists, so these never reach a jobs row.
# quota_exceeded is the upgrade modal (pricing-spec §7), NOT a failure screen.
QUOTA_EXCEEDED = "quota_exceeded"
# Retry-only: the 7-day retention sweep already collected the recording, so re-running it
# is impossible and the user has to hand us the file again. A clean state, not an error.
VIDEO_PURGED = "video_purged"

# --- Degraded outcomes -----------------------------------------------------
# The article SHIPS, so these are not failure codes and they do NOT stop the run counting
# against quota — the user got an article. Recorded on `jobs.degraded` so "how often does
# Stage 2 fall over" is one query, not an archaeology exercise.
DEGRADED_STAGE2 = "stage2_failed"
DEGRADED_FRAMES = "frames_partial"


class Failed(RuntimeError):
    """A classified pipeline failure. `code` is the taxonomy entry; the message is the
    detail — internal, logged, never rendered."""

    def __init__(self, code: str, detail: str):
        self.code = code
        super().__init__(detail)
