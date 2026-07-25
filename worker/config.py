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
# Objects are keyed "{kb_id}/…", NOT by owner: a KB can change hands (the ownership-claim
# flow) and a purge has to be able to delete exactly one KB's objects. Storage RLS reads
# ownership by resolving that first segment through knowledge_bases (migration 0014).
BUCKET_VIDEOS = "videos"
BUCKET_FRAMES = "frames"

# --- Entitlements (mvp-dev-plan §2) -----------------------------------------
# LIMITS ONLY. Prices live in the `plans` table in Supabase so they can change without a
# deploy; limits are behaviour and belong in code. `None` means unlimited throughout.
#
# Mirrored by web/src/lib/plans.ts (same shape) and, for the two flags the database itself
# must decide, by public.plan_flags() in migration 0014. If they drift, that's a bug.
#
# `plan` is OWNER-level — it lives on profiles, never on a KB. A KB-scoped plan would carry
# the wrong entitlements through an ownership claim and go ambiguous at Growth's 5 KBs.
#
# Why `internal` exists: it is how help.quink.online and the reverse-demo KBs run without a
# single admin-bypass branch in the generation path. Lee's account is just a plan tier.
# noindex stays True there so demo KBs never compete with the target's own pages.
#
# starter and founding are identical today. Correct and temporary: they diverge the moment
# Starter's price or quota moves and founding stays locked. That divergence is the whole
# reason founding is its own value rather than "starter with a note".
PLANS: dict[str, dict] = {
    "free":     {"lifetime_runs": 3,    "monthly_runs": None, "kbs": 1,
                 "expiry_days": 30,   "custom_domain": False,
                 "watermark": True,  "noindex": True},
    "founding": {"lifetime_runs": None, "monthly_runs": 20,   "kbs": 1,
                 "expiry_days": None, "custom_domain": True,
                 "watermark": False, "noindex": False},
    "starter":  {"lifetime_runs": None, "monthly_runs": 20,   "kbs": 1,
                 "expiry_days": None, "custom_domain": True,
                 "watermark": False, "noindex": False},
    "growth":   {"lifetime_runs": None, "monthly_runs": 80,   "kbs": 5,
                 "expiry_days": None, "custom_domain": True,
                 "watermark": False, "noindex": False},
    "internal": {"lifetime_runs": None, "monthly_runs": None, "kbs": 999,
                 "expiry_days": None, "custom_domain": True,
                 "watermark": False, "noindex": True},
}

DEFAULT_PLAN = "free"

# Global, plan-independent kill switch on a day's Gemini spend — `internal` included.
# Deliberate: a bug in the reverse-demo loop running against an unlimited account is
# exactly how a runaway bill happens. $5 is ~250 articles/day, far above legitimate use.
DAILY_SPEND_CAP_USD = 5.0

# What one generation is assumed to cost, per minute of source video (Stage 1's video
# tokens dominate). It only has to be roughly right — its single job is to drive the cap
# above, not to bill anyone.
# ponytail: flat per-minute rate. Replace with real token accounting from the Gemini usage
# metadata if the breaker starts firing early or late.
EST_COST_USD_PER_VIDEO_MINUTE = 0.02

# --- Custom domain (build spec §4) ------------------------------------------
# Every KB gets {subdomain}.quink.online free; a custom domain points at the same host.
READER_DOMAIN = "quink.online"

# Custom domains are a PAID feature (pricing-spec §Free: "No custom domain"; §Starter:
# "Custom domain mapping + auto-SSL") — the commitment wall (ux-spec §7). Enforced in the
# worker, not just hidden in the UI, because the UI is not a security boundary.
#
# OFF until checkout ships: there is no way to upgrade yet, so enforcing it now would just
# lock everyone (including us) out of the feature. Flip to True when payments land — that
# is the whole change on the worker side. WHICH plans qualify is not configured here; it is
# PLANS[plan]["custom_domain"], because there is exactly one entitlement table.
DOMAIN_REQUIRES_PAID_PLAN = False

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
