# LEARNINGS.md — Pipeline build log

Hard-won findings from building and running the validation harness. Each entry is a
decision or a trap we already paid for once. Read before repeating a mistake.

---

## Technical (verified, applied)

### 1. `gemini-2.5-flash-lite` is dead — and it's a trap
- 404s with "no longer available to new users."
- **Still appears in `models.list()`** — so the standard "list models, pick one" pattern
  selects a corpse. This is the trap.
- **Fix:** `TEXT_MODEL = "gemini-3.1-flash-lite"` (verified working).
- If a production key still has 2.5-lite access, it's a one-line change at the top of
  `main.py`. The constant exists precisely so this is one line, not a hunt.
- **General rule:** presence in `models.list()` is NOT proof a model is callable. Verify by
  actually calling it.
- **2026-08-22, the same trap on the video side:** `gemini-2.5-pro` 404s with the identical
  "no longer available to new users" message while listed, and Google's own error text names
  `gemini-3.1-pro-preview` as the replacement. `gemini-3.7-flash` is listed and callable in
  principle but returned 503 "high demand" on every attempt across an hour — listed, alive,
  and still not usable. Measure availability, not just existence.

### 1b. `VIDEO_MODEL` moved to `gemini-3.1-pro-preview` (2026-08-22)
- Trigger: three production runs in a row died on `gemini-2.5-flash` returning
  **503 "this model is currently experiencing high demand"**. Not the user's file.
- Measured on the eval set against 2.5-flash:
  - **V1 (the repetition video the collapse rule exists for):** 2.5-flash still emitted four
    separate "add a question" steps; 3.1-pro collapsed them into one. That is the flagship
    failure mode, fixed by the model rather than by more prompt.
  - **Speed:** 34s vs 93s on V1, 33s vs 68s on V3.
  - **Input tokens:** ~a third of 2.5-flash's for the same video.
- So "let's bear the cost" turned out to cost nothing: faster, fewer tokens, better output.
- **`media_resolution=HIGH` was tried and rejected:** 262s vs 33s and 3x the tokens on V3,
  for a byte-identical step list. Do not reach for it as a quality lever.
- Eval scores are NOT comparable across this change. Re-baseline before reading any run
  against the 2.5-flash numbers (EVAL-PLAN §1).

### 1c. The eval could not see the screenshots — and had been unrunnable for a month
- `frame_relevance` was scored by a TEXT-ONLY judge given the article JSON and the
  ground-truth note. No image. Its own reasons said "plausibly" and "likely" because it was
  inferring from the timestamp — so the dimension was `timestamp_accuracy` under a second
  name, and the one thing users complain about ("the screenshots don't match") was
  unmeasured by the whole harness. `score_frame_validity` is not a substitute: decodes /
  not blank / not duplicated, nothing more.
- **Fix:** every step's frame is attached to the judge call as an image at `detail: "high"`,
  labelled by step number, SCOPED to `frame_relevance` alone — the ground truth stays the
  only authority for what happened, or scores stop being comparable across runs.
- Three drifts found the moment it was run again, all dating from migration 0027:
  the runner sent the product context FLAT (worker wants it nested under `product`) so every
  video 422'd; it uploaded to `{owner_id}/…` when objects are `{kb_id}/…` and `_start_run`
  403s otherwise; and `append_csv` keyed on `path.exists()`, so an existing-but-EMPTY
  results.csv never got a header and every later run died `KeyError: 'run_id'`.
  It also read `job["error"]` — a column dropped in 0020 — so every failure reported
  "pipeline error: None".
- **The eval runner is the "second copy" CLAUDE.md §10 warns about.** It broke silently on
  the day the request shape changed, and nothing noticed for a month, so every change since
  `collapse-v2` shipped unmeasured. Run it after touching the request shape, not just after
  touching a prompt.

### 1d. The screenshot was early, every single time (2026-08-22)
- With the frame-aware judge, baseline `frame_relevance` was **3.33** while
  `timestamp_accuracy` was a perfect **5.00**. Every timestamp landed inside its
  ground-truth window and the picture was still wrong.
- **All six misses were in the SAME direction — the frame precedes the action's effect:**
  the three-dots icon instead of the open menu, the Submit button instead of the
  confirmation, the Questions tab instead of Responses, an empty field instead of the typed
  text. Not one was late.
- **Cause was the prompt, not the model.** `TIMESTAMPS` said *"choose the moment the action
  is clearly visible on screen, not the moment just before it begins"* — which names the
  instant of the CLICK. A click's effect (menu opens, tab switches, dialog appears) lands a
  beat later, and it is the effect a reader needs to see. The model was obeying precisely.
- **Fix:** the block now describes the PICTURE rather than the event — screen must be
  settled, the named control visible, dialogs fully open, results actually on screen, and
  "when torn between two seconds, choose the LATER one".
- **Measured, same model and same everything else:** `frame_relevance` **3.33 -> 4.67**
  like-for-like on the six videos scored in both runs (V3 2->5, V5 3->5, V1/V6 4->5,
  V7 3->4, V8 4->4). No dimension regressed. So "more prompt is not free" did not bite here.
- Two misses survive, and both are sub-second problems the model cannot resolve at Gemini's
  1 fps video sampling: a field caught mid-word ("delet"), and a tab that switches between
  one sampled second and the next. Those need a deterministic settle-pick in ffmpeg, not
  more prompt.

### 1e. The settle-pick, and two lessons about measuring it (2026-08-22)
- `frames.pick_settled_second` nudges a step's timestamp forward, at most
  `SETTLE_WINDOW_SECONDS`, to the first moment the screen has stopped changing. One extra
  ffmpeg pass per step (~80ms, the same as the full-res extraction already being done),
  no model call. Forward only: backwards is the pre-action screen, which is the failure
  the prompt rewrite exists to fix.
- **A MEAN pixel difference is the wrong instrument and it silently certified nothing.**
  First version thresholded on mean abs difference < 1.0 over a 160x90 greyscale frame.
  A character landing in a text field moves ~20 of 14,400 pixels, i.e. a mean of 0.14 —
  so a threshold loose enough to ignore codec noise also ignores every real UI change.
  Measured over 210 sampled seconds of the eval set: mean shift 0.11s, max 0.4s. It did
  nothing. Now it COUNTS pixels that changed beyond `SETTLE_PIXEL_DELTA` and thresholds
  on the fraction — small local changes are the whole point, and a mean buries them.
- **The self-check certified it anyway, because the fixture was unrealistic.** It built a
  clip whose middle segment was a full-frame `testsrc`, which changes every pixel — the
  one thing a mean CAN see. A test that passes on a function measured to be inert is a
  test of the mechanism, not of the behaviour. The fixture now slides a small white box
  over black (a local luminance change, like a real edit) and asserts directly that a
  still frame and a changing one produce different numbers. `testsrc` was wrong twice
  over: it fills the frame, and its colour bars flatten to nearly uniform grey, so it
  scored 5 changed pixels out of 14,400.
- **What it is worth:** it fires on roughly one step in six, because most timestamps
  already land on a settled screen. When it fires it is decisive — V7 step 2 moved 5.0s
  to 5.3s, turning a screenshot of a GREYED-OUT Delete button with a no-entry cursor into
  one of the enabled button. Rare, valuable, and incapable of making things worse (forward
  only, capped, returns the input unchanged on every failure path).
- **The eval cannot measure it, and that is a fact about the eval.** Runs B and C used the
  IDENTICAL Stage 1 prompt and differed only in frame extraction, yet segmentation moved
  1.14 and faithfulness 0.57 between them — Gemini is non-deterministic and the harness is
  n=1 per video. So a change that shifts ~1 step in 6 by <=0.7s is below the noise floor by
  construction, and more runs will not rescue it. Read per-video DIRECTION across many
  videos, never a mean delta of less than about one point. The A->B prompt result stands on
  5 of 6 videos moving the same way, not on the mean.

### 2. Float timestamps produce garbage screenshots
- Asking the video model for `timestamp_seconds` as a float returned 0.05, 0.10, 0.14 for a
  15-second video — every screenshot was the opening frame.
- **FFmpeg was innocent** — confirmed it seeks correctly. The model was emitting a unit it
  doesn't use for video.
- **Fix:** Gemini's documented video convention is **MM:SS**. Stage 1 now asks for
  `"timestamp": "MM:SS"` and is given the video's total duration for grounding. Backend
  parses MM:SS → seconds.
- Result: 00:04 / 00:09 / 00:14 — dead center of each screen.
- **Field-name note:** model-facing blueprint field is `timestamp` (MM:SS string). Internal
  representation stays `timestamp_seconds`. **The final JSON contract is untouched.**

### 3. Async job pattern instead of a blocking POST
- `POST /api/generate` returns a `job_id` immediately; frontend polls
  `GET /api/jobs/{id}`.
- **Why:** a single blocking POST would force the four progress labels ("Analyzing your
  recording," etc.) to be a timer-driven lie. Polling lets them reflect the *actual* stage.
- **Cost:** ~25 lines + an in-memory dict. No DB. Consistent with the no-DB rule.
- This matters beyond the harness: those labels are load-bearing for the ~90-second-wait
  bounce problem in the UX spec.

---

## Output quality (observed — to refine)

### 4. The pipeline over-segments recurring/parallel actions
- **Observed:** in a video where the user defines several questions (Q1, Q2, Q3…), the
  output emitted "Define Q1," "Define Q2," "Define Q3…" as **separate steps**.
- **Why it's wrong:** these are the *same action repeated* over different items, not
  distinct steps a reader needs re-taught. A human writer collapses them: "Define each
  question (Q1–Q3) the same way — [the action], repeating for each."
- **Impact:** directly threatens A3 (article "usable as-is / minor edits"). A guide that
  re-explains the same action N times reads as machine-generated padding and forces manual
  cleanup — the exact editing burden the product exists to remove.
- **Status: FIXED at the prompt level (candidate fix 1) — on the current eval set.**
  Resolved by the Stage-1 collapse rule in `stage1-collapse-rule.md`, added to
  `draft_prompt`. See run `2026-07-15-collapse`: segmentation went to 5 on every scored
  video, and — the part that matters — the V3 canary (a clean linear flow of genuinely
  distinct steps) held at 5, so the rule taught *compression*, not *deletion*. The
  over-collapse inverse did NOT fire.
- **Fix chosen:** prompt-level (candidate 1), as predicted cheapest. Landed in ONE
  iteration, not the 3–4 budgeted. The over-collapse guard ("keep distinct same-verb steps
  separate; when unsure, keep separate") was included from the start and is what protected
  V3/V5.
- **Candidate fixes NOT taken:** the Stage-2 consolidation pass (candidate 2) was not
  needed and should stay unbuilt — a blind text-merge risks the exact over-collapse the
  prompt rule avoids.
- **⚠️ Caveat — "fixed" is scoped to the current set, not proven robust.** The set is six
  clips, all under ~50s, single generation each, and it was tuned against. Not yet
  confirmed: (a) stability across repeat runs on the same prompt (Gemini is
  non-deterministic; a clean single run can be partly luck), (b) behavior on a long
  recording — V4 has never run ("no video file on disk" across all three runs), and (c)
  manual screenshot-alignment verification, deferred. Treat repetition as *solved on the
  test set*, revisit if any of those three surfaces a regression.
- **Watch for the inverse:** don't over-collapse. Genuinely distinct steps that happen to
  share a verb ("Click Save" in two different contexts) must stay separate. Held on the
  current set; re-check on any harder video added later.

### 5. The draft prompt hallucinated steps — "reproduce what they see" was the vector
- **Observed:** the first eval baseline (`2026-07-15-baseline`) failed the **faithfulness
  hard gate (≤2) on 4 of 5 scored videos** — invented steps, not bad segmentation. V6
  invented a "Log in" step; V3 fabricated details; V1/V2 added steps that never happened.
  This — not repetition — was the real first problem the eval surfaced. The plan had been
  to fix repetition first; the data overrode that. **Read the scorecard before picking the
  fix.**
- **Why it happened:** the Stage-1 draft prompt said "break it into the sequence of actions
  a reader must take to **reproduce what they see**." That framing is subtly *generative* —
  it invites the model to write a plausible tutorial for the task, filling gaps with what
  *usually* happens (a login, a save), rather than reporting only what the video literally
  shows.
- **Fix (run `2026-07-15-faithfulness`):** two edits to `draft_prompt`, nothing else —
  (a) softened the phrase to "actions you actually observe being performed in the
  recording," and (b) added a grounding block: report only actions visibly performed; do
  not add steps that "should" happen or are typical; a shorter faithful article beats a
  complete-looking one with an invented step.
- **Result:** faithfulness went 1/2 → **5 on every video**, all four hard-gate failures
  cleared, V5 (already clean) held. Ship it — it's in the prompt now, ahead of the collapse
  rule.
- **Sequencing lesson:** hard gate before polish item. Faithfulness ≤2 is a release
  blocker; segmentation is not. Fixing faithfulness *first* also changed the diagnosis —
  once hallucination was gone, the remaining usability drag was cleanly attributable to
  segmentation, which made the collapse rule (#4) easy to target and read.
- **Not fully closed by this alone:** immediately after the faithfulness fix, V1 and V6
  still carried a lingering invented step (V6's "Log in" at seg 3). Those disappeared by the
  `collapse` run without a targeted faithfulness change — possibly genuine, possibly
  run-to-run variance. Another reason the stability re-runs (see #4 caveat) matter before
  calling hallucination fully solved.

---

### 6. Run-to-run variance is larger than the prompt effects we're measuring
- **Observed (2026-07-17, slice-1 build):** the SAME prompt, video (V1, 47s Spotify
  playlist), and context, run three times, emitted **7, 4 and 9 steps**. Nothing changed
  between runs but Gemini's non-determinism.
- **Why it matters:** this is the single-biggest threat to the eval loop's validity. #4's
  caveat (a) — "a clean single run can be partly luck" — is no longer a suspicion, it is
  measured. A 5→3 segmentation move between two prompt versions is **indistinguishable
  from noise** at n=1. The `2026-07-15-collapse` scorecard is one run per video, so its
  numbers carry error bars we never drew.
- **Consequence for EVAL-PLAN:** one run per video cannot support the ship rule. Either
  run each video N times and compare medians/ranges, or treat single-run deltas as
  directional only and never ship on a small one. This does NOT mean adding an eval
  framework (§7 still holds) — it means N runs of the same manual loop.
- **Also seen:** the 9-step run spontaneously emitted trivial-navigation steps
  ("Choose Playlist Type" at 00:02) — i.e. **V2's failure mode appeared with no prompt
  change at all.** Failure modes are partly probabilistic, not purely prompt-caused.
- **Status:** open. The cheapest next move is to re-run one video ~5x on the current
  prompt and record the spread, so future deltas can be read against a known noise floor.

### 7. Transient network failure is a normal event, not an exception
- **Observed:** two of five pipeline runs died on transport errors — a Storage
  `StreamReset` while uploading frames, and `WinError 10054` mid-Gemini-call.
- **Why:** Stage 1 pushes the whole video inline (13MB here) and the capture stage makes
  ~55 sequential Storage uploads over one HTTP/2 connection, across a ~90s job. Dropped
  connections are routine at that shape.
- **Cost of not handling it:** a blip discards a *completed* ~60s Gemini run — the user
  waits 90s and gets an error, and we pay for the tokens anyway.
- **Fix:** retry transport errors and 5xx on the Gemini call, and retry each frame upload
  individually. **Do NOT retry 4xx** — a bad key or a dead model id (see #1) must fail
  immediately rather than after three backoffs.

### 8. Storage `list()` is one level deep and pages at 100 — the trial purge was deleting no frames at all
- **Observed:** the day-37 hard delete did `store.list(kb_id)` and removed whatever came
  back. Against live Storage, **every frame of every KB survived the purge.**
- **Why:** there are no real directories. `list(prefix)` returns the *immediate* children,
  and frames are nested — `frames/{kb_id}/{article_id}/step-3.webp`, plus a `dense/`
  subfolder under that. So every entry returned for a KB's frames prefix is a pseudo-folder
  (`id: None`), and `remove()` on a folder name deletes nothing and reports no error.
- **Why nobody noticed:** `videos/` and `branding/` are flat, so those *did* get cleared.
  The buckets a human spot-checks by hand were the working ones.
- **Second bug in the same call:** `list()` defaults to `limit: 100` and does not
  auto-paginate, so even the flat buckets truncated for any KB with more than 100 objects.
- **Fix:** one recursive, paginated lister in `purge.py`, used by the trial sweep and by
  account deletion. An entry with a non-null `id` is a removable object; a null `id` is a
  prefix to descend into. Getting that discriminator backwards is silent in both directions
  — treat files as folders and you recurse forever, treat folders as files and you delete
  nothing, which is the version we shipped.
- **General rule:** a delete that reports success is not evidence anything was deleted.
  Verify object-store cleanup by listing the prefix afterwards, not by the absence of an
  exception.

---

### 9. `articles.updated_at` does not move when a step is written

The `articles_touch` and `steps_touch` triggers each bump their OWN row's `updated_at`.
Nothing propagates a step write up to its article. So:

- **`articles.updated_at` means "the article ROW changed"** — title, subtitle, visibility,
  slug, folder — and nothing else. It does not mean "this article changed".
- The editor's own load path already knew this without saying so: it computes whether a
  draft is ahead of what readers see as `max(article.updated_at, ...steps.updated_at)`.
  That `max` is the tell, and it is the only place the whole truth was assembled.

This matters well beyond the feature that found it. Any query that asks "what changed
recently" over `articles` alone is silently blind to the bulk of editing, because the bulk
of editing is step text. A "recently edited" list, a staleness sweep, an incremental
re-index or a cache invalidation built on that column would all look correct and be wrong
in the same direction.

**The stale-write guard (Phase 3) does not add a trigger for this.** A trigger on `steps`
that touched the parent would fire for every step the PIPELINE writes too — a generated
article is a dozen step inserts plus a dozen Stage-2 updates — turning one generation into
two dozen extra writes on the busiest table in the product, and doing it inside the path
that already has the tightest latency budget. Instead the editor CLAIMS the article row
before a step write: one conditional update that both proves nothing moved underneath and
stamps `last_edited_by`. Same guarantee, no change to what the table means, and the
pipeline is untouched.

If a trigger is ever added anyway, `worker/pipeline.py` needs looking at first.

### 10. A 45MB recording OOM-killed the worker — and the taxonomy could not see it (2026-08-29)

A user uploaded a 66-second, **45MB** screen recording. Every run that had ever succeeded
was under 9MB. Twice — once on 08-26, once on 08-29 — the job reached `detecting` and
stopped dead: `status='running'`, no `failure_code`, no `finished_at`, nothing in the row
to render. She sat on "Detecting each action" for hours.

**The cause is memory, not Gemini.** `Part.from_bytes` looks like it hands the SDK a
reference to your bytes. It does not: google-genai base64-encodes the payload (45MB ->
60MB), serialises the request JSON around it, and encodes that to bytes, while the caller
still holds the original. Peak is roughly **5x the file**, and production runs on Render's
**free tier — 512MB**. The kernel killed the process mid-call.

**The part worth remembering is the shape of the failure, not the arithmetic.** The whole
taxonomy (§10g) rests on classification happening at the source, inside an `except`. A
SIGKILL runs no `except`, no `finally`, and no `fail()`. It is the ONE way to fail that
`pipeline.run`'s catch-all cannot classify, so it lands in the exact state that catch-all
exists to prevent: a job at `running` forever. Everything downstream then fails to help —
`retention.sweep_timeouts()` is the backstop, but it is driven by `domain.run_loop()` in
the *same process*, so the death that created the stuck row also killed the only thing that
would have noticed. **A worker cannot be its own dead-man's switch.**

Fixes, in order of what each one buys:

- `gemini.video_part()` streams anything over `INLINE_VIDEO_MAX_BYTES` (16MB) through the
  **File API**, which reads from disk and holds none of it. Verified on the real 47.4MB
  file: ACTIVE in 66s, no spike. The inline path stays for normal recordings — it is one
  round trip fewer and covers everything we actually see.
- `pipeline._run` drops its own reference to the bytes the moment they are on disk. Holding
  it *next to* an inline Part was half the peak.
- `domain.run_loop()` wraps the tick. Each sweep already caught its own query failure, but
  only around the query — `sweep_source_videos` does a second lookup outside its `try`.
  Anything escaping cancels the task for the life of the process, and the process keeps
  answering `/health` the whole time: six sweeps dead, nothing to see.

**A memory ceiling is not an API ceiling, and only one of them is documented.** The 100MB
in the SPA and in the old `MAX_INLINE_BYTES` was Gemini's published inline limit, correctly
transcribed and completely irrelevant — we could never have reached it. Any limit copied
from a vendor's docs should be checked against what the box we run on can survive.

---

---

## Accepted holes (known, deliberately not fixed)

### A. Deleting an account resets the free tier
- Delete the account, sign up again with the same email, get another 3 free runs.
- The `jobs` ledger is append-only precisely to stop run farming (§10b: `article_id` is
  `on delete set null` so a ledger row outlives its article, and deleting an article never
  returns a run). Account deletion walks around all of that — `jobs.user_id` is
  `on delete set null` (§10e.4), so a deleted account's rows stop counting toward anyone.
- **Not worth defending at this stage.** The runs cost cents, and nobody knows the product
  exists. Building against it now is effort spent on an attacker who does not exist.
- **Worth knowing** because the cheapest later fix is a suppression table of hashed emails
  checked at signup — and that **has to be disclosed in the privacy policy at the time it
  is added**, since it means retaining a derivative of an address after we promised the
  account was deleted. Adding it quietly would turn a real deletion promise into a false
  one.
- Revisit only if abuse actually appears. `free_email_providers` already blunts the cheap
  throwaway-domain version.

---

## Open questions this raises

- Repetition-collapse is one instance of a broader theme: **the pipeline segments by
  literal action, not by what a reader needs to learn.** Worth watching for other versions
  of this (e.g. trivial navigation clicks emitted as full steps). Log them here as found.
