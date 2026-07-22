import { useState } from 'react'
import { FREE_ARTICLE_EXPIRY_DAYS, helpCenterUrl, READER_DOMAIN } from '../lib/config'
import type { Visibility } from '../lib/types'

// Article sharing (build spec §2). Publish state IS link state — no separate share setting.
// Copy-link is a SINGLE button that copies and confirms the access level in plain words
// (never a modal of radio buttons). It's disabled while draft, and the URL reads as inactive
// so the "why" is obvious before the fact, not explained after.

type Props = {
  visibility: Visibility
  slug: string | null
  dirty: boolean
  publishing: boolean
  subdomain: string | null
  plan: string
  onPublish: () => void
  onPublishChanges: () => void
  onSetVisibility: (v: 'listed' | 'unlisted') => void
}

export default function ShareControls({
  visibility,
  slug,
  dirty,
  publishing,
  subdomain,
  plan,
  onPublish,
  onPublishChanges,
  onSetVisibility,
}: Props) {
  const [toast, setToast] = useState<string | null>(null)
  const readerUrl = helpCenterUrl(subdomain, slug ? `/${slug}` : '')
  const displayUrl = `${subdomain ?? '…'}.${READER_DOMAIN}/${slug ?? '…'}`

  async function copyLink() {
    await navigator.clipboard.writeText(readerUrl)
    const access =
      visibility === 'listed'
        ? 'Anyone with the link can read it. It’s listed in your help center.'
        : 'Anyone with the link can read it. It’s not listed in your help center.'
    const expiry =
      plan === 'free' ? ` Free articles are removed after ${FREE_ARTICLE_EXPIRY_DAYS} days.` : ''
    setToast(`Link copied — ${access}${expiry}`)
    setTimeout(() => setToast(null), 6000)
  }

  if (visibility === 'draft') {
    return (
      <div className="share">
        <span className="share-url inactive" title="Publish to activate this link">
          {displayUrl} · inactive
        </span>
        <button className="btn btn-ghost share-copy" disabled aria-disabled>
          Copy link
        </button>
        <button className="btn publish-btn" onClick={onPublish} disabled={publishing}>
          {publishing ? 'Publishing…' : 'Publish'}
        </button>
      </div>
    )
  }

  return (
    <div className="share">
      <div className="vis-toggle" role="group" aria-label="Visibility">
        <button
          className={`vis-opt${visibility === 'listed' ? ' on' : ''}`}
          onClick={() => onSetVisibility('listed')}
        >
          Listed
        </button>
        <button
          className={`vis-opt${visibility === 'unlisted' ? ' on' : ''}`}
          onClick={() => onSetVisibility('unlisted')}
        >
          Unlisted
        </button>
      </div>

      <button className="btn btn-ghost share-copy" onClick={copyLink}>
        Copy link
      </button>
      <button
        className="btn btn-ghost publish-view"
        onClick={() => window.open(readerUrl, '_blank')}
      >
        View
      </button>
      {dirty && (
        <button className="btn publish-btn" onClick={onPublishChanges} disabled={publishing}>
          {publishing ? 'Publishing…' : 'Publish changes'}
        </button>
      )}

      {toast && <div className="share-toast">{toast}</div>}
    </div>
  )
}
