# First run

The first ninety seconds of a brand-new account, as five live screens.

| # | Screen | The thing it is arguing |
|---|---|---|
| 1 | Drop | A first-run upload page is not the returning-author one. No KB context card, no folder picker — there is no help center yet. What replaces them is disclosure: the free-tier limit and the 30-day retention promise, both said before the file is committed. |
| 2 | Sign up | **The wall fires after upload and before generation** (ux-spec §2, LOCKED) — the pipeline never runs for an unverified session. That only survives if signup is feather-light: one tap, no card, no password, and a file pill that never stops saying the recording is loaded and waiting. An *open* padlock: unlocking, not blocking. |
| 3 | Check email | The magic-link branch. Says plainly that the file is held on this device and nothing has uploaded yet. |
| 4 | Building | The core screen. Two columns, neither a spinner: on the right eight step slots appear as actions are detected and fill with frames as they are captured; on the left, one question at a time. The stage row reads "Waiting on your answers" on the *write* stage only — the user can see that answering is not holding up the machine. |
| 5 | Editor | Two kinds of question live here. **Carried-over clarifications** — the ones the run never got to — arrive as a card above the article; answering rewrites one step. **Steer** is the question the *user* asks: every step has a field, pre-filled rather than blank, and the result comes back as a diff with the instruction quoted above it. |

## The three rules the question UI is built on

Carried from `web/src/editor/ClarifyPanel.tsx` and `web/src/lib/clarifications.ts`:

1. **Nothing blocks.** The write button is present the whole time — "Skip the rest and write it" while questions are open, "Write my guide" once they are done. Never disabled, never hidden behind the last question.
2. **One at a time, evidence first.** A list of three is a form; one card with the reason above it is a conversation. The default option is the primary button, because it is what happens if the user walks away — the screen should agree with the machine. The fallback sentence is *in* the card, not a tooltip: "nothing blocks" is only true if you can see what doing nothing does.
3. **Every word is a template with holes.** The model supplies a validated type (`variable_value`, `missing_prerequisite`, `element_name`, `flow_split`) and slot values, nothing else. A recording that could author its own question is a phishing vector.

## What is real and what is placeholder

Every user-facing sentence in `firstRunData.jsx` is either verbatim from `config.ts` (`COPY.wall*`) and `clarifications.ts`, or written to those templates with this recording's slots filled in. No product frames were supplied, so **every screenshot is an honest grey placeholder** labelled with its timestamp — the timestamps are the point: they are what the step spine can show before any prose exists, and what makes the wait legible.

The bottom jump rail is kit chrome, not product chrome. It is there so a reviewer can land on any moment without waiting out the pipeline.
