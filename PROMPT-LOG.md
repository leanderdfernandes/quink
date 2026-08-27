# PROMPT-LOG.md — every change to a pipeline prompt, with a prediction made first

One entry per change to `worker/prompts.py`. **Hypothesis before the first run, verdict
after.** Writing the prediction down first is the whole point: a prompt change always looks
like an improvement once you have read the output it produced.

Not `eval/prompt_log.md` — that file is an ARTIFACT the eval runner appends the prompt text
to, so a run can be reproduced. This one is written by a person and holds the reasoning.

Related: `EVAL-PLAN.md` (what the eval measures), `LEARNINGS.md` (traps not to re-enter),
`stage1-collapse-rule.md` (the one block quoted verbatim and not to be reworded).

---

## 2026-08-26 — Stage 1 emits clarification questions (`CLARIFY_RULE`)

**Change.** A new block in `DRAFT_PROMPT` asking Stage 1 to emit `clarifications` alongside
the steps: a closed four-value enum, evidence slots, two-to-four options and a default. The
model is explicitly told it does **not** write the question text. `OUTPUT` gains the
`clarifications` array with an example. Nothing else in the prompt moved.

**Hypothesis.**

1. **The block will cost some segmentation quality.** It adds ~40 lines to a prompt whose
   most valuable instruction — the collapse rule — is now further from the output spec.
   More prompt is not free; the PII and injection blocks are the standing reminder.
   *Prediction: step counts drift up slightly on the videos the collapse rule works hardest
   on (V1, V5). If `step_count_delta` moves away from 0 on those, the block moves to the
   very end of the prompt, after OUTPUT, before it is reworded.*
2. **The model will over-ask.** Admission test 2 (consequential) is the one that gets
   violated, and a model asked "is anything ambiguous?" will find something.
   *Prediction: more runs produce the cap than produce zero, and `missing_prerequisite` is
   the most common type — it is the easiest to justify and the least consequential.*
3. **Type discipline will hold; slot discipline will not.** The enum is short and named in
   the output example, so out-of-enum types should be rare. Slots are where the model will
   write a sentence instead of a label, because "field_label" invites a description.
   *Prediction: near-zero enum violations; the commonest drop reason is a slot over 64
   characters.*
4. **Nothing here can reach a user unvalidated**, regardless of any of the above.
   `worker/clarify.py` drops rather than repairs, and its self-check covers an invented
   type, a case-variant of a real one, a float timestamp, an out-of-range `step_index`, an
   over-length slot, a newline in a slot, and a missing default. That property does not
   depend on the model behaving.

**Verdict.**

*Four videos probed directly against Stage 1 (`gemini-3.1-pro-preview`, live, one call each,
no article written). No scored eval run — see "still open" below.*

| Video | Length | Steps | Offered | Asked | Dropped |
|---|---|---|---|---|---|
| V6 | 0:46 | 1 | 0 | 0 | 0 |
| V3 | 0:36 | 3 | 0 | 0 | 0 |
| V5 | 0:50 | 2 | 0 | 0 | 0 |
| V2 | 1:10 | 6 | 2 | 2 | 0 |

**2 — over-asking: REFUTED, and the opposite is the risk.** Three of four recordings
produced no questions at all, and they were right not to: a 36-second "create a task in
Notion" clip contains nothing a reader could be confused by. The only video that asked is
the only one where somebody typed sample content into a field — V2's *Food Review* title and
*How was the food today?* question text — which is `variable_value` doing precisely the job
PRD §5.2 describes. `missing_prerequisite`, predicted to be the commonest type, never fired
once. The live worry is now the reverse: **the pause may almost never happen**, which makes
§5.4's whole mechanic rare rather than intrusive. That is the better failure of the two, but
it is not the one that was designed against, and it means the drop-off measure (§10) will
take a long time to collect a signal.

**3 — type and slot discipline: BOTH HELD.** Zero drops across four videos. Types were
in-enum, the fixed option ids came back spelled exactly (`variable` / `literal`), evidence
resolved to real steps, and slots were short literal labels — "Form title", "Question text" —
nowhere near the 64-character cap. The predicted failure (a sentence in a slot) did not
appear. Note this is what the prompt asks for and not proof the validator is unnecessary:
the validator's job is the adversarial case, and a screen recording that carries an attack
was not among these four.

**4 — validation independent of model behaviour: unchanged and self-checked.**
`python worker/clarify.py` covers the drops directly.

One thing to watch that was not predicted: **V2 asked two `variable_value` questions in one
run**, on two different fields. Both pass admission test 2 individually — the answers change
different steps — but two near-identical cards in a row is a worse experience than one, and
if this repeats, the fix is a rule that the same type fires at most once per run, not a
lower cap.

**Still open, and this entry is not finished until they are answered:** the full eval
(`eval/run_eval.py`) has NOT been run against this prompt, so hypothesis 1 — whether the
block costs segmentation — is untested, and every eval number in the repo predates it.
Re-baseline before reading any score against the older runs (EVAL-PLAN §1). A fifth probe
(V1, the repetition recording) was started twice and abandoned after ~20 minutes without
returning; worth understanding on its own before the eval runs, since V1 is the video the
collapse rule exists for and the one most likely to show hypothesis 1.
