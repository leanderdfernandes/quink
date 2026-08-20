import { useEffect, useRef, useState } from 'react'
import { helpCenterUrl } from '../lib/config'
import type { SaveState } from '../lib/useAutosave'
import type { Visibility } from '../lib/types'

// Publishing, as one status pill + one button + one menu.
//
// The header used to carry four publishing concepts flat and competing: a Listed/Unlisted
// segmented control, Publish changes, a locked slug line, Copy link and View. Nothing said
// what state the article was actually in, and save state floated beside them as a separate
// string. Now: the PILL is the only place article state and save state appear, the BUTTON
// is whatever the single most useful action is right now, and everything else — including
// both destructive actions — is behind the caret where people already look for them.
//
// "Listed / Unlisted" is renamed to a plain switch. Nobody outside this category knows what
// unlisted means; everybody understands "hidden from search and browsing". The stored
// `visibility` values are unchanged.

type Props = {
  // The derived article state says a run is in flight (lib/buildState). The PILL is the one
  // label that can tell "still being written" apart from "finished and waiting for you", and
  // until now it said "Draft" for both — which is the whole reason nobody could tell.
  building?: boolean
  // A run is still writing this article. Publishing half an article, or opening the menu
  // that can delete it mid-write, is not something to leave reachable — but the controls
  // stay VISIBLE, because the wait is when someone reads what they will be able to do.
  locked?: boolean
  visibility: Visibility
  slug: string | null
  dirty: boolean
  // How far the draft is ahead of the published snapshot. Drives the pill's sub-label.
  pendingEdits: number
  publishing: boolean
  everPublished: boolean
  unpublishing: boolean
  discarding: boolean
  deleting: boolean
  changingVisibility: boolean
  subdomain: string | null
  // Autosave state and the last failed operation. Both land in the pill: a save that failed
  // and a folder that failed to create are the same thing to the person looking at it —
  // something didn't stick — so they share one surface in one fixed spot.
  saveState: SaveState
  // The stale-write guard refused the last save (Phase 3).
  conflict?: boolean
  opError: string | null
  folderName: string | null
  onPublish: () => void
  onPublishChanges: () => void
  onSetVisibility: (v: 'listed' | 'unlisted') => void
  onUnpublish: () => void
  onDiscard: () => void
  onDelete: () => void
  onChangeCategory: () => void
  onNotify: (msg: string) => void
}

const CaretIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 9l6 6 6-6" />
  </svg>
)
const LinkIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
    <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
  </svg>
)
const OutIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <path d="M15 3h6v6" />
    <path d="M10 14L21 3" />
  </svg>
)
const RowsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <path d="M4 7h16M4 12h16M4 17h10" />
  </svg>
)
const RevertIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 12a9 9 0 1 0 9-9" />
    <path d="M3 4v5h5" />
  </svg>
)
const HideIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M17.94 17.94A10 10 0 0 1 12 20c-7 0-10-8-10-8a18 18 0 0 1 5-6" />
    <path d="M1 1l22 22" />
  </svg>
)
const TrashIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
  </svg>
)

// The pill. One component, five states, always in the same place.
function StatusPill({
  building,
  saveState,
  conflict,
  opError,
  visibility,
  everPublished,
  pendingEdits,
}: Pick<
  Props,
  | 'building'
  | 'saveState'
  | 'conflict'
  | 'opError'
  | 'visibility'
  | 'everPublished'
  | 'pendingEdits'
>) {
  let cls = ''
  let label = 'Draft'
  let sub: string | null = null

  // First, and ahead of save state: while a run owns the document nothing is being saved
  // and there is nothing else worth saying here.
  if (building) {
    cls = 'bld'
    label = 'Building'
  } else if (opError) {
    cls = 'err'
    label = opError
  } else if (conflict) {
    // A refused write is not a broken one. The strip under the bar carries the explanation
    // and the two ways out; this just stops the status claiming a failure that isn't ours.
    cls = 'dirty'
    label = 'Not saved'
    sub = 'someone else edited this'
  } else if (saveState === 'error') {
    cls = 'err'
    label = 'Couldn’t save'
    sub = 'retrying on your next edit'
  } else if (saveState === 'saving') {
    label = 'Saving…'
  } else if (visibility === 'draft') {
    label = everPublished ? 'Unpublished' : 'Draft'
    sub = everPublished ? 'was published' : null
  } else if (pendingEdits > 0) {
    cls = 'dirty'
    label = 'Published'
    sub = `${pendingEdits} unpublished ${pendingEdits === 1 ? 'edit' : 'edits'}`
  } else {
    cls = 'live'
    label = 'Published'
  }

  return (
    <span className={`ed-status ${cls}`} role="status">
      <span className="ed-status-dot" aria-hidden />
      {label}
      {sub && <span className="ed-status-sub">· {sub}</span>}
    </span>
  )
}

export default function ShareControls({
  building = false,
  locked = false,
  visibility,
  slug,
  dirty,
  pendingEdits,
  publishing,
  everPublished,
  unpublishing,
  discarding,
  deleting,
  changingVisibility,
  subdomain,
  saveState,
  conflict,
  opError,
  folderName,
  onPublish,
  onPublishChanges,
  onSetVisibility,
  onUnpublish,
  onDiscard,
  onDelete,
  onChangeCategory,
  onNotify,
}: Props) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState<null | 'discard' | 'unpublish' | 'delete'>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const live = visibility !== 'draft'
  const readerUrl = helpCenterUrl(subdomain, slug ? `/${slug}` : '')
  const hidden = visibility === 'unlisted'

  // Primary action is whatever is most useful right now. Published and clean has nothing to
  // publish, so the button stops being a no-op and becomes "go look at it" — rendered quiet,
  // because it is no longer the loud thing on the screen.
  const primary = !live
    ? { label: everPublished ? 'Republish' : 'Publish', quiet: false, act: onPublish }
    : dirty
      ? { label: 'Publish changes', quiet: false, act: onPublishChanges }
      : { label: 'View live page', quiet: true, act: () => window.open(readerUrl, '_blank') }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(readerUrl)
      onNotify('Link copied')
    } catch {
      onNotify('Couldn’t copy — select the address bar on the live page instead')
    }
    setOpen(false)
  }

  if (confirm) {
    const spec = {
      discard: {
        q: 'Discard your unpublished edits and go back to the published version? This can’t be undone.',
        go: discarding ? 'Discarding…' : 'Discard edits',
        act: onDiscard,
        busy: discarding,
      },
      unpublish: {
        q: 'Take this off your help center? Readers lose access to it. The content is kept.',
        go: unpublishing ? 'Unpublishing…' : 'Unpublish',
        act: onUnpublish,
        busy: unpublishing,
      },
      delete: {
        q: 'Delete this article? This can’t be undone.',
        go: deleting ? 'Deleting…' : 'Delete',
        act: onDelete,
        busy: deleting,
      },
    }[confirm]
    return (
      <div className="pubx-confirm">
        <span>{spec.q}</span>
        <button
          className="row-confirm"
          disabled={spec.busy}
          onClick={async () => {
            await spec.act()
            setConfirm(null)
          }}
        >
          {spec.go}
        </button>
        <button className="row-cancel" onClick={() => setConfirm(null)}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <>
      <StatusPill
        building={building}
        saveState={saveState}
        conflict={conflict}
        opError={opError}
        visibility={visibility}
        everPublished={everPublished}
        pendingEdits={pendingEdits}
      />

      <div className="pubx" ref={ref}>
        <button
          className={`pubx-go${primary.quiet ? ' quiet' : ''}`}
          onClick={primary.act}
          disabled={publishing || locked}
        >
          {publishing ? 'Publishing…' : primary.label}
        </button>
        <button
          className={`pubx-caret${primary.quiet ? ' quiet' : ''}`}
          aria-label="More publishing options"
          aria-expanded={open}
          aria-haspopup="menu"
          disabled={locked}
          onClick={() => setOpen((o) => !o)}
        >
          <CaretIcon />
        </button>

        {open && (
          <div className="pubx-menu" role="menu">
            <p className="pubx-grp">This article</p>
            <button className="pubx-it" role="menuitem" disabled={!live} onClick={copyLink}>
              <span className="pubx-ic">
                <LinkIcon />
              </span>
              <span>
                Copy link
                {!live && <small>Publish it first — a draft has no address yet.</small>}
              </span>
            </button>
            <button
              className="pubx-it"
              role="menuitem"
              disabled={!live}
              onClick={() => {
                window.open(readerUrl, '_blank')
                setOpen(false)
              }}
            >
              <span className="pubx-ic">
                <OutIcon />
              </span>
              <span>View live page</span>
            </button>
            <button
              className="pubx-it"
              role="menuitem"
              onClick={() => {
                onChangeCategory()
                setOpen(false)
              }}
            >
              <span className="pubx-ic">
                <RowsIcon />
              </span>
              <span>
                Change category
                <small>{folderName ? `Filed under ${folderName}` : 'Not filed yet'}</small>
              </span>
            </button>

            <hr />
            <p className="pubx-grp">Who can find it</p>
            <button
              className="pubx-it"
              role="menuitemcheckbox"
              aria-checked={hidden}
              disabled={!live || changingVisibility}
              onClick={() => onSetVisibility(hidden ? 'listed' : 'unlisted')}
            >
              <span>
                Hide from search and browsing
                <small>
                  {live
                    ? 'Stays live at its link. Removed from your help center’s search results and category pages.'
                    : 'Publish it first.'}
                </small>
              </span>
              <span className={`pubx-sw${hidden ? ' on' : ''}`} aria-hidden />
            </button>

            <hr />
            <button
              className="pubx-it danger"
              role="menuitem"
              disabled={!everPublished || !dirty}
              onClick={() => {
                setConfirm('discard')
                setOpen(false)
              }}
            >
              <span className="pubx-ic">
                <RevertIcon />
              </span>
              <span>
                Discard unpublished edits
                <small>
                  {!everPublished
                    ? 'Nothing published to go back to yet.'
                    : !dirty
                      ? 'No unpublished edits.'
                      : 'Restores the published version. Can’t be undone.'}
                </small>
              </span>
            </button>
            <button
              className="pubx-it danger"
              role="menuitem"
              disabled={!live}
              onClick={() => {
                setConfirm('unpublish')
                setOpen(false)
              }}
            >
              <span className="pubx-ic">
                <HideIcon />
              </span>
              <span>
                Unpublish
                <small>Takes it off your help center. Keeps the content.</small>
              </span>
            </button>
            <button
              className="pubx-it danger"
              role="menuitem"
              onClick={() => {
                setConfirm('delete')
                setOpen(false)
              }}
            >
              <span className="pubx-ic">
                <TrashIcon />
              </span>
              <span>Delete article</span>
            </button>
          </div>
        )}
      </div>
    </>
  )
}
