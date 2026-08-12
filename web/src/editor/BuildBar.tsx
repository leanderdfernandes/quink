import { useRef } from 'react'
import { Bolt } from '../components/Wordmark'
import type { StageKey } from '../lib/config'

// The strip under the toolbar, present only while the article is BUILDING. It replaces the
// old GenerationStrip, which sat inside the canvas above the first step and therefore said
// nothing about the chrome — Publish was enabled beside it the whole time.
//
// Everything here is literally true: which phase is running, how far along, how many steps
// are done. No percentage text and no time estimate anywhere. The bar carries the SHAPE of
// progress and the words stay a count, so nothing here can become the timer-driven lie
// LEARNINGS #3 exists to forbid.

export type BuildStage = StageKey | 'uploading'

// THE FOUR PHASES, ALWAYS ALL VISIBLE (CLAUDE.md §5 names them and their order). This used
// to be one label for the current stage only, which on a ninety-second run means a single
// line of text and an indeterminate bar bouncing in place — nothing to tell you whether
// you are ten seconds in or eighty. Showing the whole list makes the wait legible: what is
// finished, what is happening, what is still coming.
//
// Plain language, and `analyzing`/`detecting` stay one phase to the user — we are watching
// the video — because splitting them names an internal boundary they have no use for.
const PHASES = [
  { key: 'upload', label: 'Uploading your recording', stages: ['uploading'] },
  { key: 'watch', label: 'Watching your recording', stages: ['analyzing', 'detecting'] },
  { key: 'shots', label: 'Capturing screenshots', stages: ['capturing'] },
  { key: 'words', label: 'Tightening the wording', stages: ['writing'] },
] as const

const CheckIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 12.5l5.5 5.5L20 6.5" />
  </svg>
)

type Props = {
  stage?: BuildStage
  // Steps finished / steps that exist. Both counted (lib/buildState buildProgress), never
  // estimated. `total` of 0 means Stage 1 has not spoken yet.
  done: number
  total: number
  // 0–1 while the bytes are still moving. The one real number available before Stage 1, so
  // it stands in for the count — it is measured, not a guess at how long anything will take.
  uploadProgress?: number | null
  // The article-list row: bar only, no phases, no count — the row's status carries those.
  compact?: boolean
}

export default function BuildBar({
  stage = 'analyzing',
  done,
  total,
  uploadProgress = null,
  compact = false,
}: Props) {
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

  // Indeterminate until the blueprint lands. The text names the phase and shows NO
  // denominator — the total is not known, so inventing one is not an option.
  const frac = raw === null ? null : high.current
  const pct = frac === null ? 0 : Math.round(frac * 1000) / 10

  // Deliberately NOT folded into the bar: upload bytes and finished steps are different
  // units, and switching the fill from one to the other would send it backwards.
  const count =
    total > 0
      ? `${done} of ${total} steps ready`
      : uploadProgress !== null && uploadProgress < 1
        ? `${Math.round(uploadProgress * 100)}% uploaded`
        : ''

  const at = Math.max(
    PHASES.findIndex((p) => (p.stages as readonly string[]).includes(stage)),
    0,
  )

  return (
    <div className={`bbar${compact ? ' bbar-sm' : ''}`}>
      {!compact && (
        <ol className="bbar-phases">
          {PHASES.map((p, i) => (
            <li
              key={p.key}
              className={i < at ? 'done' : i === at ? 'now' : ''}
              aria-current={i === at ? 'step' : undefined}
            >
              <span className="bbar-pip" aria-hidden>
                {i < at ? <CheckIcon /> : null}
              </span>
              {p.label}
            </li>
          ))}
        </ol>
      )}
      <div className="bbar-meter" role="status" aria-live="polite">
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
        {!compact && <span className="bbar-count">{count}</span>}
      </div>
    </div>
  )
}
