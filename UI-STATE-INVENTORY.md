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
