import {
  answerLabel,
  defaultOption,
  evidenceFor,
  fallbackFor,
  questionFor,
  type Clarification,
} from '../lib/clarifications'

// Questions that never got asked during the run — over the cap, or skipped — carried into
// the editor as one-tap cards (PRD §5.4).
//
// They only became buildable with the steer channel. A card here has to DO something when
// tapped, and until §6.1 landed there was nothing for it to do: the run is long over, so
// there is no pipeline to feed, and an answer that changed nothing would be a form field
// wearing a costume — exactly what admission test 2 exists to reject.
//
// So a tap composes an instruction from OUR template and sends it through the same steer
// call as everything else. The result lands as a diff on the step the question's evidence
// points at, with the same Keep / Try again / Discard. No silent-write path here either.

type Props = {
  clarifications: Clarification[]
  busy: boolean
  onAnswer: (c: Clarification, optionId: string) => void
  onDismiss: () => void
}

// The instruction a tapped option turns into. OURS, like every other word the model is
// given about an answer — the option id is a key, never prose (§7 control 8).
export function instructionFor(c: Clarification, optionId: string): string | null {
  const s = c.slots ?? {}
  if (c.type === 'variable_value') {
    return optionId === 'literal'
      ? `Keep "${s.typed_value ?? ''}" exactly as written — every reader enters that same value.`
      : `Write this so the reader supplies their own value instead of "${s.typed_value ?? ''}".`
  }
  if (c.type === 'flow_split') {
    return optionId === 'split'
      ? 'Make the title and subtitle describe the whole sequence, not only the first task.'
      : null
  }
  if (c.type === 'missing_prerequisite') {
    return optionId === 'add'
      ? `Add one short clause to the subtitle saying readers need this first: ${s.prerequisite ?? ''}.`
      : null
  }
  if (c.type === 'element_name') {
    if (optionId === 'by_function') return null
    const chosen = c.options.find((o) => o.id === optionId)?.label ?? optionId
    return `Call the control described as "${s.element_description ?? ''}" by its name, "${chosen}", wherever this step refers to it.`
  }
  return null
}

export default function OpenClarifications({
  clarifications,
  busy,
  onAnswer,
  onDismiss,
}: Props) {
  if (!clarifications.length) return null
  return (
    <div className="opc">
      <div className="opc-hd">
        <span>
          {clarifications.length === 1
            ? 'One thing I couldn’t work out'
            : `${clarifications.length} things I couldn’t work out`}
        </span>
        <button type="button" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      {clarifications.map((c, i) => (
        <div className="opc-q" key={i}>
          <span className="clar-ev">
            {evidenceFor(c)} · {c.evidence.timestamp}
          </span>
          <p className="opc-ask">{questionFor(c)}</p>
          <div className="clar-opts">
            {c.options.map((o) => (
              <button
                type="button"
                key={o.id}
                className={`clar-opt${o.id === defaultOption(c)?.id ? ' primary' : ''}`}
                disabled={busy}
                title={answerLabel(c, o.id)}
                onClick={() => onAnswer(c, o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
          {/* Same sentence the paused screen used. The default was already applied when the
              run wrote the article, so this is a statement of what happened, not a warning
              about what will. */}
          <p className="clar-fb">Left alone: {fallbackFor(c).toLowerCase()}</p>
        </div>
      ))}
    </div>
  )
}
