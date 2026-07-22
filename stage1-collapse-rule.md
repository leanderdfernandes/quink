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
SEGMENT BY WHAT A READER NEEDS TO LEARN, NOT BY EACH LITERAL ACTION.

Collapse repeated actions. When the user performs the SAME action across a SET of
similar items — e.g. defining question 1, then question 2, then question 3; adding
several rows the same way; filling several similar fields — emit it as a SINGLE step
that names the repetition. Do not emit one step per item.

  Bad (over-segmented):
    Step 4: Define question 1
    Step 5: Define question 2
    Step 6: Define question 3
  Good (collapsed):
    Step 4: Define each question (1–3) the same way — [the action], repeating for each.

For a collapsed step, set its timestamp to the FIRST occurrence of the repeated action.

DO NOT OVER-COLLAPSE. Only merge actions that are genuinely the same action over a set of
like items. Two steps that happen to share a verb but occur in different contexts or on
different screens are DISTINCT — keep them separate. When unsure whether two actions are
"the same repeated" or "two distinct," keep them separate; a reader tolerates one extra
step far better than a missing instruction.
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
