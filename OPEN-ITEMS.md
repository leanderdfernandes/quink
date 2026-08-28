# OPEN-ITEMS.md — what is unfinished, and what it blocks

Everything known to be outstanding as of **14 August 2026**, written as prompts you can hand
back one at a time. Ordered by what it blocks, not by size.

Each item says what is true *today*, so nobody has to re-derive it. When you finish one,
delete it from this file — a stale open-items list is worse than none.

Two things this file is not: it is not `checklist.md` (launch plan) and it is not
`OPERATIONS.md` (manual procedures). It is only the loose ends.

---

## A. Blocks publishing the legal pages

### A1. The Udyam claim is still in two documents

`privacy-policy.md` and `terms-and-conditions.md` both open with *"a sole proprietorship
registered in India **(Udyam)**"*. The registration number is pending, so `contact.md`'s
`(Udyam Registration No. …)` was removed rather than filled — but the bare `(Udyam)` claim in
the other two survived, and if the registration itself is not complete, that sentence is not
yet true in a document Razorpay and Google will read.

> **Prompt:** Confirm whether the Udyam registration is *complete* (number merely not to hand)
> or *not yet granted*. If not yet granted, delete ` (Udyam)` from the opening line of
> `privacy-policy.md` and `terms-and-conditions.md`. When the number arrives, restore
> `contact.md`'s parenthetical as `(Udyam Registration No. <number>)` and rebuild.

### A2. Five of seven subprocessor regions are unverified

Verified: **ImprovMX** is genuinely the inbound provider (`nslookup -type=MX quink.online` →
`mx1/mx2.improvmx.com`, which also settles `checklist.md` §1.6's stale "Cloudflare Email
Routing"), and the Gemini key hits `generativelanguage.googleapis.com` with `vertexai: None`
— the Developer API, which is a **global endpoint with no pinnable region**, so the table's
"United States" is a guess about something that has no single answer.

Unverified, dashboard-only: Supabase project region, Render service region, Resend, and
ImprovMX's own processing region.

> **Prompt:** Open each dashboard and read the actual region: Supabase (Project Settings →
> General), Render (service → Region), Resend, ImprovMX. Correct the table in
> `privacy-policy.md` §6. For Google, decide whether to say "Global" or drop the cell — the
> Developer API is not regional. Any row you still cannot verify: remove its region value
> rather than writing a plausible one.

### A3. Privacy §3 states something we do not do

> *"We record the number of times an article is viewed."*

False. `reader_ping` records **hours containing at least one view, per knowledge base**,
capped at 24/day, and never per article. Left unedited because the four documents are
wording-frozen — but this is the one sentence in the published set known to be untrue.

> **Prompt:** Rewrite privacy §3's usage-information paragraph so it describes what
> `reader_views` actually is (see the column comments in migration 0031), or delete the
> sentence. Do not describe per-article analytics until A4 exists.

### A4. Starter's promised analytics do not exist

`pricing-spec.md` sells Starter *"basic reader analytics (views per article)"*. Nothing
per-article is recorded, and `reader_views` structurally cannot become it — the one-hour
debounce is also the abuse ceiling on an anon-callable RPC, so it must not be weakened.

> **Prompt:** Design per-article view capture as its own append-only event table, keyed on
> article, with its own rate limiting. Do not reach for `knowledge_bases.reader_views` and do
> not touch `reader_ping`'s debounce. Ships with a privacy-policy change in the same commit
> (CLAUDE.md §10 "Privacy changes ship with the policy").

### A5. `LEGAL-IMPLEMENTATION.md` §4.1 contradicts how demos work

Rule 1 requires every unclaimed demo KB be `visibility != 'listed'`. A demo with no listed
articles renders "Nothing published yet" — and `claim_preview()` counts *listed* articles to
sell the claim. The rule as written cannot hold and the reverse demo cannot work under it.

> **Prompt:** Rewrite `LEGAL-IMPLEMENTATION.md` §4 rule 1 to say what is actually required:
> noindex, absent from every sitemap, and absent from any public listing — but articles
> `listed` within the KB, because the prospect has to see them. Terms §9 already says only
> "not indexed" and "not publicly advertised", so the public promise is unaffected.

### A6. `LEGAL-IMPLEMENTATION.md` §3 truth checks never run

Unticked and outside what can be checked from this machine:

- **Gemini paid tier active on the production key** — privacy §4's "not used to train Google's
  models" depends entirely on it. Verify in the Google Cloud console.
- **Google's current paid-tier API terms still carry the no-training language.** §4 is the
  highest-risk paragraph in the set.
- **Free-tier day-14 / day-7 / offline emails have actually sent a real message.**
  `checklist.md` §1.7 says the four templates have never delivered one. Terms §3 and privacy
  §5 both promise them.

> **Prompt:** Work `LEGAL-IMPLEMENTATION.md` §3 top to bottom. For each box, either verify it
> or soften the corresponding sentence to something true. Report which you changed.

### A7. Effective date

All four say **13 August 2026**. If they go live later, that date is wrong.

> **Prompt:** Set the date in all four documents to the actual publish date and rebuild.

---

## B. Publishing actions (yours, not code)

- Add the Privacy Policy URL to the **Google OAuth consent screen**.
- Submit all four URLs to **Razorpay** for activation review.
- After the first Vercel deploy carrying `cleanUrls`, confirm against the real CDN:
  `curl -s https://quink.online/privacy | grep -c "<h1"` → `1`, and check response headers
  carry no `X-Robots-Tag`. This is the first deploy exercising the filesystem-beats-rewrite
  path in production; it was verified against Vercel's documentation and a local static
  server, not against the live CDN.
- **The business address has no district/taluka.** `H. No. 339, Near Bhurgeancho Khuris
  Chapel, P.O. Salvador do Mundo, Goa 403101, India` is deliverable, but Razorpay sometimes
  wants the taluka (Bardez) on the activation form. Check before submitting.

---

## C. Known-unsafe or known-incomplete in the product

### C1. Orphaned storage has not been deleted

The dry run is done and the numbers are real: **11 orphaned prefixes, 140 objects, 13.8 MB**,
across `frames`, `videos` and `branding`, from 8 knowledge bases that no longer exist. Oldest
object 17 July 2026. No non-UUID prefixes turned up. **`--delete` has never been run.**

Privacy §5 and §10 describe content as deleted. Until this runs, that is false for content
already promised as gone.

> **Prompt:** Re-run the dry run to confirm the numbers still match, then run
> `cd worker && .venv/Scripts/python scripts/backfill_orphaned_storage.py --delete`. It
> refuses if any job is in flight. Paste the summary.

### C2. Reader `noindex` is JavaScript-only

`ReaderSite` sets `<meta name="robots">` at runtime. A crawler that does not execute JS sees
no directive. Googlebot renders JS so it is *probably* honoured there; nothing else is
guaranteed. **Terms §9's "it is not indexed by search engines" leans on this**, as does free
and demo-tier noindex generally.

Not fixable with `robots.txt`: one static file serves the app host, every
`*.quink.online` help center and every custom domain, and paid help centers must stay
indexable — that is something they pay for.

> **Prompt:** This is the reader SSR problem. Decide the shape (prerender at publish, an edge
> function, or a framework move) before building. Out of scope for anything smaller.

### C3. Zero-result reader searches — CAPTURED (0037), not yet surfaced

Migration 0037 landed the capture half: `log_reader_search_miss(host_key, q)` is anon,
derives `kb_id` server-side from the same predicate `reader_kb` resolves with, normalises and
caps the query, and returns `void` on every path so it cannot be used to probe which help
centers exist. Rows land in `reader_search_misses`, which is revoked from `anon` and
`authenticated` outright. The reader fires it 900ms after a settled query returns nothing —
longer than the 150ms search debounce, so three prefixes of a query that eventually succeeds
do not become three rows saying the help center failed someone it did not fail. No reader
identity is stored; see the schema note below.

Two things are still open:

- **Nothing surfaces it.** The authoring app has no "readers searched for this and found
  nothing" screen yet. The data is accumulating from day one, which was the point.
- **There is no rate limit, and that is a real abuse surface.** Anyone holding the anon key
  (it ships in the browser bundle, by design) can write unbounded rows, one per call, 120
  chars each. `submit_article_feedback`'s per-article-per-minute count is the shape available;
  a per-visitor limit is NOT, because nothing identifying is stored and so two readers cannot
  be told apart. Deliberately left out of 0037 so the limiter is its own reviewable change.

> **Prompt:** Add a per-KB-per-minute cap to `log_reader_search_miss` on the
> `submit_article_feedback` pattern, then build the authoring-side view.

**No `visitor_hash`, deliberately.** The spec 0037 was built from named one; it is not in the
schema. Migration 0025 states the promise in the table itself — the reader surface "stores
NOTHING that could identify a reader ... there is deliberately no column to put such a value
in" — and `privacy-policy.md` §"Usage information" says "We do not build profiles of your
readers." A per-visitor hash is exactly such a profile key. A search query is about the help
center's gap, not about the person who typed it. If a future change wants one, the privacy
policy changes in the same commit (CLAUDE.md §10) or the change does not ship.

---

## D. Team access — all three phases are in

Migration 0035 landed the data layer (`kb_members`, `kb_invites`, the `owns_kb()` /
`can_edit_kb()` split, the invite RPCs, quota billed to the owner, the claim wipe), and
Phase 2 landed the screens: `/app/:kbId/people`, `/invite/:token` with five distinct
states, the removed-access screen, the avatar stack, the `Yours` / `Shared with you`
switcher, and `POST /api/invite/email`. Migration 0036 (Phase 3) added `kb_entitlements()`,
the shared `kb_watermark()` predicate and `person_name()`. `supabase/test_team.py` proves
the data layer live.

**Before this reaches a customer:**

- ~~`/invite/*` in the Supabase redirect allowlist~~ — **added** (`https://www.quink.online/invite/*`).
  The localStorage backstop in `lib/people.ts` stays as a net, not a substitute.
- **`EMAIL_ENABLED` must be on for the worker** or invites are logged, never sent. With it
  off the People screen says so ("…we couldn't send the email just now") rather than
  claiming a delivery that did not happen, so nothing is silently broken — but nobody gets
  an invite either.

**Phase 3 is in.** `kb_entitlements()` replaced the guessing (D.2 below records what it
deliberately left), presence renders in the editor top bar, and autosave is no longer
last-write-wins: every save is a conditional update on `articles.updated_at` that refuses
rather than clobbers. `supabase/test_guard.py` and `web/checks/presence.check.mjs` prove
both against the live project.

### D.1 Free-tier dormancy is a fixed clock, not an activity signal

`team-access-spec.md` §8 says "free-tier persistence keys on reader or edit signal", and
asks that member edits count as edit signal. **They cannot, because nothing does.**
`worker/trial.py` keys entirely on `knowledge_bases.trial_started_at` — a fixed 30-day
clock from KB creation or claim. `last_reader_view_at` and `reader_views` are recorded but
read only by the admin KBs tab; no query anywhere extends a trial for activity of any kind.

Nothing is scoped to `owner_id`, so there is no member-specific bug to fix — the whole
mechanism the spec describes does not exist. Decide which is true before Phase 2 ships:
either the spec sentence goes, or activity-based persistence gets built and
`privacy-policy.md` §5's "30 days after your first article" changes with it.

### D.2 Known gaps in the concurrent-editing guard

Phase 3 landed the entitlements RPC, presence and the stale-write guard. Three things it
deliberately does not cover:

- **Undo and discard ARE guarded now (migration 0038) — this gap bit, in production.**
  The bet above ("the damage from a collision is smaller and visible") was wrong for the two
  gestures that replace the WHOLE step list. Article `a6aa3969` ended up with eleven step
  rows instead of five: two editors pressed Ctrl+Z, their browser-side `delete` and `insert`
  interleaved as `C1 delete → C2 delete → C1 insert → C2 insert`, and every step was
  duplicated. The second, quieter half: an undo re-mints every step's `id`, so the other
  editor's `update steps where id = …` silently matched zero rows and their heading edits
  survived only in React state until publish froze them.

  Both now go through `replace_steps` — one transaction, guarded on `articles.updated_at`,
  which also closes the window where a delete that landed and an insert that did not left an
  article with no steps at all. `supabase/test_replace_steps.py` reproduces the interleaving
  with two real connections and proves the loser writes nothing.

- **Still unguarded: publish, delete, frame picks, and the single-row step gestures**
  (insert, split, duplicate-step, delete-step). These write one row rather than replacing the
  document, so the worst case is a lost or doubled step rather than a doubled article, and
  the result is visible on screen. The cheap version of the fix is to route them through
  `claim()` the way the debounced path does.
- **The presence channel is public.** Anyone signed in who knows a kb id and an article id
  can join `kb:{kbId}:article:{articleId}` and see who is editing. What travels is a
  display name and an avatar url — never article content — and both ids are already in the
  URL of everyone who legitimately has access. Making it private needs Realtime
  authorization policies on the `realtime` schema, which is a migration in a schema nothing
  else here touches.
- **`lanesFor` still reads the caller's plan**, so a member uploads at the free tier's
  concurrency (1) inside a paid help center. Conservative, invisible, and the worker's
  `LANES` is the real limit either way. Fold it into `kb_entitlements` if it ever matters.

---

## G. Context & AI editing (migrations 0040-0043) — what was flagged, not fixed

Everything here was found while implementing `context-and-editing-prd.md`. Each one is a
divergence between the prompt, the PRD and the code, resolved with a stated assumption
rather than silently.

### G1. `product_context jsonb` was NOT created, deliberately — CLOSED by 0044 (see H3)

PRD §9 asks for `kbs.product_context jsonb {name, description, updated_at, updated_by}`.
Migration 0027 had already landed the same four facts as flat columns (`product_name`,
`product_description`, `audience`, `tone`), read by `prompts.build_context_block`,
`Upload.tsx`, `App.tsx` and `QueueDock`. A jsonb column beside them would be a SECOND
source of truth for one thing and the pipeline would have to choose.

0040 therefore adds only the two audit fields the PRD names, and moves the write behind
`set_product_context()` so the 600-char cap is a control rather than a courtesy. The RPC
takes FIVE arguments, not the three the prompt specifies, because audience and tone exist
and dropping them would have needed a second, uncapped write path.

> **Prompt:** Decide whether the PRD sentence changes or the schema does. If the jsonb is
> genuinely wanted, it is a migration that folds the four columns into it and updates five
> read sites — not an addition beside them.

### G2. Video retention reverses two locked decisions, and both docs were rewritten

CLAUDE.md §8 and §10f said the recording is deleted on first publish. `privacy-policy.md`
§1 and §5 promised it to strangers. `COPY.videoDeletion` said it on the upload screen. All
four changed in the same commit as the code (§10 "privacy changes ship with the policy") —
but this is a locked decision being reversed, so it is recorded here rather than only in a
commit message.

**The free-tier window is provisional.** PRD §11.4 leaves the number open. It is currently
7 days, taken from `FAILED_VIDEO_RETENTION_DAYS` so a free recording lives exactly as long
whether the run succeeded or failed, rather than being invented. It is one line in
`PLANS`, one in `web/src/lib/plans.ts` and one in `plan_flags()` (0041).

**The storage cost delta was never computed.** PRD §11.4 asks for it. Recordings now
persist for the life of a paid article instead of until first publish, which is an
open-ended commitment nobody has priced.

> **Prompt:** Price the retention change against real object sizes, then set the free
> window. Until then `video_retention_days` is a placeholder that happens to be defensible.

### G3. The pause has no timeout, which is in tension with §10g

PRD §5.4 is explicit: no timeout, no auto-advance. §10g is equally explicit that a job must
be able to end. Resolved by making a paused job LEGIBLE rather than by putting a deadline on
a person — the wait is excluded from `JOB_TIMEOUT_MIN`, `sweep_timeouts()` skips
`awaiting_input` rows, and the lane is handed back so other recordings still run.

What remains: **a user who never comes back leaves a `running` job forever.** That is
deliberate — it is recoverable (`listInFlightJobs` finds it and the dock offers the
questions again) and failing it would throw away a completed read plus every screenshot to
tidy a row. But nothing ever collects it, and the count only goes up.

> **Prompt:** Watch `awaiting_input_at is not null and clarifications_closed_at is null`
> (PRD §10's drop-off measure). If abandoned rows accumulate, the answer is a sweep that
> RELEASES them with the defaults applied — never one that fails them.

### G4. Stage 1 barely asks anything

Four eval videos probed live against the new prompt: three produced zero clarifications and
one produced two. Over-asking was the predicted failure and is refuted; **under-asking is
the live risk**, which makes the whole §5.4 mechanic rare rather than intrusive. See
`PROMPT-LOG.md` for the numbers and what is still unmeasured — in particular, the scored
eval has NOT been re-run against this prompt and every eval number in the repo predates it.

### G5. `flow_split = "split"` does not split anything

PRD §5.2 says the answer changes "one article vs two, and their titles". Creating a second
article is a structural change nothing in the pipeline does. The answer currently reaches
Stage 2 as an instruction to make the title and subtitle describe the whole sequence
honestly, which is the half that is achievable — the article is not split.

> **Prompt:** Either build the split (two article rows from one run, with the steps divided
> at the evidence timestamp) or narrow the PRD sentence to what the answer actually does.

### G6. Delete survived "two items only" on the step menu

The Commit 5 instruction says the step hover menu is exactly two items: "Check the
recording" and "New screenshot". Merge, split and duplicate are gone as §6.5 asks. **Delete
stayed**, because the hover cluster is its only entry point and removing it would take away
the ability to delete a step at all — a regression §6.5 does not ask for and the PRD never
mentions.

> **Prompt:** Confirm Delete belongs there, or give it another home before removing it.

### G7. Editing adds model calls outside the pipeline

CLAUDE.md §5 ends "Do NOT add a model call anywhere else." That rule is about the
PIPELINE — two calls plus a deterministic step — and the PRD deliberately adds three more
outside it: `recheck.py` (video model, one clip), and `steer.py` block and article scopes
(text model). None of them touch the generation path, none create job rows, and all three
check the global spend cap first. The sentence in §5 now needs its scope stated, or it
reads as having been broken.

### G8. Rechecks and steers are not in the spend ledger

`_spend_today_usd()` sums `jobs.est_cost_usd`, and neither editing call creates a job row —
so both are GATED BY the daily cap and contribute NOTHING to it. Deliberate: a job row per
edit would pollute the run ledger, the dock and `listInFlightJobs`. The exposure is bounded
instead by `RECHECK_MAX_PER_ARTICLE_PER_HOUR` (in-process, per instance, resets on deploy)
and by text edits being ~$0.0002 each.

> **Prompt:** If editing volume ever becomes visible in the Gemini bill, record it — a
> separate `ai_edits` table, not a job row.

---

## E. One-line cleanups

- **`profiles.account_deleted_email_sent_at` is dead.** Migration 0032 added it as the
  deletion email's `send_once` marker; the email now fires *after* `auth.users` is deleted,
  so there is no row left to mark and it is passed `marker=None`. Drop the column, or leave
  it and note why. Do not wire it back up.
- **`MAX_VIDEO_MINUTES` has undocumented downstream readers.** `web/src/lib/articles.ts`
  (`removeFrames`) and `web/src/lib/storage.ts` (`listDenseFrames`) both cap `list()` at 1000
  objects, which is safe only because a 6-minute video yields ~360 dense frames. Past roughly
  16 minutes both truncate silently — `removeFrames` would then orphan frames, which is the
  purge bug again in the client. Add a comment at the constant naming both readers.
- **`eval/run_eval.py:277` calls `list(folder)` with no limit**, so it defaults to 100. Safe
  at 7 eval videos; past 100 the existence check silently fails and re-uploads every video
  every run — the ~4 minutes the function exists to save.
- **`removeFrames` hardcodes exactly two levels** (`base`, `base/dense`). A third nesting
  level would break it the same way it broke `purge_kb_storage`.
- **Migration 0016 recreates `stamp_article_origin` with no live-definition diff.** Audited
  while writing 0037: it is the ONLY migration in the history that does a `create or replace`
  on a function an earlier migration (0014) had already defined, without stating what changed.
  That is precisely the shape that lost the watermark clause across 0024–0026 (§10m, D.4).
  Every other undiffed `create or replace` — 0003, 0005, 0006, 0031 — is a FIRST definition,
  where the `or replace` is harmless. Print 0016's body from `pg_proc`, diff it against 0014's
  and write the result into 0016's header. Do not re-run it.
- **Merge, split and duplicate are gone from the editor** (PRD §6.5), which removes three
  of the four unguarded single-row step gestures D.2 records. What is left unguarded:
  publish, delete, frame picks, insert and delete-step.
- **The local `vite build` fails before it compiles anything**, at HEAD and unrelated to any
  change: `vite.config.ts` reads `VITE_SUPABASE_URL` through `loadEnv`, which returns it
  when called directly from node in the same directory but not during the build. `tsc -b`
  passes. Worth ten minutes before someone concludes a real change broke the build.
- **Publish, delete, discard, undo and frame picks still write FAQs unguarded**, the same
  known gap D.2 records for the rest of those actions. `articles.faqs` rides the guarded
  debounced path (§10k) like `title` and `subtitle`; the one-shot actions do not, and now have
  one more column to lose a race over.

- **One owner-only surface still renders for a member**, found while gating the rail meter
  (team-access-spec L7: plan, price, upgrade CTA and payment state are owner-only). The
  `New article ▾` menu's remaining-runs line says *"2 free video runs left"* to everyone who
  can edit. The COUNT is defensible — §10b wants the client to refuse work it can already
  tell will be rejected, and a member about to spend the owner's last run should know. The
  word **free** is the leak: it names the owner's tier. Drop the word, or gate the line.
  (`QueueDock`'s held-file row was the other one and is FIXED: a member gets "Not enough
  runs left. {Owner} can add more." instead of an Upgrade button — a state, not a sell.)
- **Migration 0039 is APPLIED** (2026-08-23), transactionally, via
  `supabase/apply_migration.py` — fourteen assertions inside the transaction, commit only on
  a clean pass. It appends `cycle_runs_used` to `kb_entitlements()` so the rail meter can
  render a monthly cap honestly. It went straight to the database in `.env` **without a
  staging run**, which §10m forbids, because there is still no staging project: that URL has
  no `public.staging_marker`. The §10m risk it could not cover is the one D.4 names — a
  recreated function body silently losing a clause — and that was mitigated by diffing the
  live body out of `pg_proc` first (identical to 0036, byte for byte) and by asserting every
  structural fact of the result before committing. **This is not a precedent. Get a staging
  project**; `apply_migration.py` is a net, not a substitute.

---

## F. Deferred by decision — do not build yet

- **Payments.** Razorpay Subscriptions with UPI Autopay. `purge.py` carries a
  `TODO(payments)` at the paid-plan deletion refusal: once subscription state is
  webhook-driven, the check moves from `plan` to "no active mandate", because a subscription
  cancelled in our DB whose webhook has not landed is still debiting the customer.
  `UpgradeModal` and `RestoreScreen` both point at a `mailto:` and must switch together.
- **PostHog.** Not installed. The cookieless-analytics sentence was cut from privacy §7 for
  exactly that reason. **Re-add the sentence in the same commit that installs it** — that is
  the standing rule in CLAUDE.md §10, and this is the case that produced it.
- **Suppression table for delete-and-resignup.** Deleting an account resets the free tier
  (LEARNINGS "Accepted holes A"). Deliberately not defended — the runs cost cents. If it is
  ever built, it retains a hashed derivative of an address after we promised deletion, so it
  **must be disclosed in the privacy policy at the time it is added**.

---

## H. Design system v2 — flagged during the nav-consolidation build

Raised by Step 0 of the nav/context/theming brief. Everything here is FLAGGED, not fixed,
except H2 which was a live regression.

### H1. The brief's type scale matches neither system

The brief lists `12/13/15/18/22/30` under DO NOT CHANGE and asks that no off-scale size be
introduced. Three problems, and they compound:

1. **v1 was never that scale.** `design-system.html` also uses 9, 10, 11, 12.5, 14, 17, 20,
   32 and 40px. The six named are a subset of what shipped, not the rule it followed.
2. **v2 is a different scale entirely**, and deliberately so — 16px body rather than 15, and
   a separate display ramp for the serif:
   - display (Newsreader) `--t-d1..d6` = 76 / 56 / 42 / 33 / 26 / 22
   - UI (Hanken) = 19 / 17 / 16 / 15 / 14 / 13 / 12 / 11
   Only 13, 15 and 22 appear in both lists. 18 and 30 exist in neither v2 ramp.
3. **The brief's own rule already settles it.** It says `design-system.html` is authoritative
   *"unless `Quink Design System` ships its own token file"* — and it does, `tokens/`. So
   the design system wins, and the `12/13/15/18/22/30` sentence is the thing that is stale.

The same disagreement runs through colour (v1 hex `#0E5C6B`, v2 `oklch(44% 0.088 205)` with
a dark ramp v1 has no equivalent for) and radii (v1 8/12/16/999, v2 6/8/10/16/20/26/34/999).

This is already shipped: commit `8c23c07` rebuilt the app on the v2 tokens and is on `main`.

> **Prompt:** Confirm the v2 scale is the rule and strike `12/13/15/18/22/30` from the
> standing instructions, or say which of the two systems is being retired. Until then any
> "no off-scale sizes" review of the app will flag essentially every rule in `styles.css`.

### H2. Every font pairing had a serif heading — FIXED

Not a flag, a regression, and it shipped. `8c23c07` changed `FONT_PAIRINGS.modern` from
Hanken/Hanken to Newsreader/Hanken to match the design system's own pairing. All three
options then set a serif heading, so the reader's article titles came out serif whichever
one a customer picked and the control did nothing.

Fixed by giving each pairing a distinct heading FACE, and a `headingWeight` with it —
`themeVars()` now emits `--font-heading-weight`, because a grotesk at the serif's 420 reads
underweight at 47px:

| Pairing | Heading | Body | Weight |
|---|---|---|---|
| Modern | Hanken Grotesk | Hanken Grotesk | 640 |
| Editorial | Newsreader | Hanken Grotesk | 420 |
| Classic | Georgia | Georgia | 500 |

Quink's own chrome still obeys the serif-above-22px rule. This is the reader wearing the
*customer's* brand, which has always been a separate question.

### H3. `product_context jsonb` — RESOLVED by the fold (0044)

The brief's Commit 1 asks for `kbs.product_context jsonb` plus a new
`set_product_context(p_kb_id, p_name, p_description, p_notes)`. Both already exist in a
different shape, and the difference was a deliberate decision:

- The table is `knowledge_bases`, not `kbs`.
- Migration **0027** landed the data as flat columns (`product_name`, `product_description`,
  `audience`, `tone`).
- Migration **0040** added the two audit columns, revoked client UPDATE on the four, and
  created `set_product_context(uuid, text, text, text, text)` — `SECURITY DEFINER`,
  `auth.uid()` only, `can_edit_kb()` gated, capped at `product_context_cap()` = 600.
- **G1 in this file already escalated exactly this** and asked for a decision. It has not
  been answered, and the brief does not acknowledge it.

Adding the jsonb *beside* those columns recreates the second source of truth 0040 refused —
`prompts.build_context_block`, `Upload.tsx`, `App.tsx`, `QueueDock` and `ProductSettings`
all read the flat columns, and the pipeline would have to choose. The honest version is the
fold G1 describes, and it is not additive:

- one migration moving four columns into the jsonb and backfilling,
- `create or replace set_product_context` with a **new signature** (notes, no audience/tone)
  — which needs a live-definition diff in the header, per this same brief,
- `CONTEXT_CHAR_BUDGET = 6000` replacing `product_context_cap()` = 600, a **10x raise**,
- five read sites updated, including the worker's prompt builder.

**Answered: do the fold.** 0044 moved the four flat columns into `product_context jsonb`,
dropped them along with `audience`/`tone`, replaced `set_product_context` with a four-arg
version taking notes, and raised the cap to `CONTEXT_CHAR_BUDGET` = 6000 across description
+ notes. G1 above is closed by this. Retries are unaffected: `jobs.context` keeps its own
snapshot and the worker still reads the pre-fold key names.

### H4. `tint` is two different controls — RESOLVED, one built

The brief's Commit 3 says to restore a `tint` control "dropped" from Theming. History has
one, and it is **not** what the brief then describes:

- **What existed:** `header_style = 'tint'`, one of four masthead treatments from migration
  **0024** (`check (header_style in ('solid','ink','tint','image'))`). Removed from the
  picker in `8c23c07` — deliberately, because the design system's §3 says the band is a flat
  brand fill and *"a tint mixed toward paper goes grey for desaturated customer colours,
  which was the failure v1's own comments described"*. 0024's own header says the same. The
  stored value still renders; it resolves to `solid`.
- **What the brief describes:** a separate scalar on `knowledge_bases`, independent of
  `primary_color`, controlling how strongly the brand washes into secondary surfaces (the
  `--brand-50`/`--brand-100` end). That has never existed.

So this is not a restore. It is either a revert of a design-system decision made four hours
ago, or a new control that happens to share a word.

**Answered: build the wash control, leave the masthead treatment retired.** Shipped as
`knowledge_bases.brand_wash` (0045) and carried to the reader through `reader_kb()` (0046).
`header_style = 'tint'` stays out of the picker and stored rows keep resolving to `solid`.

### H5. The brief says five commits and lists four

Commits 1–4 are specified (product context, settings consolidation, tint, reader card
hover). No fifth appears.

> **Prompt:** Name it, or the count is stale.

### H6. `SUPABASE_DB_URL` was stale, and it broke every apply script

`db.<ref>.supabase.co` has no DNS records at all any more — not A, not AAAA. Supabase
retired the direct-connection hostnames in favour of the pooler, so **every
`supabase/apply_00XX.py` in this repo would have failed to connect**, not just 0044's.

`.env` now points at `aws-0-ap-southeast-1.pooler.supabase.com:5432` with the
`postgres.<ref>` username shape and the same password. The region was found by probing,
not guessed from the dashboard — worth writing down, because nothing else in the repo
records where this project actually lives.

`.env` is gitignored, so this is a local fix. Anyone else running a migration will hit the
same wall until their own copy is updated.

> **Prompt:** The database password was pasted into a chat transcript while sorting this
> out. Rotate it (Settings → Database → Reset database password) and update `.env`.
