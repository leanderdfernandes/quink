// Named config. Per CLAUDE.md §10: limits, prices and paths are constants, never
// scattered literals — changeable without hunting.

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

// Common, recognizable brand primaries — the colours real companies actually pick, readable
// on white and as a hero. Most users take one; the swatch is the affordance, the hex picker
// covers the rest.
export const COLOR_PRESETS = [
  '#2563EB', // blue
  '#4F46E5', // indigo
  '#7C3AED', // violet
  '#0D9488', // teal
  '#059669', // emerald
  '#EA580C', // orange
  '#DC2626', // red
  '#334155', // slate
] as const

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

// Free tier: 3 LIFETIME articles (CLAUDE.md §7, pricing-spec §2). Locked — older
// specs saying "5 minutes" are superseded. NOT enforced this slice; display only.
export const FREE_ARTICLE_LIMIT = 3

// Neutral KB name for free-provider signups. Must match kb_name_from_email() in
// the migration — if these drift, the inline rename field pre-fills wrong.
export const DEFAULT_KB_NAME = 'My Help Center'

// Upload validation. MP4/MOV only (ux-spec §2). Gemini's inline Part.from_bytes
// limit is 100MB (CLAUDE.md §5); above that needs the File API, which we haven't
// built — so reject early and loudly rather than fail deep in the pipeline.
export const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime'] as const
export const ACCEPTED_VIDEO_EXTENSIONS = ['.mp4', '.mov'] as const
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024

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
  freeLimitDisclosure: `${FREE_ARTICLE_LIMIT} free articles, then top up.`,
  videoDeletion: 'We delete the source video once your article is published.',
  buildCta: 'Build my article',
  wallHeading: 'Create a free account to build your guide.',
  wallFilePill: '✓ your recording is ready',
  wallFootnote: 'Keeps the free tier free for everyone.',
  wallNoCard: `Free accounts include ${FREE_ARTICLE_LIMIT} articles, no card needed.`,
  generatingReassurance: "Hang tight — you can't lose this.",
  generatingTip:
    "You'll be able to swap any screenshot and edit every step before publishing.",
} as const

export const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? 'http://localhost:8000'
