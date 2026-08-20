# UI-STATE-INVENTORY

Facts as of the current tree. Surfaces A–E only; styling omitted. ⚠️ DRIFT = contradicts
`ux-spec-v2.md` (named, not resolved). I can't know which branches you've personally seen; those
needing unusual state to reach are marked **[rare]**.

## A. Article list / KB dashboard

**1. Routes / files** — `/app/:kbId` (and `/`, which redirects once the KB resolves) →
`screens/KnowledgeBase.tsx`, rendered by `App.tsx` at `phase === 'kb'`. Sub-parts:
`components/KbSwitcher.tsx`, `UpgradeModal.tsx`, `RestoreScreen.tsx`, `AdminBanner.tsx`.

**2. Render branches**
| State | Condition | Ref |
|---|---|---|
| Blank (auth/KB/plan/runs in flight) | `phase === 'loading'`; separately `loading` for rows — no spinner, no skeleton | App:389, KB:86 |
| Permission-denied / not found (one merged copy) | `routeKbId && !found` → `phase='noaccess'` | App:157,392 |
| Empty library / search-empty / empty folder | `!loading && articles.length===0`; `q && matches.length===0`; `rows.length===0 && !q` | KB:187,503,485 |
| Error strip | `error` — set only by a failed `writeFromScratch` | App:513 |
| Trial pill: neutral → amber | `stage==='neutral'` ("N guides · N days left") → `'warning'` (≤14d) | trial:69,72 |
| Trial banner, persistent | `stage==='urgent' && !bannerHidden && !loading` (≤7 days) | KB:183 |
| Offline interstitial (replaces dashboard, once per visit) | `stage==='offline'` (`kb.offline_at`) `&& !restoreSeen` | App:495 |
| Over-quota modal | `showUpgrade` (dropzone cap, or pill click) | App:545 |
| Just-claimed welcome line | `justClaimed` localStorage flag **[rare]** | KB:280 |
| Admin-in-someone-else's-KB banner (never dismissible) | `kb.owner_id !== userId` | App:384 |
| Runs-only pill | `stage==='none'` + a lifetime cap **[rare: paid plans have no cap → pill null]** | trial:68 |

**3. User actions**
| Action | Writes | Optimistic | In flight | On failure |
|---|---|---|---|---|
| New folder | `folders` insert (name "New folder", pos max+1) | no | none | silent no-op |
| Rename folder / Move article | `folders.name` / `articles.folder_id` | yes | none | silent |
| Delete folder | `folders` delete; articles → Unfiled by FK | yes (card + local `folder_id=null`) | none | silent |
| Delete article | `articles` delete + best-effort Storage frame/video cleanup | no | "Deleting…" | row stays, no message |
| Write it myself | `articles` insert + `steps` insert (1 blank) | no | none | strip: "Could not create the article." |
| Switch KB | `profiles.last_kb_id` + navigate | no | `phase='loading'` | — |
| New article (video) · Search · Sign out | nothing / client-side filter / clears pending IndexedDB + `auth.signOut` | — | — | — |

**4. Data** — `articles.*` where `kb_id` order `created_at desc`; `folders.*` where `kb_id` order
`position`; `jobs` count where `user_id` + `counted_against_quota`; `knowledge_bases.{id, owner_id,
name, primary_color, logo_path, subdomain, trial_started_at, offline_at}`; `profiles.plan`.
*Fetched, unused here:* `articles.{slug, source, source_video_path, published_content, published_at}`,
`folders.{position, created_at, updated_at}`, `kb.{is_published, reader_views, purge_at, about,
headline, search_placeholder, font_pairing, favicon_path, custom_domain, domain_*, trial_*_email_sent_at}`.

**5. Hardcoded** — `timeAgo` thresholds 60s/60m/24h/30d (KB:57); status-pill labels
Generating/Published/Link-only/Draft (:50); rail labels + 4 items (:317-339); empty-state copy (:405);
new-article menu copy and 🎥 ✏️ (:369-386); "Assign a folder to publish these" (:497); folder-delete
confirm (:472); search placeholder (:399); fallback initial `'Q'` (:185); welcome copy (:282); 11
inline SVGs (:516-595); all trial pill/banner strings (`trial.ts:66,78`). *Config:* `PLANS`,
`helpCenterUrl`, `READER_DOMAIN`, `DEFAULT_KB_NAME`.

**6. Default-open vs on-demand** — Default-open: left rail, search input, trial banner (auto at
`urgent`, dismiss is per-session only). On-demand: "New article ▾" menu (closes on mouse-leave), KB
switcher dropdown (its trigger only exists when `kbs.length > 1`; else a plain label), folder rename
input, both two-step delete confirms, upgrade modal.

⚠️ DRIFT §8 — "flat article list + drag-to-reorder… folders deferred until ~10+ articles": folders ship, are the reader's categories, and gate publishing. No article drag-reorder in the list.
⚠️ DRIFT §2 Screen 4 / §3 — no inline "Name your help center" field on first landing; rename lives only in Theming.
⚠️ DRIFT §2 Screen 4 / §5 — no dismissible "Make it yours" theming pull; Theming is a permanent rail link.

## B. Article editor (incl. frame picker)

**1. Routes / files** — `/app/:kbId/article/:articleId` → `App.tsx:483` → `editor/Editor.tsx`;
children `editor/StepCard.tsx`, `editor/FramePicker.tsx`; `lib/useAutosave.ts`.

**2. Render branches**
| State | Condition |
|---|---|
| Blank page | `loading \|\| !article` (Editor:548) |
| Loaded, images still resolving | `shotUrls[id]` undefined → "+ Add image" until signed URLs land |
| Step with image / text-only | `screenshotUrl` non-null / null (the null case is also where a `frames_partial` degrade lands) |
| "✓ edited" badge · delete confirm · merge hidden | `step.is_edited` · `confirmDelete` · `isFirst` |
| Save state | `idle/saving/saved/error` → ""/"Saving…"/"Saved"/"Save failed — retrying on next edit" |
| Op error (replaces save label) | `opError`: undo, add-step, publish, visibility, or delete failure |
| Slug editable / frozen | `visibility === 'draft'` / else "{slug} · locked" |
| Undo/redo disabled | `!canUndo` / `!canRedo` |
| Article fetch failure | **no branch** — `.single()` error unhandled, `article` stays null → permanent blank page **[rare / likely never seen: a deleted or non-owned articleId shows an empty screen with no message]** |
| Picker: loading / has frames / no frames / uploading | `loading` → "Loading frames…"; `frames.length>0` → full-video 1fps strip auto-scrolled to current; else "This article has no video. Upload an image…"; `busy` → upload disabled |

**3. User actions**
| Action | Writes | Optimistic | In flight | On failure |
|---|---|---|---|---|
| Edit title/subtitle; step heading/body | `articles.title/.subtitle`, `steps.heading/.body_text`, 700ms debounce | yes | "Saving…" | error label; edit not rolled back |
| Reorder (handle or rail) | `steps.step_number` on every row | yes, live renumber | "Saving…" | same |
| Merge up | `steps.body_text` update + `steps` delete + renumber | yes | "Saving…" | same |
| Split at cursor | `steps` insert (awaited) + body update | insert awaited, then local | "Saving…" | silent return |
| Add a step | `steps` insert | no | none | `opError` "Could not add a step." |
| Pick frame / upload / remove image | `steps.screenshot_url` (path or null) + `is_edited=true` | yes | upload button disabled | silent on pick/upload; error label on remove |
| Undo / redo (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y) | deletes **all** `steps` rows and reinserts from snapshot + `articles.title/.subtitle` | no | none | `opError` "Could not undo." |
| Edit slug | `articles.slug` (slugified live, deduped on blur) | yes | none | silent |
| Delete article | `articles` delete + Storage cleanup | no | "Deleting…" | `opError` "Could not delete the article." |

**4. Data** — `articles.*` by id (uses `title, subtitle, visibility, slug, folder_id, source,
source_video_path, published_at, updated_at`); `steps.*` by `article_id` order `step_number`;
`folders.*` by `kb_id`; Storage `frames` signed URLs (1h) and `list()` of `{kb_id}/{articleId}/dense`.
*Read, unused:* `steps.timestamp_seconds` (carried through snapshots only — the ±3s window it exists
for is not implemented), `articles.{published_content (written, never read here), status, created_at}`,
`folders.position`.

**5. Hardcoded** — autosave debounce 700ms (useAutosave:9); undo-checkpoint debounce 500ms
(Editor:160); save-state strings (Editor:540); placeholders "Article title", "A one-line summary",
"What's the first thing they do?", "Describe the action in one line."; glyphs ⠿ ↶ ↷ 🗑 "⤒ Merge up"
"⤢ Split" "⟳ Wrong frame?" "⟳ Change image" "+ Add image" "+ Add a step"; picker titles + "Upload
image instead"/"Remove image" (FramePicker:81-90); WebP quality 0.85 (:148); signed-URL TTL 3600s and
dense `list()` limit 1000 (storage:42,75). `FILMSTRIP_WINDOW_SECONDS = 3` (config.ts:134) is
**imported by nothing**.

**6. Default-open vs on-demand** — Default-open: step rail, and the Merge/Split cluster (always in
the DOM, hover-only by CSS). On-demand: the frame picker (click "⟳ Wrong frame?" / "+ Add image";
toggles, one per step, never auto-opens), delete confirm, publish modal.

⚠️ DRIFT §4 — frame-picker tiers: spec has Tier 1 (±3s strip, drag selector), Tier 2 (`<video>` scrub, frame-step, canvas capture), Tier 3 (upload). Shipped: one full-video 1fps browser + upload — no ±3s window, no scrubber, no drag selector. (§9's corrected note acknowledges the collapse; §4's tier text is unchanged.)
⚠️ DRIFT §4 — control cluster is specced as split / merge-up / **duplicate / delete**; only split and merge-up exist.
⚠️ DRIFT §4 — "drag to reorder… on the canvas cards": cards are drop targets, but only the ⠿ handle and rail items are `draggable`.

## C. Publish + visibility controls

**1. Routes / files** — inside the editor route. `editor/ShareControls.tsx` (header cluster),
`editor/PublishModal.tsx` (first-publish gate); logic in `Editor.tsx:407 doPublish`.

**2. Render branches**
| State | Condition |
|---|---|
| Draft cluster | `visibility==='draft'` → "sub.quink.online/slug · inactive", Copy link **disabled**, "Publish" |
| Published cluster | else → Listed/Unlisted toggle + Copy link + View |
| "Publish changes" | `dirty` = `!published_at \|\| max(article.updated_at, steps.updated_at) > published_at` |
| Publishing | `publishing` → "Publishing…" |
| Copy toast (6s) | after `copyLink()`; wording varies by `visibility`, appends the 30-day line when `plan==='free'` |
| Modal pre-publish / blocked | `showPublish && !pubDone`; `!selectedFolderId` → button disabled + "Pick a category above to publish." |
| Modal video-deletion note · inline new-category · success | `hasSourceVideo` (`source_video_path` non-null) · `newMode` · `pubDone` → "You're live!" |
| Publish failure | `opError` "Could not publish." in the editor header; modal stays on its pre-publish face |
| Subdomain missing | `subdomain === null` → literal `…` in the URL **[rare: trigger-provisioned]** |

**3. User actions**
| Action | Writes | Optimistic | In flight | On failure |
|---|---|---|---|---|
| Publish (first) | `articles.{published_content, published_at, visibility='listed', slug, folder_id}`, then Storage video delete + `source_video_path=null` | no | "Publishing…"; Esc + overlay-click disabled | `opError`, modal stays open |
| Publish changes | same minus `folder_id` | no | "Publishing…" | `opError` |
| Listed ⇄ Unlisted | `articles.visibility` only (no re-snapshot) | **yes** | none | `opError` "Could not change visibility."; toggle **not** reverted |
| Copy link / View | none; clipboard write, or opens the reader URL in a new tab | — | — | unhandled clipboard rejection |
| + New category (modal) | `folders` insert then `folders.name` update | no | "Add" → "…" | silent |

There is **no unpublish control** — `visibility` can never be returned to `draft` from the UI.

**4. Data** — `articles.{visibility, slug, folder_id, published_at, updated_at, source_video_path,
title, subtitle}`, `steps.updated_at`, `folders.{id,name}`, `kb.subdomain`, `plan` (free-expiry line only).

**5. Hardcoded** — all modal copy ("Publish this article?", lede, "Choose a category for this
article", "Publishing to", "Filed under X", "You're live!", "Not yet — keep editing", "Back to
editor"), both toast access sentences, "· inactive", "· locked", toast timeout 6000ms, two inline
SVGs. *Already config:* `READER_DOMAIN`, `helpCenterUrl`, `FREE_ARTICLE_EXPIRY_DAYS`.

**6. Default-open vs on-demand** — Share cluster and (once published) the visibility toggle are
default-visible in the editor header, not behind a menu. Publish modal is on-demand; Esc closes
except while `publishing`. Inline category-create is on-demand.

## D. Public reader site (home, folder, article)

**1. Routes / files** — `reader/ReaderSite.tsx`. On a help-center host (`readerKeyFromHost`):
`/`, `/category/:folderId`, `/:articleSlug`. On the app host: `/kb/:kbSlug[/category/:folderId |
/:articleSlug]`. Data `reader/readerData.ts` (RPCs `reader_kb`, `reader_articles`, `reader_article`,
`reader_search`); theming `reader/theme.ts`.

**2. Render branches**
| State | Condition |
|---|---|
| Loading | `state==='loading'` → blank `.page` |
| Not found / unpublished / **offline** | `state==='notfound' \|\| !kb` — `reader_kb` returns nothing for an unknown host **or when `kb.offline_at` is set**. One screen: "This help center or article doesn't exist, or isn't published." |
| Home empty | `categories.length === 0` → "No published articles yet." **[rare: zero listed articles]** |
| Home populated / Category / Article | category cards; `folderId` matched; `articleSlug` resolved |
| Category or article not found (draft, bad slug) | `view==='category' && !category && state==='ready'`, or the article RPC returns none → same not-found card |
| Search dropdown, hits / no hits | `query.trim()` and `searchResults.length>0` (max 7) / else "No articles match "q"" |
| Watermark footer · TOC rail · related | `kb.watermark` (owner plan, or forced by `is_demo`) · `steps.length > 1` · same category, ≥1 sibling, max 3 |
| Feedback asked / thanked | local `feedback` state; resets on `activeSlug` change |
| Canonical redirect | `hostKey != null && domain_status==='live' && custom_domain !== location.host` → `location.replace` **[rare]** |

**3. User actions** — Search: writes nothing, 150ms debounce → `reader_search`. Navigation
(cards, rows, breadcrumb, TOC): writes nothing, client-side. **"Was this article helpful?" writes
nothing at all** — local `useState`, no table, no RPC, no analytics.

**4. Data** — `reader_kb` → `id, name, about, headline, search_placeholder, primary_color,
font_pairing, logo_path, favicon_path, subdomain, custom_domain, domain_status, noindex, watermark`;
`reader_articles` → `id, slug, title, subtitle, published_at, folder_id, folder_name, folder_position`;
`reader_article` → `id, slug, visibility, published_at, content, folder_name`; `reader_search` →
`id, slug, title, snippet, rank`. *Returned, unused:* `SearchHit.snippet`, `SearchHit.rank`,
`summary.published_at` on list rows, `ReaderArticle.visibility`, `summary.folder_position` (order is
taken from RPC row order instead).

**5. Hardcoded** — `DEFAULT_HEADLINE = 'How can we help?'` / `DEFAULT_PLACEHOLDER = 'Search for
articles…'` (:30); `UNFILED_CATEGORY = 'Help articles'` (readerData:6); read-time 200 wpm (:73);
`updatedLabel` thresholds; related cap 3; results cap 7; search debounce 150ms; scroll-spy rootMargin
-12%/-70%; "Was this article helpful?", "Thanks for your feedback!", "Powered by", "Help Center"
crumb, not-found copy; the brand-ramp mix ladder (theme.ts:29-39); fallback initial `'Q'`.

**6. Default-open vs on-demand** — Default-open: the search band on every view (hero-sized on home),
the on-this-page rail when >1 step, related articles. On-demand: search dropdown (typing; dismissed
by outside click or route change). No drawers, collapsibles, or consent layer.

⚠️ DRIFT §8 — "static-rendered article pages behind a CDN so reads survive backend hiccups": the reader is a client-side SPA fetching every page from Supabase RPCs at runtime.

## E. Theming screen

**1. Routes / files** — not a route: `phase === 'theme'` in `App.tsx:558`, entered from the dashboard
rail. `screens/ThemeSettings.tsx`; the preview renders the real `ReaderChrome` from `reader/ReaderSite.tsx`.

**2. Render branches**
| State | Condition |
|---|---|
| Preview on sample data | initial, and stays if `fetchReaderArticles` returns 0 rows → `SAMPLE_CATEGORIES` ("Getting started" × 2 fake articles) |
| Preview on real data | `rows.length > 0` |
| Invalid hex | `!isValidHex(hexInput)` → flagged input + "Not a valid hex colour — the preview keeps the last good one."; preview holds the last valid colour |
| Logo uploading / present | `uploading` → "Uploading…"; `logoPath` → "Replace logo" + "Remove" |
| Saving / saved | `saving` → "Saving…", disabled; `saved` → "Saved" chip, cleared by any field change |
| Save failure | **no branch** — guarded by `if (!error)`; a failed save renders nothing |
| Address line: custom domain / subdomain | `kb.custom_domain && domain_status==='live'` **[rare]** / else |
| Watermark in preview · loading state | `limitsFor(plan).watermark` · **no loading branch** — preview renders immediately with samples |

**3. User actions**
| Action | Writes | Optimistic | In flight | On failure |
|---|---|---|---|---|
| Any text field / preset / hex / font | **nothing until Save**; local state, preview repaints per keystroke | n/a | n/a | n/a |
| Upload logo | Storage `branding/{kb_id}/logo-*` + derived 64×64 PNG favicon immediately (row not yet updated) | preview updates | "Uploading…" | silent, nothing rendered |
| Remove logo / View live site ↗ | local only (`logoPath`/`faviconPath` → null) until Save / nothing | yes | none | n/a |
| Save theme | `knowledge_bases.{name, about, headline, search_placeholder, primary_color, font_pairing, logo_path, favicon_path}`, re-selects the row (subdomain may have moved), then deletes superseded branding objects | no | "Saving…" | nothing shown; superseded objects left in place |

**4. Data** — `knowledge_bases.{id, name, about, headline, search_placeholder, primary_color,
font_pairing, logo_path, favicon_path, subdomain, custom_domain, domain_status}`;
`reader_articles(kb.id)` for the preview; `PLANS[plan].{watermark, noindex}`.
*Available, unused here:* `kb.{is_published, reader_views, domain_error, domain_attempts}`, and the
`theme` jsonb column CLAUDE.md §7 reserves — nothing reads or writes it.

**5. Hardcoded** — `SAMPLE_CATEGORIES` fake articles and their copy (:37); favicon canvas 64×64 PNG
(:50-67); section headings Branding/Content/Typography, every field label, the hint "The favicon is
made from your logo automatically."; "Customize your help center", "Every change appears instantly in
the preview.", the preview caption; the address-explanation sentence (:309); accepted logo MIME list
(:234); the preview is pinned to `view="home"` (:393). *Already config:* `COLOR_PRESETS` (8),
`FONT_PAIRINGS` (3), `DEFAULT_PRIMARY_COLOR`, `READER_DOMAIN`.

**6. Default-open vs on-demand** — everything is default-open: one scrolling control column beside a
permanently visible live preview. No sections, accordions, tabs, or drawers. On-demand only: the
native `<input type="color">` popover and the logo file dialog.

⚠️ DRIFT §5 — "one font pairing from a curated dropdown of ~6 safe pairings": 3 pairings, rendered as buttons.
⚠️ DRIFT §5 — favicon is listed as its own control; it is derived from the logo, with no independent control or preview.
⚠️ DRIFT §5 — "Never in the activation path. Surfaces contextually… at preview/publish, or as a quiet dismissible dashboard nudge": theming is reachable only as a permanent rail link — no contextual surfacing at publish, no nudge.

## F. Upload + generation

Added after A–E. ⚠️ DRIFT here = contradicts `ux-spec-v2.md` **or** `mvp-dev-plan.md` (named, not
resolved).

**Two entry points, ONE implementation.** Post-signup first run and "New article → Upload a
recording" from inside a KB render the *same* `screens/Upload.tsx` at the same
`phase === 'upload'`. They diverge at exactly one branch — `App.tsx:284 if (session && kb)` —
which skips the account wall and the IndexedDB hand-off for an already-authenticated user and
goes straight to `'working'`. Everything after that (upload → `POST /api/generate` → poll →
failure screens) is one code path. There is no second dropzone, no second poller, no second
failure screen.

**1. Routes / files** — **not routes.** Deliberately (`main.tsx:24-26`): the wizard is
`phase ∈ {upload, login, wall, working, generating, failed}` inside `App.tsx`. The URL is `/`
for a signed-out first run and `/app/:kbId` for every subsequent one, and it does not change
across the wizard. Files: `screens/Upload.tsx`, `screens/AccountWall.tsx`,
`screens/Generating.tsx`, `components/FailureScreen.tsx`, `components/UpgradeModal.tsx`;
orchestration + Storage upload + `startJob` in `App.tsx:138-299`; `lib/pending.ts` (IndexedDB),
`lib/failures.ts`, `lib/config.ts`. Backend: `worker/main.py` (`_start_run`, `/api/generate`,
`/api/retry`), `worker/pipeline.py`, `frames.py`, `gemini.py`, `retention.py`.

**2. Render branches**
| State | Condition | Ref |
|---|---|---|
| Dropzone, empty | `phase==='upload'`, `!file` | App:416, Upload:171 |
| Dropzone, drag-over | `over` | Upload:133,136 |
| File accepted (pill + "Replace") | `file` | Upload:146 |
| Validation strip: wrong type / >100MB | `validateVideo` returns a string | Upload:30,35,186 |
| Over-quota modal, fired AT FILE SELECTION | `runsLeft !== null && runsLeft <= 0` → `onCapped()` | Upload:66, App:423,427 |
| Submit disabled | `!file \|\| !productName.trim()` | Upload:253 |
| Account wall | `phase==='wall' && file` | App:439 |
| Wall — link sent | `sent` | AccountWall:61 |
| Wall — disposable address refused | `isDisposableEmail(address)` **[rare]** | AccountWall:45 |
| Wall — auth error line | `error` | AccountWall:141 |
| Uploading ("Uploading your recording…") | `phase==='working'` — no percentage, no bar | App:442 |
| Generating, no job row yet | `job === null` → `activeIndex = 0` | Generating:70 |
| Generating, stage 1–4 | `job.stage` ∈ analyzing/detecting/capturing/writing | Generating:70,112 |
| Failure, job-backed | `job.status==='error'` → `FailureScreen` | Generating:72 |
| Failure, pre-job (spend cap, dead upload) | `phase==='failed'`, `jobId===null` **[rare]** | App:266,468 |
| Failure — retry offered | `failure.recovery==='retry' && jobId && !purged` | FailureScreen:44 |
| Failure — recording purged (retry withdrawn) | `video_purged_at`, or `/api/retry` 409 mid-click **[rare: 7+ days after a failure]** | FailureScreen:38,66 |
| Failure — retry itself failed | `retryFailed` | FailureScreen:112 |
| Failure — unknown/absent code | `failureFor()` falls back to `internal_error` | failures.ts:93 |
| Failure — support line degrades | `mailto` when `SUPPORT_EMAIL` set, else "Quote reference {id}" **[rare: the constant is set]** | FailureScreen:85,128 |
| Poll died mid-run | **no branch** — a thrown `supabase` call rejects `poll()` and nothing reschedules; the spinner runs forever with no failure screen **[rare / likely never seen]** | Generating:45-61 |
| Degraded success (`stage2_failed` / `frames_partial`) | **no branch** — `degraded` is selected and rendered nowhere | Generating:24 vs 84-131 |
| Job still running on return to the app | **no branch** — nothing looks for one | — |

**3. User actions**
| Action | Writes | Optimistic | In flight | On failure |
|---|---|---|---|---|
| Pick / drop a file | nothing | n/a | none | inline strip; `file` cleared to null |
| "Build my article", signed OUT | IndexedDB `quink/pending/upload` (File + context) | n/a | none — jumps straight to the wall | `savePending` rejection is unhandled (App:297) |
| "Build my article", signed IN | Storage `videos/{kb_id}/{uuid}.{mp4 or mov}`, then `POST /api/generate` → `jobs` insert | no | `phase='working'`, no progress | `handleStartFailure`: `quota_exceeded`→modal+`'kb'`, anything else→failure screen |
| Continue with Google / Email me a link | nothing (OAuth redirect / OTP) | n/a | `busy` disables both | error line under the form |
| Post-auth resume | same upload + job insert, then `clearPending()` | no | `'working'` | same as above |
| Poll the job | nothing | — | — | **silently stops** (see branch table) |
| "Try again" | `POST /api/retry` → a NEW `jobs` row (`retry_of`) | no | "Starting…" | inline `retryFailed` line |
| "Upload a recording" / "Upload a different recording" | clears `jobId`, `failureCode`, `error` | n/a | none | — |
| "Write an article by hand" (from the modal) | `articles` insert + one blank `steps` insert | no | none | "Could not create the article." on the KB screen |
| Close the tab mid-run | nothing client-side; the worker finishes anyway | — | — | the job is unrecoverable in the UI |

**4. Data** — reads `jobs.{id, kb_id, article_id, stage, status, failure_code, degraded,
video_purged_at}` (`JOB_COLUMNS`, Generating:24, `.maybeSingle()`); `profiles.plan` and
`count(jobs where counted_against_quota)` for `runsLeft` (App:143-148, plans.ts:58-71); the KB
row for `kb.id` (the upload path prefix). Writes one Storage object and one `jobs` row per attempt.
*Fetched, unused here:* `jobs.article_id` — the poll has the new article's id and discards it
(`onGenerated` goes to the list, App:270-276); `jobs.degraded` — selected, never rendered;
`jobs.kb_id` — selected, never read. *Available, never asked for:* `over_cap`, `retry_of`,
`created_at`, `finished_at`, `counted_against_quota` are all in the 0020 grant and unused.
`FILMSTRIP_WINDOW_SECONDS` (config.ts:125) is still imported by nothing.

**5. Hardcoded** — `POLL_MS = 2000` and `JOB_COLUMNS` (Generating:20,24); `mb()` to one decimal
(Upload:21, App:56); "That file type isn't supported. Upload an MP4 or MOV." (Upload:30) and the
oversize sentence (Upload:35); h1 "Turn a recording / into a guide." (:120), lede (:125), "Drop
your recording here" (:173), "MP4 or MOV, up to {N}" (:174), "Replace" (:169), every field label +
hint + placeholder (:198-247), 🔒 (:259), the seam glyph block (:106-118) and ~8 inline
`marginBottom`s; wall 🔓 / ✉️ (:66,83), "Check your email" + "Open it and your guide starts
building." (:68-72), "Please use a permanent email address." (:46), "or" (:121),
"you@company.com" (:127), "Continue with Google" (:118), the 4-path Google SVG (:100-117);
"Building your guide" (Generating:87) and the ✓ / • stage marks (:119); **"Uploading your
recording…" + "Hang tight — you can't lose this." as literals (App:446-449) — the second is a
verbatim duplicate of `COPY.generatingReassurance`**; the `.mov`/`.mp4` extension pick and the
`{kbId}/{uuid}` path (App:204-205), the `'video/mp4'` content-type fallback (:208), "Could not
start the job ({status})." (:249); "Try again"/"Starting…" (FailureScreen:102), both
upload-again labels (:108), "Could not start that again just yet." (:70,75),
`jobId.slice(0, 8)` (:84), the mailto subject "Generation issue [job {id}]" (:87), the "Still
stuck?" sentences (:132-138); all of `UpgradeModal` (:31-56); all ten heading/body pairs in
`failures.ts` (:32-88). *Worker-side literals:* the `spend_cap` and `quota_exceeded` messages
inline in `main.py:222-225,239-242`. *Already config:* `MAX_VIDEO_BYTES`,
`ACCEPTED_VIDEO_TYPES/EXTENSIONS`, `MAX_VIDEO_MINUTES`, `AUDIENCE_OPTIONS`, `TONE_OPTIONS`,
`DEFAULT_AUDIENCE/TONE`, the whole `COPY` block, `PIPELINE_STAGES`, `WORKER_URL`,
`SUPPORT_EMAIL`, `STORAGE_BUCKET_VIDEOS`, `PLANS`; worker `DAILY_SPEND_CAP_USD`,
`EST_COST_USD_PER_VIDEO_MINUTE`, `MAX_INLINE_BYTES`, `MAX_VIDEO_MINUTES`, `JOB_TIMEOUT_MIN`,
`JOB_TIMEOUT_GRACE_MIN`, `DENSE_FRAME_FPS`, `WEBP_QUALITY`, `JSON_RETRY_ATTEMPTS`,
`UPLOAD_RETRY_ATTEMPTS`, `GEMINI_TRANSPORT_RETRY_ATTEMPTS`, `FAILED_VIDEO_RETENTION_DAYS`.

**6. Default-open vs on-demand** — Everything on this surface is default-open. The dropzone, all
four context fields, the free-limit disclosure and the video-deletion note render simultaneously
in one card (Upload:131-262); optional fields carry an "Optional" span rather than being hidden.
The account wall shows Google *and* the email form at once — the fallback is not behind a "more
options". The generating screen shows all four stage labels from the first frame, past and future
included. On-demand: only the native file dialog, the upgrade modal, and the failure screen's
`mailto`. No accordion, no drawer, no progressive reveal anywhere in the flow.

⚠️ DRIFT ux-spec §1 / mvp-dev-plan §6 — **the duration cap disagrees with itself.** `MAX_VIDEO_MINUTES` is `6` in `web/src/lib/config.ts:109` and `20` in `worker/config.py:200`, and each file's comment claims the other mirrors it. The `video_too_long` screen (failures.ts:40) therefore quotes "up to 6 minutes" for a limit the worker enforces at 20.
⚠️ DRIFT ux-spec §1 Screen 1 — disclosure copy. Spec: *"3 free guides from video · articles kept 30 days."* Shipped (config.ts:159): *"3 free video guides from video · articles kept 30 days. Writing by hand is unlimited."* — "video guides from video" duplicates the word.
⚠️ DRIFT — `Home.tsx:75` calls `.replace(', then top up.', ', no card needed')` on a string that no longer contains that substring. A dead no-op; the landing page renders the raw disclosure.
⚠️ DRIFT mvp-dev-plan §6 — "`model_unavailable` … Auto-retry **once**, then button". Shipped: `GEMINI_TRANSPORT_RETRY_ATTEMPTS = 3` transport attempts (config.py:235, gemini.py:68) *plus* `JSON_RETRY_ATTEMPTS = 2` parse attempts. Three, not one.
⚠️ DRIFT mvp-dev-plan §7 — the entire Telegram alert set (`quota_exceeded`, 2-of-3 runs, every `model_*`/`timeout`/`frame_extraction_failed`, `spend_cap`, over-cap) **is not implemented.** Nothing in the worker sends an operator alert; `mailer.py` is Resend and customer-facing only.
⚠️ DRIFT mvp-dev-plan §9 — the admin **Runs** tab ("recent jobs: status, failure_code, duration, est cost, user — Open job, re-run") does not exist (`Admin.tsx:6` says the four tabs are deliberately unbuilt). Only two places in the SPA read `jobs` at all: the poll and the quota count. There is no operator view of a run.
⚠️ DRIFT ux-spec §2 Screen 4 — "land *inside their help center with article #1 already in it*". Shipped: `onGenerated` sets `phase='kb'` (App:275) and drops `job.article_id`, which the poll already holds. The user lands on the article list, not in the article.
⚠️ DRIFT CLAUDE.md §10g — a degraded run "SHIPS an editable article" and is recorded on `jobs.degraded` so the rate is one query. The SPA selects the column (Generating:24) and renders nothing: a `frames_partial` article opens with no indication anything was missing.
⚠️ DRIFT CLAUDE.md §10g / mvp-dev-plan §4 — "A job must be able to end." The *worker* side holds (deadline check + `sweep_timeouts`). The *client* side does not: one thrown fetch inside `poll()` (Generating:45) stops the loop with no reschedule and no error branch — the stuck spinner both documents exist to remove.

---

# Appendix F1 — pipeline, polling and image mechanics

Answers to the pre-redesign questions. Evidence is `file:line`; "not implemented" is stated where
that is the answer.

## Job + polling

**1. Full schema of `jobs`** — 21 live columns, assembled across five migrations.

| Column | Type / constraint | Added |
|---|---|---|
| `id` | uuid pk default `gen_random_uuid()` | 0001:85 |
| `kb_id` | uuid → `knowledge_bases(id)`; **nullable, `on delete set null`** since 0022 (was `not null` / cascade — a purge was returning the owner's whole run ledger) | 0001:86, 0022:45-49 |
| `article_id` | uuid → `articles(id)` **`on delete set null`** (was cascade; the anti-farming line) | 0001:87, 0014:79-81 |
| `stage` | text not null default `'analyzing'`, check ∈ (`analyzing`,`detecting`,`capturing`,`writing`) | 0001:89-90 |
| `status` | text not null default `'queued'`, check ∈ (`queued`,`running`,`done`,`error`) | 0001:91-92 |
| `created_at` / `updated_at` | timestamptz not null default `now()`; `updated_at` bumped by trigger `jobs_touch` | 0001:95-96, 0001:193 |
| `user_id` | uuid → `profiles(id)`, nullable, `on delete set null` | 0014:85, 0017:20-24 |
| `failure_code` | text — the entire contract with the SPA | 0014:86 |
| `failure_detail` | text — **revoked from anon/authenticated** | 0014:87, 0020:47-66 |
| `video_duration_seconds` | int | 0014:88 |
| `est_cost_usd` | numeric(10,4) — written mid-run so the breaker sees in-flight jobs | 0014:92 |
| `counted_against_quota` | boolean not null default false — set on success only | 0014:96 |
| `over_cap` | boolean not null default false | 0014:99 |
| `finished_at` | timestamptz | 0014:100 |
| `video_path` | text — recorded at job creation | 0019:16 |
| `video_purged_at` | timestamptz | 0019:19 |
| `degraded` | text, comma-separated (`stage2_failed`, `frames_partial`) | 0020:15 |
| `context` | jsonb — the user's context form, so a retry re-grounds identically | 0020:20 |
| `retry_of` | uuid → `jobs(id)` `on delete set null` | 0020:24 |

Dropped: `error text` (0001:93 → 0020:34) — must not come back.
Indexes: `jobs_kb_id_idx` (0001:99), `jobs_quota_idx` (0014:107), `jobs_created_idx` (0014:108),
`jobs_video_purge_idx` (0019:32), `jobs_inflight_idx` (0020:78).
Triggers: `jobs_touch` (0001:193), `jobs_enforce_quota` before update (0014:159).
RLS: `jobs_select_own` (0015:103). Client SELECT is a **column allowlist** (0020:49-66) — adding a
column to this table no longer exposes it.

**2. What the client polls, how often, which fields** — `Generating.tsx:38-68`, directly against
Supabase; the worker has no poll endpoint by design (main.py:7-9). Query:
`from('jobs').select(JOB_COLUMNS).eq('id', jobId).maybeSingle()`. `JOB_COLUMNS` (Generating:24) =
`id, kb_id, article_id, stage, status, failure_code, degraded, video_purged_at` — eight of the
fifteen granted columns; `failure_detail` is not among them and asking for it would 401 the whole
query. Interval: `POLL_MS = 2000` (:20), scheduled by `setTimeout(poll, POLL_MS)` **after** each
response lands (:61), so it is 2s *between responses*, not a fixed 2s tick. The loop exits on
`status === 'done'` (:54) and on `status === 'error'` (:58); it keeps asking while the row does
not exist yet.

**Mid-run state: yes, but it lives in `stage`, not `status`.** `status` really is only
queued / running / terminal. Granularity comes from `stage`, four values written at four
boundaries (`pipeline.py:132, 169, 197, 243` via `set_stage`), and that is what drives the UI
(`Generating:70`). Two caveats: the row is inserted with `stage='analyzing'` *and*
`status='queued'` (main.py:272-274), so a job that has not started yet already renders
"Analyzing your recording" as active; and `capturing` covers per-step frames **and** the entire
1fps dense-set pass (pipeline.py:205-240) — the longest stretch of the run sits under one label
with no sub-progress.

**3. Where the Stage 1 blueprint lives between Stage 1 and job completion** — split, and the
important half is **worker memory only**.

- `blueprint` is a local variable in `pipeline._run` (`pipeline.py:177-184`).
- The *title and subtitle* are persisted immediately: `_create_article` (`:193` → `:300-321`)
  inserts an `articles` row with `title`, `subtitle`, `status='generating'`,
  `source_video_path`, and `jobs.article_id` is stamped at `:194`. A polling client could read
  both today.
- The *steps* are not. `_write_steps` (`:271` → `:324-344`) is the only insert and it runs
  **after Stage 2**. Between Stage 1 and the end of the run there is no row, no jsonb, no cache —
  if the process dies there the step array is gone, and what survives is an `articles` row with a
  title, zero steps and `status='generating'` that nothing ever cleans up (it renders the
  "Generating" badge forever, `KnowledgeBase.tsx:77`).
- `articles.generated_snapshot` is written at `pipeline.py:281`, also after Stage 2, and it is a
  `Blueprint` dump — it carries `timestamp`, never `screenshot_url`.

**4. Is step count known to the backend before the job completes?** In memory, yes
(`len(blueprint.steps)`, `pipeline.py:185, 226, 228`). Persisted anywhere a client could read —
**not implemented.** No column on `jobs` holds it and the 0020 grant has none. The only
observable proxy is Storage: `{kb_id}/{article_id}/step-N.webp` objects appear during `capturing`
(`pipeline.py:215`), so a `list()` would give a lower bound. Nothing does that.

**5. Tab closed / navigated away mid-run** — **the job completes.** `pipeline.run` is a Starlette
background task (`main.py:309`) with no dependency on the caller; the article is created, the steps
are written and `counted_against_quota` is set regardless of who is watching.

**Client recovery: not implemented.** `jobId` is React state only (`App.tsx:77`) and is never
persisted. `loadPending()` (`App.tsx:172`) resurrects only a file that was *never uploaded* —
`clearPending()` fires at `App.tsx:185` the moment the job starts, so a started job leaves nothing
in IndexedDB. On return the post-auth effect falls through to `setPhase('kb')` (`App.tsx:176`) and
the user sees the article in the list carrying whatever `status` it had *at page load*; the
"Generating" badge (`KnowledgeBase.tsx:77`) never updates without a manual reload. There is no
query anywhere for an in-flight job — the only two `from('jobs')` call sites in the SPA are
`plans.ts:60` (quota count) and `Generating.tsx:46` (poll by known id).

**6. Worker concurrency** — **not configured anywhere, and it is not serial.**

- `/api/generate` is declared `def` (sync) at `main.py:296`, so Starlette runs it in the anyio
  worker thread pool; `background.add_task(pipeline.run, …)` (`:309`) passes a sync callable, so
  that runs in the same pool.
- The only ceiling is anyio's default thread limiter — 40 tokens, process-wide, never touched in
  this repo. No semaphore, no queue, no `max_concurrent_jobs`, no `--workers` flag (README.md:106
  starts a plain `uvicorn main:app --port 8000`, one process).
- So **2+ Gemini calls can run simultaneously**, and the code assumes they will: `_spend_today_usd`
  (`main.py:136-153`) sums today's `est_cost_usd` explicitly so in-flight runs count, with the
  comment "otherwise a burst of concurrent jobs all read the same stale total and sail past it
  together". The mitigation is partial — `est_cost_usd` is written at `pipeline.py:159`, *after*
  ffprobe, i.e. after the request was already admitted, so the read-then-act window is real if
  small.

**7. Where the quota check happens** — **twice, and neither is at upload.**

*Client, at file selection, before a byte moves* — `Upload.tsx:61-69`:

```
function accept(next: File | undefined) {
  if (!next) return
  if (runsLeft !== null && runsLeft <= 0) { onCapped(); return }
```

`runsLeft` is computed in `App.tsx:358-359` from `limitsFor(plan).lifetime_runs` minus
`runsUsed(userId)` (`plans.ts:58-65`, `count(*)` over the ledger). `onCapped` opens the modal
(`App.tsx:423`).

*Server, at job creation, before the insert and before the pipeline is scheduled* —
`_start_run` (`main.py:192-292`), called by `/api/generate` at `:308` **after**
`_require_owner(…)` at `:306`. Order inside: path-prefix pin (`:209`) → `_limits` (`:212`) →
global spend breaker (`:217`) → free hard wall (`:231-243`) → paid soft cap (`:249-261`) → `jobs`
insert (`:263`). The free wall:

```
if limits["lifetime_runs"] is not None:
    if _runs_used(uid) >= limits["lifetime_runs"]:
        raise HTTPException(status_code=402, detail={"code": failures.QUOTA_EXCEEDED, …})
```

**Not at upload.** `uploadVideo` (`App.tsx:200-211`) writes the object to Storage before
`startJob` is called at `:184`/`:288`, with no quota check of its own on either side.

## Frame picker remount

**8. Cause of the apparent reload/remount** — **there is no reload and no remount.** Traced end to
end, none of the five candidate mechanisms fires:

- *Router navigation:* none. `onPick` never navigates; `window.location.reload()` appears nowhere
  in the codebase.
- *Key change:* `StepCard`'s key is `${s.id}:${revs[s.id] ?? 0}` (`Editor.tsx:978`) and `revs` is
  bumped only by `mergeUp` (`:351`) and `split` (`:391`). `pickFrame` never calls `bumpRev`, so the
  TipTap editor is **not** remounted.
- *Refetch:* none — see Q9.
- *State reset:* none. `pickFrame` (`Editor.tsx:296-301`) calls `saveStep` →
  `setSteps(prev.map(…))` (`:286`), a targeted patch.

What actually happens on every pick, and what it looks like:

1. `setSteps` produces a new array **and** a new object for that step (`Editor.tsx:286`), so every
   `StepCard` in the article re-renders.
2. The scroll-spy effect keys on `[mode, steps]` (`Editor.tsx:738`), so the `IntersectionObserver`
   is **disconnected and rebuilt over every step** on each write (`:722-737`).
3. The undo-checkpoint effect keys on `[steps, article, loading]` (`:211`) and restarts a 500ms
   timer that then `JSON.stringify`s the whole article twice (`:201`).
4. `Editor.tsx:298` mints a **brand-new signed URL** for the picked path. A fresh token means a
   fresh URL string, so the `<img>` (`StepCard.tsx:178`) refetches from zero — a guaranteed cache
   miss, visible as blank-then-repaint.
5. `StepCard.tsx:211` sets `pickerOpen = false`, unmounting `FramePicker` and collapsing a tall
   element — the page jumps.

(4) + (5) together are the flash-and-jump. The likelier culprit for "feels like a page load",
though, is **opening** the picker: `FramePicker.tsx:57-63` calls `signedFrameUrl` for *every* dense
frame returned by `listDenseFrames`, which lists up to 1000 objects (`storage.ts:80-83`). A
six-minute recording is ~360 `createSignedUrl` round trips before the strip paints — on a bucket
that is public anyway (migration `0007:8`).

**9. What refetches after a pick** — **nothing from the database.** No article re-fetch, no steps
re-fetch, not even for the one step. The only network calls are the debounced
`steps.update({screenshot_url, is_edited})` (`Editor.tsx:289`, 700ms) and the single
`createSignedUrl` for the new path (`:298`). Local state is patched in place.

## Images + publish

**10. Editor** — bucket `frames`, **signed URLs, TTL 3600s** (`storage.ts:48`,
`SIGNED_URL_TTL_SECONDS`). Minted in bulk on article load (`Editor.tsx:175` → `signedFrameUrls`)
and one at a time on pick (`:298`). Two notes: the bucket is in fact **public** (migration
`0007:8`), so the signing buys nothing — and the editor's own left-rail thumbnails go through
`publicFrameUrl` instead (`StepThumb.tsx:32`), so the same screen renders the same objects via
both URL forms.

**11. Reader** — **same bucket, same objects, same paths, no copy.** Only the URL form differs:

```
// reader/ReaderSite.tsx:558
const shot = publicFrameUrl(s.screenshot_url)
```

```
// lib/storage.ts:14-17
export function publicFrameUrl(path: string | null): string | null {
  if (!path) return null
  return supabase.storage.from(STORAGE_BUCKET_FRAMES).getPublicUrl(path).data.publicUrl
}
```

Same call at `ReaderSite.tsx:493` for the spine thumbnails. Nothing duplicates a frame object at
publish time. (The one place frames *are* copied is `duplicateArticle`, `articles.ts:114-123`.)

**12. Does `published_content` embed image URLs?** It embeds the **storage path** — not a URL, and
not a reference to the `steps` rows. The snapshot is built at `Editor.tsx:493-502` (and identically
at `articles.ts:56-65`) as `{title, subtitle, steps: [{step_number, heading, body_text,
screenshot_url}]}`, where `screenshot_url` is the raw path (`0001:68` — "Storage path (not a public
URL)"). `reader_article` returns `a.published_content` verbatim (`0022:117`) and the reader resolves
path → public URL at render. So a published article points at *live objects* through a *frozen set
of paths*: replacing a frame in the editor writes a new uuid-suffixed path (`storage.ts:98`) and
updates only `steps`, so the reader keeps serving the old object until republish.

**13. Client-side image post-processing** — yes, one place: `toWebp()` in `FramePicker.tsx:180-198`,
a canvas `drawImage` + `toBlob('image/webp', 0.85)` (`:188-192`), applied only to a Tier-3 uploaded
file before `uploadStepFrame`. Frames picked from the strip are never re-encoded client-side. The
only other canvas in the app is the 64×64 favicon derivation in `ThemeSettings.tsx:50-67`
(different surface).

**14. Could `steps` hold structured annotation data today?** **No — it would be a new column.**
Full schema: `id`, `article_id`, `step_number`, `heading`, `body_text`, `screenshot_url`,
`is_edited`, `created_at`, `updated_at` (`0001:61-77`) plus `timestamp_seconds numeric`
(`0002:16`). No jsonb, no metadata column, nothing unused. `body_text` is `text` holding TipTap
HTML — smuggling annotations in there is possible and would be a bug (it is sanitized and rendered
as prose on the reader, `ReaderSite.tsx:583`). By contrast `articles` already has two jsonb columns
(`published_content` 0004:11, `generated_snapshot` 0014).

---

# Appendix F2 — contradictions and hazards for a non-destructive annotation overlay

Flagged, not resolved.

**Against the stated assumptions**

1. **"Selecting a frame appears to cause a full page reload or editor remount" — it does not.** No
   navigation, no key change, no refetch (Q8/Q9). What is visible is a guaranteed image cache miss
   from a freshly-minted signed URL (`Editor.tsx:298`) plus the picker collapsing
   (`StepCard.tsx:211`). Redesigning around a remount would be fixing the wrong thing.
2. **The picker's real cost is on open, not on pick** — up to 1000 `createSignedUrl` round trips
   (`FramePicker.tsx:57-63`, `storage.ts:80-83`) against a bucket that has been public since
   migration `0007:8`.
3. **`storage.ts` contradicts itself.** Lines 4-7 say the `frames` bucket is public and reads go
   through `getPublicUrl`; line 45 says "Frames and videos live in PRIVATE buckets … so they are
   never public URLs". The second is false for `frames`.

**What makes flatten-at-publish harder than it sounds**

4. **There are TWO publish implementations and they share no helper.** `Editor.doPublish`
   (`Editor.tsx:483-546`) and `articles.publishArticle` (`articles.ts:51-80`, used by the article
   list's row menu *and* bulk publish, `KnowledgeBase.tsx:708`) each build the snapshot by hand. A
   flatten added to one ships unflattened images from the other.
5. **`published_content` freezes paths, not pixels** (Q12). A flatten therefore has to write a new
   object and put its path in the snapshot — overwriting in place would retroactively mutate every
   published article pointing at that path. The new-object route is safe (`removeFrames` sweeps by
   `{kb_id}/{article_id}` prefix, `articles.ts:15-26`, so it collects both) but doubles frame
   storage per published article.
6. **`pendingEditCount` cannot see an annotation change.** It compares exactly four fields, and for
   the image only `p.screenshot_url !== s.screenshot_url` (`pendingEdits.ts:27-32`). Annotations in
   a *new* column would leave the count at zero — so the editor's status pill (`Editor.tsx:803`),
   the "N unpublished edits" badge (`KnowledgeBase.tsx:81`) and the "Publish changes" affordance
   would all report a clean article while the draft has diverged.
7. **Undo already drops columns, and would eat annotations.** `Snapshot` enumerates step fields
   explicitly (`Editor.tsx:49-53`) and `applySnapshot` **deletes every step row and re-inserts**
   (`:220-236`). Worse, `discardChanges` re-inserts only `step_number, heading, body_text,
   screenshot_url` (`:648-654`) — it already silently discards `is_edited` and `timestamp_seconds`
   today. Any annotation column must be added to `Snapshot`, `snapshotOf`, the `applySnapshot`
   insert **and** the `discardChanges` insert, or one Ctrl+Z or one "discard changes" wipes the
   article's annotations.
8. **`duplicateArticle` has the same gap** — `articles.ts:126-134` re-inserts four step fields, so a
   duplicate would lose annotations (as it already loses `is_edited` and `timestamp_seconds`).
9. **A new column on `steps` is exposed by default.** `jobs` is protected by an explicit column
   allowlist (`0020:49-66`); `steps` is not — it is plain row-level RLS, so anything added lands in
   `select('*')` (`Editor.tsx:157`) and in every client that can read the article.
10. **Setting `is_edited` for an annotation would break the picker's "In use" marker.** `pickFrame`
    sets `is_edited: true` (`Editor.tsx:297`), and `StepCard.tsx:208` passes `currentSecond = null`
    whenever `is_edited` — so annotating a step whose underlying frame never changed would blank
    the strip's current-frame indicator (`FramePicker.tsx:79-89`).
11. **The source recording is deleted on first publish** (`Editor.tsx:542-544`,
    `articles.ts:37-44`), and CLAUDE.md §10f requires anything depending on it to degrade in the
    same commit. An annotation tool that re-derives from the video rather than from the stored WebP
    would break on every published article. The dense 1fps set survives; the video does not.
12. **A capped or refused generation can orphan a video object.** `uploadVideo` runs before
    `/api/generate` (`App.tsx:206-209` then `:233`), and `jobs.video_path` is only recorded at the
    insert (`main.py:278`) — which is *after* the quota and spend-cap refusals (`:217`, `:231`). A
    402/503 therefore leaves the object in Storage with nothing in the database naming it, so
    neither collection path (publish, `retention.sweep`) can ever find it. Migration `0019:11-14`
    documents this exact hazard for the other case and closes it; this one is still open.
13. **The poll has no error path** (`Generating.tsx:45-61`) — one thrown request stops the loop with
    no reschedule and no failure screen. Any redesign of this surface inherits it.
14. **`MAX_VIDEO_MINUTES` is 6 in the SPA and 20 in the worker** (Surface F drift list) — worth
    settling before new copy is written against either number.

---

# Appendix G — what slices 1–3 changed (supersedes Surface F where they disagree)

Surface F and Appendices F1/F2 describe the tree BEFORE slices 1–3. Where this appendix and
Surface F disagree, **this is current**. Rows 283–295 of Surface F's branch table, and F2
items 12–14, are the parts most affected.

## Resolved from F2

- **F2 #12 — the orphaned video object: CLOSED.** Over-quota files are now refused
  client-side before a byte moves (3e); no Storage object is created, so there is nothing to
  strand. The worker's wall is unchanged and still runs on every request. See CLAUDE.md §10b,
  which was rewritten to say the client may refuse but never grant — the leak came back the
  moment someone read the old wording as banning client-side refusal.
- **F2 #13 — the poll's missing error path: CLOSED.** The loop backs off (2s/4s/8s, four
  strikes) and falls through to the failure screen, and it handles a row that vanishes after
  existing. It moved from `Generating.tsx` into `editor/useGeneration.ts`; `Generating.tsx` no
  longer exists.
- **F2 #14 — `MAX_VIDEO_MINUTES`: SETTLED at 6** in both files, enforced by the worker after
  ffprobe. Each comment now names its counterpart by path.
- **F2 #2/#3 — the picker's cost on open: CLOSED.** `FramePicker` builds public URLs
  (`getPublicUrl` is a string build, no request) instead of minting up to 1000 signed URLs.
  `storage.ts`'s self-contradicting comment is corrected.

## Surface F, superseded

- **There is no generating screen.** `screens/Generating.tsx` is deleted. A generating article
  renders the editor at the same route in an unfinished state (`ed-live`), driven by
  `editor/useGeneration.ts`. `articles.status` is now the authority for "is this still being
  written", and since the 2g worker change it reaches a terminal value on *every* path,
  failures included — previously only the success path wrote `'ready'`.
- **`articleId` is nullable in the editor.** For the first ~15s of a run the article row does
  not exist and the shell renders skeletons around the job. `onArticleResolved` puts the id in
  the URL with `replace`, without remounting.
- **Two landings, one component (2f).** First run lands inside the article; a run started from
  a populated KB stays in the KB and reports through the dock.
- **Upload progress is real.** `createSignedUploadUrl` + XHR, because `storage.upload()`
  resolves once and reports nothing on the way. The old "Uploading your recording…" card with
  no bar is gone.

## Slice 3, as built — read this before filing a miss

- **3a is built as: N dock rows immediately, N article rows as each run's Stage 1 completes.**
  This is deliberate and is the accepted behaviour, not a shortfall against the spec. The
  article row does not exist until Stage 1 creates it, and rendering placeholder rows would
  mean the list showing records the database does not have — the one thing the list must
  never do, since every other row in it is real. The dock exists precisely to cover that
  window, and `KnowledgeBase` polls `listInFlightJobs` for articles it has never seen so the
  real row arrives on its own.
- **The dock is not a new row type in the list.** A generating article is an ordinary row in
  its folder group wearing the existing `Generating` pill (`statusBadge`, Surface A).
- **Context is two-tier (3b).** Product tier on `knowledge_bases` (migration 0027:
  `product_name`, `product_description`, `audience`, `tone`); recording tier per file. Both go
  into `jobs.context` as `{product: {...}, recording: "..."}` so a retry re-grounds on what
  the run actually used. `knowledge_bases.about` is untouched and stays reader-facing — the
  decision not to prefill it is recorded at `lib/kbs.ts:saveProductContext`.
- **Lanes (3c)** are a per-account semaphore in `worker/lanes.py`, free 1 / paid 2 / internal
  3. The reason is the read-then-act window in the spend breaker, not tiering.
- **The timeout sweep now has two clocks (3i).** `jobs.started_at` (migration 0028, NOT
  granted to clients) marks when a lane was acquired. Running jobs are measured from it;
  queued jobs get `QUEUE_TIMEOUT_MIN` (2h) and their own code, `never_started`. Before this, a
  job waiting its turn on a single lane was failed as a `timeout`.

---

## G. People, invites, removed access (team access, Phase 2)

Added after A–F. ⚠️ DRIFT here = contradicts `ux-spec-v2.md` or `team-access-spec.md`.

**1. Routes / files** — `/app/:kbId/people` → `screens/People.tsx` (a real route, unlike Theming and
Domain, which stay `phase` values — People is somewhere you send a colleague a link to).
`/invite/:token` → `screens/Invite.tsx`, rendered outside the app shell like `/claim/:token`.
Sub-parts: `components/AvatarStack.tsx`, `components/OwnerOnly.tsx`, `lib/people.ts`. The removed
state is `phase === 'removed'` in `App.tsx`.

**2. Render branches — People**
| State | Condition |
|---|---|
| Paid, populated | `!gated` → inline invite form, then one list: members, then live invites |
| Paid, empty | one member and no invites → "Just you, for now" panel above the list |
| Free, gated | `isOwner && !limitsFor(plan).can_invite` → gate panel, inert field, "See plans"; owner row still renders below it |
| Admin (non-owner) view | `plan === null` → gate NEVER renders (their plan says nothing about this KB); the field works and `invite_to_kb()` is the authority |
| Row: owner / you / member / pending | `is_owner` → `Owner` chip, no action · `id === userId` → `You` chip + `Leave` · member → `Remove` · `kind === 'invite'` → dimmed row, `Pending` chip, `Resend` / `Revoke` |
| Confirm | `confirming === row.id` → the action is replaced by a question + confirm/cancel |
| Hint line | default / `ok` after a send / `err` carrying **the RPC's own message** |
| Email didn't go out | `sendInviteEmail` false → "…is invited, but we couldn't send the email just now — use Resend in a moment." |
| Loading | no spinner, no skeleton: the list simply does not render until `kb_people()` answers |

**3. Render branches — `/invite/:token`** (five, each with its own copy — deliberately not merged the
way `App.tsx` merges permission-denied and not-found)
| State | Condition |
|---|---|
| Valid | `state === 'valid'`, signed out → KB logo/colour, "{inviter} invited you to help maintain {kb}", Continue with Google + email link |
| Expired | `state === 'expired'` → names who to ask |
| Revoked | `state === 'revoked'` → vague about who withdrew it, on purpose |
| Wrong account | `accept_kb_invite()` throws → both addresses side by side, `prompt=select_account` re-auth, or a magic link to the invited address |
| Frozen | `state === 'frozen'` (owner downgraded) → names the reason, says the invite still works |
| Used / unknown | `state === 'accepted'` / zero rows |
| Already a member | `accept_kb_invite()` returns a kb id → silent `navigate('/app/:kbId')`, never an error |

**4. Other branches**
| State | Condition | Ref |
|---|---|---|
| Removed-access screen | `fetchKb` null **and** `kb_access_state() === 'removed'` | App |
| Not found (unchanged) | `fetchKb` null and state `'none'` | App |
| Admin banner — **CORRECTED** | `isAdmin && access !== 'ok'` (was `kb.owner_id !== userId`, which fired for every legitimate member) | App |
| Avatar stack | `people.length > 1` — three faces plus `+N`, opens People | KB top bar |
| Rail item People | always, every plan, with a count when `people.length > 1` | KB rail |
| Billing surfaces | trial pill, day-7 banner, rail trial panel, upgrade modal: `isOwner` only. A non-owner gets a runs-used line with no cap and no CTA, and `OwnerOnly` instead of the upgrade modal | KB rail / App |
| Domain, non-owner | `phase === 'domain' && !isOwner` → `OwnerOnly` screen naming the owner, not a 403 | App |
| KB switcher | two sections, `Yours` / `Shared with you`, headings only when both are non-empty; `+ New help center` counts OWNED KBs against `PLANS[plan].kbs` | KbSwitcher |

**5. Data** — `kb_people(kb_id)`, `kb_access_state(kb_id)`, `kb_runs_used(kb_id)`, `invite_to_kb`,
`revoke_kb_invite`, `remove_kb_member`, `invite_preview` (anon), `accept_kb_invite`; `listKbs` now
runs with NO owner filter and lets RLS return owned + shared (`isAdmin` still filters, or staff would
see every KB in the database). `POST /api/invite/email` for the send. Nothing reads `kb_members`,
`kb_invites` or another user's `profiles` row directly — all of those are revoked from clients.

**6. Hardcoded** — every string on both screens, the `SHOWN = 3` faces in the stack, the four avatar
tints, the 14-day expiry wording (the interval itself lives in the `kb_invites` default). *Config:*
`PLANS[plan].can_invite`, `WORKER_URL`.

**7. Default-open vs on-demand** — Default-open: the invite field (inline, never a modal), the whole
list. On-demand: the per-row confirm, the switcher dropdown. One `localStorage` key added,
`quink.invite_token`, purely as the OAuth-redirect backstop that `quink.claim_token` already is.

⚠️ DRIFT — `team-access-spec.md` §9.1 puts the invite box "at the top of the list" and §9.2 shows the
People screen inside the app rail. Built as a settings-style screen with a back link, matching Theming
and Domain, because the rail lives in `KnowledgeBase.tsx` and every other settings screen leaves it.
⚠️ DRIFT — §9.5's removed-access copy names the help center. `kb_access_state()` returns a state and
nothing else, and RLS is hiding the row by then, so the built copy says "this help center".
⚠️ DRIFT — §9.4 has one "Sign in to accept" button; built with the email-link fallback beside it,
because the invited address is the one that must sign in and a magic link goes straight there.
