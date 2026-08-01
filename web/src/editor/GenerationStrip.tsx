import type { StageKey } from '../lib/config'

// One line above the first step, for the whole ~90s wait. Not a checklist: a checklist
// invites you to watch four things finish, which is four times as long as watching one.
//
// Every number here comes from real data — steps rows for the total, non-null
// screenshot_url for capture progress, actual bytes for the upload. There is deliberately
// no interpolated percentage anywhere: a bar that moves on a timer is the "timer-driven
// lie" LEARNINGS #3 exists to forbid, and it is the reason this strip can say
// "safe to close this tab" and mean it.

export type GenPhase = StageKey | 'uploading' | 'ready'

type Props = {
  phase: GenPhase
  // 0–1, from the real upload. Null once the bytes are gone.
  uploadProgress: number | null
  // Steps with a screenshot / steps that exist. Both counted, never estimated.
  captured: number
  polished: number
  total: number
}

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 6L9 17l-5-5" />
  </svg>
)

export default function GenerationStrip({
  phase,
  uploadProgress,
  captured,
  polished,
  total,
}: Props) {
  const done = phase === 'ready'

  let label: string
  let count = ''
  switch (phase) {
    case 'uploading':
      label = 'Uploading your recording'
      count = uploadProgress === null ? '' : `${Math.round(uploadProgress * 100)}%`
      break
    // Both pre-blueprint stages read as one thing to the user: we are watching the video.
    // Splitting them would name an internal boundary they have no use for.
    case 'analyzing':
    case 'detecting':
      label = 'Watching your recording'
      count = 'safe to close this tab'
      break
    case 'capturing':
      label = 'Capturing screenshots'
      count = total ? `${captured} of ${total}` : ''
      break
    case 'writing':
      label = 'Tightening the wording'
      count = total ? `${polished} of ${total}` : ''
      break
    default:
      label = 'Your guide is ready to edit'
      count = `${total} ${total === 1 ? 'step' : 'steps'} · saved`
  }

  return (
    <div className={`gen-strip${done ? ' done' : ''}`} role="status" aria-live="polite">
      <span className="gen-mark" aria-hidden>
        {done ? <CheckIcon /> : <span className="gen-dot" />}
      </span>
      <span className="gen-label">{label}</span>
      <span className="gen-count">{count}</span>
      {phase === 'uploading' && uploadProgress !== null && (
        <span className="gen-rail" aria-hidden>
          <i style={{ width: `${Math.round(uploadProgress * 100)}%` }} />
        </span>
      )}
    </div>
  )
}
