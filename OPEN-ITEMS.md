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

### C3. Zero-result reader searches are not captured

Every "no articles match X" is a customer telling you exactly which article to write next,
and it is discarded. Same lossiness argument as `reader_views` before migration 0031.

> **Prompt:** Capture zero-result searches per KB, server-side, on the same anon-RPC pattern
> as `reader_ping` — debounced, no reader identity stored, its own table. Surface them in the
> authoring app as "readers searched for this and found nothing".

---

## D. One-line cleanups

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

---

## E. Deferred by decision — do not build yet

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
