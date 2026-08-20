import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { helpCenterUrl } from '../lib/config'
import {
  deleteArticle,
  duplicateArticle,
  publishArticle,
  unpublishArticle,
} from '../lib/articles'
import DeleteAccountModal from '../components/DeleteAccountModal'
import LegalFooter from '../components/LegalFooter'
import { pendingEditCount, type StepLite } from '../lib/pendingEdits'
import { listInFlightJobs } from '../lib/jobs'
import { runsLeftFrom, type Entitlements } from '../lib/plans'
import type { Person } from '../lib/people'
import AvatarStack from '../components/AvatarStack'
import { publicBrandingUrl } from '../lib/storage'
import {
  createFolder,
  deleteFolder,
  listFolders,
  moveArticle,
  renameFolder,
} from '../lib/folders'
import { trialBannerLabel, trialFor, trialPillLabel } from '../lib/trial'
import { articleState, buildProgress } from '../lib/buildState'
import BuildBar from '../editor/BuildBar'
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
  // The owner's plan (profiles.plan). Entitlements are owner-level, never per-KB — and
  // NULL when this account is not the owner: a member cannot read the owner's tier and must
  // not be shown it (team-access-spec L7). Every billing surface below keys on that.
  plan: string | null
  // The OWNER's limits and usage for this KB, resolved by kb_entitlements(). This is what
  // the run meter and the trial clock read — never the caller's own plan, which is the
  // wrong answer for everyone except the owner.
  ent: Entitlements | null
  // Owner of this help center. Not Quink staff, and not "can edit".
  isOwner: boolean
  userId: string | null
  // Everyone who can edit this KB, for the avatar stack. Owner + members + live invites.
  people: Person[]
  onOpenPeople: () => void
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
  // A run was started from this screen and its article does not exist yet — Stage 1 creates
  // it about fifteen seconds in. Without this the list has nothing to watch for and the
  // upload looks like it did nothing at all.
  runInFlight?: boolean
}

// Below this rate the helpful figure on a row reads as poor rather than good — half is the
// point where the article is failing more readers than it serves.
const HELPFUL_FLOOR = 0.5

// How often to ask whether a run that was going at page load still is. Slower than the
// generating screen's 2s: nobody is staring at this row waiting for it.
const GENERATING_POLL_MS = 5000

type Feedback = { helpful: number; total: number }

// Steps done / steps that exist, for a row that is still being built. Same numbers, same
// helper and same component as the editor's build bar.
type Build = { done: number; total: number }

type Meta = {
  steps: StepLite[]
  pending: number
  fb: Feedback | null
  // Steps with nothing to show. Only counted on GENERATED articles: a hand-written article
  // with no images is a choice, not a gap.
  missingShots: number
  build: Build
}

type StatusBadge = { label: string; cls: 'gen' | 'draft' | 'unlisted' | 'listed' | 'dirty' }

function statusBadge(a: ArticleRow, pending: number, build: Build | null): StatusBadge {
  // Same derived state the editor's pill reads (lib/buildState). An article being written
  // needs its OWN row state, or someone who leaves the tab opens a half-written article
  // expecting a finished one — and the count is the same count the editor's bar shows.
  if (articleState(a) === 'building') {
    return {
      label: build?.total ? `Building · ${build.done} of ${build.total}` : 'Building',
      cls: 'gen',
    }
  }
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

// Exported for the admin KB table, which needs the same shape of label. One helper, so
// "2h ago" means the same thing on both screens.
export function timeAgo(iso: string): string {
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
  ent,
  isOwner,
  userId,
  people,
  onOpenPeople,
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
  runInFlight = false,
}: Props) {
  const [articles, setArticles] = useState<ArticleRow[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [steps, setSteps] = useState<Record<string, StepLite[]>>({})
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({})
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'live' | 'drafts'>('all')
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

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
  // The day-7 banner is dismissible PER SESSION only (pricing-spec §7) — never permanently.
  const [bannerHidden, setBannerHidden] = useState(false)
  const renameInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [{ data }, fs, fb] = await Promise.all([
        supabase
          .from('articles')
          .select('*')
          .eq('kb_id', kb.id)
          .order('created_at', { ascending: false }),
        listFolders(kb.id),
        // Granted to authenticated since migration 0025 and called by nothing until now.
        // It proves ownership through auth.uid() itself, so there is no filter to add here.
        supabase.rpc('article_feedback_summary', { p_kb_id: kb.id }),
      ])
      if (cancelled) return
      const rows = (data as ArticleRow[]) ?? []
      setArticles(rows)
      setFolders(fs)

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
          .select(
            'article_id, step_number, heading, body_text, screenshot_url, annotations, is_edited, timestamp_seconds',
          )
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

  // A string, not an array, so this only changes when the SET of generating articles does —
  // an array literal would be a new value every render and restart the poll below forever.
  // Every article id currently on screen. A ref so the poll can test membership without
  // being restarted every time the list changes.
  const knownIds = useRef<Set<string>>(new Set())
  knownIds.current = new Set(articles.map((a) => a.id))

  const generatingIds = useMemo(
    () =>
      articles
        .filter((a) => a.status === 'generating')
        .map((a) => a.id)
        .join(','),
    [articles],
  )

  // The "Generating" badge froze at whatever the row said when the page loaded: a run that
  // finished a second later still read as generating until a manual reload, and closing the
  // tab mid-run made that permanent. Watch the run ledger instead.
  //
  // It runs whenever a run COULD be in flight, not only when a generating row is already on
  // screen, because a run started from this screen creates its article ~15s later — the row
  // has to arrive on its own or the upload looks like it did nothing.
  useEffect(() => {
    if (!generatingIds && !runInFlight) return
    let watching = generatingIds ? generatingIds.split(',') : []
    let stop = false
    let timer: ReturnType<typeof setTimeout>

    async function tick() {
      const jobs = await listInFlightJobs(kb.owner_id)
      if (stop) return
      const inflight = new Set(jobs.map((j) => j.article_id))

      // An article this KB does not have yet: a run we started has just created it.
      const unknown = jobs
        .map((j) => j.article_id)
        .filter((id): id is string => !!id && !knownIds.current.has(id))

      const settled = watching.filter((id) => !inflight.has(id))
      // Each id is re-read ONCE after its job leaves the queue. A row still saying
      // 'generating' with no job behind it (a worker that died mid-run) is not going to
      // change on its own — keep watching it and this loop never ends.
      watching = watching.filter((id) => inflight.has(id))

      // The row's count has to move, or "Building · 2 of 7" is a number frozen at whatever
      // it was when the page loaded — which is the article-list version of exactly the bug
      // this fixes. Steps are re-read for whatever is still running; the initial load
      // already read them for everything else.
      const running = jobs
        .map((j) => j.article_id)
        .filter((id): id is string => !!id)
      if (running.length) {
        const { data: sd } = await supabase
          .from('steps')
          .select('article_id, step_number, heading, body_text, screenshot_url, annotations')
          .in('article_id', running)
          .order('step_number')
        if (stop) return
        const byArticle: Record<string, StepLite[]> = {}
        for (const s of (sd ?? []) as (StepLite & { article_id: string })[]) {
          ;(byArticle[s.article_id] ||= []).push(s)
        }
        if (Object.keys(byArticle).length) setSteps((prev) => ({ ...prev, ...byArticle }))
      }

      const wanted = [...new Set([...settled, ...unknown])]
      if (wanted.length) {
        const { data } = await supabase.from('articles').select('*').in('id', wanted)
        if (stop) return
        const fresh = (data as ArticleRow[] | null) ?? []
        if (fresh.length) {
          setArticles((prev) => {
            const seen = new Set(prev.map((a) => a.id))
            const added = fresh.filter((f) => !seen.has(f.id))
            const merged = prev.map((a) => fresh.find((f) => f.id === a.id) ?? a)
            // Newest first, same order the initial query uses.
            return [...added, ...merged]
          })
        }
      }
      // Keep going while anything is still running, while a watched row is unresolved, or
      // while the DOCK still has work in flight.
      //
      // That last clause is load-bearing and was missing. A run started from this screen
      // UPLOADS first and only then creates its job row, so the first tick — five seconds
      // in, mid-upload — asks the ledger and is told nothing is running. Without
      // `runInFlight` the loop treated that as "nothing to wait for" and stopped for good,
      // five seconds into a ninety-second run. The article row then never arrived at all:
      // not as Building, and not as Draft when it finished. `runInFlight` is a dep, so the
      // effect restarts when the dock empties and this cannot spin forever.
      if (!stop && (watching.length || jobs.length || runInFlight)) {
        timer = setTimeout(tick, GENERATING_POLL_MS)
      }
    }

    timer = setTimeout(tick, GENERATING_POLL_MS)
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [generatingIds, runInFlight, kb.owner_id])

  // Everything derived per article, in one place, so the badge and the row meta can never
  // disagree about an article.
  const meta = useMemo(() => {
    const out: Record<string, Meta> = {}
    for (const a of articles) {
      const st = steps[a.id] ?? []
      const pending = pendingEditCount(a.published_content, a.title, a.subtitle, st)
      const fb = feedback[a.id] ?? null
      const missingShots =
        a.source === 'generated' ? st.filter((s) => !s.screenshot_url).length : 0
      out[a.id] = { steps: st, pending, fb, missingShots, build: buildProgress(st) }
    }
    return out
  }, [articles, steps, feedback])

  const liveCount = articles.filter((a) => a.visibility === 'listed').length
  const draftCount = articles.filter((a) => a.visibility === 'draft').length

  const q = query.trim().toLowerCase()
  const matches = useMemo(
    () =>
      articles.filter((a) => {
        if (q && !(a.title || 'Untitled').toLowerCase().includes(q)) return false
        if (filter === 'live') return a.visibility === 'listed'
        if (filter === 'drafts') return a.visibility === 'draft'
        return true
      }),
    [articles, q, filter],
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
  // Usage and the cap come from the SAME read (kb_entitlements), so the meter and the
  // number beside it can never disagree — they used to be two separate queries.
  const runs = ent?.runs_used ?? 0
  const runLimit = ent?.lifetime_runs ?? null
  const left = runsLeftFrom(ent)

  // Runs and days both drain. ONE pill, escalating with the clock (pricing-spec §6).
  // With no plan to read — an admin inside someone else's help center — there is no clock
  // to show. The countdown is a bill arriving, and it is not theirs.
  const trial = ent ? trialFor(kb, ent.expiry_days) : { stage: 'none' as const, daysLeft: 0, graceLeft: 0 }
  // Both are billing surfaces — a countdown to a bill and a button to pay it — so neither
  // renders for someone who cannot act on them (team-access-spec L7).
  const pill = isOwner ? trialPillLabel(trial, left) : null
  const showBanner = isOwner && trial.stage === 'urgent' && !bannerHidden && !loading

  const initial = (kb.name.trim()[0] || 'Q').toUpperCase()
  const logo = publicBrandingUrl(kb.logo_path)
  const libEmpty = !loading && articles.length === 0

  function renderRow(a: ArticleRow) {
    const m = meta[a.id]
    const building = articleState(a) === 'building'
    const badge = statusBadge(a, m?.pending ?? 0, m?.build ?? null)
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
      <div key={a.id} className={`al-row${isSelected ? ' sel' : ''}${building ? ' bld' : ''}`}>
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

        {/* A run in flight, on the row. "Open to watch" rather than Open, because opening
            this one lands you in an article that is still being written and the word should
            say so before the click, not after. */}
        {building && (
          <span className="al-build">
            <BuildBar compact done={m?.build.done ?? 0} total={m?.build.total ?? 0} />
            <button className="al-watch" onClick={() => onOpenArticle(a.id)}>
              Open to watch
            </button>
          </span>
        )}

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
          <KbSwitcher kb={kb} plan={plan} kbs={kbs} userId={userId} onSwitch={onSwitchKb} />
          <span className="lib-kb-tag">Help Center</span>
        </div>
        <div className="lib-top-right">
          <AvatarStack people={people} onOpen={onOpenPeople} />
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
          {/* Always present, on every plan. Hiding it on free would mean nobody ever learns
              the capability exists — the gated screen behind it is the upgrade surface. */}
          <button className="rail-item link" onClick={onOpenPeople}>
            <PeopleIcon />
            People
            {people.length > 1 && <span className="rail-count">{people.length}</span>}
          </button>

          {/* The trial and the run ledger both exist in the data and appeared nowhere in
              the app. The header pill is easy to miss and disappears entirely on day 7,
              when it is replaced by the banner — this panel is where someone can look. */}
          {/* Owner only. An admin gets the run counter — they need to know when recordings
              are exhausted — but never the plan name, the countdown or the upgrade link. */}
          {isOwner && (trial.stage !== 'none' || left !== null) && (
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

          {/* An admin gets the numbers that change what they can DO — how many recordings
              this help center has left — and nothing that only the owner can act on. No
              plan name, no countdown, no upgrade link. The cap is the owner's, resolved by
              kb_entitlements(); before that existed this line could not show one at all. */}
          {!isOwner && ent && (runLimit !== null || runs > 0) && (
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
                <b>Video guides</b>
                {runLimit === null
                  ? `${plural(runs, 'recording')} turned into a guide here.`
                  : `${runLimit - (left ?? 0)} of ${runLimit} used.`}{' '}
                Writing an article by hand is unlimited.
              </p>
            </div>
          )}

          {/* Account deletion. Bottom of the rail, plain text weight, no colour — findable
              by someone who came looking for it and invisible to everyone else. A red button
              in the main chrome would be a permanent, destructive control sitting next to
              the ones people use every day. */}
          <button className="rail-danger" onClick={() => setDeleting(true)}>
            Delete account
          </button>
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
                ] as const
              ).map(([key, label, n]) => (
                <button
                  key={key}
                  className="al-chip"
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

      {/* The app's legal footer. Compact and at the very bottom: this is a working surface,
          not a marketing page, but the links have to be reachable by clicking (Razorpay
          checks for footer links, not just live URLs). */}
      <LegalFooter compact />

      {/* Every KB this account owns, not just the one on screen — deletion is account-level
          and the dialog has to name everything that goes, or it isn't informed consent. */}
      {deleting && (
        <DeleteAccountModal
          kbs={kbs.length ? kbs : [kb]}
          onClose={() => setDeleting(false)}
          onDeleted={onSignOut}
        />
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
const PeopleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
    <path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
    <circle cx="9" cy="7.5" r="3.5" />
    <path d="M17 4.2a3.5 3.5 0 0 1 0 6.6M22 20v-1.5a4 4 0 0 0-3-3.87" />
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
