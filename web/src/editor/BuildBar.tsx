import { useRef } from 'react'
import Icon from '../components/Icon'
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

type Props = {
  /** NULL when no job row is readable yet — then NO phase is lit rather than a guessed one. */
  stage?: BuildStage | null
  // Steps finished / steps that exist. Both counted (lib/buildState buildProgress), never
  // estimated. `total` of 0 means Stage 1 has not spoken yet.
  done: number
  total: number
  // 0–1 while the bytes are still moving. The one real number available before Stage 1, so
  // it stands in for the count — it is measured, not a guess at how long anything will take.
  uploadProgress?: number | null
  // The article-list row: bar only, no phases, no count — the row's status carries those.
  compact?: boolean
  // The run has read the recording and is holding the WRITE stage for an answer
  // (PRD §5.4). Screenshots are still landing, so `capturing` stays the current phase and
  // the WRITING phase renames itself to "Waiting on your answers" — which names who the
  // machine is waiting on. Without it the last phase reads as stalled, our-fault-shaped.
  awaitingInput?: boolean
}

export default function BuildBar({
  stage = null,
  done,
  total,
  uploadProgress = null,
  compact = false,
  awaitingInput = false,
}: Props) {
  // THE BAR NEVER TRAVELS BACKWARDS. A high-water mark rather than a clamp on the input,
  // because both halves of the fraction can move: a poll can arrive out of order, and if a
  // run ever ends with a different step count than the blueprint promised, the denominator
  // grows under a numerator that did not. Growing the denominator must not rewind the bar.
  //
  // Written during render on purpose — it is a max(), so a StrictMode double render and a
  // repeat poll both produce the same value.
  const high = useRef(0)
  const stepFrac = total > 0 ? Math.min(done / total, 1) : null
  if (stepFrac !== null) high.current = Math.max(high.current, stepFrac)

  // MEASURED WHENEVER A MEASURE EXISTS. Bytes uploaded is a real fraction and the bar used
  // to throw it away, running indeterminate through the one phase of the whole run we can
  // actually count — so the longest, most anxious stretch of a first run was a dot
  // oscillating in place while the number sat in the text beside it, unused.
  //
  // The two fractions are different units and only the step one feeds the high-water mark,
  // so the bar still cannot travel backwards within a phase. They never overlap on screen
  // either: `analyzing` sits between them with nothing to count, so the fill has already
  // given way to the indeterminate treatment before the unit changes.
  const frac = stepFrac !== null ? high.current : uploadProgress
  const pct = frac === null ? 0 : Math.round(frac * 1000) / 10

  const count =
    total > 0
      ? `${done} of ${total} steps ready`
      : uploadProgress !== null && uploadProgress < 1
        ? `${Math.round(uploadProgress * 100)}% uploaded`
        : ''

  // -1 when the stage is unknown, and that is the point: every phase renders as pending
  // and the meter runs indeterminate, rather than the bar lighting a phase nobody observed.
  // `Math.max(..., 0)` used to floor it at the first phase, which is how an unreadable run
  // sat on a confident label forever.
  const at = stage
    ? PHASES.findIndex((p) => (p.stages as readonly string[]).includes(stage))
    : -1

  return (
    <div className={`bbar${compact ? ' bbar-sm' : ''}`}>
      <div className="bbar-meter" role="status" aria-live="polite">
        <span
          className={`bbar-track${frac === null ? ' idet' : ''}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total || undefined}
          aria-valuenow={frac === null ? undefined : done}
          aria-label="Steps finished"
        >
          {frac !== null && (
            <>
              <i className="bbar-fill" style={{ width: `${pct}%` }} />
              {/* The bolt rides the leading edge of the fill. It is only ever shown on a
                  fill it can lead: it used to walk the empty track by itself while nothing
                  was being measured, which is a high-contrast object thrown back and forth
                  for the ~45 seconds Stage 1 takes. The indeterminate state is a faded
                  sweep now (styles.css) — it says "working" without pretending to say
                  "this far along". */}
              <span className="bbar-bolt" style={{ left: `${pct}%` }} aria-hidden>
                <Bolt height={compact ? 8 : 10} />
              </span>
            </>
          )}
        </span>
        {!compact && <span className="bbar-count">{count}</span>}
      </div>

      {/* THE FOUR PHASES, under the track rather than beside it — the arrangement in the
          design system's first-run kit (ui_kits/first-run/Building.jsx, StageRow). Each one
          carries a state GLYPH instead of an abstract pip, which is what lets the pause say
          what it is: done ticks, the running phase is the brand sparkle, and a phase held
          for an answer turns into a clock and RENAMES ITSELF. It used to keep the label
          "Tightening the wording" and hang a small "waiting for you" off the end, so the
          phase that had stopped still read as the one in progress. */}
      {!compact && (
        <ol className="bbar-phases">
          {PHASES.map((p, i) => {
            // Only the phase that is actually held. Screenshots keep landing behind the
            // panel, so `capturing` stays "now" and normal — which is the point being made.
            const waiting = awaitingInput && p.key === 'words'
            const st = i < at ? 'done' : i === at ? 'now' : 'next'
            return (
              <li
                key={p.key}
                className={`${st}${waiting ? ' wait' : ''}`}
                aria-current={i === at ? 'step' : undefined}
              >
                <span className="bbar-ic" aria-hidden>
                  <Icon
                    name={
                      waiting
                        ? 'clock'
                        : st === 'done'
                          ? 'check-circle'
                          : st === 'now'
                            ? 'sparkle'
                            : 'dot-circle'
                    }
                    size={17}
                  />
                </span>
                {waiting ? 'Waiting on your answers' : p.label}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
