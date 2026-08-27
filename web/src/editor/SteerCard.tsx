import { REFINEMENTS } from '../lib/steer'

// The diff card for a steered edit (PRD §6.2).
//
// THREE VERBS — `Keep` · `Try again` · `Discard`. Never "Keep mine": the user did not write
// the original, we did, so calling it theirs is a small lie that makes the choice read as a
// fight over authorship rather than a preference between two drafts.
//
// "Try again" REOPENS THE INSTRUCTION, pre-filled. Rerolling blindly is a slot machine;
// editing the ask is steering, and it is the difference between the two that decides
// whether this feels like a tool or a wish.
//
// The refinement chips sit ON THE RESULT, not on the trigger. Nobody gets the instruction
// right first time, and re-articulating from scratch is what makes AI editing feel like
// work. They fire immediately, unlike the quick words below the field, because by this
// point the user has a concrete thing in front of them to react to.
//
// The instruction is QUOTED. A result somebody does not recognise has to be traceable to
// what they actually asked for — otherwise the only available conclusion is that the tool
// did something of its own accord.

type Props = {
  instruction: string
  current: string
  proposed: string
  busy?: boolean
  onKeep: () => void
  onRetry: () => void
  onRefine: (word: string) => void
  onDiscard: () => void
}

const stripTags = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()

export default function SteerCard({
  instruction,
  current,
  proposed,
  busy = false,
  onKeep,
  onRetry,
  onRefine,
  onDiscard,
}: Props) {
  return (
    <div className="str-card" role="group" aria-label="Suggested change">
      <p className="str-asked">“{instruction}”</p>

      <div className="str-diff">
        <div className="str-was">
          <span className="str-lbl">Now</span>
          <p>{stripTags(current)}</p>
        </div>
        <div className="str-now">
          <span className="str-lbl">Suggested</span>
          <p>{proposed}</p>
        </div>
      </div>

      <div className="str-refine">
        {REFINEMENTS.map((w) => (
          <button
            type="button"
            key={w}
            className="str-chip"
            disabled={busy}
            onClick={() => onRefine(w)}
          >
            {w}
          </button>
        ))}
      </div>

      <div className="str-acts">
        <button type="button" className="str-keep" disabled={busy} onClick={onKeep}>
          Keep
        </button>
        <button type="button" className="str-again" disabled={busy} onClick={onRetry}>
          Try again
        </button>
        <button type="button" className="str-discard" disabled={busy} onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  )
}
