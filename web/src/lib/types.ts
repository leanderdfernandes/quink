import type { Clarification } from './clarifications'

// The JSON contract (CLAUDE.md §6). This shape is mirrored by:
//   - worker/models.py  (Pydantic)
//   - public.steps      (DB rows)
// If any of the three drift, that's a bug.

// One shape in a step's non-destructive overlay (migration 0029). Coordinates are
// NORMALIZED 0-1 against the image's own box — the same frame renders at three different
// widths (editor canvas, reader measure, phone) and pixels survive none of them.
//
// Field names are short because this is stored per shape, per step, per article. `t` is the
// tool, `c` the colour.
//
// TWO GEOMETRIES, because the two kinds of shape genuinely are different things:
//   arrow            two POINTS — x1,y1 to x2,y2. It has no box and no rotation.
//   box/ellipse/text a RECT — origin x,y plus size w,h, with `rot` about its centre.
//
// Older rows stored every shape as two corners (x1..y2), and text as a bare point with no
// size at all. Nothing migrates them: `annotations` is jsonb, and lib/annotations.ts reads
// both forms and writes the current one whenever a shape is touched. Do NOT read these
// fields directly — go through rectOf/endsOf there, or the legacy rows render wrong.
export type Annotation = {
  t: 'arrow' | 'box' | 'ellipse' | 'text'
  c: string
  // Arrows (and legacy shapes of every kind).
  x1?: number
  y1?: number
  x2?: number
  y2?: number
  // Rect shapes.
  x?: number
  y?: number
  w?: number
  h?: number
  // Degrees, clockwise, about the box centre. Text only — a rotated arrow is just an arrow
  // with different endpoints, and a rotated box would need a rotated hit test for nothing.
  rot?: number
  text?: string
}

export type Step = {
  step_number: number
  heading: string
  body_text: string
  screenshot_url: string | null
  // Rendered identically by the editor and the reader from one component. Part of the
  // published payload, so it belongs on the contract type, not only on the DB row.
  annotations: Annotation[]
}

// One row in an article's "Common questions" tail (migration 0037). `q` is plain text; `a`
// is TipTap HTML from a deliberately restricted editor — paragraph, bold, italic, link,
// bullet list, and nothing else.
//
// `id` is minted ONCE, client-side, at row creation, and never changes. It is the reader's
// anchor target (`#q-{id}`), so deriving it from the question text would break every inbound
// link the first time someone rewords a question.
export type Faq = {
  id: string
  q: string
  a: string
}

export type Article = {
  title: string
  subtitle: string
  steps: Step[]
  // OPTIONAL on the contract, and that is the honest type rather than a convenience. Every
  // article published before 0037 has a published_content with no `faqs` key at all, and
  // those snapshots are frozen — nothing rewrites them. The `?` is what forces every read
  // site to say `?? []` instead of trusting an array that is genuinely not there.
  faqs?: Faq[]
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
  // The DRAFT "Common questions" (migration 0037). `not null default '[]'` in the database,
  // so unlike Article['faqs'] this one is always present. The reader never sees this column
  // — it sees the copy frozen into published_content.
  faqs: Faq[]
  // Questions Stage 1 asked that never got answered — over the run's cap, or skipped
  // (migration 0042). Same validated shape as jobs.clarifications; the editor renders them
  // as one-tap cards and clears the column. Null once there is nothing left to ask.
  open_clarifications: Clarification[] | null
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

// How the reader's masthead band is filled (migration 0024). All four derive from the one
// stored brand colour except `image`, which puts a customer photo behind a brand scrim.
// `solid` is the default: a flat fill of the brand cannot go grey, where a paper-mixed tint
// does exactly that for a desaturated brand.
export type HeaderStyle = 'solid' | 'ink' | 'tint' | 'image'

export type KnowledgeBase = {
  id: string
  owner_id: string
  name: string
  // Customizable reader home-page copy (build: home page / theming). `about` is the hero
  // description; headline + search_placeholder fall back to built-ins when empty.
  about: string
  headline: string
  search_placeholder: string
  // Model-facing product grounding, folded into one column (migration 0044) and reused as
  // the default for every run in this KB. NOT `about` above — that is reader-facing prose
  // the public site renders.
  //
  // The whole tier is here, audit fields included, because it is written as one object by
  // one RPC. The resolved display NAME is not part of it — that comes back from
  // set_product_context() and is carried on the client-side row only, so it is undefined
  // on a KB read straight from the table.
  product_context: ProductContext
  product_context_updated_by_name?: string | null
  subdomain: string | null
  custom_domain: string | null
  is_published: boolean
  // Theming (build spec §1). Primary colour is the ONLY colour stored — everything else
  // derives from it at render.
  primary_color: string
  // How strongly that colour washes into secondary surfaces, 0-30 percent (0045). A
  // STRENGTH, not a second colour: storing another hex would let the two drift apart and
  // break the one-stored-colour premise above.
  brand_wash: number
  font_pairing: FontPairing
  logo_path: string | null
  favicon_path: string | null
  // Masthead band treatment (migration 0024). Theming, not an entitlement: it describes the
  // help center, so it travels with the KB through claim_kb() and is deliberately not in
  // that function's reset list. `header_image_path` is a public `branding` object, keyed
  // {kb_id}/… like the logo, and is only read when header_style === 'image'.
  header_style: HeaderStyle
  header_image_path: string | null
  // One optional label + URL rendered opposite the masthead (migration 0026). The URL is
  // customer-supplied and renders on a page we host, so the scheme is constrained in the
  // database as well as in the form.
  header_link_label: string | null
  header_link_url: string | null
  domain_status: DomainStatus
  domain_last_checked_at: string | null
  domain_error: string | null
  // Failed verification checks so far. Persisted (not in worker memory) so the backoff and
  // the give-up ceiling survive a deploy — see migration 0012.
  domain_attempts: number
  reader_views: number
  // Trial lifecycle (pricing-spec §7, migration 0022). trial_started_at is stamped once, by
  // trigger, on the FIRST article created in this KB. offline_at is the READER GATE — the
  // reader RPCs return nothing while it is set, and article `visibility` is never mutated
  // for a lifecycle reason, so restoring is the same single write in reverse.
  trial_started_at: string | null
  offline_at: string | null
  purge_at: string | null
  // Nudge markers, written by the worker's sweep. Present on the row (so `select('*')`
  // returns them) and read by nothing in the SPA — the app derives its countdown from the
  // dates above, never from whether an email went out.
  trial_day14_email_sent_at: string | null
  trial_day7_email_sent_at: string | null
  trial_offline_email_sent_at: string | null
  trial_purged_email_sent_at: string | null
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
  brand_wash: number
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
  header_style: HeaderStyle
  header_image_path: string | null
  header_link_label: string | null
  header_link_url: string | null
  // Migration 0025: an offline help center now RESOLVES and says so, instead of being
  // filtered out and rendering as "doesn't exist" — that told a customer's own readers
  // their site was gone. Everything above except id/name/watermark is blanked server-side
  // while offline, and the other three reader RPCs still return nothing at all.
  offline: boolean
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
  // When the 1fps dense frame pass STOPPED, success or failure (migration 0030). Null means
  // more frames are still coming — including on a job whose status is already 'done', which
  // is the normal case: the pass runs past the finish line so the article ships first. The
  // frame picker must read this and never `status`, or a healthy run reads as a failed one
  // for as long as the pass takes.
  frames_ready_at: string | null
  // The failed job this one re-attempts, if any. Each attempt is its own ledger row.
  retry_of: string | null
  // Stage 1's clarification questions, ALREADY VALIDATED by the worker (migration 0042).
  // Never raw model output: every one passed clarify.py's closed enum and length caps
  // before it was written. The UI renders our copy templates around the slots — see
  // lib/clarifications.ts, which holds every word a user reads.
  clarifications: Clarification[] | null
  // True while the pipeline is holding the WRITE stage for an answer. Screenshots carry on
  // regardless. Its sibling columns awaiting_input_at / clarifications_closed_at are the
  // drop-off measure (PRD §10) and are deliberately not granted to clients.
  awaiting_input: boolean
}

// The context form, in two tiers (slice 3b). Split by WHO IT DESCRIBES, not by how often
// it changes: the product tier is the thing being documented and lives on the KB
// (migration 0027), reused by every run; the recording tier describes one video.
//
// ProductContext is NOT knowledge_bases.about. `about` is reader-facing prose the public
// help center renders; this is model-facing grounding nobody ever sees. Prefilling `about`
// from `description` on a first save is a UI convenience, not the same field.
export type ProductNote = {
  // Minted once, client-side, at row creation and never changed — the same rule as Faq.id.
  // The RPC mints one for any note that arrives without it rather than rejecting the write.
  id: string
  title: string
  body: string
}

export type ProductContext = {
  name: string
  description: string
  // Repeatable {title, body} blocks — a glossary entry, a feature list, a roles breakdown.
  // Same purpose as `description`, chunked so unrelated facts are not forced into one
  // paragraph. Shares one character budget with it (CONTEXT_CHAR_BUDGET).
  notes: ProductNote[]
  // Stamped inside set_product_context(). Absent until the first save.
  updated_at?: string | null
  updated_by?: string | null
}

// Audience and tone are gone (0044); PRD §4 cut them as a v1 leftover that moves voice
// rather than accuracy. A KB read straight from the table can carry `{}` — the column's
// default — so read it through productContextOf() in lib/kbs.ts, never directly.

// What goes into jobs.context, and therefore what a retry re-grounds on. Stored per job
// rather than re-read from the KB, so a retry reproduces the ORIGINAL run rather than
// whatever the product context happens to say later (CLAUDE.md §10g).
export type VideoContext = {
  product: ProductContext
  recording: string
}
