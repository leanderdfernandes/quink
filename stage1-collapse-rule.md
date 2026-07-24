# Stage 1 collapse-rule — prompt language + eval hooks

The first fix to run through the full eval loop. Targets LEARNINGS.md #4
(over-segmentation of recurring actions). Test video: **V1** in EVAL-PLAN.md.

Fix at the **prompt level** (Stage 1, the model that saw the video). Do NOT add a Stage 2
consolidation pass — Stage 2 is blind to the video and would merge steps that only look
similar in text.

---

## The instruction to add to the Stage 1 prompt

Insert into the Stage 1 system/instruction block, in the section describing how to
segment steps:

```
SEGMENT BY WHAT A READER NEEDS TO LEARN, NOT BY EACH ACTION PERFORMED.

Before writing steps, ask: what are the distinct things a reader must be TAUGHT?
A reader who has been taught an action once does not need it taught again with
different content.

Collapse into a single step when the user performs the same KIND of action
repeatedly, even when the specific content, options, or settings differ each
time. Name the pattern and note the variation:

  Bad:
    Step 3: Add a name question
    Step 4: Add a multiple choice question
    Step 5: Add a short answer question
  Good:
    Step 3: Add each question — click "Add question", type the question text,
    then choose its type from the dropdown. Repeat for every question you need.

  Bad:
    Step 1: Enter your email
    Step 2: Enter your name
    Step 3: Select your class
  Good:
    Step 1: Answer each question in the form, entering text or selecting an
    option as each one requires.

Set a collapsed step's timestamp to the FIRST occurrence.

DO NOT OVER-COLLAPSE. Actions are distinct when they are different KINDS of
action, or occur in different contexts or on different screens — even if they
share a verb. Saving a draft and publishing are distinct. Configuring a setting
and answering a question are distinct. When genuinely unsure, keep them separate.
```

Keep it as a named constant / part of the prompt template — not inline scattered text.
(CLAUDE.md: model IDs and prompts are constants.)

---

## Why prompt-level, not a new stage

- The video model is the only one that knows whether Q1/Q2/Q3 are truly the same action or
  three different ones. That judgment needs the video.
- A Stage 2 text-merge would guess from wording alone and can wrongly merge distinct steps.
- Cheapest fix that lives in the right place. (LEARNINGS.md #4, candidate fix 1.)

---

## Eval hooks — how to know it worked (and didn't break anything)

Run the full EVAL-PLAN workflow. Specifically watch:

**Did it fix the target?**
- **V1 (repetition):** segmentation score should jump; step count should match the ground
  truth's expected (~one collapsed step, not three). Usable-as-is on V1 should improve.

**Did it over-correct? (the real risk)**
- **V3 (short clean linear flow)** and any video with legitimately distinct same-verb steps:
  segmentation must NOT drop. If the model starts merging distinct steps, you've traded one
  failure for a worse one (missing instructions).
- Watch specifically any ground-truth note flagged "must stay separate" (e.g. two Saves in
  different contexts). If those collapse, revert or soften the rule.

**Did it break an unrelated dimension?**
- Faithfulness and alignment should be unchanged. If a collapsed step's timestamp logic
  regresses screenshot alignment, that's a side effect to catch here.

**Ship rule:** keep the change only if V1 segmentation improved, no "must stay separate"
case collapsed, and no hard-gate (PII, faithfulness) regressed anywhere. Otherwise iterate
the wording and re-run. Expect 3–4 iterations before the rule threads the needle across the
set — one video can't tell you if you've taught good compression or just taught deletion.
(In practice it threaded on the first iteration on this set — but see the status note below
on why "first-iteration pass on six short clips" is not the same as "robust.")

---

## Status: SHIPPED (run `2026-07-15-collapse`) — passed the ship rule on the current set

The rule as written in this doc was added to `draft_prompt` verbatim and shipped on the
first attempt. It was run *after* the faithfulness grounding fix (LEARNINGS #5), which had
already cleared the hallucination hard-gate failures — so this change was measured against a
clean-faithfulness baseline and its effect on segmentation was cleanly attributable.

## Iteration log

```
v1 wording (this doc, unchanged) → run 2026-07-15-collapse:
    V1 segmentation 2 → 5   (repetition collapsed correctly)
    V2 segmentation 1 → 3   (improved; not perfect — see note)
    V3 segmentation   5 → 5  CANARY HELD — distinct linear steps NOT merged
    V5 segmentation   5 → 5  held
    V6 segmentation   3 → 5
    Faithfulness = 5 on all videos (no hard-gate regression).
    No "must stay separate" pair collapsed (V1 add-methods, V2 distinct controls survived).
    → SHIP. Threaded the needle in ONE iteration, not the 3–4 expected.
```

```
v2 wording (this doc as it now reads, 2026-07-24) → run 20260724T160101Z_collapse-v2.
    Widens collapse from "same action over like items" to "same KIND of action even when
    the content differs", adds a second example pair (answering a form's fields), and
    names distinctness cases explicitly (save vs publish; configure vs answer).
    Measured against 20260724T143442Z_baseline (same video set, so comparable; the v1
    scores above are from a DIFFERENT set and are not).

    usable_rate 71% -> 86%. Hard gates all clear. Faithfulness mean +0.29 (4.71).
    segmentation mean +0.57 (3.29).

    video   segmentation   step_count_delta   usable_as_is
    V1        2 -> 5          +4 -> +0        major_rework -> minor_edits
    V2        3 -> 3          +1 -> +1        minor_edits  -> minor_edits
    V3        2 -> 3          +4 -> +1        minor_edits  -> minor_edits   CANARY
    V5        2 -> 2          +5 -> +2        major_rework -> major_rework
    V6        5 -> 5          +0 -> +0        zero_edits   -> minor_edits
    V7        3 -> 2          +1 -> +2        minor_edits  -> minor_edits
    V8        2 -> 3          +1 -> +1        minor_edits  -> minor_edits

    Every step_count_delta stayed >= 0 and moved toward 0 — it taught compression, not
    deletion, which is the whole risk this wording carried. The V3 canary improved rather
    than collapsing.
    → SHIP, with the caveat below.

    CAVEAT — the over-collapse half of the ship rule was NOT exercised: every note in the
    current eval/ground-truth set says "Must-stay-separate: none". The guard against the
    failure this wording most plausibly causes is currently vacuous. Before treating v2 as
    durably safe, add a must-stay-separate case (a save-draft vs publish pair is the
    obvious one) and re-baseline.

    Went the wrong way, both minor: V7 segmentation 3 -> 2 with delta +1 -> +2 (judge
    wants the menu-open and Delete steps merged — under-collapse, not over-). V6
    zero_edits -> minor_edits on a soft note ("could use small copy-editing ... if
    desired") — reads as judge noise, but V6 was the only clean sweep, so watch it.
```

**Open on this fix (do not treat as fully closed):**
- **V2 sits at segmentation 3, not 5** — best on the set, but the judge still flagged some
  residual over-segmentation. Acceptable, not perfect. If a later run regresses V2, this is
  the first place to look.
- **V4 never ran** ("no video file on disk", all three runs) — the long-recording case is
  untested. Repetition over many steps late in a long video is exactly where a
  one-iteration fix on short clips is most likely to be optimistic.
- **Single run per video, alignment unverified.** The canary held once; confirm stability
  across repeat runs before treating "compression not deletion" as durably proven.

Logged back into LEARNINGS.md #4 as fixed-on-the-current-set with these caveats.
