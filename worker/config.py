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
# Comma-separated list of allowed SPA origins (CORS). An origin is scheme://host[:port]
# with NO trailing slash or path — the browser sends exactly that, so a stray "/" makes
# the match silently fail. We split and normalize so ".env" can be forgiving.
ALLOWED_ORIGINS = [
    o.strip().rstrip("/")
    for o in os.environ.get("ALLOWED_ORIGIN", "http://localhost:5173").split(",")
    if o.strip()
]

# --- Storage ----------------------------------------------------------------
BUCKET_VIDEOS = "videos"
BUCKET_FRAMES = "frames"

# --- Custom domain (build spec §4) ------------------------------------------
# Every KB gets {subdomain}.quink.online free; a custom domain points at the same host.
READER_DOMAIN = "quink.online"

# Custom domains are a PAID feature (pricing-spec §Free: "No custom domain"; §Starter:
# "Custom domain mapping + auto-SSL") — the commitment wall (ux-spec §7). Enforced in the
# worker, not just hidden in the UI, because the UI is not a security boundary.
#
# OFF until checkout ships: there is no way to upgrade yet, so enforcing it now would just
# lock everyone (including us) out of the feature. Flip to True when payments land — that
# is the whole change on the worker side. The SPA needs no flag: it surfaces the 402's
# message in the form's error slot, and that's the moment to build the upgrade modal
# (pricing-spec §7) properly.
DOMAIN_REQUIRES_PAID_PLAN = False
PAID_PLANS = ("starter", "growth")

# Hosting/verification is behind one interface with two implementations (build spec §4):
#   "stub"   — driven manually in local dev via /api/domain/stub (no Vercel, no DNS)
#   "vercel" — the real thing: registers the host on the project and asks Vercel when it
#              is servable. There is deliberately no "just check the CNAME" mode — DNS
#              pointing at us does not mean we can serve the host or that a cert exists.
# Default stub so the whole flow is testable with no external services.
DOMAIN_VERIFIER = os.environ.get("DOMAIN_VERIFIER", "stub")

# Vercel serves the SPA, so it is also what terminates TLS for customer domains. A host it
# doesn't know 404s with no certificate — registering it is what makes a custom domain work
# at all, so these are REQUIRED when DOMAIN_VERIFIER=vercel.
# Token needs project domain scope; VERCEL_TEAM_ID only for team accounts.
VERCEL_TOKEN = os.environ.get("VERCEL_TOKEN", "")
VERCEL_PROJECT_ID = os.environ.get("VERCEL_PROJECT_ID", "")
VERCEL_TEAM_ID = os.environ.get("VERCEL_TEAM_ID", "")
VERCEL_TIMEOUT_SECONDS = 15

# Only used if Vercel's config response omits a recommendation — their current published
# targets. The API answer always wins so a change on their side can't strand users.
VERCEL_CNAME_FALLBACK = "cname.vercel-dns.com"
VERCEL_A_FALLBACK = "76.76.21.21"

# What the stub shows in dev. Obvious placeholders — nobody should paste these anywhere.
STUB_CNAME_VALUE = "cname.example-stub.invalid"
STUB_A_VALUE = "203.0.113.1"

# Background re-check cadence + give-up ceiling. The per-domain wait grows with attempts
# (backoff) inside domain.py, so this is only the floor. Keep it ≥60s in production: every
# tick is a Vercel API call per pending domain.
DOMAIN_CHECK_INTERVAL_SECONDS = int(os.environ.get("DOMAIN_CHECK_INTERVAL_SECONDS", "60"))
DOMAIN_MAX_BACKOFF_SECONDS = 3600
DOMAIN_MAX_ATTEMPTS = 40  # ~ days of backoff before -> failed
DOMAIN_CNAME_TTL = 3600

# --- Email ------------------------------------------------------------------
# DNS can take hours, so the "we'll email you the moment it's live" promise in the UI needs
# a real sender. Unset -> the emails are logged instead (fine for dev; the promise is a lie
# in production, so set it before launch).
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
EMAIL_FROM = os.environ.get("EMAIL_FROM", "Quink <hello@quink.online>")

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
