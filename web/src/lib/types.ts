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
  status: 'generating' | 'ready' | 'published'
  // draft = 404 · unlisted = link-only · listed = in nav/search/sitemap.
  visibility: Visibility
  // URL slug: from the title, editable while draft, FROZEN once published. Null until set.
  slug: string | null
  // Folder the article is filed in (build spec §7). Null = "Unfiled" — cannot be
  // published until filed. Doubles as the live-site category (migration 0009).
  folder_id: string | null
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
  free_articles_used: number
  plan: string
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
  plan: string
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

export type Job = {
  id: string
  kb_id: string
  article_id: string | null
  stage: 'analyzing' | 'detecting' | 'capturing' | 'writing'
  status: 'queued' | 'running' | 'done' | 'error'
  error: string | null
}

// The context form (ux-spec §2). Product name is the only required field; it is
// injected into the Stage 1 prompt for terminology grounding (EVAL-PLAN V7).
export type VideoContext = {
  product_name: string
  audience: string
  tone: string
  description: string
}
