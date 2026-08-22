# GENERATION-GAPS.md — what generation still gets wrong

Written 2026-08-22, after the frame-quality work. Companion to `EVAL-PLAN.md` (how we
measure) and `LEARNINGS.md` (traps already paid for). This file is the open list: what is
still wrong with the article a user gets, and what to do about it, worst first.

**Read the measurement caveat before trusting any number here.** See §0.

---

## 0. The eval has a noise floor of about one point

Runs B and C on 2026-08-22 used the **identical** Stage 1 prompt and differed only in frame
extraction — which runs *after* Stage 1 and cannot touch text. Between them:

| dimension | moved by |
|---|---|
| segmentation | 1.14 |
| faithfulness | 0.57 |
| instructional_quality | 0.57 |

That is Gemini non-determinism at n=1 per video. Consequences, and they are not optional:

- **Never read a mean delta under ~1 point as a result.** It is noise.
- **Read per-video direction across the set instead.** The prompt change is credible because
  5 of 6 videos moved the same way and the judge's stated reasons changed in kind, not
  because the mean moved 1.24.
- A change touching a minority of steps by a small amount **cannot be measured at all** by
  this harness. The settle-pick is in that category by construction.
- The fix is n≥3 runs per config and comparing medians. Nobody has done that yet; it costs
  ~15 min and ~$0.11 of Gemini per run. **Do it before the next prompt change**, or the next
  prompt change is another judgement call dressed as a measurement.

---

## 1. Open gaps, worst first

### 1.1 The frame can still show the wrong SCREEN (not just the wrong instant)
**Status: open. The biggest remaining frame problem.**

V8 step 1 says "Open the Responses tab" and the screenshot shows the **Questions** tab. The
timestamp is inside the ground-truth window, so `timestamp_accuracy` scores 5. The tab
switches somewhere in the following second and the model named the second before it.

The settle-pick cannot fix this: at that second the screen is genuinely still — it is still
on the *old* tab. Nothing is moving, so there is nothing to nudge off.

**Suggested fix, cheapest first:**
1. Extend the settle rule to a *change-then-settle* rule: if a significant change occurs
   anywhere in `[t, t+W]`, prefer the first settled frame **after** that change rather than
   before it. Today the search returns the first settled candidate outright, which is the
   pre-change screen. This is a ~10 line change to `pick_settled_second` and reuses the
   scoring already there.
2. Only if that is not enough: ask Stage 1 for a `shows` field per step — one short phrase
   describing what the screenshot must contain — and pick the candidate frame that best
   matches it. That needs a vision call per step and **breaks the two-model rule** in
   CLAUDE.md §5, so it is a last resort, not a next step.

### 1.2 Segmentation is the least stable dimension
**Status: open, and partly a measurement problem.**

Across three runs on the same prompt, V3 scored 5, 5, 2 and V6 scored 2, 5, 2. The
collapse rule (`stage1-collapse-rule.md`) is tuned, but the model applies it inconsistently
run to run — most visibly on "is this trivial click its own step".

**Suggested fix:** nothing prompt-shaped until §0 is done. Chasing a segmentation score at
n=1 is chasing noise. After n≥3 baselining, the specific target is trivial-navigation
clicks becoming steps (V2, V7, V8 all show it).

### 1.3 The over-collapse guard has never been tested
**Status: open, inherited.**

`stage1-collapse-rule.md` warns about it and `prompts.py` repeats it: **no ground-truth note
in the eval set carries a `Must-stay-separate` pair.** So the failure the v2 collapse
wording most plausibly causes — merging two genuinely distinct actions that share a verb —
is unmeasured. v2 shipped on that basis and is still running.

**Suggested fix:** add one video, or one `Must-stay-separate` annotation to an existing
ground-truth note. Cheap, and it closes a known blind spot rather than a suspected one.

### 1.4 V9 (prompt injection) has never run
**Status: open, inherited.**

`INJECTION_RULE` has been in the prompt since 2026-07-17 and is described in its own comment
as "untested — treat this as a guard, not a proven defence". EVAL-PLAN lists V9 as a Should.
V8's ground truth happens to contain an injection attempt and passes, which is weak evidence
and not the designed test.

**Suggested fix:** record V9. It is a security dimension on text we publish publicly.

### 1.5 One frame per step, always
**Status: open, by design, worth revisiting.**

A collapsed step ("add each question — repeat for every question you need") gets exactly one
screenshot, of the first occurrence. That is correct per the collapse rule but under-serves
the reader on precisely the steps that carry the most instruction.

**Suggested fix:** none yet. Flagging it because the collapse rule and the one-frame rule
were designed separately and interact. The editor's step block is `{heading, body, image}`
singular, so this is a schema change, not a prompt change — do not start it casually.

### 1.6 No second frame source when the recording is gone
**Status: open, known, documented in CLAUDE.md §10f.**

Past the 7-day sweep, or after first publish, the recording is deleted and the frame picker
runs entirely off the 1fps dense set. That is fine today. It becomes a gap the moment anyone
reintroduces a client-side `<video>` scrubber, which must degrade to the filmstrip **in the
same commit**.

### 1.7 `gemini-3.1-pro-preview` is a preview model id
**Status: accepted risk, needs a watch.**

It is the model Google's own 404 text names as the replacement for `gemini-2.5-pro`, and it
is measurably better on the collapse case. But preview ids get retired, and LEARNINGS #1 is
the story of exactly that happening twice. There is no fallback: a retired id fails every
generation with `model_bad_output`.

**Suggested fix:** when it graduates, move to the stable id. Until then, this is one line in
`worker/config.py` and the failure is loud, so no code is warranted — but somebody should
know it is a preview id.

---

## 2. Things deliberately NOT worth doing

Recorded so they do not get re-proposed.

| Idea | Why not |
|---|---|
| `media_resolution=HIGH` on Stage 1 | Measured: 262s vs 33s and 3x the tokens on V3, for a byte-identical step list. |
| Higher video sampling fps | Cost scales linearly with frames and the timestamps were already inside their windows — the problem was *which* frame, not *which second*. |
| Lossless WebP frames | Measured: 2.6x encode time and 2x the bytes, on a pass whose bottleneck is already uploading ~100 objects. Quality 90 captures nearly all of it. |
| `-preset text` on WebP | Measured: SSIM difference in the fourth decimal. Not worth a config line. |
| A third model call to pick frames | CLAUDE.md §5. The video model drafts, the cheap model polishes, code does everything deterministic. §1.1 option 2 is the only scenario worth reopening it for, and only after option 1 fails. |
| Backwards search in the settle-pick | Backwards is where the pre-action screen lives, which is the exact failure the 2026-08-22 prompt rewrite fixed. |

---

## 3. Suggested order of work

1. **n≥3 eval baselining** (§0). Everything else is unfalsifiable until this exists.
2. **Change-then-settle** (§1.1 option 1). Small, targets the biggest remaining frame defect,
   cannot regress if it keeps the current "never move a settled frame" behaviour as fallback.
3. **A `Must-stay-separate` ground-truth pair** (§1.3). Closes a live blind spot for the cost
   of an annotation.
4. **Record V9** (§1.4). Security dimension, currently unmeasured.
5. Revisit segmentation (§1.2) — only after 1.
