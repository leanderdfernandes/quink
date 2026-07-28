import { useEffect, useState } from 'react'
import { READER_DOMAIN } from '../lib/config'
import type { Folder } from '../lib/types'

// The publish gate (build spec §7). An article can't go live unfiled — publishing IS filing
// it in a folder, because that folder is the category card its readers browse. A first-time
// user has no folders yet, so "+ New category" is inline: the make-articles → publish loop
// must never dead-end (North Star, CLAUDE.md §2).
//
// The success face used to dead-end at "You're live!" with a button that opened the site.
// It now carries the actual URL with a copy button — the first thing anyone does after
// publishing is send the link to someone — and offers theming. ux-spec §5 always said
// branding should surface contextually "at preview/publish, where brand visibly matters";
// it never shipped. It is an OFFER, not a redirect: they came here to publish, and hijacking
// that into a settings screen is how a pull becomes a push.

type Props = {
  articleTitle: string
  subdomain: string | null
  slug: string | null
  // Whether this article still holds its source recording — publishing collects it.
  hasSourceVideo: boolean
  folders: Folder[]
  selectedFolderId: string | null
  onSelectFolder: (id: string) => void
  onCreateFolder: (name: string) => Promise<Folder | null>
  publishing: boolean
  published: boolean
  // Re-filing an already-published article: same picker, no first-publish framing.
  recategorizeOnly?: boolean
  onPublish: () => void
  onClose: () => void
  onViewSite: () => void
  onCustomize: () => void
  onNotify: (msg: string) => void
}

function CheckIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
}

export default function PublishModal({
  articleTitle,
  subdomain,
  slug,
  hasSourceVideo,
  folders,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  publishing,
  published,
  recategorizeOnly = false,
  onPublish,
  onClose,
  onViewSite,
  onCustomize,
  onNotify,
}: Props) {
  const [newMode, setNewMode] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  // Esc closes — but never mid-publish (an interrupted publish leaves an ambiguous state).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !publishing) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [publishing, onClose])

  const hcUrl = `${subdomain ?? '…'}.${READER_DOMAIN}`
  const liveUrl = `${hcUrl}/${slug ?? ''}`
  const selectedName = folders.find((f) => f.id === selectedFolderId)?.name ?? ''

  async function createAndSelect() {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    const f = await onCreateFolder(name)
    setCreating(false)
    if (f) {
      onSelectFolder(f.id)
      setNewMode(false)
      setNewName('')
    }
  }

  async function copyLive() {
    try {
      await navigator.clipboard.writeText(`https://${liveUrl}`)
      onNotify('Link copied')
    } catch {
      onNotify('Couldn’t copy — the address is shown above')
    }
  }

  return (
    <div className="pub-overlay" onClick={() => !publishing && onClose()}>
      <div className="pub-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {!published ? (
          <div className="pub-sheet-in">
            <h2>{recategorizeOnly ? 'Change category' : 'Publish this article?'}</h2>
            <p className="pub-lede">
              {recategorizeOnly
                ? 'Readers browse your help center by category, so this is where it appears.'
                : 'It goes live on your help center immediately. You can edit or unpublish it any time.'}
            </p>

            <div className="pub-section">
              <div className="pub-label">Choose a category for this article</div>
              <div className="pub-pills">
                {folders.map((f) => (
                  <button
                    key={f.id}
                    className={`pub-pill${selectedFolderId === f.id ? ' on' : ''}`}
                    onClick={() => onSelectFolder(f.id)}
                  >
                    {f.name}
                  </button>
                ))}
                {newMode ? (
                  <span className="pub-newcat">
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') createAndSelect()
                        if (e.key === 'Escape') {
                          setNewMode(false)
                          setNewName('')
                        }
                      }}
                      placeholder="Category name"
                      aria-label="New category name"
                    />
                    <button className="pub-pill add" disabled={creating} onClick={createAndSelect}>
                      {creating ? '…' : 'Add'}
                    </button>
                  </span>
                ) : (
                  <button className="pub-pill add" onClick={() => setNewMode(true)}>
                    + New category
                  </button>
                )}
              </div>
            </div>

            <div className="pub-target">
              <div className="pub-target-label">Publishing to</div>
              <div className="pub-target-url">
                <span className="pub-dot" />
                <span className="mono">{hcUrl}</span>
              </div>
              <div className="pub-target-title">{articleTitle || 'Untitled'}</div>
              {selectedName && (
                <div className="pub-filed">
                  <CheckIcon /> Filed under {selectedName}
                </div>
              )}
            </div>

            <button
              className="btn btn-lg pub-go-big"
              disabled={!selectedFolderId || publishing}
              onClick={onPublish}
            >
              {publishing ? 'Publishing…' : recategorizeOnly ? 'Save category' : 'Publish now'}
            </button>
            {hasSourceVideo && !recategorizeOnly && (
              // The upload screen promises we delete the recording once the article is
              // published. Saying so again at the moment it happens turns a silent
              // background deletion into a visibly kept promise. Your screenshots stay —
              // they are the article; the recording was only ever the raw material.
              <p className="pub-note">
                Your source recording is deleted when this goes live. The screenshots stay.
              </p>
            )}
            {!selectedFolderId && <p className="pub-hint">Pick a category above to publish.</p>}
            <button className="linklike pub-back" onClick={onClose}>
              {recategorizeOnly ? 'Cancel' : 'Not yet — keep editing'}
            </button>
          </div>
        ) : (
          <>
            <div className="pub-done-top">
              <span className="pub-tick">
                <CheckIcon size={20} />
              </span>
              <h2>You’re live</h2>
              <p>Anyone with the link can read this now.</p>
            </div>

            <div className="pub-url">
              <code>{liveUrl}</code>
              <button onClick={copyLive}>Copy link</button>
            </div>

            {/* The pull, at the moment brand visibly matters (ux-spec §5). An offer with a
                way past it, never a redirect. */}
            <div className="pub-nudge">
              <span className="pub-nudge-sw" aria-hidden>
                <i />
                <b />
              </span>
              <span className="pub-nudge-tx">
                <b>Make it look like you</b>
                Add your logo and colour so this reads as your help center, not ours.
              </span>
              <button className="btn" onClick={onCustomize}>
                Customize
              </button>
            </div>

            <div className="pub-done-foot">
              <button className="linklike" onClick={onViewSite}>
                View live page
              </button>
              <button className="linklike" onClick={onClose}>
                Back to the editor
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
