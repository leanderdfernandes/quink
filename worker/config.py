"""Named config for the pipeline worker.

CLAUDE.md §10: model IDs, prompts, paths and limits are constants at the top, never
scattered literals — changeable without hunting.
"""

import os

from dotenv import load_dotenv

load_dotenv()

# --- Models -----------------------------------------------------------------
# The video model drafts; the cheap model polishes; code does everything
# deterministic. Do NOT add a model call anywhere else (CLAUDE.md §5).

VIDEO_MODEL = "gemini-2.5-flash"

# NOT "gemini-2.5-flash-lite". That model 404s with "no longer available to new
# users" while STILL appearing in models.list() — the standard "list models, pick
# one" pattern selects a corpse. Presence in models.list() is not proof a model is
# callable. (LEARNINGS #1.) If a production key regains 2.5-lite access, this is the
# one line to change — that is why the constant exists.
TEXT_MODEL = "gemini-3.1-flash-lite"

# --- Secrets / environment --------------------------------------------------
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "http://localhost:5173")

# --- Storage ----------------------------------------------------------------
BUCKET_VIDEOS = "videos"
BUCKET_FRAMES = "frames"

# --- Custom domain (build spec §4) ------------------------------------------
# Every KB gets {subdomain}.quink.site free; a custom domain CNAMEs to it.
READER_DOMAIN = "quink.site"

# The verifier is behind an interface with two implementations (build spec §4):
#   "stub" — driven manually in local dev via /api/domain/stub (no real DNS)
#   "dns"  — a real CNAME lookup (needs dnspython)
# Default stub so the whole flow is testable with no external services.
DOMAIN_VERIFIER = os.environ.get("DOMAIN_VERIFIER", "stub")

# Background re-check cadence + give-up ceiling. Short interval for local dev; the
# per-domain wait grows with attempts (backoff) inside domain.py.
DOMAIN_CHECK_INTERVAL_SECONDS = int(os.environ.get("DOMAIN_CHECK_INTERVAL_SECONDS", "15"))
DOMAIN_MAX_ATTEMPTS = 40  # ~ hours of backoff before -> failed
DOMAIN_CNAME_TTL = 3600

# --- Limits -----------------------------------------------------------------
# Gemini's inline ceiling for Part.from_bytes. Above this the File API is required;
# we don't implement that fallback yet, so we fail loudly instead of silently
# truncating (CLAUDE.md §5).
MAX_INLINE_BYTES = 100 * 1024 * 1024

# Dense frame set for the Tier-1 filmstrip: 1 frame per second across the whole
# video. Pure ffmpeg, no model call — "code does everything deterministic".
DENSE_FRAME_FPS = 1

# The filmstrip shows +/- this many seconds around a step's timestamp (ux-spec §4).
# The worker doesn't slice the window; it just needs the dense set to cover it.
FILMSTRIP_WINDOW_SECONDS = 3

# WebP for speed + privacy + size (CLAUDE.md §8). Not a cost play — at ~92% margins
# halving COGS is noise, so don't over-invest here.
WEBP_QUALITY = 80

# Retry the model exactly once on malformed JSON, then fail loudly with the raw
# output in the error (CLAUDE.md §5).
JSON_RETRY_ATTEMPTS = 2

# A run uploads ~50+ frames over one HTTP/2 connection; Storage occasionally resets a
# stream mid-flight. Retry the individual upload so one blip doesn't discard a finished
# ~60s Gemini run.
UPLOAD_RETRY_ATTEMPTS = 3
UPLOAD_RETRY_BACKOFF_SECONDS = 1.0

# Stage 1 pushes the whole video inline (tens of MB) over a ~90s job, so dropped
# connections are routine. Transport errors and 5xx retry; 4xx does not (see gemini.py).
GEMINI_TRANSPORT_RETRY_ATTEMPTS = 3
GEMINI_TRANSPORT_BACKOFF_SECONDS = 2.0

# --- Pipeline stages --------------------------------------------------------
# Must match jobs.stage in the migration and PIPELINE_STAGES in the SPA config.
# Labels reflect the REAL stage — never a timer-driven lie (LEARNINGS #3).
STAGE_ANALYZING = "analyzing"   # "Analyzing your recording"
STAGE_DETECTING = "detecting"   # "Detecting each action"
STAGE_CAPTURING = "capturing"   # "Capturing screenshots"
STAGE_WRITING = "writing"       # "Writing your guide"
