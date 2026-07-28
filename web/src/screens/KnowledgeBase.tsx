import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { helpCenterUrl } from '../lib/config'
import {
  deleteArticle,
  duplicateArticle,
  publishArticle,
  unpublishArticle,
} from '../lib/articles'
import { pendingEditCount, type StepLite } from '../lib/pendingEdits'
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

// Screen 4 — the article library (ux-spec §2).
//
// Folders group articles here AND become the category cards on the live site (migration
// 0009). The payoff rule still holds: never an empty dashboard, theme/domain/live-site all
// reachable from the rail but never blocking the make-articles loop.
//
// Rebuilt against articles-domain-design-pass.html. The row carried three persistent
// controls — a category select, an Edit button and a bin — which is ~66 controls on a
// 22-article screen. The row itself is now the target and the rest lives behind one hover
// menu. The strip at the top is the part that was missing entirely: article_feedback_summary
// (migration 0025) has existed since it shipped and nothing has ever called it.

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
  // Opens the upgrade path. The countdown pill, the sidebar panel and the day-7 banner are
  // all clickable at any point (pricing-spec §6) — a warning you can't act on is anxiety.
  onUpgrade: () => void
  // They arrived here from a claim link seconds ago. One line, dismissible, above the
  // articles — never a modal. The articles ARE the demo.
  justClaimed?: boolean
  onDismissWelcome?: () => void
}

// "Below this rate, on at least this many answers, the article needs looking at."
//
// The sample floor is the important half. A 0% helpful rate off two answers is two people
// having a bad afternoon, and surfacing it as a defect sends someone to rewrite an article
// that is fine. Five is the smallest number where a majority verdict is not one person, and
// half is the point where the article is failing more readers than it serves.
const HELPFUL_MIN_ANSWERS = 5
const HELPFUL_FLOOR = 0.5

type Feedback = { helpful: number; total: number }

type Meta = {
  steps: StepLite[]
  pending: number
  fb: Feedback | null
  // Steps with nothing to show. Only counted on GENERATED articles: a hand-written article
  // with no images is a choice, not a gap.
  missingShots: number
  attention: string[]
}

type StatusBadge = { label: string; cls: 'gen' | 'draft' | 'unlisted' | 'listed' | 'dirty' }

function statusBadge(a: ArticleRow, pending: number): StatusBadge {
  if (a.status === 'generating') return { label: 'Generating', cls: 'gen' }
  // The draft is ahead of what readers see — that is the more useful thing to say than
  // repeating that it is published. Same count as the editor's status pill.
  if (pending > 0 && a.visibility !== 'draft') {
    return { label: `${pending} unpublished ${pending === 1 ? 'edit' : 'edits'}`, cls: 'dirty' }
  }
  if (a.visibility === 'listed') return { label: 'Published', cls: 'listed' }
  // "Link only" is a label for the existing `unlisted` value, not a state of its own.
  if (a.visibility === 'unlisted') return { label: 'Link only', cls: 'unlisted' }
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

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

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
  const [steps, setSteps] = useState<Record<string, StepLite[]>>({})
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({})
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'live' | 'drafts' | 'attention'>('all')
  const [menuOpen, setMenuOpen] = useState(false)

  // Row menu, and the folder picker nested inside it.
  const [rowMenu, setRowMenu] = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // A bulk action is two steps: name what will happen, then report what did — per article,
  // because "3 of 5 failed" with no names is not something anyone can act on.
  const [bulk, setBulk] = useState<'move' | 'publish' | 'unpublish' | 'delete' | null>(null)
  const [bulkFolder, setBulkFolder] = useState<string>('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ ok: number; failed: string[] } | null>(null)

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
  const [bannerHidden, setBannerHidden] = useState(false)
  const renameInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [{ data }, fs, used, fb] = await Promise.all([
        supabase
          .from('articles')
          .select('*')
          .eq('kb_id', kb.id)
          .order('created_at', { ascending: false }),
        listFolders(kb.id),
        runsUsed(kb.owner_id),
        // Granted to authenticated since migration 0025 and called by nothing until now.
        // It proves ownership through auth.uid() itself, so there is no filter to add here.
        supabase.rpc('article_feedback_summary', { p_kb_id: kb.id }),
      ])
      if (cancelled) return
      const rows = (data as ArticleRow[]) ?? []
      setArticles(rows)
      setFolders(fs)
      setRuns(used)

      const summary: Record<string, Feedback> = {}
      for (const r of (fb.data ?? []) as {
        article_id: string
        helpful_count: number
        not_helpful_count: number
      }[]) {
        summary[r.article_id] = {
          helpful: Number(r.helpful_count),
          total: Number(r.helpful_count) + Number(r.not_helpful_count),
        }
      }
      setFeedback(summary)

      // One query for every step in the KB. It feeds both the unpublished-edit count and
      // the missing-screenshot check, so the screen pays for it once.
      if (rows.length) {
        // ponytail: one `in (…)` over every article id. Fine into the low hundreds;
        // past that this wants a view or a range query rather than a longer URL.
        const { data: sd } = await supabase
          .from('steps')
          .select('article_id, step_number, heading, body_text, screenshot_url')
          .in(
            'article_id',
            rows.map((r) => r.id),
          )
          .order('step_number')
        if (cancelled) return
        const byArticle: Record<string, StepLite[]> = {}
        for (const s of (sd ?? []) as (StepLite & { article_id: string })[]) {
          ;(byArticle[s.article_id] ||= []).push(s)
        }
        setSteps(byArticle)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [kb.id, kb.owner_id])

  // Everything derived per article, in one place, so the badge, the row meta, the
  // needs-attention count and the needs-attention FILTER can never disagree about an
  // article. The filter chip shows exactly the rows this marked.
  const meta = useMemo(() => {
    const out: Record<string, Meta> = {}
    for (const a of articles) {
      const st = steps[a.id] ?? []
      const pending = pendingEditCount(a.published_content, a.title, a.subtitle, st)
      const fb = feedback[a.id] ?? null
      const missingShots =
        a.source === 'generated' ? st.filter((s) => !s.screenshot_url).length : 0
      const attention: string[] = []
      if (missingShots) {
        attention.push(`${plural(missingShots, 'step')} with no screenshot`)
      }
      if (a.visibility === 'draft' && !a.folder_id) attention.push('draft with no folder')
      if (pending > 0 && a.visibility !== 'draft') {
        attention.push(`${plural(pending, 'edit')} readers can't see yet`)
      }
      if (fb && fb.total >= HELPFUL_MIN_ANSWERS && fb.helpful / fb.total < HELPFUL_FLOOR) {
        attention.push(
          `${Math.round((fb.helpful / fb.total) * 100)}% helpful over ${plural(fb.total, 'answer')}`,
        )
      }
      out[a.id] = { steps: st, pending, fb, missingShots, attention }
    }
    return out
  }, [articles, steps, feedback])

  const liveCount = articles.filter((a) => a.visibility === 'listed').length
  const draftCount = articles.filter((a) => a.visibility === 'draft').length
  const attentionIds = useMemo(
    () => new Set(articles.filter((a) => meta[a.id]?.attention.length).map((a) => a.id)),
    [articles, meta],
  )

  // Help-center-wide feedback. Sums the per-article rows rather than asking for a second
  // aggregate — the RPC already returned every row this KB has.
  const totals = useMemo(() => {
    let helpful = 0
    let total = 0
    for (const f of Object.values(feedback)) {
      helpful += f.helpful
      total += f.total
    }
    return { helpful, total }
  }, [feedback])

  const q = query.trim().toLowerCase()
  const matches = useMemo(
    () =>
      articles.filter((a) => {
        if (q && !(a.title || 'Untitled').toLowerCase().includes(q)) return false
        if (filter === 'live') return a.visibility === 'listed'
        if (filter === 'drafts') return a.visibility === 'draft'
        if (filter === 'attention') return attentionIds.has(a.id)
        return true
      }),
    [articles, q, filter, attentionIds],
  )
  const unfiled = matches.filter((a) => !a.folder_id)

  const byId = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles])
  const selectedArticles = [...selected].map((id) => byId.get(id)).filter(Boolean) as ArticleRow[]

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600)
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelected(new Set())
    setBulk(null)
    setBulkResult(null)
  }

  function toggleFolder(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
    setRowMenu(null)
    setMovingId(null)
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

  const liveUrl = (a: ArticleRow) => helpCenterUrl(kb.subdomain, `/${a.slug ?? ''}`)

  async function copyLink(a: ArticleRow) {
    try {
      await navigator.clipboard.writeText(liveUrl(a))
      flash('Link copied')
    } catch {
      flash(`Couldn't copy. The address is ${liveUrl(a)}`)
    }
    setRowMenu(null)
  }

  async function duplicate(a: ArticleRow) {
    setRowMenu(null)
    try {
      const id = await duplicateArticle(a, meta[a.id]?.steps ?? [])
      onOpenArticle(id)
    } catch {
      flash(`Couldn't copy "${a.title || 'Untitled'}". Try again.`)
    }
  }

  // --- bulk ------------------------------------------------------------------------
  // Every action reports per article. Publish is the one with a real rule behind it: an
  // article cannot go live unfiled, because the folder IS its category on the reader site.
  // Those are named and left alone rather than filed somewhere on the user's behalf.
  async function runBulk() {
    setBulkBusy(true)
    const failed: string[] = []
    let ok = 0
    for (const a of selectedArticles) {
      const name = a.title || 'Untitled'
      try {
        if (bulk === 'move') {
          await moveArticle(a.id, bulkFolder || null)
          setArticles((p) =>
            p.map((x) => (x.id === a.id ? { ...x, folder_id: bulkFolder || null } : x)),
          )
        } else if (bulk === 'publish') {
          if (!a.folder_id) {
            failed.push(`${name} — needs a folder first`)
            continue
          }
          await publishArticle(a, meta[a.id]?.steps ?? [])
          setArticles((p) =>
            p.map((x) => (x.id === a.id ? { ...x, visibility: 'listed' } : x)),
          )
        } else if (bulk === 'unpublish') {
          await unpublishArticle(a.id)
          setArticles((p) => p.map((x) => (x.id === a.id ? { ...x, visibility: 'draft' } : x)))
        } else if (bulk === 'delete') {
          await deleteArticle(a)
          setArticles((p) => p.filter((x) => x.id !== a.id))
        }
        ok += 1
      } catch (e) {
        failed.push(`${name} — ${e instanceof Error ? e.message : 'could not be updated'}`)
      }
    }
    setBulkBusy(false)
    setBulkResult({ ok, failed })
    setSelected(new Set())
    setBulk(null)
    // Publishing rewrites published_content and the slug; re-read so the badges are honest.
    if (ok) {
      const { data } = await supabase
        .from('articles')
        .select('*')
        .eq('kb_id', kb.id)
        .order('created_at', { ascending: false })
      if (data) setArticles(data as ArticleRow[])
    }
  }

  const BULK_COPY: Record<string, { q: string; go: string }> = {
    move: {
      q: `Move ${plural(selected.size, 'article')} to a folder?`,
      go: 'Move them',
    },
    publish: {
      q: `Publish ${plural(selected.size, 'article')} to your help center? Anything without a folder is skipped.`,
      go: 'Publish them',
    },
    unpublish: {
      q: `Take ${plural(selected.size, 'article')} off your help center? The links stop working until you publish again.`,
      go: 'Unpublish them',
    },
    delete: {
      q: `Delete ${plural(selected.size, 'article')}? This can't be undone, and it does not give a video run back.`,
      go: 'Delete them',
    },
  }

  // Only tiers with a lifetime cap get a counter. The unit is video RUNS — writing an
  // article by hand is unlimited on every tier, so the copy must not imply otherwise.
  const runLimit = limitsFor(plan).lifetime_runs
  const left = runLimit === null ? null : Math.max(runLimit - runs, 0)

  // Runs and days both drain. ONE pill, escalating with the clock (pricing-spec §6).
  const trial = trialFor(kb, plan)
  const pill = trialPillLabel(trial, left)
  const showBanner = trial.stage === 'urgent' && !bannerHidden && !loading

  const initial = (kb.name.trim()[0] || 'Q').toUpperCase()
  const logo = publicBrandingUrl(kb.logo_path)
  const libEmpty = !loading && articles.length === 0

  function renderRow(a: ArticleRow) {
    const m = meta[a.id]
    const badge = statusBadge(a, m?.pending ?? 0)
    const fb = m?.fb
    const rate = fb && fb.total ? Math.round((fb.helpful / fb.total) * 100) : null
    const isSelected = selected.has(a.id)
    const shareable = a.visibility !== 'draft' && !!a.slug

    if (confirmArticleId === a.id) {
      return (
        <div key={a.id} className="al-row al-row-confirm">
          <span>Delete “{a.title || 'Untitled'}”? This can't be undone.</span>
          <button
            className="row-confirm"
            disabled={deletingId === a.id}
            onClick={() => removeArticle(a)}
          >
            {deletingId === a.id ? 'Deleting…' : 'Delete'}
          </button>
          <button className="row-cancel" onClick={() => setConfirmArticleId(null)}>
            Cancel
          </button>
        </div>
      )
    }

    return (
      <div key={a.id} className={`al-row${isSelected ? ' sel' : ''}`}>
        <input
          type="checkbox"
          className="al-chk"
          checked={isSelected}
          onChange={() => toggleSelect(a.id)}
          aria-label={`Select ${a.title || 'Untitled'}`}
        />

        <button className="al-open" onClick={() => onOpenArticle(a.id)}>
          <span className="al-titleline">
            <b>{a.title || 'Untitled'}</b>
            <span className={`al-badge ${badge.cls}`}>{badge.label}</span>
            {!!m?.missingShots && (
              <span className="al-flag">
                {plural(m.missingShots, 'step')} with no screenshot
              </span>
            )}
          </span>
          {a.subtitle && <span className="al-sum">{a.subtitle}</span>}
          <span className="al-meta">
            {/* Reader and helpful figures appear only where the data is real. No
                per-article view count exists yet, so no row claims one. */}
            {rate !== null && (
              <span className={rate >= HELPFUL_FLOOR * 100 ? 'good' : 'poor'}>
                {rate}% helpful · {plural(fb!.total, 'answer')}
              </span>
            )}
            <span>Updated {timeAgo(a.updated_at)}</span>
          </span>
        </button>

        <div className="al-menuwrap">
          <button
            className="al-more"
            aria-haspopup="menu"
            aria-expanded={rowMenu === a.id}
            aria-label={`Actions for ${a.title || 'Untitled'}`}
            onClick={() => {
              setRowMenu((cur) => (cur === a.id ? null : a.id))
              setMovingId(null)
            }}
          >
            <DotsIcon />
          </button>
          {rowMenu === a.id && (
            <div className="al-menu" role="menu" onMouseLeave={() => setRowMenu(null)}>
              {movingId === a.id ? (
                <>
                  <p className="al-menu-cap">Move to</p>
                  <button role="menuitem" onClick={() => move(a.id, null)}>
                    Unfiled
                  </button>
                  {folders.map((f) => (
                    <button key={f.id} role="menuitem" onClick={() => move(a.id, f.id)}>
                      {f.name}
                    </button>
                  ))}
                  <button role="menuitem" className="al-menu-back" onClick={() => setMovingId(null)}>
                    Back
                  </button>
                </>
              ) : (
                <>
                  <button role="menuitem" onClick={() => onOpenArticle(a.id)}>
                    Edit
                  </button>
                  <button role="menuitem" onClick={() => setMovingId(a.id)}>
                    Change folder
                  </button>
                  <button role="menuitem" disabled={!shareable} onClick={() => copyLink(a)}>
                    Copy link
                  </button>
                  <a
                    role="menuitem"
                    href={shareable ? liveUrl(a) : undefined}
                    target="_blank"
                    rel="noopener"
                    aria-disabled={!shareable}
                    className={shareable ? '' : 'off'}
                    onClick={() => shareable && setRowMenu(null)}
                  >
                    View live page
                  </a>
                  <button role="menuitem" onClick={() => duplicate(a)}>
                    Duplicate
                  </button>
                  <button
                    role="menuitem"
                    className="danger"
                    onClick={() => {
                      setRowMenu(null)
                      setConfirmArticleId(a.id)
                    }}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderGroup(
    key: string,
    head: React.ReactNode,
    rows: ArticleRow[],
    extra?: React.ReactNode,
    className = '',
  ) {
    const isOpen = !collapsed.has(key)
    return (
      <section key={key} className={`al-grp ${className}`}>
        {head}
        {extra}
        {isOpen &&
          (rows.length > 0
            ? rows.map(renderRow)
            : !q && (
                <p className="al-grp-empty">Empty — move an article here, or publish into it.</p>
              ))}
      </section>
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
          <button className="trial-banner-x" onClick={onDismissWelcome} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      {/* Days 7–0: a persistent banner, not a pill (pricing-spec §7). */}
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

          {/* The trial and the run ledger both exist in the data and appeared nowhere in
              the app. The header pill is easy to miss and disappears entirely on day 7,
              when it is replaced by the banner — this panel is where someone can look. */}
          {(trial.stage !== 'none' || left !== null) && (
            <div className="rail-trial">
              {left !== null && runLimit !== null && (
                <div
                  className="rail-meter"
                  role="img"
                  aria-label={`${runLimit - left} of ${runLimit} video runs used`}
                >
                  <i style={{ width: `${((runLimit - left) / runLimit) * 100}%` }} />
                </div>
              )}
              <p>
                <b>
                  {trial.stage === 'none'
                    ? 'Free plan'
                    : trial.stage === 'offline'
                      ? 'Your help center is offline'
                      : `Free trial · ${plural(trial.daysLeft, 'day')} left`}
                </b>
                {left !== null && runLimit !== null
                  ? `${runLimit - left} of ${runLimit} video runs used. Articles you write by hand don't count.`
                  : 'Unlimited video runs on your plan.'}
              </p>
              <button className="linklike" onClick={onUpgrade}>
                See plans →
              </button>
            </div>
          )}
        </nav>

        <main className="lib-main">
          {selected.size > 0 ? (
            <div className="al-selbar">
              <span className="al-selcount">{plural(selected.size, 'article')} selected</span>
              <span className="al-selsp" />
              <button onClick={() => setBulk('move')}>Move to folder</button>
              <button onClick={() => setBulk('publish')}>Publish</button>
              <button onClick={() => setBulk('unpublish')}>Unpublish</button>
              <button onClick={() => setBulk('delete')}>Delete</button>
              <button className="x" onClick={clearSelection} aria-label="Clear selection">
                ✕
              </button>
            </div>
          ) : (
            <div className="lib-head">
              <div>
                <h1>All articles</h1>
                <p className="cap">
                  {plural(articles.length, 'article')} · {liveCount} live ·{' '}
                  {plural(folders.length, 'folder')}
                </p>
              </div>
              <div className="lib-head-actions">
                <button className="btn btn-ghost" onClick={newFolder}>
                  <FolderPlusIcon />
                  New folder
                </button>
                <div className="new-article">
                  <button
                    className="btn"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((o) => !o)}
                  >
                    New article ▾
                  </button>
                  {menuOpen && (
                    <div className="new-menu" role="menu" onMouseLeave={() => setMenuOpen(false)}>
                      {left !== null && (
                        <p className="new-menu-rem">
                          {left === 0
                            ? 'No free video runs left'
                            : `${plural(left, 'free video run')} left`}
                        </p>
                      )}
                      <button
                        role="menuitem"
                        className="new-menu-item"
                        onClick={() => {
                          setMenuOpen(false)
                          onNewArticle()
                        }}
                      >
                        <span>
                          <b>Upload a recording</b>
                          <small>
                            Screen recording in, drafted article out. Uses one video run.
                          </small>
                        </span>
                      </button>
                      <button
                        role="menuitem"
                        className="new-menu-item"
                        onClick={() => {
                          setMenuOpen(false)
                          onWriteFromScratch()
                        }}
                      >
                        <span>
                          <b>Write it yourself</b>
                          <small>Start from a blank article. Doesn't use a video run.</small>
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {bulk && (
            <div className="al-bulkconfirm">
              <p>{BULK_COPY[bulk].q}</p>
              {bulk === 'move' && (
                <select
                  value={bulkFolder}
                  onChange={(e) => setBulkFolder(e.target.value)}
                  aria-label="Folder to move to"
                >
                  <option value="">Unfiled</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              )}
              <button className="row-confirm" disabled={bulkBusy} onClick={runBulk}>
                {bulkBusy ? 'Working…' : BULK_COPY[bulk].go}
              </button>
              <button className="row-cancel" onClick={() => setBulk(null)}>
                Cancel
              </button>
            </div>
          )}

          {bulkResult && (
            <div className={`al-bulkresult${bulkResult.failed.length ? ' bad' : ''}`}>
              <p>
                {bulkResult.ok
                  ? `${plural(bulkResult.ok, 'article')} updated.`
                  : 'Nothing was changed.'}
                {bulkResult.failed.length > 0 && ` ${plural(bulkResult.failed.length, 'article')} skipped:`}
              </p>
              {bulkResult.failed.length > 0 && (
                <ul>
                  {bulkResult.failed.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
              <button className="linklike" onClick={() => setBulkResult(null)}>
                Dismiss
              </button>
            </div>
          )}

          {/* The value-proof strip. Any figure without real data behind it says so —
              a zero here would read as a measurement of nothing. */}
          <div className="al-stats">
            <div className={`al-stat${kb.reader_views > 0 ? '' : ' empty'}`}>
              <p className="k">Readers · 30 days</p>
              {kb.reader_views > 0 ? (
                <p className="v">{kb.reader_views.toLocaleString()}</p>
              ) : (
                <p className="v">Not counted yet</p>
              )}
              <p className="t">
                {kb.reader_views > 0 ? 'Across your help center' : 'Reader visits aren’t recorded'}
              </p>
            </div>

            <div className={`al-stat${totals.total > 0 ? '' : ' empty'}`}>
              <p className="k">Found it helpful</p>
              {totals.total > 0 ? (
                <p className="v">
                  {Math.round((totals.helpful / totals.total) * 100)}
                  <small>%</small>
                </p>
              ) : (
                <p className="v">No answers yet</p>
              )}
              <p className="t">
                {totals.total > 0
                  ? `of ${plural(totals.total, 'answer')}`
                  : 'Readers are asked at the end of each article'}
              </p>
            </div>

            <div className="al-stat">
              <p className="k">Live articles</p>
              <p className="v">{liveCount}</p>
              <p className="t">{plural(draftCount, 'draft')}</p>
            </div>

            {/* Spans, not paragraphs: a <button> may only contain phrasing content. */}
            <button
              className={`al-stat as-btn${attentionIds.size ? '' : ' empty'}`}
              aria-pressed={filter === 'attention'}
              onClick={() => setFilter((f) => (f === 'attention' ? 'all' : 'attention'))}
            >
              <span className="k">Needs attention</span>
              <span className="v">{attentionIds.size || 'Nothing'}</span>
              <span className={`t${attentionIds.size ? ' warn' : ''}`}>
                {attentionIds.size ? 'Show only these' : 'Everything looks fine'}
              </span>
            </button>
          </div>

          <div className="al-tools">
            <div className="lib-search">
              <SearchIcon />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your articles…"
                aria-label="Search articles"
              />
            </div>
            <div className="al-chips" role="group" aria-label="Filter articles">
              {(
                [
                  ['all', 'All', articles.length],
                  ['live', 'Live', liveCount],
                  ['drafts', 'Drafts', draftCount],
                  ['attention', 'Needs attention', attentionIds.size],
                ] as const
              ).map(([key, label, n]) => (
                <button
                  key={key}
                  className={`al-chip${key === 'attention' ? ' attn' : ''}`}
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {label}
                  <span className="c">{n}</span>
                </button>
              ))}
            </div>
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
                if ((q || filter !== 'all') && rows.length === 0) return null
                const head = (
                  <div className="al-grp-hd">
                    <button
                      className="al-tw"
                      aria-expanded={!collapsed.has(f.id)}
                      aria-label={`${collapsed.has(f.id) ? 'Expand' : 'Collapse'} ${f.name}`}
                      onClick={() => toggleFolder(f.id)}
                    >
                      <ChevronIcon open={!collapsed.has(f.id)} />
                    </button>
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
                        <button
                          className="btn"
                          style={{ padding: '6px 13px' }}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => saveRename(f.id)}
                        >
                          Save
                        </button>
                      </>
                    ) : (
                      <>
                        <h2>{f.name}</h2>
                        <span className="n">{plural(rows.length, 'article')}</span>
                        <span className="al-ga">
                          <button
                            aria-label={`Rename ${f.name}`}
                            onClick={() => {
                              setRenamingId(f.id)
                              setRenameValue(f.name)
                              setTimeout(() => renameInput.current?.focus(), 0)
                            }}
                          >
                            <PencilIcon />
                          </button>
                          <button
                            aria-label={`Delete ${f.name}`}
                            onClick={() => setConfirmFolderId(f.id)}
                          >
                            <TrashIcon />
                          </button>
                        </span>
                      </>
                    )}
                  </div>
                )
                const confirm =
                  confirmFolderId === f.id ? (
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
                  ) : null
                return renderGroup(f.id, head, rows, confirm)
              })}

              {unfiled.length > 0 &&
                renderGroup(
                  '__unfiled__',
                  <div className="al-grp-hd">
                    <button
                      className="al-tw"
                      aria-expanded={!collapsed.has('__unfiled__')}
                      aria-label={`${collapsed.has('__unfiled__') ? 'Expand' : 'Collapse'} Unfiled`}
                      onClick={() => toggleFolder('__unfiled__')}
                    >
                      <ChevronIcon open={!collapsed.has('__unfiled__')} />
                    </button>
                    <h2>Unfiled</h2>
                    <span className="n">{plural(unfiled.length, 'article')}</span>
                    <span className="al-hint">
                      These need a folder before they can go live — the folder is the category
                      readers browse.
                    </span>
                  </div>,
                  unfiled,
                  null,
                  'unfiled',
                )}

              {matches.length === 0 && (
                <div className="lib-blank">
                  <div className="lib-blank-title">
                    {q ? `No articles match “${query}”` : 'Nothing in this filter'}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {toast && (
        <div className="al-toast" role="status">
          {toast}
        </div>
      )}
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
const FolderPlusIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...stroke}>
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    <path d="M12 10v6" />
    <path d="M9 13h6" />
  </svg>
)
const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...stroke}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...stroke}>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
  </svg>
)
const DotsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="5" cy="12" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="19" cy="12" r="1.7" />
  </svg>
)
const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    {...stroke}
    strokeWidth={2.6}
    style={{ transform: open ? 'none' : 'rotate(-90deg)' }}
    aria-hidden
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
)
