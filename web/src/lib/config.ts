// Named config. Per CLAUDE.md §10: limits, prices and paths are constants, never
// scattered literals — changeable without hunting.

import { PLANS } from './plans'

// WHICH DEPLOYMENT IS THIS. The single source of truth on the web side, mirroring
// APP_ENV / IS_PRODUCTION in worker/config.py. Vite inlines it at BUILD time, so it must be
// set in the deploy environment (Vercel > Settings > Environment Variables) per branch.
//
// No default, and it THROWS at module load rather than assuming. A staging build that
// silently identifies as production renders no staging banner — which is the one thing
// standing between an operator and editing what they believe is test data. vite.config.ts
// refuses the build too, so this throw is the second net, not the first.
export const APP_ENV = import.meta.env.VITE_APP_ENV as 'production' | 'staging'
if (APP_ENV !== 'production' && APP_ENV !== 'staging') {
  throw new Error(
    `VITE_APP_ENV is ${APP_ENV ?? 'unset'} — it must be "production" or "staging". ` +
      'Set it in the deploy environment and rebuild.',
  )
}
export const IS_PRODUCTION = APP_ENV === 'production'

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
// heading + body stack built only from already-loaded fonts (Newsreader, Hanken Grotesk)
// + web-safe serifs — no extra network load on the reader.
export const FONT_PAIRINGS: Record<
  string,
  { label: string; heading: string; body: string; headingWeight: string }
> = {
  // THREE PAIRINGS, AND THE HEADING FACE IS WHAT SEPARATES THEM. That is the whole point
  // of the control: a customer who picks Modern is choosing a grotesk headline, and if all
  // three set a serif then the setting does nothing and the reader's article titles come
  // out serif whatever they pick. (They did, briefly — see OPEN-ITEMS H2.)
  //
  // Quink's OWN chrome still follows the design system's serif-above-22px rule. This is the
  // reader wearing the CUSTOMER's brand, which is a different question and always has been.
  modern: {
    label: 'Modern',
    heading: "'Hanken Grotesk', system-ui, sans-serif",
    body: "'Hanken Grotesk', system-ui, sans-serif",
    // A grotesk headline carries its hierarchy in weight, so it takes --w-bold. The serif
    // pairings stay light: weight is where a transitional serif turns into advertising.
    headingWeight: '640',
  },
  editorial: {
    label: 'Editorial',
    heading: "'Newsreader', 'Iowan Old Style', Palatino, Georgia, serif",
    body: "'Hanken Grotesk', system-ui, sans-serif",
    headingWeight: '420',
  },
  classic: {
    label: 'Classic',
    heading: "Georgia, 'Times New Roman', serif",
    body: "Georgia, 'Times New Roman', serif",
    // Georgia has no variable axis, so it snaps to 400/700. 500 renders as regular, which
    // is what this pairing wants.
    headingWeight: '500',
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

// Upload validation. MP4/MOV only (ux-spec §2). 100MB is a TRANSPORT ceiling, not a model
// one: the worker streams anything over worker/config.py INLINE_VIDEO_MAX_BYTES through
// Gemini's File API, so nothing here is bounded by Part.from_bytes any more. Kept because
// MAX_VIDEO_MINUTES is the limit that actually matters and a 100MB upload over a phone
// tether is a worse experience than being told no — reject early rather than deep in the
// pipeline.
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

// AUDIENCE_OPTIONS / TONE_OPTIONS / DEFAULT_AUDIENCE / DEFAULT_TONE are GONE (0044).
// PRD §4 calls them a v1 leftover from ux-spec.md Screen 1 and cuts them: they move voice,
// not accuracy, and accuracy is the problem this section exists to solve. The columns went
// with them in the fold — a field nothing writes is a field that rots.

// The shared context pool, in characters (PRD "Context & AI Editing" §4). Covers
// `description` PLUS every note title and body, combined; `name` is exempt and separately
// capped at 120.
//
// Mirrors CONTEXT_CHAR_BUDGET in worker/config.py and public.context_char_budget()
// (migration 0044) — and the database is where it is ENFORCED. product_context is not in
// the UPDATE grant, so set_product_context() is the only way in and this number is the
// meter, not the control. If the two drift, the meter fills at one length and the RPC
// refuses at another.
export const CONTEXT_CHAR_BUDGET = 6000

// Sum it exactly the way the RPC sums it, or "100%" means two different things on the two
// sides of the wire.
export function contextCharsUsed(description: string, notes: { title: string; body: string }[]) {
  return (
    description.length +
    notes.reduce((n, note) => n + note.title.length + note.body.length, 0)
  )
}

// Past this the meter turns amber (PRD §4). Not a limit — a warning that one is coming.
export const CONTEXT_BUDGET_WARN = 0.9

// The per-run half of context (PRD §4, as amended): the "What does this recording show"
// note on the upload card. Deliberately OUTSIDE CONTEXT_CHAR_BUDGET — that pool is the
// workspace context, reused by every guide, while this is typed fresh per upload. It also
// is not CLARIFICATION_NOTE_MAX, which is the same 600 on a different field at a different
// stage (lib/clarifications.ts); two limits that happen to agree are still two limits.
//
// Mirrors RECORDING_NOTE_MAX in worker/config.py, which is where it is ENFORCED — this is
// the input's maxLength, and a maxLength is a courtesy, not a control.
export const RECORDING_NOTE_MAX = 600

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
  // WAS: "We delete the source video once your article is published." That promise is
  // retired with the retention reversal (PRD "Context & AI Editing" §8) — the recording now
  // survives publishing, because checking a step against the recording is the one edit a
  // general chat model cannot make, and deleting on publish removed it on day one.
  //
  // A FUNCTION rather than a constant, because the answer is genuinely different per tier
  // and a single sentence would be false on one of them. Retention IS the meter here, so
  // the number is not decoration: it is what the user is being told they are buying.
  // `null` = kept for the life of the article. Mirrors PLANS[plan].video_retention_days in
  // worker/config.py, which is where it is enforced.
  // `undefined` means we do not know the window yet, and the note is then not rendered at
  // all. Saying nothing is the only honest third option: a retention period is a promise.
  videoDeletion: (days: number | null | undefined): string | null =>
    days === undefined
      ? null
      : days === null
        ? 'We keep your recording for as long as the article exists, so you can check the guide against it. Delete the article and the recording goes with it.'
        : `We keep your recording for ${days} days so you can check the guide against it, then we delete it.`,
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
    'No video runs left. Nothing was uploaded and no run was used — this recording is waiting on this device.',
  // The same wall, for someone who cannot buy their way past it. It is a STATE, not a sell:
  // an "Upgrade" button in front of a member is the most literal reading of
  // team-access-spec L7 there is — asking the one person on the screen who has no card on
  // file to go and pay. Naming the owner is not billing information; it is the answer to
  // "who do I ask".
  heldFileNoteMember: (owner: string | null) =>
    `Not enough runs left. ${owner ?? 'The owner of this help center'} can add more. ` +
    'Nothing was uploaded and no run was used — this recording is waiting on this device.',
  generatingTip:
    "You'll be able to swap any screenshot and edit every step before publishing.",
  // The building state (slice: building vs ready). A greyed control on its own tells the
  // user something is broken; a greyed control with a sentence beside it tells them to
  // wait. Both say WHEN it opens, never "please wait".
  buildLockHint: 'Editing opens when your guide is finished.',
  buildPublishHint: 'Publish opens when your guide is finished.',
  // Completion is an EVENT, not four things quietly stopping. Dismissed by hand only —
  // a banner that clears itself on a timer means someone who looked away got no signal
  // at all, which is the bug this whole slice exists to fix.
  buildDone: 'Your guide is ready. Every step is editable now, and you can publish.',
  // On the placeholder itself, not buried in a panel nobody opens.
  buildShotComing: 'Screenshot coming',
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

// WAKE THE WORKER BEFORE THE USER NEEDS IT.
//
// Production runs on Render's free tier, which stops the instance after ~15 idle minutes;
// a cold start was measured at 26.5s. .github/workflows/keep-worker-awake.yml pings it on a
// */9 cron, but GitHub's scheduled triggers are explicitly best-effort and are routinely
// delayed or dropped — so "the worker is asleep when someone uploads" is a state that still
// happens, and where it lands is the worst possible screen: a first run, at the moment the
// user is deciding whether this product works.
//
// The fix that is actually in our hands: the screen that is ABOUT to need the worker wakes
// it. Picking a file and answering one question takes longer than a cold boot, so the wait
// overlaps with work the user was doing anyway instead of being added to the front of it.
//
// Fire-and-forget, deliberately: nothing on the calling screen reads the answer, and a
// failure here must never be visible. It is NOT a health check and must never become one —
// the worker stays the only authority on whether a run may proceed (CLAUDE.md §10b).
export function wakeWorker(): void {
  void fetch(`${WORKER_URL}/health`, { cache: 'no-store' }).catch(() => {})
}
