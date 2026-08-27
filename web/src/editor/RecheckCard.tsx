import type { RecheckResult } from '../lib/recheck'

// The diff card for "Check the recording" (PRD §6.3).
//
// TWO VERBS — `Keep` and `Discard`, and no "Try again". That asymmetry against every other
// AI edit in the product is deliberate: a factual correction is not a matter of taste, so
// rerolling it would be asking the same question of the same seconds and hoping for a
// different answer. A slot machine wearing a diff card.
//
// The two lines above the proposal are the entire reason this feature exists. The timestamp
// range and the observation are what a general chat model cannot produce, and they are what
// makes Keep a judgement rather than a leap of faith — the user can open their own recording
// at that moment and check us.
//
// Which also names the failure to design against: a FABRICATED observation. It carries our
// authority and the user will tap Keep. The worker rejects a response that has no
// observation rather than shipping the correction alone; this component never renders the
// proposal without it.

type Props = {
  result: RecheckResult
  current: string
  onKeep: () => void
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

export default function RecheckCard({ result, current, onKeep, onDiscard }: Props) {
  const unchanged = result.no_change || !result.proposed_text

  return (
    <div className="rck" role="group" aria-label="What the recording shows">
      <div className="rck-hd">
        <span className="rck-range">
          {result.window.from}–{result.window.to}
        </span>
        <span className="rck-src">in your recording</span>
      </div>

      {/* The observation, always, and first. */}
      <p className="rck-obs">{result.observed}</p>

      {unchanged ? (
        <>
          <p className="rck-same">This step already matches. Nothing to change.</p>
          <div className="rck-acts">
            <button type="button" className="rck-discard" onClick={onDiscard}>
              Close
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="rck-diff">
            <div className="rck-was">
              <span className="rck-lbl">Now</span>
              <p>{stripTags(current)}</p>
            </div>
            <div className="rck-now">
              <span className="rck-lbl">Suggested</span>
              <p>{result.proposed_text}</p>
            </div>
          </div>
          <div className="rck-acts">
            <button type="button" className="rck-keep" onClick={onKeep}>
              Keep
            </button>
            <button type="button" className="rck-discard" onClick={onDiscard}>
              Discard
            </button>
          </div>
        </>
      )}
    </div>
  )
}
