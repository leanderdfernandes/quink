import { useEffect, useState } from 'react'
import { READER_DOMAIN } from '../lib/config'
import type { Folder } from '../lib/types'

// The publish gate (build spec §7 / "Quink Flow" PUBLISH screen). An article can't go live
// unfiled — publishing IS filing it in a folder, because that folder is the category card
// its readers browse. A first-time user has no folders yet, so "+ New category" is inline:
// the make-articles → publish loop must never dead-end (North Star, CLAUDE.md §2).

type Props = {
  articleTitle: string
  subdomain: string | null
  // Whether this article still holds its source recording — publishing collects it.
  hasSourceVideo: boolean
  folders: Folder[]
  selectedFolderId: string | null
  onSelectFolder: (id: string) => void
  onCreateFolder: (name: string) => Promise<Folder | null>
  publishing: boolean
  published: boolean
  onPublish: () => void
  onClose: () => void
  onViewSite: () => void
}

export default function PublishModal({
  articleTitle,
  subdomain,
  hasSourceVideo,
  folders,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  publishing,
  published,
  onPublish,
  onClose,
  onViewSite,
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

  return (
    <div className="pub-overlay" onClick={() => !publishing && onClose()}>
      <div className="pub-card" onClick={(e) => e.stopPropagation()}>
        {!published ? (
          <>
            <span className="pub-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v13" />
                <path d="m8 12 4 4 4-4" />
                <path d="M20 21H4" />
              </svg>
            </span>
            <h2>Publish this article?</h2>
            <p className="pub-lede">
              It goes live on your help center immediately. You can edit or unpublish it any
              time.
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
              className="btn btn-lg pub-go"
              disabled={!selectedFolderId || publishing}
              onClick={onPublish}
            >
              {publishing ? 'Publishing…' : 'Publish now'}
            </button>
            {hasSourceVideo && (
              // The upload screen promises we delete the recording once the article is
              // published. Saying so again at the moment it happens turns a silent
              // background deletion into a visibly kept promise. Your screenshots stay —
              // they are the article; the recording was only ever the raw material.
              <p className="pub-note">
                Your source recording is deleted when this goes live. The screenshots stay.
              </p>
            )}
            {!selectedFolderId && (
              <p className="pub-hint">Pick a category above to publish.</p>
            )}
            <button className="linklike pub-back" onClick={onClose}>
              Not yet — keep editing
            </button>
          </>
        ) : (
          <>
            <span className="pub-icon done">
              <CheckIcon size={30} />
            </span>
            <h2>You’re live!</h2>
            <p className="pub-lede">
              Your article is now live under {selectedName} and searchable on your help center.
            </p>
            <div className="pub-live-url mono">{hcUrl}</div>
            <button className="btn btn-lg pub-go" onClick={onViewSite}>
              View your live help center
            </button>
            <button className="linklike pub-back" onClick={onClose}>
              Back to editor
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function CheckIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
