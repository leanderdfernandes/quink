import { useState } from 'react'
import {
  CLARIFICATION_NOTE_MAX,
  acceptsFreeText,
  answerLabel,
  defaultOption,
  evidenceFor,
  fallbackFor,
  questionFor,
  type Clarification,
} from '../lib/clarifications'

// The pause (PRD "Context & AI Editing" §5.4).
//
// Screenshots keep landing behind this panel; only the WRITE stage is waiting. That is what
// makes the pause comfortable and it is why the stage list says so out loud: the user is not
// holding up the machine, they are holding up the one stage that needs them.
//
// THREE RULES THIS COMPONENT EXISTS TO KEEP:
//
//   1. Nothing blocks. The button is present the whole time — "Skip the rest and write it"
//      while questions are open, "Write my guide" once they are done. Every question already
//      has a default applied, and the card says what it is.
//   2. One question at a time, evidence first. A list of three is a form; one card with the
//      reason above it is a conversation. Answered ones move to a short list with a Change
//      link, so nothing is a dead end.
//   3. Every word here comes from lib/clarifications.ts. The model supplied a type and some
//      slot values and nothing else — see that file for why that is the load-bearing control
//      and not a matter of taste.

type Props = {
  clarifications: Clarification[]
  // Screenshots landing behind the panel, so "take your time" is a fact on the screen
  // rather than a claim.
  shotsDone: number
  shotsTotal: number
  busy: boolean
  onSubmit: (answers: Record<string, string>, note: string) => void
}

const CheckIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 12.5l5.5 5.5L20 6.5" />
  </svg>
)

export default function ClarifyPanel({
  clarifications,
  shotsDone,
  shotsTotal,
  busy,
  onSubmit,
}: Props) {
  // Index -> the value we will send. An index that is absent was never answered; one mapped
  // to null was explicitly skipped, which is a different thing on screen (it shows in the
  // answered list as the fallback) and the same thing to the pipeline (nothing is sent).
  const [answers, setAnswers] = useState<Record<number, string | null>>({})
  const [note, setNote] = useState('')
  const [typed, setTyped] = useState('')

  const next = clarifications.findIndex((_, i) => !(i in answers))
  const current = next === -1 ? null : clarifications[next]
  const answered = clarifications
    .map((c, i) => ({ c, i }))
    .filter(({ i }) => i in answers)

  function answer(index: number, value: string | null) {
    setAnswers((prev) => ({ ...prev, [index]: value }))
    setTyped('')
  }

  function submit() {
    // Skips are dropped rather than sent as a sentinel: "no answer" and "the default" must
    // be the same thing to the pipeline, or the default stops being a default.
    const payload: Record<string, string> = {}
    for (const [index, value] of Object.entries(answers)) {
      if (value !== null) payload[index] = value
    }
    onSubmit(payload, note.trim())
  }

  return (
    <div className="clar">
      <p className="clar-found">
        {shotsTotal > 0 ? (
          <>
            Got <b>{shotsTotal} steps</b>.{' '}
          </>
        ) : null}
        {clarifications.length === 1
          ? 'One thing I couldn’t work out on my own.'
          : `${clarifications.length} things I couldn’t work out on my own.`}
      </p>

      {answered.length > 0 && (
        <>
          <p className="clar-grp">Answered</p>
          <div className="clar-done">
            {answered.map(({ c, i }) => (
              <div className="clar-ansd" key={i}>
                <i aria-hidden>
                  <CheckIcon />
                </i>
                <p>
                  {answers[i] === null ? fallbackFor(c) : answerLabel(c, answers[i]!)}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setAnswers((prev) => {
                      const nextState = { ...prev }
                      delete nextState[i]
                      return nextState
                    })
                  }
                >
                  Change
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {current && (
        <>
          <p className="clar-grp">
            {next + 1} of {clarifications.length}
          </p>
          <div className="clar-q">
            {/* Evidence FIRST. It is what makes the question feel earned rather than
                generic — and it is the one part a user can check against the recording. */}
            <span className="clar-ev">
              {evidenceFor(current)} · {current.evidence.timestamp}
            </span>
            <h3>{questionFor(current)}</h3>

            <div className="clar-opts">
              {current.options.map((o) => (
                <button
                  type="button"
                  key={o.id}
                  // The default is the primary. Not because it is more correct, but because
                  // it is what happens if they walk away — the screen should agree with the
                  // machine about that.
                  className={`clar-opt${
                    o.id === defaultOption(current)?.id ? ' primary' : ''
                  }`}
                  onClick={() => answer(next, o.id)}
                >
                  {o.label}
                </button>
              ))}
              <button type="button" className="clar-skip" onClick={() => answer(next, null)}>
                Not sure
              </button>
            </div>

            {acceptsFreeText(current) && (
              <div className="clar-other">
                <input
                  type="text"
                  placeholder="Or your own word…"
                  value={typed}
                  maxLength={64}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && typed.trim()) {
                      e.preventDefault()
                      answer(next, typed.trim())
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={!typed.trim()}
                  onClick={() => answer(next, typed.trim())}
                >
                  Use
                </button>
              </div>
            )}

            {/* Says the fallback IN THE CARD, not in a tooltip. "Nothing blocks" is only
                true if the person can see what happens when they do nothing. */}
            <p className="clar-fb">Not sure? {fallbackFor(current)} You can change it later.</p>
          </div>
        </>
      )}

      {!current && (
        <p className="clar-found">That’s everything I needed.</p>
      )}

      <details className="clar-more">
        <summary>Anything else about this recording?</summary>
        <textarea
          placeholder="Brand new feature — nobody has seen this screen before."
          value={note}
          maxLength={CLARIFICATION_NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
        />
      </details>

      {/* PRESENT THE WHOLE TIME (PRD §5.4). Never disabled, never hidden behind the last
          question: the pause has to be leaveable at any moment or it is a gate. */}
      <button
        type="button"
        className={`btn${current ? ' btn-ghost' : ''}`}
        disabled={busy}
        onClick={submit}
      >
        {busy ? 'Starting…' : current ? 'Skip the rest and write it' : 'Write my guide'}
      </button>

      {shotsTotal > 0 && shotsDone < shotsTotal && (
        <p className="clar-shots">
          Screenshots are still capturing — {shotsDone} of {shotsTotal}. Take your time.
        </p>
      )}
    </div>
  )
}
