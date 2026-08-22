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

# MEASURED against gemini-2.5-flash on the eval set (2026-08-22), which is why this moved:
# on V1 — the repetition video the whole collapse rule exists for — 2.5-flash still emitted
# four separate "add a question" steps and 3.1-pro collapsed them into one. It is also
# ~3x faster (34s vs 93s on V1) and uses ~a third of the input tokens, so "bear the cost"
# turned out not to cost anything.
#
# `gemini-2.5-pro` is NOT the upgrade path: it 404s with the same "no longer available to
# new users" message 2.5-flash-lite gives (LEARNINGS #1) while still appearing in
# models.list(), and Google's own error text names this model as the replacement.
# `gemini-3.7-flash` was tried and returned 503 "high demand" on every attempt.
VIDEO_MODEL = "gemini-3.1-pro-preview"

# NOT "gemini-2.5-flash-lite". That model 404s with "no longer available to new
# users" while STILL appearing in models.list() — the standard "list models, pick
# one" pattern selects a corpse. Presence in models.list() is not proof a model is
# callable. (LEARNINGS #1.) If a production key regains 2.5-lite access, this is the
# one line to change — that is why the constant exists.
TEXT_MODEL = "gemini-3.1-flash-lite"

# --- Environment ------------------------------------------------------------
# The single source of truth for "which deployment is this". Everything that must differ
# between production and staging keys off these two names rather than off an inference
# (a hostname, an origin list, whether a key happens to be set).
#
# REQUIRED, with NO default. A missing APP_ENV is a boot failure, never a silent fallback
# to production behaviour: the worker holds the service role key for whichever database it
# was pointed at, and "assume production" is the one guess that can email real customers
# and spend real money. main.py checks the rest of the coherence rules at startup.
APP_ENV = os.environ["APP_ENV"]
IS_PRODUCTION = APP_ENV == "production"

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
# Logos, favicons and header images. Was a bare "branding" literal inside the trial purge —
# the one bucket name that existed in three places and this table's whole point is that a
# path is named once. Mirrors STORAGE_BUCKET_BRANDING in web/src/lib/config.ts.
BUCKET_BRANDING = "branding"

# Every bucket a KB owns. purge.py iterates THIS, so a fourth bucket added later is deleted
# by both the trial purge and account deletion without either being edited — the failure this
# guards against is a new bucket that only one of the two deletion paths knows about.
KB_BUCKETS = (BUCKET_FRAMES, BUCKET_VIDEOS, BUCKET_BRANDING)

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
                 "watermark": True,  "noindex": True, "can_invite": False},
    "founding": {"lifetime_runs": None, "monthly_runs": 20,   "kbs": 1,
                 "expiry_days": None, "custom_domain": True,
                 "watermark": False, "noindex": False, "can_invite": True},
    "starter":  {"lifetime_runs": None, "monthly_runs": 20,   "kbs": 1,
                 "expiry_days": None, "custom_domain": True,
                 "watermark": False, "noindex": False, "can_invite": True},
    "growth":   {"lifetime_runs": None, "monthly_runs": 80,   "kbs": 5,
                 "expiry_days": None, "custom_domain": True,
                 "watermark": False, "noindex": False, "can_invite": True},
    "internal": {"lifetime_runs": None, "monthly_runs": None, "kbs": 999,
                 "expiry_days": None, "custom_domain": True,
                 "watermark": False, "noindex": True, "can_invite": True},
}

DEFAULT_PLAN = "free"

# How many generations one ACCOUNT may have running at once (slice 3c). See lanes.py for
# why this exists: the real reason is the read-then-act window in the daily spend breaker,
# not tiering. Kept small on every plan, `internal` included.
LANES: dict[str, int] = {
    "free": 1,
    "founding": 2,
    "starter": 2,
    "growth": 2,
    "internal": 3,
}

# Global, plan-independent kill switch on a day's Gemini spend — `internal` included.
# Deliberate: a bug in the reverse-demo loop running against an unlimited account is
# exactly how a runaway bill happens. $5 is ~250 articles/day, far above legitimate use.
#
# Read from the environment so staging can be capped far lower than production without a
# code change — main.py refuses to boot a non-production worker above $2. The DEFAULT is
# unchanged: unset, this is still the $5 production ceiling.
DAILY_SPEND_CAP_USD = float(os.environ.get("DAILY_SPEND_CAP_USD", "5.0"))

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

# --- Source-video retention (ux-spec §9) ------------------------------------
# A successful article's recording is collected on first publish. A FAILED job never
# reaches a publish event, so its upload would sit in Storage forever — this is the other
# collection path. 7 days is deliberately longer than the retry-without-reupload window:
# re-running a failed job from the stored recording has to still work.
FAILED_VIDEO_RETENTION_DAYS = 7

# How often the background loop looks for them. The sweep is a STATE query ("failed, older
# than N days, not yet purged"), never a scheduled event, so a missed tick self-heals on
# the next one and nothing needs to fire at an exact moment.
VIDEO_PURGE_INTERVAL_SECONDS = int(os.environ.get("VIDEO_PURGE_INTERVAL_SECONDS", "3600"))

# --- Trial lifecycle (pricing-spec §7, ux-spec §6) --------------------------
# How long a free help center stays live is PLANS[plan]["expiry_days"] — one entitlement
# table, no second copy. What lives here is the shape of the wind-down around it.
#
# The grace window is the reason this deletion is defensible at all: expiry takes the site
# offline, it does not delete anything. Seven days later the data goes. pricing-spec §7
# calls the offline screen the highest-intent moment in the free funnel, and it only exists
# because nothing was destroyed to reach it.
TRIAL_GRACE_DAYS = 7

# Days-remaining thresholds that get an email, most urgent LAST (the sweep walks this in
# reverse). Mirrored by TRIAL_WARN_DAYS in web/src/lib/trial.ts, which decides when the pill
# turns amber — if the two drift, the app and the inbox disagree about the same day.
TRIAL_WARN_DAYS = (14, 7)

# --- Email ------------------------------------------------------------------
# DNS can take hours, so the "we'll email you the moment it's live" promise in the UI needs
# a real sender. All sending goes through mailer.py — see the module docstring for why it
# is not called email.py and why every looped send needs a persisted marker.
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")

# ONE support address in the codebase, mirroring web/src/lib/config.ts SUPPORT_EMAIL. A
# real, monitored mailbox on the verified domain — this is not a noreply setup and the copy
# invites a reply, so From and Reply-To are both it. There used to be a second address
# (hello@) sitting in the From line: replies reached us either way, which is exactly why
# nobody would have noticed the day one of the two stopped being read.
SUPPORT_EMAIL = os.environ.get("SUPPORT_EMAIL", "support@quink.online")

# Non-production catch-all. When set, mailer.py delivers EVERY message to this one address
# and prepends the real recipient to the subject as "[-> real@example.com]", so a staging
# worker can exercise the trial templates end to end without a single message reaching a
# customer. main.py refuses to boot: non-production with this UNSET, or production with it
# SET — the second is the dangerous one, a production deploy silently swallowing every
# customer email into a developer's inbox.
EMAIL_REDIRECT_TO = os.environ.get("EMAIL_REDIRECT_TO", "").strip()

EMAIL_FROM = os.environ.get("EMAIL_FROM", f"Quink <{SUPPORT_EMAIL}>")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO", SUPPORT_EMAIL)

# The kill switch, DEFAULT OFF. A real send needs this AND RESEND_API_KEY — the key alone
# is not consent, because a developer with production secrets in their .env (or a test run
# that imports config) would otherwise mail a live customer. Set it on Render only.
# Unset, mailer.py logs the whole payload instead; main.py's lifespan warns loudly if that
# is the state while the worker is serving a non-local origin, because the silent version
# of this is how a user-facing promise goes undelivered for a month.
EMAIL_ENABLED = os.environ.get("EMAIL_ENABLED", "").lower() in ("1", "true", "yes")

# --- Operator alerts (mvp-dev-plan §7) --------------------------------------
# Telegram, not email: these are for us, and an operator channel that shares a provider with
# customer mail goes quiet at exactly the moment you need to know why. Both unset by default,
# same consent rule as EMAIL_ENABLED — with either missing, purge.notify_ops() logs at
# WARNING instead, so a dev run exercises the same call path without pinging a real channel.
#
# NOTE: §7 specs a much wider alert set (quota, model failures, spend cap, over-cap) and
# UI-STATE-INVENTORY §D records that none of it is built. This is the first alert to land;
# notify_ops() is deliberately generic so the rest attach to it rather than growing a second
# sender, but do NOT take that as licence to build them speculatively.
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")

# --- Account deletion (DPDP right to withdraw consent) ----------------------
# Which plans may delete themselves without talking to a human. NOT an entitlement — it is a
# money safety catch, which is why it is here and not in PLANS.
#
# A paid account with a live mandate that deletes itself keeps getting debited by a payment
# processor that no longer has an account to point at. Razorpay Subscriptions with UPI
# Autopay does not read our database to decide whether to charge. Closing this before the
# mandate infrastructure exists costs one `if`; closing it after costs a refund and a
# chargeback dispute. `internal` is here because it is Lee's own tier and carries no mandate.
SELF_DELETE_PLANS = ("free", "internal")

# --- Limits -----------------------------------------------------------------
# Gemini's inline ceiling for Part.from_bytes. Above this the File API is required;
# we don't implement that fallback yet, so we fail loudly instead of silently
# truncating (CLAUDE.md §5).
MAX_INLINE_BYTES = 100 * 1024 * 1024

# Duration ceiling, checked after ffprobe (pipeline.py raises `video_too_long` above it).
# The 100MB size cap the SPA enforces is a proxy for this and a bad one — a low-bitrate
# 40-minute screen recording sails under it and then produces a Stage 1 prompt that costs
# real money to get a mediocre 60-step article from.
#
# This is the ENFORCED number. web/src/lib/config.ts MAX_VIDEO_MINUTES only renders it and
# is verified 6 to match — it was 6 there against 20 here, so every user who saw "up to 6
# minutes" was reading a limit that did not exist.
MAX_VIDEO_MINUTES = 6

# Wall clock ceiling on one run. A ~90s job that has been going 15 minutes is wedged, not
# slow. Checked at every stage boundary inside the pipeline (so the worker STOPS rather than
# racing a sweep), and again by retention.sweep_timeouts() for the case the process died and
# left the row at 'running' forever — the stuck-spinner state.
JOB_TIMEOUT_MIN = 15
# The sweep waits this much longer than the in-process check, so under normal operation the
# pipeline always classifies its own timeout and the sweep only ever catches dead processes.
JOB_TIMEOUT_GRACE_MIN = 5

# A job that never got a LANE is a different animal from a job that hung, and must not share
# a threshold with one (slice 3i). Waiting behind other runs is a capacity problem: nothing
# is wrong, the work simply has not started. On one lane, four dropped recordings put the
# last one ~6 minutes out; two hours is far past any legitimate queue and still catches a
# job orphaned by a worker that died holding the semaphore.
QUEUE_TIMEOUT_MIN = 120

# Dense frame set for the Tier-1 filmstrip: 1 frame per second across the whole
# video. Pure ffmpeg, no model call — "code does everything deterministic".
DENSE_FRAME_FPS = 1

# The filmstrip shows +/- this many seconds around a step's timestamp (ux-spec §4).
# The worker doesn't slice the window; it just needs the dense set to cover it.
FILMSTRIP_WINDOW_SECONDS = 3

# WebP for speed + privacy + size (CLAUDE.md §8). Not a cost play — at ~92% margins
# halving COGS is noise, so don't over-invest here.
#
# 90, not 80: these are screenshots of UI text, where lossy chroma subsampling shows. SSIM
# against the raw frame goes 0.9977 -> 0.9988 for +28% bytes, and the dense pass encodes no
# slower (measured: 4.0s vs 4.1s for 99 frames). 95 buys almost nothing on top.
#
# Deliberately ONE number for both the step frame and the dense set: a Tier-1 pick promotes
# a dense frame to BE the step's screenshot (FramePicker onPick writes its path straight
# onto the step), so a cheaper filmstrip would mean picking a better moment cost you image
# quality. Lossless was measured and rejected — 2.6x encode time and 2x the bytes on a pass
# whose bottleneck is already uploading ~100 objects.
WEBP_QUALITY = 90

# Retry the model exactly once on malformed JSON, then fail loudly with the raw
# output in the error (CLAUDE.md §5).
JSON_RETRY_ATTEMPTS = 2

# A run moves a video IN and ~50+ frames OUT over one HTTP/2 connection; Storage
# occasionally resets a stream mid-flight. Retry the individual transfer so one blip
# doesn't discard a finished ~60s Gemini run.
#
# Named STORAGE_, not UPLOAD_: the download of the recording is governed by these too now.
# It was the one network hop in the pipeline with no retry at all, and a WinError 10035
# mid-download failed a whole eval video on 2026-08-22.
STORAGE_RETRY_ATTEMPTS = 3
STORAGE_RETRY_BACKOFF_SECONDS = 1.0

# Stage 1 pushes the whole video inline (tens of MB) over a ~90s job, so dropped
# connections are routine. Transport errors and 5xx retry; 4xx does not (see gemini.py).
#
# 4 x 4s (linear, so ~40s of trying) rather than 3 x 2s (~12s): the failure actually seen in
# production on 2026-08-22 was a 503 "this model is currently experiencing high demand",
# three runs in a row. A capacity spike outlasts twelve seconds. The job's own ceiling is
# JOB_TIMEOUT_MIN (15 min), so this is nowhere near it.
GEMINI_TRANSPORT_RETRY_ATTEMPTS = 4
GEMINI_TRANSPORT_BACKOFF_SECONDS = 4.0

# --- Pipeline stages --------------------------------------------------------
# Must match jobs.stage in the migration and PIPELINE_STAGES in the SPA config.
# Labels reflect the REAL stage — never a timer-driven lie (LEARNINGS #3).
STAGE_ANALYZING = "analyzing"   # "Analyzing your recording"
STAGE_DETECTING = "detecting"   # "Detecting each action"
STAGE_CAPTURING = "capturing"   # "Capturing screenshots"
STAGE_WRITING = "writing"       # "Writing your guide"
