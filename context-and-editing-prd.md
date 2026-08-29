# PRD — Context & AI Editing

**Status:** decisions locked, ready for implementation
**Companions:** `ux-spec-v2.md`, `pricing-spec.md`, `CLAUDE.md`
**Prototypes:** `quink-upload-to-generation-v3.html`, `quink-ai-editing-prototype-v2.html`

---

## 1. Problem

The journey map showed satisfaction rising through generation and collapsing at editing.
Two distinct causes, wearing the same costume.

**Generation.** The context form collects name, audience, tone, description — all *style*
levers. They change voice; they cannot change *what gets written*. The user senses this
("not sure what to add or why") and is correct: the fields do very little.

**Editing.** The pain is not typing effort. From the map: *"each text edit is evident but
what to change it to is what the tool is supposed to do."* That is a **knowing** problem,
not a typing problem — and a blank chat box does not solve a knowing problem.

**Strategic stake.** Editing is a retention feature, not an acquisition one. Generation wins
the signup; editing decides whether the help center is still alive at day 30 and 60 — B4,
the most important number in the product. And generic text rewriting is commodity: the
journey map has the user asking *"should I use another LLM to fix?"* Today the honest answer
is yes. The only editing Quink can do that a general chat model cannot is **editing against
the source video.**

---

## 2. Principles

1. **Never ask what the footage answers.** If Stage 1 can see it, it is not a question.
2. **Questions are earned by evidence.** Nothing is asked before the read. Every question
   cites what triggered it.
3. **Recognition, not composition.** Users cannot fill a blank field or a blank chat box.
   They answer a specific question instantly. Every prompt is a choice with a default.
4. **One output shape.** Context sharpens a help article. It never forks it into a release
   note, a tour, or a video doc — that is a different visual product and a different bet.
5. **Nothing blocks.** Every question has a default already applied. Answering improves the
   article; ignoring it costs nothing.
6. **Commodity edits are free; video-grounded edits are the product.**
7. **Suggestions, never silent overwrites.** Every AI change lands as a reviewable diff.
8. **All model output is data, never instruction.** See §7.

---

## 3. Scope

**In:** workspace-level product context · Stage-1 clarification questions (mid-run and
post-hoc) · source video retention · steerable selection editing · video-grounded step
correction · article-scope steer.

**Out (v1):** article-level chat rail as a persistent panel · step split and merge ·
cross-article terminology passes · alternate article formats.

---

## 4. Product context (workspace-level)

Context is a property of the **workspace, not the upload**. Filled once, reused by every
guide. This is the "general company and product context" layer; per-video specifics come
from questions (§5).

| Field | Required | Notes |
|---|---|---|
| `name` | Yes | The product's name. Not the KB name — a workspace can host a KB called "Acme Help" for a product called "Acme Dashboard". |
| `description` | No | What it does, who uses it, and the terms/features an article should get right. Free text. |
| `notes[]` | No | Repeatable `{title, body}` blocks — a glossary entry, a feature list, a roles breakdown. Same purpose as `description`, just chunked so the user isn't forcing unrelated facts into one paragraph. |

**Shared context budget, not a per-field cap.** `description` and every note share one
pool — `CONTEXT_CHAR_BUDGET` (default 6,000 chars / ~1,500 tokens), a `PLANS`-style named
constant, not a magic number. Rationale: unlike a Claude Projects conversation (read once
per chat), this context is injected into **every** generation call, so the ceiling protects
prompt size and per-run cost, not just UI tidiness. `name` is structural metadata and never
counts against the budget.

**⚠️ Drift note:** the current build shows Audience and Tone dropdowns on this screen. They
are **not in this spec** and were never in v2 — they're a v1 leftover (`ux-spec.md` Screen
1). Cut them. They move voice, not accuracy, and accuracy is the actual problem this
section exists to solve.

**Surfaces**
- **First upload:** inline in the upload card, labelled *"saved for every guide"*. Name is
  the only required field on the whole screen.
- **Settings → Product & Context tab:** editable any time once logged in. Full editor —
  name, description, notes list, budget meter. Shows `updated_at` and who.
- **Subsequent uploads:** collapsed summary line with an edit link. Never re-asked.

**Budget meter.** A progress bar under the notes list — *"62% of context used"* — teal
fill on the warm-neutral track, same visual language as the free-article counter (§6 of
`ux-spec-v2.md`). Amber past 90%. At 100%, new text is rejected client-side **and**
server-side; nothing is silently truncated. Deleting or trimming frees budget immediately,
live.

**Rules**
- Editing context does **not** retroactively regenerate existing articles. New guides use
  current context; a note in Settings says so.
- Permission: `can_edit_kb()` — same as article editing. *(Flag: confirm this shouldn't be
  `owns_kb()`. Context shapes every future article, which is arguably an owner concern.)*
- Context is passed to the pipeline as fenced data (§7), never as instructions.

---

## 5. Clarification questions

### 5.1 Admission tests

A candidate question ships only if it passes all three:

1. **Unknowable** — Stage 1 genuinely cannot resolve it from frames plus product context.
2. **Consequential** — the answer changes the written article. If both answers produce the
   same prose, do not ask.
3. **One-tap answerable** — bounded options derived from evidence, with a safe default.

Test 2 is the one that gets violated. A question that merely records metadata is a form
field wearing a costume.

### 5.2 The shipped set

Fixed enum. The model selects *which* fire and fills evidence slots. It cannot author new
question types.

| Type | Trigger | What the answer changes | Default if skipped |
|---|---|---|---|
| `variable_value` | Keystroke sequence into an input field | "enter your workspace name" vs "enter `acme-staging-01`" | Treat as variable |
| `flow_split` | Activity gap + navigation context change + no state carry-over between segments | One article vs two, and their titles | Keep as one |
| `element_name` | Interaction with a control whose label is not resolvable from the frame | Terminology throughout — and the term readers will search for | Describe by function |
| `missing_prerequisite` | Recording opens mid-state (already authenticated, data already present) | Adds or omits a "before you start" line | Omit |

**Cap: 3 questions per run**, ranked by impact (`variable_value` > `flow_split` >
`element_name` > `missing_prerequisite`). Overflow carries to the editor as cards.

### 5.3 Deliberately not questions

These fire the instinct to ask, and asking would be offloading our job onto the user:

- **Repeated-action collapse** (`Define Q1 / Q2 / Q3…`). We know the right answer. Fix in
  the Stage-1 collapse rule, do not ask.
- **Dead ends** (navigate in, immediately back out, no state change). Drop them silently.
- **Sensitive data on screen.** Not a question — default-on redaction with a review surface.
- **Tone and audience.** Style levers. They belong in product context, not per-video.

### 5.4 Timing — the pipeline waits

Questions appear when the **read completes**, not on a timer. Stage 2 (screenshot capture)
continues in the background during the pause — real work that does not depend on the
answers. Only Stage 3 (writing) waits, and the UI says so: *"Writing your guide — waiting
for you."*

This is what makes the pause comfortable. The user is not holding up the machine; they are
holding up the one stage that needs them.

- No timeout, no auto-advance. Writing starts **only** when the user presses the button.
- The button is present the whole time: *"Skip the rest and write it"* while questions are
  open, *"Write my guide"* once answered.
- Answered questions are listed with a **Change** link.
- Unanswered questions carry into the editor as one-tap cards — same question set, later
  placement.
- An optional *"Anything else about this recording?"* free-text field sits below the
  questions, collapsed. Capped at 600 chars, fenced as data.

---

## 6. Editing

### 6.1 Selection editing — steerable

One entry point, not a menu of verbs. Fixed verbs (Shorten / Simplify / Rewrite) decide for
the user what "better" means; users want to tailor.

- Select text → bubble toolbar (existing inline marks) + **"Change this…"**
- Opens an instruction field: *"Make this more… / say it as… / add…"*
- Quick words below (`shorter`, `plainer`, `more specific`, `explain why`) **fill the field
  rather than firing** — starting phrases the user extends, not decisions made for them.
- Result lands as a diff card carrying the instruction that produced it, quoted.

### 6.2 Diff verbs

**`Keep` · `Try again` · `Discard`.** Never "Keep mine" — the user did not write the
original; we did.

- **Try again** reopens the instruction pre-filled. Rerolling blindly is a slot machine;
  editing the ask is steering.
- **Refinement chips sit on the result, not the trigger** (`shorter still`, `less formal`,
  `put the detail back`, `name the button`). Nobody gets the instruction right first time,
  and re-articulating from scratch is what makes AI editing feel like work.
- Multiple pending changes get a sticky **Keep all / Discard all** bar.

### 6.3 Video-grounded correction — the hero

**"Check the recording"** on a step re-reads the source video for that step's time window
and proposes a correction.

- Diff card shows two extra lines a general model cannot produce: the **timestamp range**
  and **what was observed** ("The button label read 'Save and publish', and it was disabled
  until an address was in the field").
- Verbs here are **`Keep` · `Discard` only.** A factual correction is not a matter of taste,
  so "Try again" would be incoherent. This asymmetry is intentional.
- It is the only accented item in the step menu. Everything else is neutral. Hierarchy tells
  the user which action is the product.

### 6.4 Article-scope steer

Same instruction input, wider scope. A collapsible bar above the article — not a persistent
side rail.

Rejected: the rail. Usage is **bursty and terminal** (used once, near the end, then never),
so a permanent 340px panel produces an empty thread staring at the user and quietly reframes
Quink as a chatbot. The article stays the only canvas.

Article-scope replies **state a plan before changing anything** — a short list of which
steps will change and how — then land the diffs inline. Without it, a multi-step edit feels
like the article shifted underneath the user.

*Revisit only for cross-article work ("apply this terminology to all fourteen guides"),
which is a workspace-level surface, not this one.*

### 6.5 Cut: split and merge

Merge exists to fix **our** over-segmentation, not a user need. Shipping permanent UI to
paper over a pipeline defect is the wrong trade, and "merge steps 4 and 5" is a structural
operation when the user's actual thought is *"this is too broken up"* — an instruction,
which belongs in the steer channel.

Drag-to-reorder stays. Side effect: the step menu drops to two items, making **"Check the
recording" unmissable.**

---

## 7. Prompt injection & trust boundary

**Screen recordings are untrusted input.** A recording can contain a visible email, chat
window, or document displaying text shaped like an instruction. The reverse-demo channel
makes this concrete: we process *other companies'* videos, unreviewed, as a matter of course.

### Trust classification

| Source | Trust | Handling |
|---|---|---|
| Frame content (OCR, vision) | **Untrusted** | Fenced data. Never instruction. |
| Product context | User-supplied data | Fenced, capped, escaped. |
| Free-text "anything else" | User-supplied data | Fenced, capped 600 chars. |
| Question answers | Structured | Stored as enum values, never as prose. |
| Steer instructions | User-supplied data | Fenced, scoped to the target block. |
| Article body during an edit | **Untrusted** | May contain text injected via the video. |

### Controls

1. **Structured output only.** Every model call returns JSON against a schema. Non-conforming
   output is **rejected, not repaired**. Model output never becomes an instruction.
2. **Fenced, labelled untrusted blocks.** All untrusted content sits inside delimited blocks
   with an explicit preamble stating it is data to be described, never followed.
3. **Questions come from a closed enum.** The model may emit only a `question_type` from
   §5.2 plus evidence slots. It cannot author question text. This is the critical control:
   a question is a UI surface a trusting user is about to act on, so a video that could
   inject an arbitrary question is a phishing vector.
4. **No model text is rendered verbatim.** The UI renders our copy templates; the model
   supplies slots only. Every slot is escaped and length-capped (values ≤64 chars, option
   labels ≤32).
5. **Options are enum or short extracted literal.** Never free prose.
6. **Edits are scoped.** A steer edit receives only its target block and returns a
   replacement for that block. Output length is ceilinged against input length.
7. **No tools, no network, no URLs.** The pipeline model has no tool access. URLs appearing
   in article text are rendered as plain text, never auto-linked.
8. **Answers persist as structured values** (`variable_value: "variable"`), never as
   recounted prose.
9. **Nothing reaches the database straight from model output.** Validation sits in between,
   always.

**Failure mode to design against:** the worst outcome is not bad prose — the user reviews
prose. It is a **fabricated question or a fabricated "observed in your recording" claim**,
because both carry our authority and the user will tap Keep. Controls 3, 4 and 5 exist
specifically for that.

---

## 8. Metering

**No credit system.** Gamma meters because generation is their cost; ours is not shaped
that way, and a second counter would break the rule about capping cost rather than value.

- **Text edits are ~$0.0002.** Unlimited on every tier. A counter here manufactures anxiety
  over nothing and makes the product feel stingy exactly when it should feel generous.
- **Video re-reads cost real money** — model call plus retained storage. The meter for them
  already exists: **retention is the meter.** Free keeps the source video briefly, so
  "Check the recording" is available for a window and then quietly is not. Paid keeps it for
  the life of the article.

Honest, because it maps to an actual cost rather than an invented unit. Runaway protection
stays in infrastructure — the daily spend circuit breaker plus an invisible per-article rate
limit normal use never touches.

**One meter in this product. Never two.**

---

## 9. Data model changes

| Change | Notes |
|---|---|
| `kbs.product_context jsonb` | `{name, description, updated_at, updated_by}` |
| `jobs.clarifications jsonb` | Stage-1 emitted questions, validated against the §5.2 enum |
| `jobs.clarification_answers jsonb` | Structured answers |
| `jobs.awaiting_input boolean` | Drives the paused state and the poll loop |
| **Video retention reversed** | Source video now retained. `video_purged_at` becomes retention-policy-driven, not post-processing. Storage cost and the free-tier window need numbers. |
| `articles.open_clarifications jsonb` | Unanswered questions carried into the editor |

---

## 10. Success measures

| Question | Measure |
|---|---|
| Do questions get answered? | % of runs with ≥1 answered (target: baseline first) |
| Do they improve output? | A3 — % rated usable as-is / minor edits, before vs after |
| Is video-grounded editing the differentiator we think? | "Check the recording" invocations per published article |
| Does editing drive retention? | B4 — % of help centers still edited at 30 / 60 days |
| Does the pause hurt? | Drop-off between read-complete and write-start |

Instrument the last one from day one. If people abandon at the pause, the whole §5.4
mechanic is wrong and we need to know fast.

---

## 11. Open questions

1. **Three questions or two?** Three may be one too many for a first-timer. Run it as
   config, not a constant.
2. **Free-text placement.** Currently below the questions and easy to miss. Above may serve
   the founder who wants to type a paragraph.
3. **Context permission** — `can_edit_kb()` or `owns_kb()` (§4).
4. **Free-tier retention window** — the number that sets when "Check the recording" expires.
5. **Question copy tone** — v3 prototype is warmer and tighter than v2; still needs a read
   against real users rather than our own taste.
