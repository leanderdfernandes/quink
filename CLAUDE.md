# CLAUDE.md — Quink (real product)

Standing context for every coding session. Read before writing code. These are **settled
decisions, not suggestions** — do not re-open them each session. If a task seems to require
violating one, stop and flag it rather than quietly working around it.

> **This file supersedes the old harness `CLAUDE.md`.** That file described a throwaway
> validation harness (no DB, no auth, files on disk). The harness proved the pipeline and is
> done. We are now building the real product. Where the two conflict, this file wins.

---

## 1. What Quink is

A hosted, living help center that fills itself from screen recordings. Non-technical support
and ops staff record their screen, get a clean editable article, organize articles into a
branded help center, and publish it on their own domain. Their customers read it; the team
keeps it updated.

**The one-liner:** we sell *"record instead of write."* The buyer pays for the week of
article-writing they never do.

**The pipeline is the on-ramp. The hosted, living help center is the product.** Never let
work drift so the "export a doc" framing creeps back — value does not end at a download, it
ends at a live, maintained, trafficked help center.

## 2. North Star — what every decision serves

**Number of live help centers receiving reader traffic** (published + has articles + real
visitors in the last 30 days). It only rises when the whole system works: the pipeline
produces usable articles → the team goes live → their customers actually use it → it stays
maintained. It cannot be gamed by signups or uploads.

Two governing rules fall out of this:

- **Remove the setup. Protect the making-articles loop.** Funnel all attention toward article
  creation and publishing. Treat KB-creation, theming, and organizing as things that should
  be nearly free or deferred. The failure mode is spreading build effort evenly so the article
  editor — the only screen that creates value — ends up as polished as the settings page.
- **The editor should disappear.** The buyer is non-technical staff who *resent* editing work.
  The highest praise this tool earns is a user not noticing they used it. The editor is a
  **repair tool, not a creation tool** — invisible until something looks wrong, effortless to
  fix, then out of the way.

## 3. Target user (do not drift off this)

Non-technical support/ops staff at **small teams**. One customer, one use case first.
**Resist** agencies, multi-tenant, and enterprise until the core loop retains. A visible
multi-KB/agency surface pulls in exactly the wrong early customer — keep it quiet (see §7).

---

## 4. Architecture (locked)

Three pieces, each doing the one thing it's best at:

1. **Frontend — Vite + React SPA.** Talks to Supabase directly for auth, KB/article reads,
   and editor saves. No custom backend for CRUD.
2. **Supabase** — auth (Google OAuth primary, email-link fallback), Postgres (RLS on all user
   tables), Storage (video + WebP frames), Realtime (optional).
3. **Pipeline worker — one thin FastAPI app (Python), on Render (~$7/mo).** The ONLY custom
   backend. Owns the expensive/native work: Gemini calls + FFmpeg. Everything else is
   client↔Supabase.

**Why the worker exists (do not try to fold it into Supabase):** the pipeline needs FFmpeg (a
native binary, unavailable in Supabase Edge Functions) and runs a ~90s+ job (fragile inside an
edge function's wall-clock limit). Keep it separate and thin.

**Editor:** TipTap, always. **Never fake it with a `<textarea>`** — editability is half the
product.

**AI SDK:** `google-genai`. **Never** the deprecated `google-generativeai`.

**Video processing:** `ffmpeg-python`. Deterministic. Not a model call.

**Payments (when they come):** Lemon Squeezy (merchant-of-record; handles India routing +
global tax). Webhooks are the source of truth; idempotency on every credit/quota-affecting
operation.

---

## 5. The pipeline (locked — two model calls + one deterministic step)

1. **Stage 1 — VIDEO_MODEL** (`gemini-2.5-flash`): video + injected context → JSON blueprint
   `{ step_number, heading, body_text, timestamp }`. The video model drafts; only the model
   that saw the video can write the steps.
   - **Timestamps are `"MM:SS"` strings, NEVER floats.** Float `timestamp_seconds` returns
     garbage (every screenshot becomes the opening frame). Pass total video duration into the
     prompt for grounding. Backend parses MM:SS → seconds. (Hard-won — see LEARNINGS #2.)
   - Include the **Stage-1 collapse rule** (segment by what a reader needs to learn; collapse
     repeated actions; do NOT over-collapse; preserve literal button/control labels). It lives
     in `stage1-collapse-rule.md`. It is a named prompt constant.
2. **Frame extraction — FFmpeg (NOT a model):** one raw frame per step at its
   `timestamp_seconds`, plus a **1fps dense set** for the frame-picker filmstrip. Convert all
   to **WebP**. Upload to Supabase Storage. No cropping.
3. **Stage 2 — TEXT_MODEL** (`gemini-3.1-flash-lite`): polish grammar/tone/terminology using
   the context. Same JSON schema in and out.

**Principle:** the video model drafts, the cheap model polishes, code does everything
deterministic. **Do not add a model call anywhere else.**

**Model IDs are config constants** at the top of the worker, never inline. Same rule for
prompts, paths, and limits: named constant, not scattered literal.
- `VIDEO_MODEL = "gemini-2.5-flash"`
- `TEXT_MODEL  = "gemini-3.1-flash-lite"` — **NOT `gemini-2.5-flash-lite`**, which 404s
  ("no longer available to new users") while still appearing in `models.list()`. Presence in
  `models.list()` is NOT proof a model is callable. (LEARNINGS #1.)

**Job pattern:** `POST /api/generate` returns a `job_id` immediately; frontend polls job
status (prefer a Postgres `jobs` row so the SPA polls Supabase directly). A blocking POST
would force the progress labels to be a timer-driven lie; polling ties them to the real stage.

**Progress labels (exact, in order):** `Analyzing your recording · Detecting each action ·
Capturing screenshots · Writing your guide`.

**Gemini robustness:** instruct model to return only valid JSON (no markdown fences); strip
accidental fences before parsing; retry once on malformed JSON, then fail loudly with the raw
output in the error. Video inline via `Part.from_bytes` (100MB inline limit); File API
fallback only above ~100MB. Read `GEMINI_API_KEY` from env; ship `.env.example`.

---

## 6. The JSON contract (must be exact — it survives into every layer)

```
{ title, subtitle, steps: [ { step_number, heading, body_text, screenshot_url } ] }
```

Worker: a Pydantic model. Frontend: a matching TypeScript type, identical shape. DB `steps`
rows mirror it. If any of them drift, that's a bug.

---

## 7. Scope discipline — build for the deferred, don't build it yet

We ship in testable vertical slices. Things are deliberately deferred, but the **schema and
structure must not box them out** (retrofitting these is the expensive kind of rework):

| Deferred feature | Don't build the UI | DO leave room for it |
|---|---|---|
| Theming / branding | No theme editor yet | `theme` jsonb on the KB |
| Payments | No checkout yet | Lemon Squeezy-shaped; webhooks-as-truth planned |
| Limit/quota enforcement | No hard wall yet | `free_articles_used`, `plan` on the KB |
| Custom domain / go-live | No DNS flow yet | `subdomain`, `custom_domain`, `is_published` |
| Public reader site | Authoring app only for now | article `status` incl. `published` |
| Folders / search | Flat list for now | — (additive later) |
| Manual "write from scratch" | Video-generated only for now | step block is the shared unit either way |
| Multi-KB / agency | Single KB per user | KB is already its own table |

**Free tier is 3 lifetime articles** (countable — "1 of 3 left"), NOT "5 minutes." This is
locked; older specs saying minutes are superseded.

**Monetization shape (when it lands):** hosting subscription is the recurring core; AI video
*runs* are the capped/metered thing (the only real variable cost); manual articles are
unlimited (they cost nothing). Meter the cost, not the value. Starter ($29 / ₹1,499) is the
featured tier; Growth is a quiet line, not a card, at launch.

---

## 8. Data & privacy decisions (locked)

- **Source video: kept until the article is first published, then deleted.** The Tier-2
  full-scrub frame-picker needs the video reachable during editing. (This is a deliberate
  change from the harness's "delete post-processing.") Wire the delete-on-publish hook when
  publishing ships; until then videos persist — that's expected, note it in code.
- **Screenshots + articles persist indefinitely** — they are the product.
- **Frames are stored as WebP** (speed + privacy + size). Margin work like this is for speed
  and privacy, not cost — at ~92% margins, halving COGS is noise. Do not over-invest here.
- **Human-correction memory:** when a user manually picks/uploads a frame, mark the step
  `is_edited = true`. A pipeline re-run must NOT silently overwrite it.
- **KB auto-provisions on signup.** Naming: real company email domain → derive
  ("Acme Help Center"); free provider (gmail/outlook/etc.) → don't guess, neutral default
  "My Help Center" + one inline editable field. Never a blocking setup screen.

---

## 9. Editor rules (the highlight — protect it)

- Unit of everything is the **step block** `{ heading, body, image }`. Generated and manual
  articles are the same surface; a generated article is a manual one that arrived pre-filled.
  Build and polish **one editor**, not two.
- **Structural vocabulary is exactly three gestures:** reorder (drag, live renumber), merge
  (fuse adjacent, concat bodies, keep chosen screenshot), split (cleave at cursor). Resist
  adding more — a good editor is defined as much by what it refuses.
- **Frame-picker is progressive disclosure, not a filmstrip-under-every-step.** Tier 0 default
  (hover "⟳ Wrong frame?") → Tier 1 ±3s filmstrip → Tier 2 client-side full-video scrub +
  canvas capture → Tier 3 upload. Each tier hidden until the previous fails the user. Showing
  repair UI on every step reads as "N steps of work to review" — the opposite of the goal.
- **No appearance controls in the editor.** Font/color/layout live in the KB theme, applied at
  render. The author never styles a step. This is what stops the editor bloating into a word
  processor.

---

## 10. Code philosophy (YAGNI — this is a real product, but still lean)

- **Climb the ladder before writing:** does it need to exist? → stdlib / platform feature? →
  existing dependency? → one line? → only then the minimum that works.
- **No speculative abstractions.** No provider interface "for flexibility." No state library
  where `useState` works. No wrapper where a native element works.
- **Lazy, not negligent.** Never cut: error handling on Gemini/FFmpeg calls, file-type
  validation on upload, the JSON-contract integrity, or RLS policies. Cut only unnecessary
  complexity.
- **Read the files you touch before adding to them.**
- **One change at a time**, especially through the pipeline and eval loop — two at once and you
  can't attribute what moved.
- **Config, not literals:** model IDs, prompts, prices, limits, paths — named and centralized,
  changeable without hunting. Prices/limits ship as editable config, never hardcoded.

## 10b. Entitlements (locked — migration 0014)

Settled. Do not re-open, and do not quietly work around one; flag it instead.

- **`plan` is OWNER-level.** It lives on `profiles`, never on a KB. `knowledge_bases.plan`
  is dropped and must not come back. A KB-scoped plan carries the wrong entitlements
  through the ownership-claim flow, breaks `internal` demo KBs, and goes ambiguous the
  moment a tier allows more than one KB.
- **Quota counts `jobs`, not `articles`, and the ledger is append-only.** The quota query is
  `count(*)` over `jobs where counted_against_quota` — never a stored counter. `article_id`
  is `on delete set null` so a ledger row outlives its article. **Deleting an article never
  returns a run**; that FK is the entire anti-farming mechanism.
- **`counted_against_quota` is set on SUCCESS ONLY.** A failed generation never burns a run.
  Not generosity — failed-run support tickets are the largest support cost at this size.
- **Free tier = 3 lifetime AI video RUNS + unlimited manual articles + 30-day expiry.** Not
  "3 articles". Generation is the only variable cost; hosting typed articles is free.
  **Manual article creation is never gated by anything.** Any copy saying "3 free articles"
  is wrong.
- **Limits live in code, prices live in the DB.** `PLANS` in `worker/config.py`, mirrored by
  `web/src/lib/plans.ts` and — for the two flags the database itself must decide —
  `public.plan_flags()`. Prices live in the `plans` table so they change without a deploy.
  One price per plan for everyone; no per-customer price column.
- **Enforcement happens once, in `POST /api/generate`, before the Gemini call.** Free is a
  hard wall; paid run caps are SOFT (proceed + flag `over_cap`). The hard protection is the
  global `DAILY_SPEND_CAP_USD` circuit breaker, which applies to `internal` too. The SPA
  reads counters for display only, never for permission.
- **Storage objects are keyed `{kb_id}/…`,** never by owner: a KB changes hands on claim,
  and a purge must be able to delete exactly one KB's objects. Storage RLS resolves that
  first path segment through `knowledge_bases`.

## 10c. Routing & admin access (locked — migration 0015)

- **Authoring is `/app/:kbId`, keyed on `kb.id` and NEVER on the subdomain.** The subdomain
  is trigger-provisioned and follows the KB name on rename (0013), so an authoring URL
  keyed on it dies the first time someone renames their help center. Authoring URLs are
  internal: ugly and stable beats pretty and fragile. `/kb/:kbSlug` stays the reader
  preview — do not put authoring there.
- **Reader resolves by HOSTNAME, authoring resolves by PATH, and they never share a
  resolver.** One "get current KB" helper that sometimes reads the host and sometimes the
  path is how a customer eventually gets served someone else's help center.
- **The wizard phases are deliberately not routes.** Upload → account wall → generating is
  a linear job the user cannot re-enter; routing it hands them a browser back button in the
  middle of a 90-second run. Only the KB shell and the article are routes.
- **Never resolve a KB with `.single()` on `owner_id`.** It throws rather than degrades the
  moment an account has a second KB, and `internal` is the multi-KB account.
- **A KB id that doesn't resolve renders one state** — "not found, or no access". Never
  distinguish the two, or the URL bar becomes a probe for which KBs exist.
- **Admin access is `is_admin()` inside RLS**, not a route guard. A route guard alone is
  theatre when the SPA talks to Supabase directly. Admin sessions can WRITE (open-as-owner
  must be able to fix a screenshot, not just look at one), so **the viewing-as-admin banner
  is a safety control and is never conditional or dismissible.**
- **Clients cannot write `profiles.plan` or `profiles.is_admin`.** The UPDATE grant is
  scoped to `last_kb_id` alone. Plan changes are a money operation and go through the
  service role or a SECURITY DEFINER rpc that checks `is_admin()`. Do not widen that grant.

## 10d. Ownership transfer (locked — migration 0016)

- **All owner-derived state resets in `claim_kb()`.** One function, one place. When you add
  an owner-derived column, it must be added to that reset list — miss it there and you get
  a visible bug; spread the resets across call sites and you get a silent entitlement leak
  instead. Currently: `owner_id`, `trial_started_at`, `offline_at`, `purge_at`,
  `reader_views`, `claim_token`, `claim_expires_at`, `is_demo`.
- **Identity is never denormalised outside `jobs.user_id`.** Everything else resolves
  through `knowledge_bases` — articles by `kb_id`, steps through their article, folders by
  `kb_id`, storage by the `{kb_id}/…` path prefix. A table that stores its own copy of who
  owns something breaks on transfer, silently.
- **`jobs.user_id` stays with the original owner, deliberately.** We spent those runs; they
  didn't. A claimer seeing a dozen articles and zero runs used is the generosity we want at
  that moment. Do not let a cleanup "fix" it.
- **The claim link is the only transfer path.** There is no admin force-transfer: a second
  path is a second place the entitlement resets can be forgotten, and clicking the link is
  the recipient's consent.
- **The trial clock starts when they take it, not when we built it** — and
  `stamp_article_origin` only starts a clock for plans that actually expire, so demo KBs on
  `internal` never carry one.
- **The KB switcher's visibility is driven by KB COUNT, not by `PLANS[plan].kbs`.** A
  claimer can legitimately hold two KBs on a one-KB plan; gate on the plan and they lose
  all access to the one they just claimed. The plan limit governs "New KB" only.
- `supabase/test_transfer.sh` proves the whole handover end to end against the live project
  with throwaway accounts. Run it after touching anything ownership-shaped.

## 10e. Security invariants (learned the hard way — do not relearn)

1. **A `SECURITY DEFINER` function derives identity from `auth.uid()`, never from an
   argument.** Taking the acting or destination account as a client-supplied parameter
   hands the caller the exact thing the function exists to prove. This has been the root
   cause of two escalation holes in two consecutive slices; treat a `p_user_id`-shaped
   parameter on a definer function as a bug on sight.
2. **Adding a privileged column to an existing table inherits that table's existing write
   policy.** RLS is row-level and *cannot* express column scope, so `profiles.plan` and
   `profiles.is_admin` were world-writable the moment they were added to a table with a
   blanket `for update using (id = auth.uid())`. Any new privileged column requires a
   column-GRANT review, not a policy read — and **verify with a real anon-key session, not
   by reading the SQL.** The policy looked correct while the hole was live.
3. **The `frames` bucket is public by design (migration 0007).** Anyone holding a frame URL
   keeps it after a transfer, a plan downgrade, or an unpublish. That is a deliberate
   reader-performance tradeoff, not a bug — but it means a future "private help center"
   cannot gate articles alone: the images leak independently of the article. Know this
   before promising privacy to a customer.
4. **`jobs.user_id` is `on delete set null`,** so a deleted account's ledger rows stop
   counting toward anyone. Delete-and-resignup is therefore a free-tier reset. Accepted:
   `free_email_providers` already blunts the cheap version, and building further against it
   is not worth it at this scale. Revisit only if abuse actually appears.

## 10f. Source-video lifecycle (locked — migration 0019)

- **The recording is deleted on FIRST publish, and the frame picker must keep working
  without it.** These are one change and must never be separated. Today the picker runs
  entirely off the 1fps dense frame set, which is separate objects that survive — so this
  costs nothing. **If a client-side `<video>` scrubber is ever reintroduced, it must
  degrade to the filmstrip in the same commit**, or publishing silently breaks editing on
  every published article.
- **Delete the object, then null `source_video_path` — in that order.** The reverse strands
  the object with nothing naming it, invisible to both collection paths.
- **Two collection paths, because publish cannot reach everything.** A successful article's
  recording goes on first publish; a FAILED job never publishes, so `jobs.video_path` +
  the 7-day sweep in `retention.py` collects those. `jobs.video_path` is recorded at job
  creation because a job that dies before Stage 1 never creates an article to hang it on.
- **Sweeps are state queries, never scheduled events.** "Failed, older than N days, not yet
  purged" — so a tick missed to a deploy or an idle-instance recycle self-heals, and
  running it twice is harmless. The day-30/37 trial sweep must follow the same shape.
- **`articles.source`, not `source_video_path`, answers "was this generated?"** The video
  is deleted on publish, so its absence stops meaning anything about the article's origin.
- **`status` is the pipeline lifecycle only** (`generating` → `ready`). Publish state is
  `visibility`. Writing `status='published'` violates the check constraint retired in 0015.

## 10g. Failures degrade before they fail (locked — migration 0020)

- **Stage 2 failure and partial frame failure both SHIP an editable article.** Stage 2
  only polishes prose, so its death means rougher text over correct steps and correct
  screenshots — and editing text is the product. A step whose frame won't render is a
  text-only step with the "+ Add image" affordance the editor already has. **Only Stage 1
  failure and TOTAL ffmpeg failure are real failures**, because only they leave nothing
  to give the user. A recoverable article beats a failure screen every time.
- **A degraded run is a SUCCESS and DOES count against quota** — they got an article.
  Recorded on `jobs.degraded` (`stage2_failed` / `frames_partial`) so the rate is one
  query. Only paths that reach `fail()` are free.
- **Classification happens at the source**, never by pattern-matching an exception string
  afterwards. `failures.Failed(code, detail)` is raised where the cause is known
  (frames.py, gemini.py, pipeline.py). A reworded upstream error must not be able to
  silently reclassify itself into a screen that blames the user's file.
- **Never blame the user's file when it's ours.** Only `video_unreadable` and
  `video_too_long` are about their recording. A user who believes their file is bad
  re-records it, fails again, and leaves.
- **`failure_detail` is log-only and the database enforces it.** 0020 revokes table SELECT
  on `jobs` from anon/authenticated and grants back a column list that excludes it — RLS
  is row-level and cannot express column scope (§10e.2). **Adding a column to `jobs` no
  longer exposes it to clients;** anything the SPA needs must be added to that grant
  deliberately. The `error` column is dropped and must not come back.
- **Retry re-runs from `jobs.video_path`** — no re-upload, no second video object. It goes
  through the same `_start_run` gate as a first attempt, and each attempt is its own ledger
  row (`retry_of`), so only the row that actually succeeds can carry
  `counted_against_quota`. `jobs.context` exists so the retry rebuilds from the same
  grounding rather than silently producing a different article.
- **Past the 7-day sweep the recording is gone: check Storage, never assume.** That state
  is "upload it again", not an error — a signed-URL failure must never reach a user.
- **`quota_exceeded` is not a failure and must never render as one.** It is the upgrade
  modal (pricing-spec §7), and it fires **at the dropzone on file selection**, before the
  upload — nobody watches a 90-second bar that was doomed from the start. It always says
  manual writing still works, because it does.
- **A job must be able to end.** The pipeline checks `JOB_TIMEOUT_MIN` at every stage
  boundary so it stops itself; `retention.sweep_timeouts()` (a state query, longer cutoff,
  so it never races the pipeline) catches rows abandoned by a dead worker. Without it a
  killed process leaves a spinner running forever — the worst state the product can be in.
- `worker/test_failures.py` forces every code and both degrade paths, and fails if the
  worker's codes drift from the copy in `web/src/lib/failures.ts`.
- **`SUPPORT_EMAIL` in `web/src/lib/config.ts` is now set** (`support@quink.online`, MX
  live). That one constant arms every failure screen: the job id it already rendered
  becomes a prefilled mailto subject. Empty it again if the mailbox ever stops being read
  — the screens fall back to "quote reference {id}", and a mailto that goes nowhere is a
  worse promise than none.

## 10h. Email (locked — migration 0021)

- **Email is NEVER part of a transaction.** A send failure must not fail the operation
  that triggered it. A domain that went live went live; the email is a notification
  about work that already succeeded. Send after the state write, catch everything,
  return a bool — `mailer.send_once` cannot raise into its caller.
- **Every email that fires from a loop or a sweep needs a persisted `*_email_sent_at`
  marker on the row it concerns.** The worker restarts on every deploy, so an in-memory
  "already sent" set is not protection. The marker is **claimed before the send** (a
  conditional update that only wins if the column is still null) and released only if
  the provider itself fails — the reverse order duplicates under concurrency, which is
  the failure a paying customer actually notices.
- **`send_once` is the only public send, and `marker=` is a required keyword.** Making
  the marker impossible to forget beats remembering it at each call site. Add a template
  to `mailer.py`; do not add a second send path.
- **It is `worker/mailer.py`, never `email.py`** — the worker's own directory is first on
  `sys.path`, so that filename shadows the stdlib `email` package that httpx, supabase
  and google-genai all import.
- **Sending needs `EMAIL_ENABLED` AND `RESEND_API_KEY`, both off by default.** The key
  alone is not consent: a developer with a copied production `.env`, or a test run, must
  not be able to mail a customer. Unset, the full payload is logged and the marker is
  still consumed, so dev exercises the same once-only path production does.
- **A disabled sender must announce itself.** `main.py`'s lifespan WARNs when sending is
  off while `ALLOWED_ORIGINS` contains a non-local origin. The domain-live promise sat
  undelivered precisely because the fallback was quiet — a silent safe default is how a
  user-facing promise goes unnoticed.
- **A KB's `domain_live_email_sent_at` is deliberately NOT reset by `claim_kb()`** — the
  one documented exception to §10d. It records that we sent a message, not owner state;
  a claimed KB's domain is already live and does not go live again, so resetting it can
  only produce a stale notification. The reason lives on the column comment in the DB.
- **Auth mail (magic links, confirmations) is Supabase SMTP, configured by hand** in
  Project Settings → Auth, pointed at Resend. Not in code, and the built-in sender is
  rate-limited and not for production.

## 11. Working with me

- I come in with drafts and rough concepts, work through tradeoffs conversationally, then lock
  decisions into written specs. Push back with reasons when I'm about to contradict a locked
  decision or my own North Star — don't just comply.
- Direct, verb-first copy and plain language. No soft or business-internal phrasing in
  user-facing text ("New users," not "end customers").
- When something conflicts across specs, surface it and make me choose — don't silently pick.

---

## 12. Reference specs (source of truth, in the repo)

- `ux-spec-v2.md` — the hosted-product UX (activation flow, editor, frame-picker, theming).
- `pricing-spec.md` (v2, locked) — tiers, geo pricing, unit economics.
- `video-to-docs-mvp.md` — vision, North Star, scope, competitive position.
- `LEARNINGS.md` — hard-won pipeline traps (read before repeating a mistake).
- `stage1-collapse-rule.md` + `EVAL-PLAN.md` + `ground-truth-example-and-backlog.md` — the
  eval loop and the prompt-quality backlog.
- `design-system.html` — exploratory visual direction (teal-blue, warm neutrals, Hanken
  Grotesk, timeline-seam). **Note:** brand direction is being revisited under the name Quink;
  treat final colors/wordmark as not-yet-locked. Logo wordmark: `Qu_nk.svg` (single path,
  `#211F1B`; swap to `currentColor` to recolor; no standalone glyph yet).


  ## SUPABASE SQL changes
  -The supabase link is in the root .env, make all changes to the db using the same
