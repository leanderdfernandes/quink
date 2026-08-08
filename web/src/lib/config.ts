// Named config. Per CLAUDE.md §10: limits, prices and paths are constants, never
// scattered literals — changeable without hunting.

import { PLANS } from './plans'

// Brand direction is being revisited (CLAUDE.md §12); the wordmark is not locked.
// One constant so renaming is one line.
export const PRODUCT_NAME = 'Quink'

// The reader-site root domain: every KB gets {subdomain}.quink.online free from signup
// (build spec §4). One constant so the rename is one line.
export const READER_DOMAIN = 'quink.online'

// Subdomains that belong to the app/infra, never a customer help center. A user must
// never be handed one of these as their KB subdomain, and a request to one must fall
// through to the authoring app, not the reader.
const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'api', 'admin', 'dashboard', 'mail'])

// If the current host is a customer help center — a {sub}.quink.online subdomain, or a
// custom domain pointed at us — return the key the reader_kb RPC resolves it by (the
// subdomain label, or the whole custom-domain host). Return null when this is the app
// itself or local dev; there the reader is reachable only via the /kb/{slug} dev path.
export function readerKeyFromHost(host: string): string | null {
  const h = host.split(':')[0].toLowerCase()
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local')) return null
  if (h === READER_DOMAIN || h === `www.${READER_DOMAIN}`) return null
  if (h.endsWith(`.${READER_DOMAIN}`)) {
    const label = h.slice(0, -(READER_DOMAIN.length + 1))
    // Only a single non-reserved label is a help center (acme.quink.online).
    return label.includes('.') || RESERVED_SUBDOMAINS.has(label) ? null : label
  }
  return h // a different domain entirely → a customer custom domain (matched by reader_kb)
}

// The public URL of a help center, or of a path within it. In production each help center
// lives on its own {subdomain}.quink.online; in local dev subdomains aren't wired, so we
// fall back to the /kb/{slug} path on the current origin. `path` is '' (home) or a leading-
// slash path like `/getting-started` or `/category/<id>`.
export function helpCenterUrl(subdomain: string | null, path = ''): string {
  const sub = subdomain ?? ''
  const host = window.location.hostname
  if (host === 'localhost' || host === '127.0.0.1') {
    return `${window.location.origin}/kb/${sub}${path}`
  }
  return `https://${sub}.${READER_DOMAIN}${path}`
}

// Storage bucket for logos + derived favicons (public). Frames + videos are in config
// below; branding is separate so a logo never collides with a frame path.
export const STORAGE_BUCKET_BRANDING = 'branding'

// Theming (build spec §1) --------------------------------------------------------
// The default primary colour. MUST match knowledge_bases.primary_color default in
// migration 0005 — if they drift, a fresh KB previews a different colour than it saves.
export const DEFAULT_PRIMARY_COLOR = '#1F6E6B'

// The pickable brand colours moved to lib/palette.ts and are now GENERATED at a constant
// OKLCH lightness rather than listed as hex. A hand-picked list cannot hold the one
// property that matters — equal contrast behind masthead text — and this one did not:
// its amber sat far lighter than the rest and washed the band out.

// Font pairings named by FEEL, never by font name (build spec §1). Each maps to a
// heading + body stack built only from already-loaded fonts (Hanken Grotesk) + web-safe
// serifs — no extra network load on the reader.
export const FONT_PAIRINGS: Record<
  string,
  { label: string; heading: string; body: string }
> = {
  modern: {
    label: 'Modern',
    heading: "'Hanken Grotesk', system-ui, sans-serif",
    body: "'Hanken Grotesk', system-ui, sans-serif",
  },
  editorial: {
    label: 'Editorial',
    heading: "Georgia, 'Times New Roman', serif",
    body: "'Hanken Grotesk', system-ui, sans-serif",
  },
  classic: {
    label: 'Classic',
    heading: "Georgia, 'Times New Roman', serif",
    body: "Georgia, 'Times New Roman', serif",
  },
}

// Sharing (build spec §2) — copy shown at the moment of sharing. The free-tier expiry
// disclosure is REQUIRED, not a nicety: over-disclosure here keeps deletion fair.
export const FREE_ARTICLE_EXPIRY_DAYS = 30

// Free-tier limits live in lib/plans.ts (PLANS.free), mirroring the worker. They are NOT
// repeated here: the unit is 3 lifetime AI video RUNS — articles typed by hand are
// unlimited on every tier — and a stray "FREE_ARTICLE_LIMIT" constant is how that
// distinction gets quietly lost again.

// Neutral KB name for free-provider signups. Must match kb_name_from_email() in
// the migration — if these drift, the inline rename field pre-fills wrong.
export const DEFAULT_KB_NAME = 'My Help Center'

// Upload validation. MP4/MOV only (ux-spec §2). Gemini's inline Part.from_bytes
// limit is 100MB (CLAUDE.md §5); above that needs the File API, which we haven't
// built — so reject early and loudly rather than fail deep in the pipeline.
export const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime'] as const
export const ACCEPTED_VIDEO_EXTENSIONS = ['.mp4', '.mov'] as const
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024

// Duration ceiling. ENFORCED by the worker after ffprobe — worker/config.py
// MAX_VIDEO_MINUTES, verified 6, and pipeline.py raises `video_too_long` above it. The SPA
// only RENDERS this number (the dropzone hint and the video_too_long screen): the browser
// can't be trusted to measure a file it also chose. If the two drift, the failure copy
// quotes a limit nobody enforces — which is exactly what it did at 6 here against 20 there.
export const MAX_VIDEO_MINUTES = 6

// Where a stuck user writes to us. A real, monitored, forwarding mailbox on the verified
// domain — replies reach a human, so the failure screens can invite one.
//
// This one constant arms every failure screen: FailureScreen switches on it alone to turn
// the job id it already renders into a prefilled mailto. Empty it and they all fall back
// to "quote reference <id>" — which is what to do if the mailbox ever stops being read,
// because a mailto that silently goes nowhere is worse than no link at all.
export const SUPPORT_EMAIL = 'support@quink.online'

export const STORAGE_BUCKET_VIDEOS = 'videos'
export const STORAGE_BUCKET_FRAMES = 'frames'

// Tier-1 frame-picker shows ±this many seconds of 1fps candidate frames around a step's
// timestamp (ux-spec §4). Must match the worker's dense set coverage.
export const FILMSTRIP_WINDOW_SECONDS = 3

// The four pipeline stages, in order. These map to the `jobs.stage` enum in the
// migration and to the worker's STAGES. Progress labels reflect the REAL stage —
// never a timer-driven lie (CLAUDE.md §5, LEARNINGS #3).
export const PIPELINE_STAGES = [
  { key: 'analyzing', label: 'Analyzing your recording' },
  { key: 'detecting', label: 'Detecting each action' },
  { key: 'capturing', label: 'Capturing screenshots' },
  { key: 'writing', label: 'Writing your guide' },
] as const

export type StageKey = (typeof PIPELINE_STAGES)[number]['key']

// Context form (ux-spec §2). Product name is the ONE required field.
export const AUDIENCE_OPTIONS = [
  'New users',
  'Existing customers',
  'Internal team',
  'Admins',
] as const

export const TONE_OPTIONS = ['Friendly', 'Concise', 'Formal'] as const

export const DEFAULT_AUDIENCE = 'New users'
export const DEFAULT_TONE = 'Friendly'

// User-facing copy that the specs fix word-for-word. Kept here so it can't drift
// into soft or business-internal phrasing (CLAUDE.md §11).
export const COPY = {
  // BOTH free limits, stated at the dropzone before the file is committed (pricing-spec §6,
  // ux-spec §1). The days half is not optional politeness: free tier includes unlimited
  // manual articles, so someone can hand-build forty of them, and a 30-day expiry
  // discovered afterwards is the exact dark pattern pricing-spec §2 says we must not ship.
  // Three facts, each said once. The old wording — "N free video guides from video ·
  // articles kept 30 days" — named the same object twice ("guides", then "articles") and
  // left "from video" dangling off a noun that already contained it.
  freeLimitDisclosure: `${PLANS.free.lifetime_runs} free guides from video, kept ${PLANS.free.expiry_days} days. Writing by hand is unlimited.`,
  videoDeletion: 'We delete the source video once your article is published.',
  buildCta: 'Build my article',
  wallHeading: 'Create a free account to build your guide.',
  wallFilePill: '✓ your recording is ready',
  wallFootnote: 'Keeps the free tier free for everyone.',
  wallNoCard: `Free accounts include ${PLANS.free.lifetime_runs} video guides, no card needed.`,
  generatingReassurance: "Hang tight — you can't lose this.",
  // Teaches granularity by example. "Describe this recording" on its own gets the product
  // description a second time; a specific, technical example gets a specific answer.
  recordingPlaceholder: 'e.g. Connecting a Postgres read replica and running the first sync',
  // Quota surface 3 of 3 (3f). The last run has to be a KNOWN moment — finding out
  // afterwards that that was the last one is the version of this that loses trust.
  lastRunWarning: 'This is your last free article. Writing by hand stays unlimited.',
  // Held files (3e). Leads with the constraint, then closes both worries in one sentence,
  // then says where it lives — someone who upgrades on their phone and finds an empty dock
  // stops trusting the product at the exact moment they paid.
  heldFileNote:
    'No free articles left. Nothing was uploaded and no run was used — this recording is waiting on this device.',
  generatingTip:
    "You'll be able to swap any screenshot and edit every step before publishing.",
  // The upgrade modal (pricing-spec §7, reactive variant). Was hardcoded in the component —
  // the one surface in the funnel where the words decide whether someone pays, and the only
  // one whose copy lived outside this file.
  //
  // The load-bearing sentence is "you can still write articles by hand." Generation is the
  // only thing that costs us anything, so it is the only thing capped, and a user who
  // believes the whole product is locked has no reason to come back.
  upgradePill: `You've used your ${PLANS.free.lifetime_runs} free video guides`,
  upgradeHeading: 'Keep building your help center',
  upgradeBody:
    'You can keep writing articles by hand for free. To make more guides from recordings — and to publish on your own domain without a watermark — pick a plan. Your whole team included, no per-seat fees.',
  upgradeManualCta: 'Write an article by hand',
  upgradeDismiss: 'Not now',
  upgradeNote:
    "Writing by hand is unlimited on every plan — it costs us nothing, so we don't charge for it.",
  // There is no checkout yet, so the way to actually buy is to ask us. A pricing surface
  // with no way to reach a human is where the highest-intent user in the funnel stops.
  upgradeContact: 'Want a plan now? Email us and we’ll set you up:',
} as const

export const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? 'http://localhost:8000'
