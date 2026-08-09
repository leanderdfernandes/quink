import { useState } from 'react'
import { COPY } from '../lib/config'
import type { QueueItem } from '../lib/queue'

// The queue dock (slice 3).
//
// It reports on work that is already happening somewhere else — so it sits in the corner,
// it collapses, and it never takes the screen. Everything in it is a row that says what the
// recording is, what is happening to it, and what the user can still change about it.
//
// The article LIST is not this component's business. A generating article is an ordinary
// row in its folder group wearing the ordinary Generating pill; introducing a second row
// type for "currently building" would split one mental model in two.

type Props = {
  items: QueueItem[]
  productName: string
  productSummary: string
  onChangeProduct: () => void
  onSetRecording: (id: string, text: string) => void
  onRemove: (id: string) => void
  onUndoRemove: () => void
  canUndo: boolean
  onOpenArticle: (articleId: string) => void
  // Watch a recording that has no article yet — the upload, and the stretch before Stage 1.
  // By item id, not article id, because the whole point is that there isn't one.
  onWatchItem: (itemId: string) => void
  onUpgrade: () => void
  onDismiss: () => void
  onAddMore: () => void
}

const ChevronIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 15l6-6 6 6" />
  </svg>
)
const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 6L9 17l-5-5" />
  </svg>
)
const LockIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="4" y="10" width="16" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
)
const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

// What one row says it is doing. Stage labels match the editor's strip word for word — the
// same run described twice in two vocabularies is how a user concludes something is wrong.
function statusOf(item: QueueItem): string {
  switch (item.state) {
    case 'uploading':
      return `Uploading ${Math.round(item.progress * 100)}%`
    case 'running':
      switch (item.stage) {
        case 'capturing':
          return 'Capturing screenshots'
        case 'writing':
          return 'Tightening the wording'
        default:
          return 'Watching your recording'
      }
    case 'settling':
      return 'Finishing'
    case 'done':
      return 'Ready'
    case 'error':
      return "Didn't finish"
    case 'held':
      return 'Held'
    default:
      return 'In line'
  }
}

export default function QueueDock({
  items,
  productName,
  productSummary,
  onChangeProduct,
  onSetRecording,
  onRemove,
  onUndoRemove,
  canUndo,
  onOpenArticle,
  onWatchItem,
  onUpgrade,
  onDismiss,
  onAddMore,
}: Props) {
  const [min, setMin] = useState(false)
  if (!items.length) return null

  const active = items.filter(
    (i) => i.state === 'queued' || i.state === 'uploading' || i.state === 'running',
  ).length
  const ready = items.filter((i) => i.state === 'done').length
  const held = items.filter((i) => i.state === 'held').length
  const total = items.filter((i) => i.state !== 'held').length
  const queued = items.filter((i) => i.state === 'queued')

  const title = active
    ? `Building ${active} recording${active > 1 ? 's' : ''}`
    : held
      ? `${ready} ready · ${held} held`
      : `${ready} ready`

  return (
    <aside className={`dock${min ? ' min' : ''}`} aria-label="Recording queue">
      <button
        className="dock-bar"
        onClick={() => setMin((m) => !m)}
        aria-expanded={!min}
      >
        <span className="dock-t">{title}</span>
        {active > 0 && (
          <span className="dock-s">
            {ready} of {total} done
          </span>
        )}
        <span className="dock-chev">
          <ChevronIcon />
        </span>
      </button>

      <div className="dock-body">
        {/* The product tier, stated ONCE as a header rather than asked again per file.
            Second run onward this is the whole form (3b). */}
        <div className="dock-pctx">
          <span className="dock-pctx-t">{productName || 'Your product'}</span>
          <span className="dock-pctx-d">{productSummary}</span>
          <button type="button" className="dock-pctx-a" onClick={onChangeProduct}>
            Change
          </button>
        </div>

        <div className="dock-files">
          {items.map((item) => {
            const locked =
              item.state !== 'queued' && item.state !== 'held' && item.state !== 'error'
            const position = queued.indexOf(item)
            // 2f: clicking a row goes in and watches it build. That now works from the
            // moment the bytes start moving, not only once Stage 1 has written something —
            // the upload is the longest part of the wait on a big recording, and having no
            // way in during it was the stretch where nothing on screen was watchable.
            // Before the article exists the shell is opened by ITEM, because there is no
            // article id yet to open by.
            // Anything already in flight, which is upload AND the stretch before Stage 1 —
            // covering only the upload would make the view blink out for the thirty seconds
            // the video model takes, which is worse than never offering it.
            // NOT `queued`: a file that has not entered a lane stays editable in the dock
            // (3d), and opening it into a locked editor would take that away.
            const watchable = item.state === 'uploading' || item.state === 'running'
            const openable = !!item.articleId || watchable
            const open = () =>
              item.articleId ? onOpenArticle(item.articleId) : onWatchItem(item.id)
            return (
              <div className="dock-f" key={item.id}>
                <div
                  className={`dock-f-top${openable ? ' openable' : ''}`}
                  role={openable ? 'button' : undefined}
                  tabIndex={openable ? 0 : undefined}
                  title={
                    !openable
                      ? undefined
                      : item.articleId
                        ? 'Open this article'
                        : 'Watch this being built'
                  }
                  onClick={openable ? open : undefined}
                  onKeyDown={
                    openable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            open()
                          }
                        }
                      : undefined
                  }
                >
                  <span className={`dock-f-ic ${item.state}`} aria-hidden>
                    {item.state === 'done' ? (
                      <CheckIcon />
                    ) : item.state === 'queued' ? (
                      position + 2
                    ) : (
                      <span className="dock-f-dot" />
                    )}
                  </span>
                  <span className="dock-f-n">{item.title || item.name}</span>
                  <span className={`dock-f-st ${item.state}`}>
                    {item.state === 'queued'
                      ? position === 0
                        ? 'Next'
                        : `${position + 1} in line`
                      : statusOf(item)}
                  </span>
                  {(item.state === 'queued' || item.state === 'held') && (
                    <button
                      type="button"
                      className="dock-f-x"
                      aria-label={`Remove ${item.name}`}
                      // The row is now a target, so a control inside it has to say it
                      // handled the click itself.
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemove(item.id)
                      }}
                    >
                      <CloseIcon />
                    </button>
                  )}
                </div>

                {item.state === 'uploading' && (
                  <span className="dock-bar-rail" aria-hidden>
                    <i style={{ width: `${Math.round(item.progress * 100)}%` }} />
                  </span>
                )}

                {/* Per-file context. Editable until the file enters a lane, then LOCKED and
                    still visible (3d) — the user has to be able to see what a run was
                    grounded on when deciding whether its output is wrong. Hiding it at that
                    moment removes the only evidence. */}
                {item.state !== 'done' && item.state !== 'settling' && (
                  <div className={`dock-ctx${locked ? ' locked' : ''}`}>
                    <label className="dock-ctx-h" htmlFor={`rec-${item.id}`}>
                      About this recording
                      {!locked && <span>Optional</span>}
                    </label>
                    <textarea
                      id={`rec-${item.id}`}
                      value={item.recording}
                      readOnly={locked}
                      placeholder={locked ? '—' : COPY.recordingPlaceholder}
                      onChange={(e) => onSetRecording(item.id, e.target.value)}
                    />
                    {locked && (
                      <p className="dock-ctx-lock">
                        <LockIcon />
                        Locked — this is what it&rsquo;s building with
                      </p>
                    )}
                  </div>
                )}

                {item.state === 'held' && (
                  <div className="dock-held">
                    <p>{COPY.heldFileNote}</p>
                    <button type="button" className="dock-held-go" onClick={onUpgrade}>
                      Upgrade to build it
                    </button>
                  </div>
                )}

                {/* No separate "Open it" button: the ROW is the target, for every state
                    that has an article behind it — including a run still going, which is
                    the whole point of being able to go and watch it. */}
                {/* The "you'll be able to open this once the first steps are written" line
                    is gone: every in-flight row is openable now, so it was a promise about
                    a wait that no longer exists. */}
              </div>
            )
          })}
        </div>

        <div className="dock-foot">
          {canUndo ? (
            <button type="button" className="dock-undo" onClick={onUndoRemove}>
              Undo remove
            </button>
          ) : (
            <span>
              {active
                ? // True because of 3g: the dock rebuilds from the run ledger on load, so
                  // closing the tab really does cost nothing.
                  'Safe to close this tab — we’ll keep going.'
                : 'All done.'}
            </span>
          )}
          <button type="button" onClick={onAddMore}>
            Add more
          </button>
          {!active && (
            <button type="button" onClick={onDismiss}>
              Clear
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
