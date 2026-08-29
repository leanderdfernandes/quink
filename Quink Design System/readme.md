# Quink — Design System

> Record your screen once. Quink turns it into a polished, step-by-step help article —
> published straight to your own branded help center at `docs.yourcompany.com`.

---

## This system is v2 — a reinvention, not a recreation

The first pass of this design system was a faithful recreation of the shipped
`web/src/styles.css`. **v2 replaces it.** The token layer, every component, every specimen
card and all three UI kits were rebuilt to a deliberately higher bar. §1 (product context)
and §2 (content fundamentals) are unchanged — the copy voice was never the problem. §3–§5
describe v2.

**What v2 decided**

| Axis | v1 (the shipped product) | v2 |
|---|---|---|
| Neutrals | Warm taupe at hue ~80 with real chroma | Warm at hue 55–65 at a *tenth* of the chroma, deeper ink. Reads warm beside a cool grey, neutral alone. |
| Separation | 1px beige borders on everything | **No borders.** A surface ladder (`--bg` → `--surface-1..4`) plus layered elevation. The one hairline left is `--rule`, an ink mix. |
| Depth | Single-stop 6% shadows | 2–3 stop shadows (contact + lift + ambient). In dark mode depth switches mechanism: surface lightness plus a 1px inner `--edge` light. |
| Type | Hanken Grotesk alone | **Newsreader** (transitional serif, optical-sized) for every headline above 22px; Hanken Grotesk for UI, body and controls. |
| Themes | Light only | Light **and** dark, both fully tokenised. No component branches on theme. |
| State | A coloured dot inside a bordered pill, on every row | An icon glyph plus a weighted label, no container (`<State>`). Shown only on rows that aren't the norm. |
| Motion | Almost none; a pulsing dot for "building" | One spring for size/position, 120ms in / 180ms out, determinate progress. No spinner, no pulsing dot, no looping shimmer. |
| Density | 15px body, tight gutters | 16px body, ~40% more gutter, larger radii (cards 16, panels 20, sheets 26). |

**The five specific complaints, and where each is fixed**

1. *"The on-hover focus button feels weird."* → One hover model and one focus model, in
   `components.css`. Hover overlays `--hover` and lifts one elevation step; focus is `--ring`
   drawn **outside** the control so it never shifts layout. Nothing recolours a border.
2. *"The selection toolbar comes over other buttons."* → `--z-toolbar` is the top persistent
   layer and only `<Toolbar>` may use it; `<Toolbar>` **flips below** the selection near the
   top edge; and `q-quiet-tools` on the editor canvas fades every hover-revealed control out
   while it's open. See `components/feedback/Toolbar.prompt.md`.
3. *"The warm colour borders feel very 2000s."* → There is no border token. See
   `guidelines/colors-surfaces.html` and `guidelines/colors-ink.html`.
4. *"The dots and pills give it an AI-generated feel."* → `Pill`, `StatusPill` and `Badge` are
   deleted. `<State>` replaced them; `<Chip>` is the only pill shape left, because it's a
   control. `<Group>` replaced the folder card, so lists are no longer boxes inside boxes.
5. *"Spacing and shadows feel off and flat."* → New 4px spacing scale with real control
   geometry (`--h-control`, `--pad-*`), and the layered elevation set above.

**Components** (`components/<group>/`, each `.jsx` + `.d.ts` + `.prompt.md`)

- `brand/` — **Wordmark**, **Bolt**, **Micro**, **ThemeToggle**
- `core/` — **Button**, **IconButton**, **Segmented**, **Switch**, **Chip**, **Icon**
- `forms/` — **Field**, **Input**, **Textarea**, **Select**, **Dropzone**
- `data/` — **Card**, **State**, **Row**, **Group**, **Thumb**, **Progress**, **AvatarStack**
- `feedback/` — **Notice**, **Sheet**, **Menu**, **Toolbar**

Removed in v2: `Pill`, `StatusPill`, `Badge`, `ArticleRow`, `FolderCard`, `StepThumb`, `Seam`,
`Eyebrow`, `Banner`, `Modal`. Added: `State`, `Chip`, `Row`, `Group`, `Thumb`, `Notice`,
`Sheet`, `Toolbar`, `Progress`, `Micro`, `ThemeToggle`.

**Intentional additions** — `Icon` (the source inlines the same Lucide paths in four files),
`Segmented`, `ThemeToggle` (v1 had no dark mode), `Toolbar` (the collision fix needs to live
somewhere), `Progress`.

**UI kits**

- `ui_kits/app/` — the authoring app: library → new article → upload → generating → editor,
  all live. Opens on the editor. Light and dark.
- `ui_kits/first-run/` — the first run, end to end: drop → account wall → the article
  assembling behind the clarification questions → landing in the editor with the questions
  that were never asked.
- `ui_kits/marketing/` — the landing page and log-in sheet.
- `ui_kits/reader/` — the published help center: band search, categories, an article with a
  tracking step spine, feedback. Themed from one customer hex via a port of `themeVars`.

**The connective tissue.** The reader and the authoring app are now literally the same
chassis — same surface ladder, same elevation, same type — and only `--brand` differs. v1
scoped a separate, warmer neutral set to `.rs2`; v2 doesn't, which is what makes an editor
page and a published page read as one product.

---

## 1. Product context

**Quink** is a help-center authoring product. A support or ops person uploads a screen
recording (`.mp4`/`.mov`, ≤100 MB, ≤6 minutes); an AI pipeline analyses it, detects each
action, captures a screenshot per action and drafts a step-by-step article. The author
edits it — reword a line, swap a frame, annotate a screenshot, split or merge a step — and
publishes it to a hosted, searchable help center on `{subdomain}.quink.online` or their own
custom domain.

The value proposition is stated in the product's own words: *"The week of article-writing
you never have to do."*

### Surfaces represented in this design system

| Surface | What it is | Where it lives in the source |
|---|---|---|
| **Marketing site** | The front door: hero, three-step how-it-works, legal footer. Also four statically-built legal pages (terms, privacy, refunds, contact). | `web/src/screens/Home.tsx`, `web/public/*.html`, `web/scripts/build-legal.mjs` |
| **Authoring app** | Upload + context form, account wall, generating screen, the editor (the North Star surface), article library, publish flow, theming, people/invites, admin. | `web/src/screens/`, `web/src/editor/`, `web/src/components/` |
| **Reader** (public help center) | The customer-branded, per-KB themed published site: masthead band, search, category lists, article with step spine, feedback, footer. | `web/src/reader/ReaderSite.tsx`, `web/src/reader/theme.ts` |

The three are deliberately **not** the same skin. The authoring app always wears Quink's own
teal; the reader wears the *customer's* colour, mixed from a single stored hex, and uses a
slightly warmer neutral chassis scoped to `.rs2`. That separation is load-bearing: it is what
stops the authoring UI changing appearance per account.

### Pipeline vocabulary (use these words, in this order)

`analyzing` → "Analyzing your recording" · `detecting` → "Detecting each action" ·
`capturing` → "Capturing screenshots" · `writing` → "Writing your guide".

### Sources given to me

- **Codebase:** a mounted local folder `web/` — the Vite + React 18 + TypeScript SPA
  (`react-router-dom`, `@supabase/supabase-js`, TipTap for prose editing, `dompurify`,
  `marked`). No component library, no Tailwind, no CSS-in-JS: **one hand-written
  9,172-line `web/src/styles.css`** is the entire visual system, and its own comments name
  `design-system.html` and `reader-design-pass-v2.html` as upstream sources I was **not**
  given. Where those are quoted in comments I've followed the quote.
- **Codebase:** a mounted local folder `Logo/` — `Quink Icon.{ico,png,svg}`.
- **Uploads:** `uploads/Quink Icon.{ico,png,svg}`, `uploads/logo-name.svg` (the wordmark).
- No Figma file, no slide deck, no screenshots were provided. There is therefore **no slide
  template in this design system** — none was given.

---

## 2. Content fundamentals

Quink's copy is the most opinionated part of the brand. `web/src/lib/config.ts` holds a
`COPY` object whose comments explain, sentence by sentence, *why* each word is there. Match
that discipline or the product stops sounding like itself.

**Voice: second person, present tense, active.** "You can keep writing articles by hand for
free." Never "users can". First person plural is used only for what *Quink* does to the
user's data — "We keep your recording for 30 days so you can check the guide against it,
then we delete it." The split is exact: **you** act, **we** are accountable.

**Casing: sentence case everywhere.** Buttons ("Build my article", "Write an article by
hand"), headings ("Keep building your help center"), menu items. Title Case appears
nowhere. The only uppercase is the tracked eyebrow label (`.eyebrow`, `+0.08em`) and mono
micro-captions in the reader (`ON THIS PAGE`, category counts).

**Say the number.** Limits, days and prices are always concrete and always
interpolated from one constant, never softened: *"3 free guides from video, kept 30 days.
Writing by hand is unlimited."* — three facts, each said once.

**Name the consequence, not the state.** A countdown is not decoration: the trial pill
escalates from neutral → amber → a persistent banner because "a warning you can't act on is
just anxiety". Every disabled control is paired with a sentence saying *when* it opens —
"Editing opens when your guide is finished." Never "please wait".

**Over-disclose, early.** The free-tier expiry is stated at the dropzone *before* the file
is committed, because finding out afterwards is the dark pattern the pricing spec forbids.
Same for retention: `COPY.videoDeletion(days)` returns `null` when the window isn't known
yet, because saying nothing is more honest than guessing — a retention period is a promise.

**Reassure at the exact moment of doubt.** "Hang tight — you can't lose this." ·
"✓ your recording is ready" · "Keeps the free tier free for everyone." · "You'll be able to
swap any screenshot and edit every step before publishing."

**Teach by example, not by instruction.** Placeholder text is a specific, technical
example: *"e.g. Connecting a Postgres read replica and running the first sync"* — because
"Describe this recording" gets you the product description a second time.

**Failure copy names a human.** Every failure screen turns the job id into a prefilled
`mailto:support@quink.online`. A dead end with no way to reach a person is where trust ends.

**Not Quink's voice:** exclamation marks, "Oops!", "Awesome!", "Let's get started",
"Simply", "just", "seamless", "powerful", "leverage", "unlock", growth-marketing urgency,
or any sentence that could survive a find-and-replace of the product name.

**Emoji: no.** Two unicode glyphs are used as *typographic* marks, not decoration: `✓` in
reassurance lines and file pills, and `🔒` on the account-wall padlock. Everything else is
a Lucide SVG. Do not add emoji.

**Two words to get right:** a *guide* / *article* is the output; a *run* is one unit of AI
generation from video (the metered thing); *writing by hand is unlimited* is the sentence
that must never be dropped from a paywall, because generation is the only thing that costs
anything.

---
## 3. Visual foundations

### Colour

**One hero, one ramp, one accent.** `--brand-600` is a deep teal at a fixed oklch hue of 205;
nine steps plus a set of `color-mix(in oklab, …)` derivations (`--brand-tint`, `--brand-wash`,
`--brand-press`, `--brand-ring`, `--brand-mark`, `--brand-deep`). Nothing hardcodes a shade.

The **accent** is the wordmark's bolt green, promoted from "the logo's colour" to a real role:
it means *completion*. Published, ready, finished. One accent control per screen — a second
one destroys the signal.

**Neutrals are warm, but barely.** Hue 55–65 at roughly a tenth of v1's chroma. Beside a cool
grey they read warm; alone they read neutral. That is the whole fix for "the warm borders feel
very 2000s": the warmth was never the problem, the *saturation* was.

**Colour is organised as two ladders, not a palette.**

- Surfaces: `--bg` → `--surface-1` (raised) → `--surface-2` (inset) → `--surface-3` (hover)
  → `--surface-4` (pressed).
- Ink: `--ink` (headings) → `--ink-2` (body) → `--ink-3` (meta) → `--ink-4` (placeholder).

Semantics are `--positive` / `--caution` / `--critical`, each with a `-soft` surface and an
`-ink`. They are always a **tinted surface plus an ink** — never a fill with a border round it.

Everything is oklch, which is what lets the dark theme be *derived* rather than hand-picked,
and lets the reader expand one customer hex into a full ramp at render.

### Dark mode

Warm near-black (`oklch(16.5% 0.006 62)`), never blue-black. Two things invert:

1. **The brand ramp flips.** `--brand-600` *lifts* to `oklch(72% …)` — a deep teal on a
   near-black page has no contrast left to spend — and tints go darker, not lighter.
2. **Depth changes mechanism.** Shadows are nearly invisible on a dark page, so surface
   lightness does the lifting and a 1px inner top light (`--edge`) defines the edge. Same
   token names, different physics: **no component ever branches on the theme.** If you find
   yourself writing a theme conditional in a component, a token is missing.

### Type

**Two families, and the pairing is the reinvention.**

- **Newsreader** — a transitional serif, variable, optical-sized (`opsz 6..72`) — carries
  every headline. Calm, literary, low drama. A help article *is* a piece of writing, and this
  is what stops the product reading as generic SaaS.
- **Hanken Grotesk** stays for UI, body and controls. It is in the wordmark, so keeping it is
  what makes v2 read as the same brand rather than a skin swap.

**The rule: serif above 22px, grotesk at or below. No exceptions.** A serif button label is
the fastest way to make this look like costume rather than craft.

The serif runs **light** — 420 at display size, 500 for emphasis, never bold: weight is where
transitional serifs turn into advertising. Emphasis lives in the grotesk (400 / 480 / 560 /
640). Optical sizing handles the tracking, so the values are small: `-0.03em` at hero scale,
`-0.021em` elsewhere.

Body copy is **16px**, controls 15px, hints 13px — one full step up from v1 across the board.
Mono (`--font-mono`, the system stack, never a webfont) appears only as metadata: `<Micro>`
labels, counts, timestamps, inline `code`. It is what makes the reader feel documentary.

Measures: 68ch prose · 54ch lede · 22ch title · 17ch hero.

### Spacing & rhythm

A real 4px scale with the two half-steps the product needs (2 and 6). Control geometry is
fixed so mixed rows align without hacks: `--h-control-sm` 32 · `--h-control` 38 ·
`--h-control-lg` 46 · `--h-field` 42.

Gutters are 40px (24 on small screens), and every screen is measurably roomier than v1.
"Fewer things per screen" is a spacing decision before it is an editing one.

Layout is **rail + capped column**, repeatedly: 232px step rail | 720px editor canvas ·
248px nav rail | 960px library · 180px reader spine | 68ch prose.

### Backgrounds & imagery

**No gradients. No patterns, no textures, no grain, no illustration, no stock photography.**
The product's imagery *is* the user's own screenshots, and they are always framed, never bled.

v1 had two functional gradients in the reader's image masthead. v2 has **zero** — the band is
a flat brand fill, because a tint mixed toward paper goes grey for desaturated customer
colours, which was the failure v1's own comments described.

Screenshot frames take the image's own ratio, so there is never a letterbox bar. Portrait
frames sit *beside* the prose at 268px; landscape frames stack *under* it and break out past
the text measure up to 780px.

### Surfaces, corners, cards

**There are no borders.** Not on cards, not on buttons, not on inputs, not on bars, not on the
rail. Regions separate by surface lightness and elevation. The only 1px lines left are
`--rule` and `--rule-strong` — ink mixes, not beiges — for list separators and section
divisions, where elevation genuinely cannot help.

Elevation is four layered steps, and every one is **2–3 stops**: a tight contact shadow for
the edge, a mid shadow for the lift, a wide ambient for the room. Single-stop shadows are what
read as flat, and that was the complaint.

- `--e0` flush (wells, inputs) · `--e1` resting (cards, bars) · `--e2` interactive lift ·
  `--e3` overlays (menus, popovers) · `--e4` modals and the floating toolbar.

Shadow colour is a mix of `--ink`, so it inherits the palette's warmth instead of laying a
grey cast over a warm page.

Radii are more generous than v1 — the cheapest single lever on whether something feels
modern: 6 thumbnails · 8 small controls · 10 buttons and fields · 16 cards · 20 panels ·
26 sheets · 999 chips.

**The canonical card** is `--surface-1` + `--r-lg` + `--e1` + `--edge`. No border, no coloured
left edge, no gradient. **Never nest a card in a card** — a quieter region inside one is
`variant="inset"`, and a list of things is `<Group>`. Boxes inside boxes was the main reason
v1 felt cluttered.

**Inner shadows do not exist** except `--edge` (dark mode) and the focus ring.

### States

- **Focus:** `--ring` — a 2px brand ring at 2px offset, drawn **outside** the control so it
  never changes layout and never sits under a label. Fields get `--ring-inset` instead.
  There is no border to recolour, which is exactly what made v1's focus feel bolted on.
- **Hover:** overlay `--hover` (an ink mix) and lift one elevation step. One model, every
  interactive surface. Primaries deepen to `--brand-press`.
- **Press:** `scale(0.985)` and settle back one elevation step. A 1.5% settle, not a bounce —
  the difference between "responsive" and "cute".
- **Fields invert:** sunken at rest (`--surface-2`), **raised** on focus (`--surface-1` +
  inset ring). Sinking at rest and rising on focus is what makes them feel physical.
- **Disabled:** `--surface-3` fill, `--ink-4` text, no shadow — and always accompanied by a
  sentence saying when it opens.
- **Destructive:** neutral until hovered, then `--critical` on an `--critical-soft` fill.
  Delete is a two-step **inline** confirm, never a dialog.
- **Hover-only tools** live at `opacity: 0` and reveal on `:hover, :focus-within`; one
  coarse-pointer rule pins them visible on touch.

### State language

Article state is an **icon glyph plus a weighted label, with no container** (`<State>`).
v1 put a coloured dot inside a bordered pill on every row; at list scale that became forty
bubbles competing with forty titles, which is precisely what read as generated rather than
designed. `<Chip>` is the only pill shape left in the system, because a chip is a *control*.

And state is shown **only on rows that aren't the norm** — in the library, published and
edited rows carry a state; plain drafts don't.

### Motion

v1's budget was "almost nothing", which is defensible but reads as flat. v2 spends more, on
fewer things, with real physics.

- `--ease` `cubic-bezier(0.32, 0.72, 0, 1)` for everything; `--ease-spring`
  `cubic-bezier(0.34, 1.32, 0.64, 1)` for anything that changes size or position.
- **120ms hover in, 180ms hover out.** Leaving is always slower than arriving — that
  asymmetry is most of what makes pointer feedback feel considered instead of twitchy.
- Entrances are 240–320ms and travel **4–8px**. Long travel is what makes an interface feel
  slow and cheap.
- **No spinner. No pulsing dot. No looping shimmer.** Progress is determinate and driven by
  real stage data; skeletons get one slow sweep of light, not a loop.

All disabled under `prefers-reduced-motion`.

### Transparency, blur, and layering

**No backdrop blur anywhere.** Transparency is used only where a value must adapt to an
unknown fill — the reader band's field (`--on-brand` at 12%) and the modal scrim. Everything
else is opaque.

Layering is declared **once**, in `components.css`, and it is load-bearing:
`--z-rail` 10 · `--z-bar` 20 · `--z-sticky` 30 · `--z-dock` 40 · `--z-menu` 50 ·
`--z-toolbar` 60 · `--z-overlay` 80 · `--z-toast` 90. Only `<Toolbar>` may use
`--z-toolbar`. Ad-hoc z-indexes are how the selection toolbar ended up underneath other
buttons in v1.

### The motif that survived

The **step number** — a 26px column with a `2px solid var(--brand)` top rule above a mono
tabular index — is the one v1 motif kept, unchanged, in the editor and the reader alike. It is
genuinely good, it is in the live product, and it is what makes an author recognise their own
article on the published site.

v1's timeline seam (the ticked rule with a haloed dot) is **gone**. It was decoration in three
costumes, and determinate progress says the same thing honestly.

---

## 4. Iconography

**Lucide, inlined as SVG paths — no icon package is installed.** `web/package.json` has no
icon dependency; every icon in the source is a hand-inlined Lucide path. v2 keeps that and
wraps the set in one `<Icon>` component with a shared stroke preset:

```js
{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' }
```

Rules:

- `viewBox="0 0 24 24"` always. Rendered at **15** (inline), **17** (default), **19** (nav) or
  **22** (feature tiles). Nothing larger — icons never become illustration.
- **Stroke 1.75, not v1's 2.** Against 16px body copy a 2px stroke read heavier than the text
  beside it.
- **`currentColor` always.** This is what makes an icon work on the dark toolbar, on a brand
  band, and inside a hover state with no second rule.
- Round caps and joins. The only filled glyph is the `dots` overflow menu.
- Five **state glyphs** — `check-circle`, `dot-circle`, `arrow-up-circle`, `draft-circle`,
  `alert` — exist specifically to carry article state, since v2 says state with a glyph
  instead of a coloured dot. Reach for `<State>`, not the glyphs directly.

**No icon font. No sprite sheet. No PNG icons. No emoji.** Two unicode marks survive from v1
as *typographic* characters, not decoration: `✓` in reassurance lines and `·` as a separator.

**Brand marks (`assets/`)** — all copied from the sources, none drawn by me:

| File | What it is |
|---|---|
| `quink-wordmark.svg` | The full "Qu⚡nk" wordmark, 472×151. Letters `#211f1b`, bolt `#2f7d57`. |
| `quink-wordmark-light.svg` | Same paths, letters recoloured for dark surfaces. |
| `quink-icon.svg` | The app icon: warm-paper disc + green bolt. |
| `quink-icon-brand.svg` | Same, disc filled with the brand teal. |
| `quink-icon.png` / `.ico` | 1080px raster + multi-size favicon, as supplied. |
| `favicon.svg`, `favicon.ico`, `apple-touch-icon.png` | Shipped app favicons from `web/public/`. |

The wordmark's `i` **is** the lightning bolt, and the bolt keeps its green in the wordmark
(there it is a letter) while `<Bolt>` used alone inherits `currentColor` (there it is a UI
element). That distinction is in the source and worth preserving.

⚠️ The supplied `Quink Icon.svg` shipped with no `fill` on its disc path, so it rendered
black. `assets/quink-icon.svg` fills it with the warm paper sampled from the supplied PNG.

---

## 5. Index

**Foundations**

- `styles.css` — the entry point consumers link. `@import` lines only.
- `tokens/` — `colors.css` (both themes), `typography.css`, `spacing.css`,
  `elevation.css` (elevation, focus, radii), `motion.css`, `fonts.css`
- `base.css` — reset, element type, links, `.q-micro` / `.q-lede` / `.q-prose`
- `components.css` — every primitive's styling, plus the z-layer scale
- `guidelines/` — 18 foundation specimen cards (Colors, Type, Elevation, Spacing, Motion, Brand)
- `assets/` — logos, icons, favicons
- `thumbnail.html` — the homepage tile
- `SKILL.md` — Agent-Skills entry point for using this system outside the workspace

**Components** — see the table in the v2 banner at the top of this file.

**UI kits**

| Kit | What it covers |
|---|---|
| `ui_kits/app/` | The authoring app. Library → new article → upload → generating → editor, all live. Opens on the editor. |
| `ui_kits/reader/` | The published help center. Band search, categories, article with tracking step spine, feedback. Customer-themed from one hex. |
| `ui_kits/first-run/` | The first run for a brand-new user. Drop → the account wall (after upload, before generation) → the article visibly assembling while the clarification questions are answered one at a time → the editor, carrying the unasked questions and the per-step steer field. |
| `ui_kits/marketing/` | The landing page, pricing block and log-in sheet. |

Each kit has its own `README.md` explaining what is faithful, what changed at v2, and what was
deliberately not built.

### Known gaps

- **No slide template** exists in this system: no deck was provided.
> **Note, added later:** both files named just below were deleted from the repo once the app
> had been rebuilt on this system. They are recorded here as provenance — what v2 was
> reconciled against — not as anything a reader can still open.

- `design-system.html` and `reader-design-pass-v2.html` — named as upstream sources in the
  CSS comments — were **not** provided. Anything in them beyond what the CSS implements is
  unknown here.
- **Fonts are CDN-loaded.** No binaries were available to ship, for Hanken Grotesk or
  Newsreader. If you have them, they should be self-hosted.
- **No real product screenshots.** Every figure in every kit is an honest placeholder rather
  than a drawn approximation of a UI.
- The account wall, theming settings, people/invites, admin shell and annotate-mode toolbar
  exist in the source but are not rebuilt as kit screens. The component set covers them.
- The marketing kit's **pricing section** is the one place I added a section the source
  didn't have. Its content is the product's own pricing logic; flag it if you'd rather it go.

---

## 6. Consumption inventory (Step 0 of the nav-consolidation build)

Recorded because a build brief asked for three primitives — Tabs, ProgressBar, DropdownMenu
— and only one of them was actually missing. Names matter here: reaching for a component
that already exists under a different name is how a system grows two of everything.

| Asked for | Status | What it is here |
|---|---|---|
| **Tabs** | **ADDED** | `components/core/Tabs.jsx` — `<Tabs>` + `<TabPanel>`, roving tabindex, arrow keys, ink underline on the rail's own hairline. `.q-tabs` in `components.css`. |
| **ProgressBar** | Already existed | `components/data/Progress.jsx` — `<Progress value={0..1} />`, plus `indeterminate`. `.q-progress` / `.q-progress-fill`. Determinate by default: the system forbids a timer-driven fake. |
| **DropdownMenu** | Already existed | `components/feedback/Menu.jsx` — `<Menu items={[…]} />` with group, divider, switch and critical item types. `.q-menu`. Positioning is the caller's; it must sit on `--z-menu`. |

**Why Tabs is not Segmented.** `<Segmented>` is a mode switch for two or three options on
ONE surface, and its sliding thumb is what says the options are a single control. Tabs
address four or more sections that each own a whole screen, so nothing slides — the page
changes, and the active tab thickens a slice of the rule the rail already sits on.
`<TabPanel>` renders only the active panel, because these are screens with their own
fetches.

Full component list, for the same reason: **brand** Wordmark, Bolt, Micro, ThemeToggle ·
**core** Button, IconButton, Segmented, Switch, Chip, Icon, **Tabs** · **forms** Field,
Input, Textarea, Select, Dropzone · **data** Card, State, Row, Group, Thumb, Progress,
AvatarStack · **feedback** Notice, Sheet, Menu, Toolbar.

### The token question, answered once

`design-system.html` (v1) and this system disagree on nearly every value, and this system
wins: it ships `tokens/`, which is the condition v1 itself set for being superseded. v1 is
now a historical reference for the brand's *direction*, not a source of values. The
disagreements are listed in `OPEN-ITEMS.md` H1 rather than reconciled, because they are
decisions, not drift.
