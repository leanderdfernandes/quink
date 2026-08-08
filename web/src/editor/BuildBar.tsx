import { useRef } from 'react'
import { Bolt } from '../components/Wordmark'
import type { StageKey } from '../lib/config'

// The strip under the toolbar, present only while the article is BUILDING. It replaces the
// old GenerationStrip, which sat inside the canvas above the first step and therefore said
// nothing about the chrome — Publish was enabled beside it the whole time.
//
// Three elements, all literally true: what is happening, how far along, how many steps are
// done. No percentage text and no time estimate anywhere. The bar carries the SHAPE of
// progress and the words stay a count, so nothing here can become the timer-driven lie
// LEARNINGS #3 exists to forbid.

export type BuildStage = StageKey | 'uploading'

// Plain language: how a person would describe what is happening, not the pipeline's stage
// names. `analyzing` and `detecting` are one thing to the user — we are watching the video —
// and splitting them would name an internal boundary they have no use for.
const STAGE_LABEL: Record<BuildStage, string> = {
  uploading: 'Uploading your recording',
  analyzing: 'Watching your recording',
  detecting: 'Watching your recording',
  capturing: 'Capturing screenshots',
  writing: 'Tightening the wording',
}

type Props = {
  stage?: BuildStage
  // Steps finished / steps that exist. Both counted (lib/buildState buildProgress), never
  // estimated. `total` of 0 means Stage 1 has not spoken yet.
  done: number
  total: number
  // The article-list row: bar only, no label, no count — the row's status carries those.
  compact?: boolean
}

export default function BuildBar({ stage = 'analyzing', done, total, compact = false }: Props) {
  // THE BAR NEVER TRAVELS BACKWARDS. A high-water mark rather than a clamp on the input,
  // because both halves of the fraction can move: a poll can arrive out of order, and if a
  // run ever ends with a different step count than the blueprint promised, the denominator
  // grows under a numerator that did not. Growing the denominator must not rewind the bar.
  //
  // Written during render on purpose — it is a max(), so a StrictMode double render and a
  // repeat poll both produce the same value.
  const high = useRef(0)
  const raw = total > 0 ? Math.min(done / total, 1) : null
  if (raw !== null) high.current = Math.max(high.current, raw)

  // Indeterminate until the blueprint lands. The text names the stage and shows NO
  // denominator — the total is not known, so inventing one is not an option.
  const frac = raw === null ? null : high.current
  const pct = frac === null ? 0 : Math.round(frac * 1000) / 10

  return (
    <div className={`bbar${compact ? ' bbar-sm' : ''}`} role="status" aria-live="polite">
      {!compact && <span className="bbar-stage">{STAGE_LABEL[stage]}</span>}
      <span
        className={`bbar-track${frac === null ? ' idet' : ''}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total || undefined}
        aria-valuenow={frac === null ? undefined : done}
        aria-label="Steps finished"
      >
        {frac !== null && <i className="bbar-fill" style={{ width: `${pct}%` }} />}
        {/* The bolt rides the leading edge of the fill. While indeterminate it travels the
            track on its own — the brand cue doing the work a generic sweep would, without
            being one. */}
        <span
          className="bbar-bolt"
          style={frac === null ? undefined : { left: `${pct}%` }}
          aria-hidden
        >
          <Bolt height={compact ? 8 : 10} />
        </span>
      </span>
      {!compact && (
        <span className="bbar-count">
          {total > 0 ? `${done} of ${total} steps ready` : ''}
        </span>
      )}
    </div>
  )
}
