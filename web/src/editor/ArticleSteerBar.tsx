import { useState } from 'react'
import SteerField from './SteerField'
import type { ArticleProposal } from '../lib/steer'
import AiMark, { AiTag } from '../components/AiMark'

// Article-scope steer (PRD §6.4). A COLLAPSIBLE BAR above the article — not a side rail,
// not a chat panel.
//
// The rail was considered and rejected, and the reason is worth keeping: usage here is
// bursty and terminal — used once, near the end, then never — so a permanent 340px panel
// produces an empty thread staring at the user and quietly reframes Quink as a chatbot.
// The article stays the only canvas. This collapses back to one line the moment it is done.
//
// Replies STATE A PLAN before anything lands. A multi-step edit that just happens feels
// like the article shifted underneath the user; the same edits announced first feel like
// they steered them. The plan only ever names steps that have a diff behind it.

type Props = {
  busy: boolean
  // The plan for the pending change set, or null when nothing is pending. The diffs
  // themselves land on the steps, inline — this bar never shows the text.
  pending: ArticleProposal | null
  error: string | null
  onSubmit: (instruction: string) => void
}

export default function ArticleSteerBar({ busy, pending, error, onSubmit }: Props) {
  const [open, setOpen] = useState(false)

  if (pending) {
    return (
      <div className="asb asb-plan">
        <AiTag>Here's what I'd change</AiTag>
        <p className="asb-asked">“{pending.instruction}”</p>
        <ul className="asb-list">
          {pending.plan.map((p) => (
            <li key={p.step_number}>
              <b>Step {p.step_number}</b>
              {p.change}
            </li>
          ))}
        </ul>
        <p className="asb-note">
          {pending.steps.length === 1
            ? 'One change is waiting on the step below.'
            : `${pending.steps.length} changes are waiting on the steps below.`}
        </p>
      </div>
    )
  }

  if (!open) {
    return (
      <button type="button" className="asb asb-shut" onClick={() => setOpen(true)}>
        <AiMark size={15} />
        Change something across the whole guide
      </button>
    )
  }

  return (
    <div className="asb">
      <SteerField
        placeholder="Make every step shorter · Use “workspace” instead of “project” · Say why each step matters"
        busy={busy}
        submitLabel="Show me"
        onSubmit={onSubmit}
        onCancel={() => setOpen(false)}
      />
      {error && <p className="asb-err">{error}</p>}
    </div>
  )
}

// The sticky bar for more than one pending change (PRD §6.2). One decision for the whole
// set, so a fourteen-step terminology pass is not fourteen taps — while every individual
// diff stays on its own step and can still be taken or left on its own.
export function KeepAllBar({
  count,
  onKeepAll,
  onDiscardAll,
}: {
  count: number
  onKeepAll: () => void
  onDiscardAll: () => void
}) {
  if (count < 2) return null
  return (
    <div className="asb-all" role="group" aria-label="Pending changes">
      <span>
        {count} suggested changes
      </span>
      <button type="button" className="str-keep" onClick={onKeepAll}>
        Keep all
      </button>
      <button type="button" className="str-discard" onClick={onDiscardAll}>
        Discard all
      </button>
    </div>
  )
}
