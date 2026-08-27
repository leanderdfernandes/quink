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
3. **Pipeline worker — one thin FastAPI app (Python), on Render.** The ONLY custom
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
deterministic. **Do not add a model call anywhere else IN THE PIPELINE.**

Scope stated, because AI editing broke the older wording's letter and not its point: three
model calls now live OUTSIDE the pipeline — `recheck.py` (the video model, on one clip) and
`steer.py`'s two scopes (the cheap model, on text). None of them touch generation, none
create job rows, all three check the global spend cap first, and none may write: every one
returns a proposal the user accepts or discards. Inside `pipeline.py` the rule is unchanged
and absolute — two calls, one deterministic step, and nothing added.

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

- **Source video: kept on a RETENTION POLICY, not deleted on publish.** SUPERSEDED (2026-08-26,
  PRD `context-and-editing-prd.md` §8, migrations 0041): publishing no longer collects the
  recording. Video-grounded editing — "Check the recording", the one edit a general chat
  model cannot make — re-reads it long after the first publish, and deleting on publish
  removed that capability at the exact moment a user finished their first article. The
  window is `PLANS[plan]["video_retention_days"]`: brief on free, life-of-the-article on
  paid. **Retention is also the meter** — there is one meter in this product, never two, and
  a video re-read costs a model call plus the storage that made it possible. See §10f.
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
- **Privacy changes ship with the policy.** If a change touches what data we keep, who can
  access it, or how long we keep it, `/legal/privacy-policy.md` changes in the same commit.
  Retention periods, deletion behaviour, the subprocessor list and admin-access disclosure
  are written promises to strangers, not internal notes. If a change would make a sentence
  in those documents false, the sentence changes or the change doesn't ship.
  *The frames bug is the argument:* `checklist.md` had storage lifecycle marked done while
  every frame survived every purge, and we came within one commit of publishing a retention
  promise that production contradicted. The four legal documents are now a fourth place
  specs can drift from code, and the most expensive one — the drift is a promise to someone
  who can act on it.

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
  global `DAILY_SPEND_CAP_USD` circuit breaker, which applies to `internal` too.
- **The client may REFUSE locally; it may never GRANT.** This supersedes the older, less
  precise "the SPA reads counters for display only, never for permission", which read as
  banning both directions. The rule is asymmetric, because the risks are:
  - **Refusing** locally costs nothing if the client is wrong or tampered with — a user who
    patches out the check just reaches the worker's wall and is refused there. So the SPA
    may decline work it can already tell will be rejected, and *should*, whenever declining
    early avoids pointless or destructive work.
  - **Granting** locally is the whole vulnerability. The worker remains the ONLY authority
    for admission. No client check may ever be the reason a run proceeds, and removing one
    must never widen what the backend allows.
  - **Worked example (slice 3e, held files):** an over-quota file is refused at the dropzone
    before a byte moves. That consumes no quota, creates no Storage object, and closes a
    real leak — `uploadVideo` runs before `/api/generate` and `jobs.video_path` is only
    written at insert, so a 402 strands an object nothing in the database names (five queued
    files with three refused stranded three, per attempt). The worker's free-tier wall is
    untouched and still runs on every request. **Do not "fix" this refusal back out.**
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
  `reader_views`, `last_reader_view_at`, `claim_token`, `claim_expires_at`, `is_demo`.
  (`last_reader_view_at` added in 0033 — 0031 introduced the column and missed this list,
  which is the exact failure this rule exists to catch.)
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
- **The token is the capability — never bind a claim to an email address.** The founder
  who receives the link forwards it to whoever actually runs their docs, and that person
  is the real user. Locking it to the addressee breaks the common case.
- **Show the goods before asking for anything.** `claim_preview()` is anon and renders
  the KB name, listed-article count and a live link for a signed-out visitor. Bouncing
  someone to a signup form asks them to create an account for a thing they haven't seen.
  It returns those four fields and **never the kb id or owner** — handing an anonymous
  caller the kb id turns a claim link into an internal-identifier lookup. The signed-in
  owner re-clicking a spent link gets their kb id from `claim_kb()` instead, where
  `auth.uid()` proves they may have it.
- **`claimed_token` exists so a used link is not a dead end.** `claim_kb()` nulls
  `claim_token`, so without it "already claimed" and "never existed" were the same row
  state and no caller change could tell them apart. People re-click links from old emails
  constantly.
- **A demo renders watermarked (`f.watermark or kb.is_demo`).** A demo on `internal` used
  to render clean and gain a badge the instant it was claimed — the thing they accept
  looking visibly worse than the thing they were shown, seconds after saying yes. The
  handover must change nothing visually.
- **`claim_kb()` returning null is a STATE, not an error.** Expired, unknown, lost the
  race, or spent by someone else — the caller re-reads the preview and renders which.
  Never an error screen.
- **`/claim/:token` must be in the Supabase redirect allowlist.** Verified live: with only
  the Site URL allowed, Google OAuth lands on `https://www.quink.online/?code=…` and the
  token is gone — the user has just signed up for a help center they were promised and is
  looking at an empty app. `lib/claim.ts` stashes the token in localStorage as a backstop
  and `App.tsx` resumes from it, but that only rescues a **same-origin** fallback. Fix the
  setting; the backstop is a net, not a substitute.
- **Never consume a one-shot flag in a render path or a mount effect.** React StrictMode
  mounts, unmounts and remounts in dev, so the throwaway first mount eats it and the
  instance that renders sees nothing — this silently swallowed the post-claim greeting
  twice. Read purely; clear on an explicit user action.
- `supabase/test_claim.py` proves the handover end to end against the live project: link
  generation, the anonymous preview and what it withholds, all four states, the race, the
  re-click, and that the reader renders identically before and after.
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

## 10f. Source-video lifecycle (locked — migrations 0019, 0041)

- **Publishing does NOT collect the recording.** This reverses 0019's rule (see §8). There is
  no lifecycle deletion anywhere in the SPA any more: `collectSourceVideo` is gone, and the
  only client-side delete left is `deleteArticle`, which is the user destroying their own
  content rather than a policy expiring it. **Do not put a lifecycle delete back in the
  browser** — a policy enforced by whichever screen the user happened to be on is not a
  policy.
- **The window is per PLAN and lives in one place.** `PLANS[plan]["video_retention_days"]`
  in `worker/config.py`, mirrored by `web/src/lib/plans.ts` and by `public.plan_flags()`
  (0041) so `kb_entitlements()` can tell the SPA what to promise. `None` = life of the
  article. **The free number is provisional** — PRD §11.4 leaves it open and it currently
  matches `FAILED_VIDEO_RETENTION_DAYS`, so a free recording lives as long whether the run
  succeeded or failed. It is one line to change and nothing else reads a window.
- **The SPA states the window from `kb_entitlements`, never from the caller's plan.** The
  caller and the payer are not the same person (§10j). Falling back to the caller's plan is
  the `lanesFor` gap, and it is harmless there and not here: it would tell a member inside a
  paid help center that we delete their recording in a week. When the window is unknown, the
  UI states NOTHING. A retention period is a promise; guessing at one is worse than silence.
- **Delete the object, then null the columns naming it — in that order.** The reverse strands
  the object with nothing naming it, invisible to every collection path. `retention._purge_video`
  is the only implementation; both sweeps go through it.
- **Two sweeps, because there are two reasons a recording stops being worth keeping.**
  `sweep_source_videos()` collects SUCCEEDED runs past their owner's window;
  `sweep()` collects FAILED ones, which never make an article and so have no article
  lifetime, on the flat `FAILED_VIDEO_RETENTION_DAYS`. `jobs.video_path` is recorded at job
  creation because a job that dies before Stage 1 never creates an article to hang it on.
- **Sweeps are state queries, never scheduled events.** "In this state, older than this
  ceiling, not yet purged" — so a tick missed to a deploy or an idle-instance recycle
  self-heals, and running it twice is harmless. The day-30/37 trial sweep follows the same
  shape.
- **The frame picker must keep working with the recording gone**, and this has not changed:
  the picker runs entirely off the 1fps dense frame set, which is separate objects that
  survive. **If a client-side `<video>` scrubber is ever reintroduced, it must degrade to the
  filmstrip in the same commit.** Same rule for "Check the recording": with the recording
  purged the action is ABSENT, never present-and-failing.
- **`articles.source`, not `source_video_path`, answers "was this generated?"** The recording
  is eventually collected either way, so its absence stops meaning anything about origin.
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
- **A PAUSED job is not a hung one, and still has to be able to end.** The clarification
  pause has no timeout (PRD §5.4) and `sweep_timeouts()` skips `awaiting_input` rows, so a
  thinking user is never failed. The other half of that rule is
  `retention.sweep_abandoned_pauses()`: Render idles an instance out after ~15 minutes and
  takes the pipeline task with it, so a row left waiting across that boundary has nobody
  left to notice an answer. It is released as a SUCCESS with `stage2_failed` — the article,
  its steps and its screenshots all exist; only the polish never ran, which is exactly what
  that degrade code already means.
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
- **A marker resets when the CYCLE IT BELONGS TO resets.** This supersedes the coarser
  "delivery records never reset" wording. `domain_live_email_sent_at` does not reset in
  `claim_kb()` because a domain goes live once, historically — there is no cycle. The
  four `trial_*_email_sent_at` markers DO reset there, because `claim_kb()` restarts
  `trial_started_at`, and a marker outliving its cycle means the new owner's help center
  is deleted with every warning already stamped as delivered. Same rule in
  `admin_set_plan`. When you add a marker, ask what cycle it belongs to — not whether
  it is "owner-derived".
- **Auth mail (magic links, confirmations) is Supabase SMTP, configured by hand** in
  Project Settings → Auth, pointed at Resend. Not in code, and the built-in sender is
  rate-limited and not for production.

## 10i. Trial lifecycle (locked — migration 0022)

- **Offline is a READER-SIDE GATE on `kb.offline_at`. Article `visibility` is NEVER
  mutated for a lifecycle reason.** The earlier plan flipped every article to `draft` on
  expiry; that destroys the listed/unlisted distinction, so restoring would have to guess
  which articles were link-only. Offline and restore are now the same single column write
  in opposite directions, and the four reader RPCs carry the condition.
- **All four reader RPCs are gated, not just the resolver.** `reader_kb` takes a hostname;
  the other three take a `kb_id`, and a kb_id is not a secret — it is in the owner's URL
  bar and travels in claim links. Gating only the resolver leaves an offline help center
  readable by anyone who has ever seen its id.
- **The deletion is defensible only because it is over-disclosed and soft.** Free includes
  unlimited manual articles, so someone can hand-build forty and lose them —
  `pricing-spec.md` §2 names this as our own dark-pattern risk. Four warnings, a 7-day
  grace window where nothing is deleted, and copy taken from §7 verbatim. **If you find
  yourself trimming a warning, trim something else.**
- **One message per tick, most urgent only; skipped thresholds are marked as sent.** A
  worker down for a week must not deliver day-14 and day-7 ninety seconds apart — that
  reads as a bug and buries the message that matters.
- **The sweep filters on `plan = 'free'` in the query AND re-checks in Python.** A single
  mis-stamped `trial_started_at` on `internal` would delete a live reverse demo, and
  reverse demos are the acquisition channel. Belt and braces is the right amount here.
- **`jobs.kb_id` is `on delete set null` (was `cascade`).** The day-37 purge is the first
  code path that deletes a KB, and under the old FK it deleted that owner's whole run
  ledger — handing back every free run they ever spent. Same fix and same reasoning as
  0017 did for `user_id`: the run happened; the ledger stops naming the KB rather than
  forgetting the run.
- **A downgrade is never a deletion.** `admin_set_plan` moving someone TO free restarts
  `trial_started_at` from now. Without it, a customer downgraded after two months carries
  a two-month-old clock and goes offline on the next tick.
- **`admin_set_plan(p_target, p_plan)` is not a §10e.1 violation.** `p_target` is the
  SUBJECT; the ACTOR is `is_admin()`, which reads `auth.uid()` and cannot be supplied by
  the caller. A `p_user_id` parameter is a bug when it stands in for proof of who is
  calling. Note this means the **service role cannot call it** — restore needs a real
  signed-in admin session.
- **While offline, authoring still works.** The KB is invisible to readers, not to its
  owner. Blocking editing punishes exactly the person we are trying to convert, so the
  restore screen is an interstitial with a way through, not a wall.
- **The restore CTA is a `mailto:`, on purpose** — same call as `UpgradeModal`. There is
  no checkout; a dead button on the highest-intent screen in the funnel teaches users the
  product is broken rather than paid. Swap both when Lemon Squeezy lands.
- `supabase/test_trial.py` proves the whole lifecycle end to end against the live project
  with a throwaway account, by moving `trial_started_at` backwards. Run it after touching
  the sweep, the reader gate, `claim_kb`, `admin_set_plan`, or the `jobs` FKs.

## 10j. Team access (locked — migration 0035)

- **`owns_kb()` and `can_edit_kb()` are two different questions and neither is a synonym
  for the other.** `can_edit_kb()` — owner OR an active `kb_members` row — gates
  everything that MAKES ARTICLES: `articles`, `folders`, `steps`, all three storage
  buckets, `knowledge_bases` UPDATE, and the worker's `/api/generate` + `/api/retry`.
  `owns_kb()` stays the gate for what only the person accountable for the help center may
  do: deleting the KB, ownership transfer, and the custom domain. When you add a surface,
  decide which question it asks — a new policy that reaches for `owns_kb()` by habit locks
  out every admin, and one that reaches for `can_edit_kb()` by habit hands an invitee the
  DNS.
- **Entitlements resolve through `knowledge_bases.owner_id → profiles.plan`, never the
  caller's plan.** A free-plan user who is an admin inside a paid help center can invite
  and can generate; they are spending the owner's entitlement. This is why
  `_require_editor()` returns `(uid, owner_id)` — the caller and the payer are no longer
  the same person, and every limit reads the second one.
- **`jobs.billed_to_user_id` is stamped at creation and never derived by joining through
  `kb_id`.** A join re-bills history on every ownership change: claim a demo we spent
  three runs building and the prospect starts at 3 of 3. `jobs.user_id` stays as who
  pressed the button (the failure lookup wants it). The quota query counts the former.
- **Domain columns are owner-only by COLUMN GRANT, not a trigger and not a second
  policy.** RLS is row-level and cannot express column scope (§10e.2), so the row policy
  stays at `can_edit_kb()` and UPDATE on `custom_domain` / `domain_*` is revoked from
  `authenticated` — the same mechanism that blocks `is_admin` self-elevation. 0035 also
  narrowed that grant to the sixteen columns the SPA actually writes, which closed a live
  hole: the blanket grant let any owner reset their own `trial_started_at` or clear
  `offline_at` from the browser console.
- **Rendering people must never widen the `profiles` SELECT policy.** `kb_people()`
  projects exactly the fields the screen needs and nothing else. If you find yourself
  editing a `profiles` policy to show a member list, stop.
- **Membership is wiped in `claim_kb()`, in that one function** — same rule and same
  reason as every other owner-derived reset (§10d). Hard delete for members, `revoked_at`
  for live invites, `jobs` untouched.
- **`kb_members` gave `knowledge_bases` a SECOND foreign-key path to `profiles`, so every
  bare PostgREST embed became ambiguous** (PGRST201) the moment the table existed. The
  trial sweep failed silently on it. Embeds now name the FK:
  `profiles!knowledge_bases_owner_id_fkey(...)`. Any new table linking those two must
  expect the same, and the sweeps must be re-run after adding one.
- **Every migration that recreates a function states its live-definition diff in the
  header.** Print the body from `pg_proc` first, diff it, and say what changed. This is
  not ceremony: 0024 recreated `reader_kb` from an older body and dropped the watermark
  clause, and 0025/0026 carried the loss. A `create or replace` you did not diff is a
  silent revert.
- `supabase/test_team.py` proves the whole thing against the live project with throwaway
  accounts — what a member can do, the four refusals, re-invite after removal, quota
  attribution, and the claim wipe. Run it after touching anything membership-shaped.

## 10k. Concurrent editing (locked — migration 0036)

- **Every autosave is a CONDITIONAL UPDATE on `articles.updated_at`.** The editor holds the
  value it last read and writes `where id = ? and updated_at = ?`. Zero rows is the
  conflict: the write is REFUSED, nothing is merged, nothing is retried, and the user's
  unsaved text stays in the editor until they choose. Last-write-wins autosave with two
  admins in one article is silent data loss, and silent is the part that matters — there
  was no error, no conflict and nothing to report.
- **An article edit IS the claim; a step edit claims first, then writes.** Claiming and
  then writing the article patch would bump `updated_at` twice and leave the editor's own
  base stale, so its next save would conflict with itself. One update carries the patch.
- **`articles.updated_at` does not move when a step is written** (LEARNINGS #9) — the two
  `touch_updated_at` triggers each bump their own row. That is why the claim exists rather
  than a trigger on `steps`: a trigger would fire for every step the PIPELINE writes,
  adding two dozen writes to `articles` per generation. Do not add one without reading
  LEARNINGS #9 first.
- **`last_edited_by` / `last_edited_at` are stamped by the claim**, so they are written on
  every successful save and by nothing else. They exist so the conflict strip can name a
  person instead of saying "someone".
- **The strip is evergreen, not amber, and it never writes on its own.** `Keep mine`
  rebases onto what is on the server and writes on the user's NEXT edit — an overwrite the
  user chose, with the other author named on screen. `Reload their version` discards the
  local copy only. Neither may silently overwrite anyone.
- **Replacing the WHOLE step list is one atomic guarded call — `replace_steps` (0038).**
  Undo, redo and discard all go through it. They used to do a browser-side `delete` then
  `insert`, which with two editors interleaves as `C1 delete → C2 delete → C1 insert →
  C2 insert` and DUPLICATES every step in the article; it happened in production. An undo
  also re-mints every step `id`, so the other editor's row updates then match zero rows and
  their work survives only in their own tab. The RPC serialises on the article row: the
  loser writes nothing and re-reads. Never rebuild the step list from the client again.
- **NOT guarded: publish, delete, frame picks, and the single-row step gestures.** They are
  explicit one-shot actions touching one row rather than the whole document, and they are
  recorded as a known gap in OPEN-ITEMS rather than half-covered here.
- **Presence keys ONE CHANNEL PER CONNECTION, never per user.** Two tabs under one presence
  key leave a permanent ghost — the second untrack never empties the key, verified against
  the live project — and a ghost that never clears teaches people to ignore the signal.
  The hook de-duplicates by `user_id` when rendering, so one person with three tabs is one
  face. `web/checks/presence.check.mjs` asserts exactly this.
- **No Yjs, no CRDT, no operational transform.** Presence prevents most collisions and the
  guard catches the rest. A merge layer is weeks of work to solve a problem two people in
  one help center do not have.
- `supabase/test_guard.py` reproduces the editor's save path with two real sessions and
  proves no text is lost in either window. Run it after touching the save path.

## 10l. The watermark predicate (locked — migration 0036)

- **`kb_watermark(plan, is_demo)` is the ONE definition**, called by `reader_kb()` and by
  `kb_entitlements()`. The rule is "the owner plan's flag OR the KB is a demo" — the second
  half is what makes claiming a reverse demo change nothing visually (§10d), and it has
  been silently dropped from `reader_kb` once already. Never re-implement it; a second copy
  would drift, and the drift shows up as a customer's preview disagreeing with their live
  site.
- **`kb_entitlements(p_kb_id)` is how the SPA learns limits.** It resolves the OWNER's plan,
  is gated on `can_edit_kb()`, and returns limits, usage and rendering flags — but the tier
  NAME only to the owner. Limits and usage are operational; billing is not. `kb_runs_used`
  is folded into it and gone: two functions answering "how many runs" is two answers that
  can disagree.
- **`person_name()` resolves every display name**, from `auth.users` OAuth metadata with the
  email's local part as the fallback. `kb_entitlements`, `kb_people` and `invite_preview`
  all call it. It is SECURITY INVOKER and revoked from clients, so it only resolves inside
  a definer function.

## 10m. Environments (locked)

- **Migrations run on staging first, always.** A numbered migration is applied to the
  staging project, the resulting object is diffed against its live definition, and only
  then applied to production. Production's SQL editor is for *data* — reads and the
  documented `OPERATIONS.md` writes. It is never used to alter schema, and never to
  `create or replace` a function. This is the specific control for `OPEN-ITEMS.md` D.4:
  the watermark clause was lost across 0024–0026 exactly because the final function body
  was assumed rather than observed.
- **Staging is replayed, never restored.** The staging database is built by running
  `0001…N` from empty. It is never seeded from a production dump — a dump carries the
  *result* of the migrations, which is what would have hidden D.4.
- **`APP_ENV` / `VITE_APP_ENV` are the only way either half learns which deployment it
  is.** Required, no default, and both refuse to start rather than guess. Nothing may
  re-derive the environment from a hostname, an origin list or whether a key happens to
  be set — that is what `domain._refuse_if_serving_real_users()` used to do, and it
  answered wrong for staging. `worker/main.py:_assert_env_coherent()` holds the rules that
  cannot be caught later (mail catch-all, live payment keys, the spend cap); a worker that
  boots into the wrong configuration looks healthy the entire time. The full variable
  ledger is `docs/ENVIRONMENTS.md`, and it changes in the same commit the variable does.
- **`public.staging_marker` is created by hand and is deliberately in no migration.** It
  is the only thing that stops `db/seed.sql` running against production, and a migration
  would carry it there.

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

Keep responses focused, brief, and concise. Keep disclaimers and caveats short, and spend most of the response on the main answer. When asked to explain something, give a high-level summary unless an in-depth explanation is specifically requested.

Match the length of written documents to what the task needs: cover the substance, but do not pad with filler sections, redundant summaries, or boilerplate.

If you notice smaller bugs that are recoverable, fix them instead of asking me. It's cheaper that way. 

Stay brief and concise. Optimise for quality
