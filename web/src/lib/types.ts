// The JSON contract (CLAUDE.md §6). This shape is mirrored by:
//   - worker/models.py  (Pydantic)
//   - public.steps      (DB rows)
// If any of the three drift, that's a bug.

export type Step = {
  step_number: number
  heading: string
  body_text: string
  screenshot_url: string | null
}

export type Article = {
  title: string
  subtitle: string
  steps: Step[]
}

// --- DB row shapes (what Supabase actually returns) ---------------------------
// The contract above is the payload; these carry the persistence/UI state around it.

export type StepRow = Step & {
  id: string
  article_id: string
  // Human-correction memory (CLAUDE.md §8): a re-run must not overwrite a frame a
  // human chose.
  is_edited: boolean
  // The moment in the video this frame came from. Centres the Tier-1 filmstrip's ±3s
  // window. Null when the image didn't come from a timestamp (a Tier-3 upload).
  timestamp_seconds: number | null
  updated_at: string
}

// Publish/link state (build spec §2). Same thing as "is it shared" — no separate flag.
export type Visibility = 'draft' | 'unlisted' | 'listed'

export type ArticleRow = {
  id: string
  kb_id: string
  title: string
  subtitle: string
  // PIPELINE lifecycle only. Publish state is `visibility`; 'published' was retired from
  // the DB check constraint in migration 0015 and must never be written here again.
  status: 'generating' | 'ready'
  // draft = 404 · unlisted = link-only · listed = in nav/search/sitemap.
  visibility: Visibility
  // URL slug: from the title, editable while draft, FROZEN once published. Null until set.
  slug: string | null
  // Folder the article is filed in (build spec §7). Null = "Unfiled" — cannot be
  // published until filed. Doubles as the live-site category (migration 0009).
  folder_id: string | null
  // 'generated' | 'manual', stamped by a DB trigger off source_video_path (0014). Use
  // this — not the video's existence — for anything that describes the article's ORIGIN:
  // the video is deleted on first publish, so source_video_path stops being an answer.
  source: 'generated' | 'manual'
  // Null once collected. Present only between generation and first publish.
  source_video_path: string | null
  // Frozen snapshot the reader renders (CLAUDE.md §7 publish). Null until first publish.
  published_content: Article | null
  published_at: string | null
  created_at: string
  updated_at: string
}

// A folder = the editor's org unit AND the live-site category (migration 0009).
export type Folder = {
  id: string
  kb_id: string
  name: string
  position: number
  created_at: string
  updated_at: string
}

export type FontPairing = 'modern' | 'editorial' | 'classic'
export type DomainStatus = 'none' | 'pending' | 'verifying' | 'live' | 'failed'

export type KnowledgeBase = {
  id: string
  owner_id: string
  name: string
  // Customizable reader home-page copy (build: home page / theming). `about` is the hero
  // description; headline + search_placeholder fall back to built-ins when empty.
  about: string
  headline: string
  search_placeholder: string
  subdomain: string | null
  custom_domain: string | null
  is_published: boolean
  // Theming (build spec §1). Primary colour is the ONLY colour stored — everything else
  // derives from it at render.
  primary_color: string
  font_pairing: FontPairing
  logo_path: string | null
  favicon_path: string | null
  domain_status: DomainStatus
  domain_last_checked_at: string | null
  domain_error: string | null
  // Failed verification checks so far. Persisted (not in worker memory) so the backoff and
  // the give-up ceiling survive a deploy — see migration 0012.
  domain_attempts: number
  reader_views: number
  // Trial lifecycle (mvp-dev-plan §5). Stamped once, by trigger, on the FIRST article
  // created in this KB — never recalculated. The sweep that acts on these is a later slice.
  trial_started_at: string | null
  offline_at: string | null
  purge_at: string | null
  created_at: string
}

// Entitlements are OWNER-level and live here, not on a KB. `plan` on a KB would carry the
// wrong tier through an ownership claim and go ambiguous once a plan allows several KBs.
export type Profile = {
  id: string
  email: string
  plan: string
  plan_since: string | null
  is_admin: boolean
  last_kb_id: string | null
  created_at: string
}

// The reader-safe KB projection returned by the reader_kb() RPC (anon). A subset of the
// columns above — no owner_id, quota, or domain internals.
export type ReaderKb = {
  id: string
  name: string
  about: string
  headline: string
  search_placeholder: string
  primary_color: string
  font_pairing: FontPairing
  logo_path: string | null
  favicon_path: string | null
  subdomain: string | null
  custom_domain: string | null
  domain_status: DomainStatus
  // RENDERING flags, derived from the owner's plan at query time. The reader is anon and
  // has no business knowing what tier its host pays for — or that tier names exist.
  noindex: boolean
  watermark: boolean
}

// Nav/sitemap row from reader_articles(). Carries the folder it's filed in so the home
// can group into category cards (migration 0010).
export type ReaderArticleSummary = {
  id: string
  slug: string
  title: string
  subtitle: string
  published_at: string
  folder_id: string | null
  folder_name: string | null
  folder_position: number | null
}

// Published articles grouped by folder — one card on the help-center home.
export type ReaderCategory = {
  id: string
  name: string
  articles: ReaderArticleSummary[]
}

// A row in the run ledger (migration 0014). Append-only: it outlives the article it
// produced, which is what makes `counted_against_quota` un-farmable.
export type Job = {
  id: string
  kb_id: string
  user_id: string
  article_id: string | null
  // Set on SUCCESS only — a failed generation never burns a run. A DEGRADED run is a
  // success and does count: the user got an editable article.
  counted_against_quota: boolean
  stage: 'analyzing' | 'detecting' | 'capturing' | 'writing'
  status: 'queued' | 'running' | 'done' | 'error'
  // The taxonomy entry, and the ONLY thing that chooses failure copy (lib/failures.ts).
  // Its sibling `failure_detail` is revoked from the client in migration 0020 — it is a
  // log line, and there is deliberately no field for it here.
  failure_code: string | null
  // Non-null when the article shipped with something missing: 'stage2_failed' (unpolished
  // prose) and/or 'frames_partial' (steps with no screenshot). Never a failure.
  degraded: string | null
  // Set once the retention sweep has collected the recording — after which retry is
  // impossible and the only path is uploading it again.
  video_purged_at: string | null
  // The failed job this one re-attempts, if any. Each attempt is its own ledger row.
  retry_of: string | null
}

// The context form (ux-spec §2). Product name is the only required field; it is
// injected into the Stage 1 prompt for terminology grounding (EVAL-PLAN V7).
export type VideoContext = {
  product_name: string
  audience: string
  tone: string
  description: string
}
