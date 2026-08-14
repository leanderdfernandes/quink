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
