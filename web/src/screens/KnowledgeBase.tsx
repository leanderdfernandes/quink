import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { helpCenterUrl } from '../lib/config'
import { deleteArticle } from '../lib/articles'
import { limitsFor, runsUsed } from '../lib/plans'
import { publicBrandingUrl } from '../lib/storage'
import {
  createFolder,
  deleteFolder,
  listFolders,
  moveArticle,
  renameFolder,
} from '../lib/folders'
import { trialBannerLabel, trialFor, trialPillLabel } from '../lib/trial'
import Wordmark from '../components/Wordmark'
import KbSwitcher from '../components/KbSwitcher'
import type { ArticleRow, Folder, KnowledgeBase as KB } from '../lib/types'

// Screen 4 — the article library (ux-spec §2, redesigned to the "Quink Flow" mock).
//
// Folders group articles here AND become the category cards on the live site (migration
// 0009). The payoff rule still holds: never an empty dashboard, theme/domain/live-site all
// reachable from the rail but never blocking the make-articles loop.

type Props = {
  kb: KB
  // The owner's plan (profiles.plan). Entitlements are owner-level, never per-KB.
  plan: string
  // Every KB this account can open. Unused on a 1-KB plan — the switcher renders a label.
  kbs: KB[]
  onSwitchKb: (kbId: string) => void
  onNewArticle: () => void
  onWriteFromScratch: () => void
  onOpenArticle: (id: string) => void
  onOpenTheme: () => void
  onOpenDomain: () => void
  onSignOut: () => void
  // Opens the upgrade path. The countdown pill and the day-7 banner are both clickable at
  // any point (pricing-spec §6) — a warning you can't act on is just anxiety.
  onUpgrade: () => void
  // They arrived here from a claim link seconds ago. One line, dismissible, above the
  // articles — never a modal. The articles ARE the demo; putting anything in front of them
  // is putting a tour in front of the thing the tour is about.
  justClaimed?: boolean
  onDismissWelcome?: () => void
}

type StatusPill = { label: string; cls: 'gen' | 'draft' | 'unlisted' | 'listed' }

function statusPill(a: ArticleRow): StatusPill {
  if (a.status === 'generating') return { label: 'Generating', cls: 'gen' }
  if (a.visibility === 'listed') return { label: 'Published', cls: 'listed' }
  if (a.visibility === 'unlisted') return { label: 'Link-only', cls: 'unlisted' }
  return { label: 'Draft', cls: 'draft' }
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function KnowledgeBase({
  kb,
  plan,
  kbs,
  onSwitchKb,
  onNewArticle,
  onWriteFromScratch,
  onOpenArticle,
  onOpenTheme,
  onOpenDomain,
  onSignOut,
  onUpgrade,
  justClaimed,
  onDismissWelcome,
}: Props) {
  const [articles, setArticles] = useState<ArticleRow[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  // Inline, two-step confirms — delete is irreversible, so never one click.
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmFolderId, setConfirmFolderId] = useState<string | null>(null)
  const [confirmArticleId, setConfirmArticleId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // AI video runs spent, read from the append-only jobs ledger — never from a counter on
  // the KB. Deleting an article does not give a run back, so this number only rises.
  const [runs, setRuns] = useState(0)
  // The day-7 banner is dismissible PER SESSION only (pricing-spec §7) — never permanently.
  // Someone who dismisses it on day 7 still has to see it on day 6.
  const [bannerHidden, setBannerHidden] = useState(false)
  const renameInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      supabase
        .from('articles')
        .select('*')
        .eq('kb_id', kb.id)
        .order('created_at', { ascending: false }),
      listFolders(kb.id),
      runsUsed(kb.owner_id),
    ]).then(([{ data }, fs, used]) => {
      setArticles((data as ArticleRow[]) ?? [])
      setFolders(fs)
      setRuns(used)
      setLoading(false)
    })
  }, [kb.id, kb.owner_id])

  const q = query.trim().toLowerCase()
  const matches = useMemo(
    () => (q ? articles.filter((a) => (a.title || 'Untitled').toLowerCase().includes(q)) : articles),
    [articles, q],
  )
  const unfiled = matches.filter((a) => !a.folder_id)
  // Folder options for the move dropdown: every folder + Unfiled.
  const folderOptions = folders

  async function newFolder() {
    const f = await createFolder(kb.id, folders)
    if (!f) return
    setFolders((prev) => [...prev, f])
    setRenamingId(f.id)
    setRenameValue('')
    setTimeout(() => renameInput.current?.focus(), 0)
  }

  async function saveRename(id: string) {
    const name = renameValue.trim() || 'Untitled'
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)))
    setRenamingId(null)
    await renameFolder(id, name)
  }

  async function confirmDeleteFolder(id: string) {
    setFolders((prev) => prev.filter((f) => f.id !== id))
    // Its articles fall to Unfiled (FK set-null); mirror that locally.
    setArticles((prev) => prev.map((a) => (a.folder_id === id ? { ...a, folder_id: null } : a)))
    setConfirmFolderId(null)
    await deleteFolder(id)
  }

  async function move(articleId: string, folderId: string | null) {
    setArticles((prev) => prev.map((a) => (a.id === articleId ? { ...a, folder_id: folderId } : a)))
    await moveArticle(articleId, folderId)
  }

  async function removeArticle(a: ArticleRow) {
    setDeletingId(a.id)
    try {
      await deleteArticle(a)
      setArticles((prev) => prev.filter((x) => x.id !== a.id))
    } finally {
      setDeletingId(null)
      setConfirmArticleId(null)
    }
  }

  // Only tiers with a lifetime cap get a counter. The unit is video RUNS — writing an
  // article by hand is unlimited on every tier, so the copy must not imply otherwise.
  const runLimit = limitsFor(plan).lifetime_runs
  const left = runLimit === null ? null : Math.max(runLimit - runs, 0)

  // Runs and days both drain. ONE pill, escalating with the clock (pricing-spec §6) — two
  // competing meters is noise. Past day 7 the pill gives way to a persistent banner,
  // because a countdown that fits in the header no longer matches the stakes.
  const trial = trialFor(kb, plan)
  const pill = trialPillLabel(trial, left)
  // Held back until the article count is real. The banner names it ("your 12 articles"),
  // and rendering "your 0 articles" for a frame in the last week before deletion is exactly
  // the kind of wrong number that makes a user stop believing the countdown.
  const showBanner = trial.stage === 'urgent' && !bannerHidden && !loading

  const initial = (kb.name.trim()[0] || 'Q').toUpperCase()
  const logo = publicBrandingUrl(kb.logo_path)
  const libEmpty = !loading && articles.length === 0

  function renderRow(a: ArticleRow) {
    const pill = statusPill(a)
    return (
      <div key={a.id} className="lib-row">
        <span className="lib-row-icon" aria-hidden>
          <FileIcon />
        </span>
        <div className="lib-row-main">
          <div className="lib-row-title-line">
            <span className="lib-row-title">{a.title || 'Untitled'}</span>
            <span className={`lib-pill ${pill.cls}`}>{pill.label}</span>
          </div>
          <div className="lib-row-meta">
            {timeAgo(a.updated_at)}
            {a.subtitle ? ` · ${a.subtitle}` : ''}
          </div>
        </div>
        {confirmArticleId === a.id ? (
          <div className="lib-confirm">
            <span>Delete this article?</span>
            <button className="row-confirm" disabled={deletingId === a.id} onClick={() => removeArticle(a)}>
              {deletingId === a.id ? 'Deleting…' : 'Delete'}
            </button>
            <button className="row-cancel" onClick={() => setConfirmArticleId(null)}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="lib-row-actions">
            <select
              className="lib-move"
              value={a.folder_id ?? ''}
              onChange={(e) => move(a.id, e.target.value || null)}
              aria-label="Move to folder"
            >
              <option value="">Unfiled</option>
              {folderOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <button className="lib-edit" onClick={() => onOpenArticle(a.id)}>
              Edit
            </button>
            <button
              className="lib-icon-btn danger"
              onClick={() => setConfirmArticleId(a.id)}
              title="Delete article"
              aria-label={`Delete ${a.title || 'article'}`}
            >
              <TrashIcon />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="lib">
      <header className="lib-top">
        <div className="lib-top-brand">
          <Wordmark height={20} />
          <span className="lib-sep">/</span>
          {logo ? (
            <img className="lib-kb-logo" src={logo} alt="" />
          ) : (
            <span className="lib-kb-badge" style={{ background: kb.primary_color }}>
              {initial}
            </span>
          )}
          <KbSwitcher kb={kb} plan={plan} kbs={kbs} onSwitch={onSwitchKb} />
          <span className="lib-kb-tag">Help Center</span>
        </div>
        <div className="lib-top-right">
          {pill && (
            <button
              className={`counter counter-btn${trial.stage === 'warning' ? ' amber' : ''}`}
              onClick={onUpgrade}
            >
              {pill}
            </button>
          )}
          <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {/* Handover greeting. Two sentences, above the articles, gone on click. */}
      {justClaimed && (
        <div className="claim-welcome">
          <span>
            <b>{kb.name} is yours.</b> Every article is editable — open one and change
            anything. Add more from a recording or write one by hand.
          </span>
          <button
            className="trial-banner-x"
            onClick={onDismissWelcome}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Days 7–0: a persistent banner, not a pill (pricing-spec §7). It names the article
          count because "your 12 articles" is the sentence that lands where "your content"
          does not — and this is the last warning before the site goes dark. */}
      {showBanner && (
        <div className="trial-banner">
          <span>{trialBannerLabel(trial, articles.length)}</span>
          <button className="btn" onClick={onUpgrade}>
            Keep my help center
          </button>
          <button
            className="trial-banner-x"
            onClick={() => setBannerHidden(true)}
            aria-label="Dismiss until next visit"
          >
            ✕
          </button>
        </div>
      )}

      <div className="lib-body">
        <nav className="rail">
          <p className="rail-label">Content</p>
          <div className="rail-item on">
            <BookIcon />
            Articles<span className="rail-count">{articles.length}</span>
          </div>
          <p className="rail-label">Your help center</p>
          <button className="rail-item link" onClick={onOpenTheme}>
            <BrandIcon />
            Theming
          </button>
          <a
            className="rail-item link"
            href={helpCenterUrl(kb.subdomain)}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalIcon />
            View live site
          </a>
          <button className="rail-item link" onClick={onOpenDomain}>
            <GlobeIcon />
            Domain
          </button>
        </nav>

        <main className="lib-main">
          <div className="lib-head">
            <div>
              <h1>All articles</h1>
              <p className="cap">
                {articles.length} {articles.length === 1 ? 'article' : 'articles'} ·{' '}
                {folders.length} {folders.length === 1 ? 'folder' : 'folders'}
              </p>
            </div>
            <div className="lib-head-actions">
              <button className="btn btn-ghost" onClick={newFolder}>
                <FolderPlusIcon />
                New folder
              </button>
              <div className="new-article">
                <button className="btn" onClick={() => setMenuOpen((o) => !o)}>
                  New article ▾
                </button>
                {menuOpen && (
                  <div className="new-menu" onMouseLeave={() => setMenuOpen(false)}>
                    <button
                      className="new-menu-item primary"
                      onClick={() => {
                        setMenuOpen(false)
                        onNewArticle()
                      }}
                    >
                      <span className="new-menu-icon">🎥</span>
                      <span>
                        <b>Record or upload a video</b>
                        <small>Fastest — we draft the whole article</small>
                      </span>
                    </button>
                    <button
                      className="new-menu-item"
                      onClick={() => {
                        setMenuOpen(false)
                        onWriteFromScratch()
                      }}
                    >
                      <span className="new-menu-icon">✏️</span>
                      <span>
                        <b>Write it myself</b>
                        <small>Start from a blank step</small>
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lib-search">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search all your articles…"
            />
          </div>

          {libEmpty ? (
            <div className="lib-blank">
              <div className="lib-blank-title">Nothing here yet</div>
              <div className="cap">Record a workflow and Quink drafts your first article.</div>
              <button className="btn" style={{ marginTop: 16 }} onClick={onNewArticle}>
                Create an article
              </button>
            </div>
          ) : (
            <>
              {folders.map((f) => {
                const rows = matches.filter((a) => a.folder_id === f.id)
                if (q && rows.length === 0) return null
                return (
                  <div key={f.id} className="folder-card">
                    <div className="folder-head">
                      <span className="folder-icon" aria-hidden>
                        <FolderIcon />
                      </span>
                      {renamingId === f.id ? (
                        <>
                          <input
                            ref={renameInput}
                            className="folder-rename"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => saveRename(f.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur()
                              if (e.key === 'Escape') setRenamingId(null)
                            }}
                            placeholder="Folder name"
                          />
                          <button className="btn" style={{ padding: '7px 14px' }} onMouseDown={(e) => e.preventDefault()} onClick={() => saveRename(f.id)}>
                            Save
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="folder-name">{f.name}</span>
                          <span className="folder-count">
                            {rows.length} {rows.length === 1 ? 'article' : 'articles'}
                          </span>
                          <div className="folder-actions">
                            <button
                              className="lib-icon-btn"
                              title="Rename folder"
                              onClick={() => {
                                setRenamingId(f.id)
                                setRenameValue(f.name)
                                setTimeout(() => renameInput.current?.focus(), 0)
                              }}
                            >
                              <PencilIcon />
                            </button>
                            <button
                              className="lib-icon-btn danger"
                              title="Delete folder"
                              onClick={() => setConfirmFolderId(f.id)}
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    {confirmFolderId === f.id && (
                      <div className="folder-confirm">
                        <span>
                          Delete “{f.name}”? Any articles inside move to Unfiled — they aren't
                          deleted.
                        </span>
                        <button className="row-confirm" onClick={() => confirmDeleteFolder(f.id)}>
                          Delete folder
                        </button>
                        <button className="row-cancel" onClick={() => setConfirmFolderId(null)}>
                          Cancel
                        </button>
                      </div>
                    )}
                    {rows.length > 0
                      ? rows.map(renderRow)
                      : !q && <div className="folder-empty">Empty — move an article here or publish into it.</div>}
                  </div>
                )
              })}

              {unfiled.length > 0 && (
                <div className="folder-card unfiled">
                  <div className="folder-head">
                    <span className="folder-icon plain" aria-hidden>
                      <InboxIcon />
                    </span>
                    <span className="folder-name">Unfiled</span>
                    <span className="folder-count">Assign a folder to publish these</span>
                  </div>
                  {unfiled.map(renderRow)}
                </div>
              )}

              {q && matches.length === 0 && (
                <div className="lib-blank">
                  <div className="lib-blank-title">No articles match “{query}”</div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}

/* --- Inline icons (lucide paths, stroked with currentColor) --- */
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}
const BookIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
  </svg>
)
const BrandIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
    <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
    <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
    <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
    <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2Z" />
  </svg>
)
const ExternalIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </svg>
)
const GlobeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" />
  </svg>
)
const SearchIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
)
const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
  </svg>
)
const FolderPlusIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...stroke}>
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    <path d="M12 10v6" />
    <path d="M9 13h6" />
  </svg>
)
const FileIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </svg>
)
const PencilIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...stroke}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)
const TrashIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...stroke}>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
  </svg>
)
const InboxIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
    <path d="M12 3v13" />
    <path d="m8 11 4 4 4-4" />
    <path d="M4 21h16" />
  </svg>
)
