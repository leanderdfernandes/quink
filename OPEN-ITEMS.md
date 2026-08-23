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
- **Publish, delete, discard, undo and frame picks still write FAQs unguarded**, the same
  known gap D.2 records for the rest of those actions. `articles.faqs` rides the guarded
  debounced path (§10k) like `title` and `subtitle`; the one-shot actions do not, and now have
  one more column to lose a race over.

- **Two owner-only surfaces still render for a member**, found while gating the rail meter
  (team-access-spec L7: plan, price, upgrade CTA and payment state are owner-only). Neither
  was in scope for that change, so both are still live:
  - The `New article ▾` menu's remaining-runs line says *"2 free video runs left"* to
    everyone who can edit. The COUNT is defensible — §10b wants the client to refuse work it
    can already tell will be rejected, and a member about to spend the owner's last run
    should know. The word **free** is the leak: it names the owner's tier. Drop the word, or
    gate the line.
  - `QueueDock`'s held-file CTA reads **"Upgrade to build it"** for a member. The click is
    already safe — `App.tsx` swaps `UpgradeModal` for `OwnerOnly` when the viewer is not the
    owner — but the button itself is an upgrade CTA on a member's screen, and a CTA that
    leads to "ask someone else" should say so in its label.
- **Migration 0039 is written and NOT APPLIED.** It appends `cycle_runs_used` to
  `kb_entitlements()` so the rail meter can render a monthly cap honestly; without it the
  meter falls back to the lifetime count for `starter`/`growth`, which is a stale number
  rather than a broken one. It must go to staging first (§10m) — the only `SUPABASE_DB_URL`
  in the repo has no `public.staging_marker`, i.e. it is production, so a staging project
  ref is needed before this can be applied anywhere.

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
