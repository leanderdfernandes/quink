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
  // Whether the viewer can act on the wall a held file is sitting behind. A member spends
  // the OWNER's runs, so the held row names the owner instead of offering a purchase.
  isOwner: boolean
  ownerName: string | null
  onDismiss: () => void
  onAddMore: () => void
}

const ChevronIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 15l6-6 6 6" />
  </svg>
)
const CheckIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 6L9 17l-5-5" />
  </svg>
)
const LockIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="4" y="10" width="16" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
)
// The working glyph, matching <State state="building"> — v2 replaced the pulsing dot, and
// the dock and the editor must not describe the same run in two vocabularies.
const SparkIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3.5l1.7 4.6 4.6 1.7-4.6 1.7L12 16.1l-1.7-4.6L5.7 9.8l4.6-1.7Z" />
    <path d="M18.5 16.5l.65 1.7 1.7.65-1.7.65-.65 1.7-.65-1.7-1.7-.65 1.7-.65Z" />
  </svg>
)
const CloseIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
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
        case 'analyzing':
        case 'detecting':
          return 'Watching your recording'
        case 'capturing':
          return 'Capturing screenshots'
        case 'writing':
          return 'Tightening the wording'
        // NOT "Watching your recording". That was the `default:` arm, so a row whose stage
        // we have not read yet — a job adopted from the in-flight list, a poll that has not
        // landed — claimed a specific phase we had no evidence for, and kept claiming it for
        // as long as the stage stayed unknown. The four labels are only ever said when the
        // stage says them (LEARNINGS #3: progress is never a label we chose for it).
        default:
          return 'Building'
      }
    // Names WHO is being waited on. "Capturing screenshots" would be true and useless here
    // — the row's whole job in this state is to say there is something to come back to.
    case 'awaiting':
      return 'Waiting for you'
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
  isOwner,
  ownerName,
  onDismiss,
  onAddMore,
}: Props) {
  const [min, setMin] = useState(false)
  if (!items.length) return null

  // A run holding the WRITE stage for an answer. It is the ONE in-flight state with
  // something for the user to do, and the only one where nothing at all happens until they
  // do it — so it takes the dock's title, forces it open, and gets a real button.
  //
  // This is the fix for a run that sat paused and unanswered: the question lives inside the
  // editor, and someone who started the run from the help center is never on that screen.
  // "Waiting for you" in the same grey as "Capturing screenshots" was not a signal.
  const awaiting = items.filter((i) => i.state === 'awaiting')

  const active = items.filter(
    (i) =>
      i.state === 'queued' ||
      i.state === 'uploading' ||
      i.state === 'running' ||
      i.state === 'awaiting',
  ).length
  const ready = items.filter((i) => i.state === 'done').length
  const held = items.filter((i) => i.state === 'held').length
  const total = items.filter((i) => i.state !== 'held').length
  const queued = items.filter((i) => i.state === 'queued')

  const title = awaiting.length
    ? awaiting.length > 1
      ? `${awaiting.length} guides need an answer`
      : 'One question before I write it'
    : active
    ? `Building ${active} recording${active > 1 ? 's' : ''}`
    : held
      ? `${ready} ready · ${held} held`
      : `${ready} ready`

  return (
    <aside
      className={`dock${min && !awaiting.length ? ' min' : ''}${
        awaiting.length ? ' dock-asking' : ''
      }`}
      aria-label="Recording queue"
    >
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
            const watchable =
              item.state === 'uploading' ||
              item.state === 'running' ||
              item.state === 'awaiting'
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
                      <span className="dock-f-dot">
                        <SparkIcon />
                      </span>
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
                  {/* A real target, not a status word. Everything else in this dock is a
                      report on work happening on its own; this one is the only row that is
                      a request. */}
                  {item.state === 'awaiting' && (
                    <button
                      type="button"
                      className="dock-f-answer"
                      onClick={(e) => {
                        e.stopPropagation()
                        open()
                      }}
                    >
                      Answer
                    </button>
                  )}
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
                    {isOwner ? (
                      <>
                        <p>{COPY.heldFileNote}</p>
                        <button type="button" className="dock-held-go" onClick={onUpgrade}>
                          Upgrade to build it
                        </button>
                      </>
                    ) : (
                      // No CTA at all. There is nothing an admin can do here, and a button
                      // that leads to "ask someone else" teaches people the product is
                      // broken (team-access-spec L7, same call as OwnerOnly).
                      <p>{COPY.heldFileNoteMember(ownerName)}</p>
                    )}
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
