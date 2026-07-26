# Video-to-Help-Center — UX Specification (v2, hosted product)

Screen recording → editable article → published to a team's branded, hosted help center.
This spec covers the end-to-end V1 experience for the **v2 hosted product** (not the
throwaway validation harness in CLAUDE.md). Final visual design — colours, typography,
product name — is deliberately deferred; this is structure, flow, copy, and the psychology
behind each decision. Two greyboxed wireframes accompany it: `activation-flow.html` and
`editor-wireframe.html`.

---

## 0. The core strategic principle

Every decision below serves one rule:

> **Remove the setup. Protect the making-articles loop.**

The North Star is *live help centers receiving reader traffic*, which only moves when people
(a) make good articles and (b) go live. So the whole product funnels attention toward
**article creation** and **publishing**, and treats KB-creation, theming, and organizing as
things that should be nearly free or deferred. The failure mode isn't a bad screen — it's
spreading build effort evenly so the article editor (the only screen that creates value)
ends up as polished as the settings page.

A second rule governs the editor specifically:

> **The editor should disappear.** The buyer is non-technical support/ops staff who *resent*
> editing work. The highest praise this tool earns is a user not noticing they used it.

---

## 1. The five jobs (JTBD)

| # | Job (when… I want… so that…) | The one design decision |
|---|------------------------------|-------------------------|
| **Article creation** | When I finish recording a workflow I know cold, I want it turned into a publishable article without writing or screenshot work I resent, so I can get back to my job. | The editor is a **repair tool, not a creation tool** — invisible until something looks wrong, effortless to fix, then out of the way. |
| **Create a KB** | When I sign up, I want a help center that already exists and is mine, so I can fill it, not configure it. | KB is **auto-provisioned on signup** — zero setup screens. "1 per email" removes the only decision. |
| **Customize brand** | When I publish, I want it to look like our brand so customers trust it and I'm not embarrassed to link it. | **Live split-preview**, constrained theming (one primary colour drives the theme). No raw CSS — constraint is a feature. |
| **Add to domain** | When it's ready, I want it live on our domain without asking a developer. | CNAME **as a recipe, not engineering** — auto-verify, auto-SSL, free subdomain as zero-friction default. This is the commitment/paid wall. |
| **Organize + search** | When I have many articles, I want readers to find the right one fast, so the KB deflects questions instead of dying. | **Don't build folders until article count forces it.** Flat list + drag-reorder + Postgres full-text search for V1. |

---

## 2. The activation flow (value ASAP, signup enforced before generation)

Wireframe: `activation-flow.html` (4 screens).

**Emotional sequence:**
`upload (commit the file) → one-tap signup to build → watch it build → land inside a
populated KB → brand it when ready to publish → go live (paid wall)`

Value, then commitment, in that order, every time.

### Screen 1 — Landing + upload + context (ungated)
- Dropzone and context form are **one visual unit** — the form reads as part of uploading,
  not a gate before it.
- Committing the file first creates sunk-cost momentum that makes the upcoming wall feel
  like a next step, not a barrier.
- **Product name** is the one required field. Audience, tone, description optional.
- CTA is an action on their file: **"Build my article"** — never "sign up."
- **Free-limit disclosure lives here**, at the dropzone, stated before commitment:
  *"3 free guides from video · articles kept 30 days."* Both halves of the free tier —
  the run cap and the clock — appear before the file is committed. (See §6; this must
  appear before upload, never sprung.)

### Screen 2 — Account wall (the enforced pre-generation gate)
**Decision (locked): the wall fires AFTER upload, BEFORE generation.** The expensive Gemini
pipeline never runs for an unverified session — total cost protection, kills scripted
budget-burn (per CLAUDE.md). This costs almost nothing in conversion **because signup is
feather-light (Google-first, one tap)**. The trade only hurts when signup is heavy; keep it
light and the gate is close to free.

Framing does the work:
- File pill ("✓ your recording is ready") — reminds them their file is loaded and waiting.
- Icon is an **open padlock** (unlocking, not blocking).
- Heading: **"Create a free account to build your guide"** — the value sits one tap behind it.
- **"Continue with Google"** offered first; email-with-verification-link as fallback
  (verification is the real abuse control; harden with disposable-domain blocking).
- Footnote reframes the gate as protecting the user *and* states the real reason plainly:
  *"keeps the free tier free for everyone."*

### Screen 3 — Generating (first logged-in moment)
- The ~90s wait is now the first in-product experience. Progress stages map to the **real
  pipeline** (async job + poll), never a timer-driven lie.
- Verb-first labels, in order: **Analyzing your recording · Detecting each action ·
  Capturing screenshots · Writing your guide.**
- Copy kills commitment-anxiety: *"Hang tight — you can't lose this."*
- Tip plants the value coming next: *"you'll be able to swap any screenshot and edit every
  step before publishing."*

### Screen 4 — Landing inside a populated KB
The payoff, and the thing most tools get wrong. The user does **not** land on an empty
dashboard — they land *inside their help center with article #1 already in it.*
- On signup, three things happen invisibly: account created, **KB auto-provisioned**, the
  just-built article dropped in as article #1.
- KB naming (see §3) — **not** naively from email domain.
- Theming and Domain are visible in the rail but **never blocked the path**.
- "Make it yours" is a **dismissible pull**, surfaced now that there's something worth
  branding — never a push, never a gate.

---

## 3. KB creation & naming (job: create a KB)

**Auto-provisioned on signup. Zero setup screens.** "1 KB per email" is treated as a gift,
not a limitation — it removes the only decision (which/how-many KB), so there's nothing to
create. Multiple KBs are a **Pro-tier** feature later.

**Naming — do NOT naively derive from the email domain.** Fallback chain:
1. If the email domain is a **real company domain** (not a known free provider) → derive
   ("maya@acme.io" → *"Acme Help Center"*), editable anytime.
2. If the email is a **free provider** (gmail, outlook, yahoo, icloud, proton, etc.) →
   **don't guess.** Show a single lightweight, inline, editable field on first landing
   inside the KB — *"Name your help center"* — pre-filled with a neutral default
   (*"My Help Center"*). One field, never a blocking setup screen.

Rationale: `maya@gmail.com → "Gmail Help Center"` is an embarrassing guess. Most sign-ups
will be personal (gmail) addresses, so the free-provider branch is the common path — design
it as the default, not the exception.

---

## 4. The editor (job: article creation — THE highlight)

Wireframe: `editor-wireframe.html`.

### Two doors, one room
The editor is entered two ways — **generated** (machine did the work, user corrects) and
**manual from scratch** (user authors). These are **not two editors.** A generated article
is a manual article that arrived with its steps pre-filled. The unit of everything is the
**step block** — `{ heading, body, image }`. The video pipeline emits an array of them; the
manual user builds them one at a time. Once created, the two are indistinguishable. Build
and polish **one surface.**

**"New article" offers two doors, weighted:**
- Primary: **"Record / upload a video (fastest)."**
- Secondary: **"Write it myself."**

Keep manual mode excellent, but make it the *second-offered* door — the video on-ramp is the
moat and the North Star driver; an equal-weighted "write from scratch" button trains users
away from what makes the product special.

### Zero blank-page terror (manual mode's core risk)
Never show an empty canvas with a blinking cursor. A manual article opens with **one empty
step block already present, with ghost-text scaffolding**: heading whispers *"What's the
first thing they do?"*, body whispers *"Describe the action in one line."* The step schema
**is the writing coach** — the user answers small concrete prompts, never faces "write an
article."

### The step block must feel physical
- **Drag to reorder** — in the left rail *and* on the canvas cards. Numbers **renumber live**
  as a card moves, so the sequence visibly heals itself. Reordering is the #1 structural edit
  both flows need (pipeline mis-sequences; manual users think out of order).
- At rest the card is clean; the full control vocabulary appears **on hover only** — grab
  handle (left), and a control cluster (split / merge-up / duplicate / delete) top-right.
  Restraint *is* the design for this buyer.

### Structural editing vocabulary (deliberately tiny — 3 gestures)
1. **Reorder** (drag).
2. **Merge** — fuse two adjacent steps; bodies concatenate; keep the screenshot you want.
   The reader-side fix for the pipeline's **over-segmentation** bug (LEARNINGS #4) when the
   prompt fix hasn't fully landed.
3. **Split** — cursor mid-body + "split here" cleaves the block in two at the cursor.
   How a manual author who dumped three actions into one block cleans up.

Resist adding more. A perfect editor is defined as much by the gestures it *refuses* as the
ones it has.

### The frame-picker — the signature interaction (job: fix a wrong screenshot)
**Principle: a repair tool, not a creation tool.** Invisible until needed, effortless, then
gone. **Progressive disclosure — three tiers of effort, each hidden until the previous fails
the user.** Do NOT show a filmstrip under every step by default; that reads as "N steps of
work to review," the opposite of a boring utility that prints money.

- **Tier 0 — default (no interaction).** Screenshot shows with a subtle hover-only affordance
  ("⟳ Wrong frame?"). 80%+ of frames are right; repair UI for them is noise.
- **Tier 1 — filmstrip (one click).** Opens an inline strip of **±3s candidate frames**
  (extracted at 1fps during processing — pure ffmpeg, no model call, fits "code does
  everything deterministic"). **Drag a selector across the strip** (or click a thumbnail) —
  dragging maps to "a little earlier / later in time," exactly the user's mental model.
  "Use this frame" confirms. Handles the most common failure (timestamp drift, LEARNINGS #2)
  in one gesture.
- **Tier 2 — full scrub (one more click).** "Scan the whole video →" loads the source
  `<video>` and lets the browser **seek natively (client-side)**; frame-step ◀ ▶ for
  single-frame nudges; **"Capture frame"** grabs the current frame via `<canvas>` and uploads
  it as the new `screenshot_url`. No per-frame backend round-trip — instant. This is the
  power path for the rare "right moment is outside the ±3s window" case.
- **Tier 3 — upload (always present, quiet).** "Upload image instead" — for the "doesn't
  exist in the video" case (annotated diagram, external screenshot).

**Human-correction memory:** when a user manually picks/uploads a frame, the step is marked
**"✓ edited"** — a re-run of the pipeline must NOT silently overwrite it. This marker also
feeds the eval loop: corrected frames are labeled signal on whether the timestamp model is
improving.

**Shared component:** the Tier-2 client-side scrubber doubles as the manual author's "grab
from a video" affordance — drop a video into any step's image slot and scrub a frame out of
it. One scrubber component, two uses (generated repair + manual authoring). *(Open flag: this
gives manual authors video-frame power too, slightly blurring the video-first nudge — judged
acceptable, since it still pulls from a recording.)*

### Appearance is NOT in the editor
No font / colour / layout controls in the editor. All appearance lives in the **KB theme**
(§5) and is applied at render. The author never styles a step — a themed KB styles it for
them, so every article is automatically on-brand with zero effort. This separation is what
stops the editor becoming a bloated word processor.

---

## 5. Theming (job: customize brand)

Fits the "rigid, constrained branding" decision — and that constraint is correct.

- **Live split-preview**, not a settings page: controls left, the actual reader site
  rendering live on the right. A non-technical user pasting a hex code must *see* it land
  immediately or won't trust it worked.
- Controls: **primary colour** (hex input + picker), **logo** upload, **favicon**, **one
  font pairing** from a curated dropdown of ~6 safe pairings.
- **One primary colour drives the whole theme** — buttons, links, accents derived
  algorithmically — so a non-technical user can't build something ugly. "Constrained theming
  is a feature, not a limitation."
- **Never in the activation path.** Surfaces contextually: at preview/publish ("Make it
  yours — add your logo and colour" where brand visibly matters), or as a quiet dismissible
  dashboard nudge. Pull, not push.

---

## 6. The free limit & monetization surfacing

**Free tier: 3 lifetime AI video runs + unlimited manual articles, everything kept 30
days.** *(Locked. Supersedes both "3 articles" and "5 minutes of video" in older specs.)*

The free tier follows the **same runs-vs-manual split as every paid tier**
(`pricing-spec.md` §3): cap the thing that costs money, give away the thing that doesn't.
One mechanic across all tiers, and it reads as more generous while protecting identical
cost.

- **3 video runs, lifetime.** Countable — *"1 of 3 left."*
- **Manual articles unlimited.** Writing by hand costs us nothing to host.
- **Everything expires 30 days** from first article created. This is the conversion lever.
- **Deleting an article never returns a run.** The ledger is append-only (see
  `mvp-dev-plan.md` §3) — this is what stops delete-and-regenerate farming.

### Two counters, one pill

Runs and days both drain, but showing two meters is noise. **One pill, showing whichever
is scarcer**, clicking opens the upgrade path at any time (proactive path).

The clock escalates; the run counter does not:

| Window | Treatment | Copy |
|--------|-----------|------|
| Days 30–15 | Neutral pill, brand-quiet | *"12 guides · 22 days left"* |
| Days 14–8 | Amber pill, names the consequence | *"Your articles are removed in 11 days"* |
| Days 7–0 | Persistent banner, not just a pill | `pricing-spec.md` §7 expiry copy — do not invent new |

Escalation is warranted here where it wouldn't be elsewhere: a free user can now build a
40-article help center by hand and lose it. The countdown is what makes that defensible
rather than a dark pattern, and `pricing-spec.md` §2 flags under-disclosure as the
specific risk. **Over-disclose.**

### Soft delete, 7-day grace

At day 30 the KB goes **offline and hidden, not purged.** Content is recoverable until
day 37, then hard-deleted.

This turns the angriest moment into the highest-intent one: *"Your help center is offline
— upgrade to restore it"* converts far better than *"your work is gone."* Cost is a flag
and a cron job.

### Where the limit appears (never sprung)

1. **Before upload** (Screen 1, dropzone): *"3 free guides from video · articles kept 30 days."*
2. **In the account wall** (Screen 2): *"free accounts include 3 video guides, no card needed."*
3. **Persistently in the app**: the single pill above, in the KB chrome near "New article."
4. **At the limit** (reactive): attempting run #4 fires the upgrade modal naming the exact
   blocker: *"You've used your 3 free video guides."* Note this blocks **generation only** —
   they can keep writing manually, which is the point.
5. **At day 14 and day 7**: escalating clock treatment above.

**Model (v2):** hosting is not bursty — the help center is read every day — so a **base
hosting subscription** is the core recurring revenue, with generation (the 3-free-then-paid
articles) metered on top for cost control. All numbers ship as **editable config**, not
hardcoded. (This reverses v1's credits-primary model; see mvp.md §4.)

---

## 7. Domain / go-live (job: add to domain — the commitment wall)

The v2 paid/commitment wall is **going live on a domain**, not export. It's the stickiest
moment (their brand on the line), so it gets care despite being the scariest step for a
non-technical user.

- **Free `yourname.helpkit.site` subdomain is the zero-friction default** — going live is
  *never* blocked on DNS. Most users take the subdomain instantly; custom domain comes later
  once committed. Protects the "% who go live" metric (B2).
- Custom domain: **CNAME as a recipe, not engineering.** Exact record shown (host + value,
  copy button on each), **live-polling auto-verify** ("Checking… ✓ Connected"),
  **auto-provisioned SSL** (invisible). Subfolder hosting deferred — too technical for this
  audience.

---

## 8. Organize + search (job: organize + search)

- **V1: flat article list + drag-to-reorder + Postgres full-text search.** Good search beats
  a deep folder tree for a small KB every time.
- **Folders/categories deferred** until article count forces it (~10+). It's a reader-side
  navigation need that doesn't exist early — and organizing must not become a procrastination
  surface that keeps users away from making articles.
- Uptime is now customer-facing (their live KB = part of their uptime story):
  static-rendered article pages behind a CDN so reads survive backend hiccups.

---

## 9. Data retention (changed from harness)

- **Source video: kept until the article is first published, then deleted.** This is a
  deliberate change from CLAUDE.md's "delete post-processing." The reason is
  **retry-without-reupload** — a generation that fails must be re-runnable from the stored
  video, since requiring re-upload roughly doubles abandonment at the moment the user is
  already annoyed.
  *(Corrected: this previously said the retention existed for a Tier-2 full-scrub frame
  picker. That picker does not exist — `FramePicker` was deliberately collapsed to the
  1fps dense-frame browser and the client-side `<video>` scrubber was removed for
  browser-decode fragility. The retention window is unchanged; only the rationale was
  wrong. If a scrubber is ever reintroduced, its degradation path ships in the same
  commit.)*
  Screenshots + article persist indefinitely (they're the product).
- **Failed generations never publish, so their videos are never collected by the rule
  above.** Purge failed-job videos after **7 days** — long enough for retry-without-
  re-upload (`mvp-dev-plan.md` §5), short enough not to accumulate.
- **Free-tier articles expire 30 days from first article created**, soft-deleted with a
  7-day grace, hard-deleted at day 37 (§6). Paid articles persist indefinitely.
- Update the Screen-1 reassurance copy accordingly: *"we delete the source video once your
  article is published"* (not "once your article is built").

---

## 10. Open decisions to resolve at build time

1. ~~**Free-tier unit** — 3 articles vs. 5 minutes.~~ **RESOLVED:** 3 lifetime AI video
   runs + unlimited manual articles + 30-day expiry (§6). Same runs-vs-manual mechanic as
   the paid tiers.
2. **Shared scrubber for manual authoring** — gives manual authors video-frame power;
   judged acceptable but flagged.
3. **Pricing numbers** — all placeholder, ship as editable config.
4. **Subscription vs. metered split** — base hosting sub + metered generation is the
   direction; exact shape is execution work.
5. **Final visual design, product name, colours** — deferred. This spec is structure + copy.

---

## Wireframe handoff notes (for Claude Design)

- Greybox is intentional. The evergreen/amber split is **functional colour-coding** (calm
  chrome vs. the one tactile repair moment), NOT a proposed brand palette. Run the real
  visual direction fresh.
- The load-bearing interaction is the **tiered frame-picker** (in `editor-wireframe.html`).
- Still un-wireframed, specced in prose here: the **theming split-preview** (§5) and the
  **go-live / domain** screen (§7).
- The two wireframes chain: KB (Screen 4) → article → editor → Preview/Publish (theming
  becomes contextual) → go-live (paid wall).
