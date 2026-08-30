import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { publicFrameUrl } from '../lib/storage'
import { useAutosave } from '../lib/useAutosave'
import { uniqueArticleSlug } from '../lib/slug'
import {
  articleHrefResolver,
  deleteArticle,
  publishSnapshot,
  replaceSteps,
} from '../lib/articles'
import type { HrefResolver, LinkTarget } from '../lib/articleLinks'
import { key } from '../lib/keys'
import { pendingEditCount } from '../lib/pendingEdits'
import { createFolder, listFolders } from '../lib/folders'
import { COPY, helpCenterUrl } from '../lib/config'
import { articleState, buildProgress } from '../lib/buildState'
import type { Entitlements } from '../lib/plans'
import { usePresence, type Peer } from '../lib/usePresence'
import { ReaderChrome } from '../reader/ReaderSite'
import StepThumb from '../components/StepThumb'
import ThemeToggle from '../components/ThemeToggle'
import StepCard from './StepCard'
import FaqPanel from './FaqPanel'
import ShareControls from './ShareControls'
import PublishModal from './PublishModal'
import BuildBar, { type BuildStage } from './BuildBar'
import ClarifyPanel from './ClarifyPanel'
import RecheckCard from './RecheckCard'
import SteerField from './SteerField'
import SteerCard from './SteerCard'
import ArticleSteerBar, { KeepAllBar } from './ArticleSteerBar'
import OpenClarifications, { instructionFor } from './OpenClarifications'
import { useGeneration } from './useGeneration'
import {
  clearOpenClarifications,
  submitClarificationAnswers,
  type Clarification,
} from '../lib/clarifications'
import { recheckStep, type RecheckResult } from '../lib/recheck'
import { steerArticle, steerBlock, type ArticleProposal } from '../lib/steer'
import { canonicalBody } from '../lib/pendingEdits'
import FailureScreen from '../components/FailureScreen'
import { degradedNotice } from '../lib/failures'
import { fetchArticleJob } from '../lib/jobs'
import type {
  Annotation,
  Article,
  ArticleRow,
  Faq,
  Folder,
  KnowledgeBase as KB,
  ReaderKb,
  StepRow,
  Visibility,
} from '../lib/types'

// The editor (ux-spec §4). The header is one status pill, one button, one menu
// (ShareControls). The rail is a MAP — it navigates and nothing else; adding a step moved
// into the canvas where the steps are, because "add" is an act on the document and the rail
// is not the document.
//
// Structural vocabulary is the four gestures §4 lists — reorder, merge, split, duplicate —
// plus delete, plus INSERT, which is a different job from split and says so: split means
// "this step covers two things", insert means "I missed a step entirely".
//
// THIS IS ALSO THE GENERATING SCREEN. There is no other one. A run in flight renders here,
// in an unfinished state: skeleton steps resolve into headings, screenshots land in their
// slots, prose tightens in place, and the chrome un-dims. Nothing hands off, because a
// handoff is the moment the user discovers they were waiting for a different screen than
// the one they get. `articleId` is therefore nullable — for the first ~15 seconds of a run
// the article row does not exist yet and this component renders the shell around a job.

type Props = {
  // Null until Stage 1 creates the article. The shell renders either way.
  articleId: string | null
  kb: KB
  // The OWNER's plan (profiles.plan), not the KB's — entitlements are owner-level.
  // The OWNER's limits and flags for this KB (kb_entitlements). Replaces the plan id
  // the preview used to derive watermark/noindex from — which was only correct for
  // the owner.
  ent: Entitlements | null
  onBack: () => void
  // The publish-moment handoff into theming (ux-spec §5). An offer, never a redirect.
  onOpenTheme: () => void
  // A run this editor should watch. Set on the first-run landing, where the user is put
  // inside the article before there is an article.
  jobId?: string | null
  // 0–1 while the bytes are still moving, from the real upload. Null afterwards.
  uploadProgress?: number | null
  // The pipeline created the article: put it in the URL. Fires once, and does NOT remount
  // this component — that is the whole point.
  onArticleResolved?: (articleId: string) => void
  onRetryStarted?: (jobId: string) => void
  onReupload?: () => void
  // Who is looking at this article, for presence and for naming whoever moved the row out
  // from under a save. `people` is the KB's roster (kb_people) — the only projection of
  // another person's name this app has.
  me: Peer | null
  people: { id: string; name: string | null; email: string }[]
}

// An undo checkpoint — content only, no DB ids (a restore reinserts fresh rows).
//
// THE FIVE-PLACES RULE. A restore DELETES every step row and re-inserts from this shape, so
// any step column missing from it is destroyed by one Ctrl+Z — silently, with no error, and
// only noticed later. The same list has to appear in five places that rebuild or compare
// rows:
//   1. this type          2. snapshotOf()             3. applySnapshot()
//   4. discardChanges()                                5. duplicateArticle() (lib/articles)
// Sites 3 and 4 no longer write the rows themselves: both hand their list to replaceSteps()
// in lib/articles, which is where the column list for a rebuild now lives (and migration
// 0038, which does the insert). Add a step column there as well as here.
// plus pendingEditCount() in lib/pendingEdits.ts, which compares them.
//
// If you add a column to `steps`, add it to all of them. This is not hypothetical: is_edited
// and timestamp_seconds were dropped by half of them before annotations existed, and
// discardChanges was still dropping both until they were carried across explicitly.
//
// PUBLISHING is no longer on this list. Both publish paths go through ONE builder,
// publishSnapshot() in lib/articles.ts — that is the list of PUBLISHED fields, which is a
// different (smaller) list, and it is now impossible to update one publish path and miss
// the other.
type Snapshot = {
  title: string
  subtitle: string
  // Site 1 for the article-level fields too, not only for step columns. FAQs are article
  // content, so an undo that did not carry them would delete a question the user had just
  // typed and offer nothing to say so.
  faqs: Faq[]
  steps: Pick<
    StepRow,
    | 'step_number'
    | 'heading'
    | 'body_text'
    | 'screenshot_url'
    | 'is_edited'
    | 'timestamp_seconds'
    | 'annotations'
  >[]
}

const snapshotOf = (article: ArticleRow, steps: StepRow[]): Snapshot => ({
  title: article.title,
  subtitle: article.subtitle,
  faqs: article.faqs ?? [],
  steps: steps.map((s) => ({
    step_number: s.step_number,
    heading: s.heading,
    body_text: s.body_text,
    screenshot_url: s.screenshot_url,
    is_edited: s.is_edited,
    timestamp_seconds: s.timestamp_seconds,
    annotations: s.annotations ?? [],
  })),
})

// The article row before Stage 1 has written one. Never rendered as text — every field it
// carries is behind a skeleton while `building` is true — it exists so the shell has one shape
// instead of a null-check on every line of the canvas.
const PENDING_ARTICLE = {
  id: '',
  kb_id: '',
  title: '',
  subtitle: '',
  status: 'generating',
  visibility: 'draft',
  slug: null,
  folder_id: null,
  source: 'generated',
  source_video_path: null,
  faqs: [],
  open_clarifications: null,
  published_content: null,
  published_at: null,
  created_at: '',
  updated_at: '',
} as const satisfies ArticleRow

// One screenshot url per step, keyed by row id.
//
// SYNCHRONOUS. This used to be `await signedFrameUrls(...)` — one signing round trip PER
// STEP, on a bucket that has been public since migration 0007, at three separate points in
// this file. Now it is a string build, so the map is ready in the same tick the rows are.
const shotMap = (rows: StepRow[]): Record<string, string | null> =>
  Object.fromEntries(rows.map((r) => [r.id, publicFrameUrl(r.screenshot_url)]))

const renumber = (list: StepRow[]) =>
  list.map((s, i) => (s.step_number === i + 1 ? s : { ...s, step_number: i + 1 }))

function move<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice()
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

const UndoIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
  </svg>
)
const RedoIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9a5 5 0 0 0 0 10h3" />
  </svg>
)
const InfoIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v.1M12 11.5V16" />
  </svg>
)

export default function Editor({
  articleId,
  me,
  people,
  kb,
  ent,
  onBack,
  onOpenTheme,
  jobId = null,
  uploadProgress = null,
  onArticleResolved,
  onRetryStarted,
  onReupload,
}: Props) {
  const [article, setArticle] = useState<ArticleRow | null>(null)
  const [steps, setSteps] = useState<StepRow[]>([])
  const [shotUrls, setShotUrls] = useState<Record<string, string | null>>({})
  // A per-step remount counter. TipTap owns its document after mount, so when a structural
  // op changes a step's body externally (merge/split) we bump its rev to force a fresh
  // editor with the new content. Plain typing never bumps it.
  const [revs, setRevs] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  // The ONE failure surface. Every operation that used to fail silently routes here, and it
  // renders in the status pill — a fixed spot the eye already goes to.
  const [opError, setOpError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  // Draft-vs-published tracking. The reader shows the last published snapshot; `dirty`
  // means the draft is ahead of it.
  const [dirty, setDirty] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [visibility, setVisibility] = useState<Visibility>('draft')
  const [changingVisibility, setChangingVisibility] = useState(false)
  const [slug, setSlug] = useState<string | null>(null)
  // The publish gate (build spec §7): folders to file into, and the modal that gates
  // first-publish on picking one.
  const [folders, setFolders] = useState<Folder[]>([])
  // Remount key for the FAQ answer editors. Bumped only by undo and discard, which replace
  // the array from outside TipTap; ordinary typing never bumps it, same rule as `revs`.
  const [faqRev, setFaqRev] = useState(0)
  // The other articles in this KB, for the "link to an article" picker, and the resolver the
  // dead-link marking reads. Loaded alongside folders — one more small read on a screen that
  // already does several.
  // Ordered most-recently-edited first, which is what the picker shows on an empty query:
  // the article someone just came from is the likeliest thing they mean to link to. The
  // folder arrives as an id and is named below — `folders` loads in parallel with this, so
  // joining them inside the fetch would race whichever finished second.
  const [linkRows, setLinkRows] = useState<(Omit<LinkTarget, 'folder'> & {
    folderId: string | null
  })[]>([])
  const [linkHref, setLinkHref] = useState<HrefResolver>(() => () => null)
  const linkTargets = useMemo<LinkTarget[]>(() => {
    const name = new Map(folders.map((f) => [f.id, f.name]))
    return linkRows.map(({ folderId, ...r }) => ({
      ...r,
      folder: folderId ? (name.get(folderId) ?? null) : null,
    }))
  }, [linkRows, folders])
  const [showPublish, setShowPublish] = useState(false)
  const [recategorize, setRecategorize] = useState(false)
  const [pubFolderId, setPubFolderId] = useState<string | null>(null)
  const [pubDone, setPubDone] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [unpublishing, setUnpublishing] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [activeStep, setActiveStep] = useState<number | null>(null)
  const { state, schedule, flush } = useAutosave()
  const dragFrom = useRef<number | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  // Any successful write clears a stale failure. Without this the pill would keep showing
  // "couldn't save" after the retry that fixed it.
  const clearError = useCallback(() => setOpError(null), [])
  const notify = useCallback((msg: string) => {
    setNotice(msg)
    setTimeout(() => setNotice(null), 2600)
  }, [])

  // --- Undo/redo (unified, app-level) ---------------------------------------------
  // One history for the whole editor: text, reorder, merge, split, insert, duplicate,
  // delete, frame swap/remove. TipTap's own per-editor history is disabled (StepCard), so a
  // single Ctrl-Z covers everything. Typing coalesces into checkpoints (debounced);
  // structural ops land as their own checkpoint.
  const history = useRef<{ stack: Snapshot[]; pointer: number }>({ stack: [], pointer: -1 })
  const applying = useRef(false) // true while restoring, so restores don't self-record
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  // Bumped when a watched run reaches a terminal state, to re-read the finished article
  // once and hand control back to the normal editing path.
  const [reloadKey, setReloadKey] = useState(0)

  // --- The stale-write guard (team-access-spec §8) --------------------------------------
  // Autosave was last-write-wins: two admins in one article meant one person's paragraph
  // vanished with no error, no conflict and nothing to report. This is the whole reason
  // Phase 3 exists.
  //
  // `base` is the `articles.updated_at` this editor last saw. Every save is a CONDITIONAL
  // update on it — `where id = ? and updated_at = ?` — so a row that moved underneath us
  // matches zero rows, and zero rows is the conflict. No merge, no clobber, no retry: the
  // user's unsaved text stays in the editor, untouched, until they choose what to do.
  const base = useRef<string | null>(null)
  const [conflict, setConflict] = useState<{ name: string } | null>(null)

  // The run behind an article we did NOT arrive at from the landing. Opening a
  // half-written article from the article list gives us an article id and nothing else, so
  // the job has to be looked up or the build bar has no stage and never ends.
  const [foundJobId, setFoundJobId] = useState<string | null>(null)

  // The run a RETRY just started. It has to win over the `jobId` prop: that prop is the
  // queue item's job, which is the FAILED one, so without this the failure screen keeps
  // polling the dead row and "Try again" looks like it does nothing — while every click
  // quietly starts another pipeline run behind it.
  const [retryJobId, setRetryJobId] = useState<string | null>(null)

  // A run we watched reach 'done'. Drives the completion line — and it is set from the
  // POLL, so it can only ever be true for someone who was here while it happened. Opening
  // a long-finished article never announces anything.
  const [finished, setFinished] = useState(false)

  // What this article's run shipped WITHOUT (CLAUDE.md §10g). A degraded run is a success —
  // it produced an editable article and charged a run — but until now it announced itself
  // nowhere at all, so a frames_partial article opened looking healthy and the gap was
  // discovered by opening a picker that came back empty.
  //
  // Dismissal is per article, for this tab only: sessionStorage, not localStorage. Someone
  // who dismisses it, comes back next week and finds three steps missing images deserves to
  // be told why again.
  const [degradedMsg, setDegradedMsg] = useState<string | null>(null)
  const dismissKey = articleId ? `degraded-seen:${articleId}` : null

  useEffect(() => {
    // No article yet: the run is still in Stage 1. The shell renders off the job alone.
    if (!articleId) {
      setLoading(false)
      return
    }
    let cancelled = false
    // Belongs to the article being loaded, so it is dropped before that article changes —
    // a job id carried over from the last one would have this editor watching a run that
    // has nothing to do with what is on screen.
    setFoundJobId(null)
    setRetryJobId(null)
    ;(async () => {
      const [{ data: a }, { data: s }] = await Promise.all([
        supabase.from('articles').select('*').eq('id', articleId).single(),
        supabase.from('steps').select('*').eq('article_id', articleId).order('step_number'),
      ])
      if (cancelled) return
      // Gone, or this account cannot see it. `article` stays null and the render already
      // has a state for that; the unguarded cast below used to throw instead, and an
      // exception in an effect white-screens the app rather than showing a missing article.
      if (!a) {
        setLoading(false)
        return
      }
      const art = a as ArticleRow
      setArticle(art)
      // The row as we found it. Every later save is conditional on this value, and every
      // successful save replaces it with the one the database hands back.
      base.current = art.updated_at
      setConflict(null)
      const rows = (s as StepRow[]) ?? []
      setSteps(rows)
      setVisibility(art.visibility)
      setSlug(art.slug)
      setPubFolderId(art.folder_id)
      listFolders(kb.id).then((fs) => !cancelled && setFolders(fs))
      supabase
        .from('articles')
        .select('id, title, slug, visibility, folder_id, updated_at, steps(count)')
        .eq('kb_id', kb.id)
        .order('updated_at', { ascending: false })
        .then(({ data }) => {
          if (cancelled) return
          const rows = (data ?? []) as (Pick<
            ArticleRow,
            'id' | 'title' | 'slug' | 'visibility' | 'folder_id'
          > & { steps: { count: number }[] })[]
          setLinkRows(
            rows
              .filter((r) => r.id !== articleId && r.slug && r.visibility !== 'draft')
              .map((r) => ({
                id: r.id,
                title: r.title,
                slug: r.slug,
                folderId: r.folder_id,
                // A count embed comes back as one row; no rows means no steps.
                steps: r.steps[0]?.count ?? 0,
              })),
          )
        })
      // A function in state has to be wrapped, or useState calls it as an updater.
      articleHrefResolver(kb.id, articleId).then(
        (fn) => !cancelled && setLinkHref(() => fn),
      )
      const lastEdit = Math.max(
        Date.parse(art.updated_at),
        ...rows.map((r) => Date.parse(r.updated_at)),
      )
      setDirty(!art.published_at || lastEdit > Date.parse(art.published_at))
      history.current = { stack: [snapshotOf(art, rows)], pointer: 0 }
      setShotUrls(shotMap(rows))
      setLoading(false)

      // After the article is on screen. It is a note about work that already succeeded, so
      // nothing waits on it — and a manual article has no run to ask about.
      if (art.source === 'generated' && art.status !== 'generating') {
        const job = await fetchArticleJob(articleId)
        if (cancelled) return
        const msg = degradedNotice(job?.degraded)
        if (msg && sessionStorage.getItem(`degraded-seen:${articleId}`) !== '1') {
          setDegradedMsg(msg)
        }
      } else if (art.status === 'generating' && !jobId) {
        // Re-entering a run in flight. Same query, different question — find the job so the
        // build bar has a real stage and so completion is still an event for someone who
        // left the tab and came back.
        const job = await fetchArticleJob(articleId)
        if (cancelled) return
        if (job && (job.status === 'queued' || job.status === 'running')) setFoundJobId(job.id)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [articleId, kb.id, jobId, reloadKey])

  // Who else is in here. One quiet line in the top bar — the warning that means nobody has
  // to be caught by the guard below in the first place.
  const peers = usePresence(kb.id, articleId, me)

  // --- The run, if there is one ---------------------------------------------------
  const watchJobId = retryJobId ?? jobId ?? foundJobId
  const gen = useGeneration(watchJobId, articleId, onArticleResolved)
  // In flight between pressing the button and the poll seeing awaiting_input clear. Only
  // disables the button — the panel stays exactly as it is, so a failed release leaves the
  // answers on screen rather than an empty card.
  const [releasing, setReleasing] = useState(false)

  // THE one derived article state (lib/buildState). Everything below reads `building` —
  // the lock, the pill, the bar, Publish — so no component gets to decide for itself
  // whether a run is in flight. `article.status` is the authority once the row exists and
  // reaches a terminal value on EVERY path, failure included; before it exists, a job id is
  // the only evidence a run is happening.
  // An upload still moving is a run in flight too, even though no job row exists yet. Without
  // this the first-run landing rendered a BLANK PAGE for the whole upload: articleId and
  // jobId are both null until the bytes land, so `building` was false and the shell's own
  // early return fired — nothing on screen said a guide was coming.
  // Any non-null value means the run has not reached a job row yet — including progress 1,
  // which is the window where the bytes have landed and /api/generate has not answered.
  // `< 1` here was the blank first-run screen: at 100% uploaded there was no article, no job
  // and now no upload either, so `building` went false and the early return below fired.
  const uploading = uploadProgress !== null
  const docState = articleState(
    article && { status: article.status, visibility },
    !!watchJobId || uploading,
  )
  const building = docState === 'building'

  // The run ended: read the finished article once, then the normal editing path owns it.
  // Success also arms the completion line — the un-dim, the pill flip and Publish coming
  // back all ride on `building` turning false when that re-read lands, so the four of them
  // are one moment rather than four quiet changes.
  const jobStatus = gen.job?.status
  useEffect(() => {
    if (jobStatus === 'done' || jobStatus === 'error') setReloadKey((k) => k + 1)
    if (jobStatus === 'done') setFinished(true)
  }, [jobStatus])

  const bumpRev = (id: string) => setRevs((r) => ({ ...r, [id]: (r[id] ?? 0) + 1 }))

  // --- Check the recording (PRD §6.3) --------------------------------------------
  // ONE proposal on screen at a time, deliberately. This is a factual claim about a
  // specific moment; three of them stacked up would be a review queue, which is the shape
  // this whole product exists to avoid.
  const [recheck, setRecheck] = useState<{ stepId: string; result: RecheckResult } | null>(null)
  const [recheckBusy, setRecheckBusy] = useState<string | null>(null)

  async function runRecheck(step: StepRow) {
    if (recheckBusy) return
    setRecheck(null)
    setRecheckBusy(step.id)
    try {
      const result = await recheckStep(articleId!, step.step_number)
      setRecheck({ stepId: step.id, result })
      clearError()
    } catch (e) {
      // Including the rate limit, which is not a failure and says nothing about a count —
      // naming a number would be the second meter PRD §8 forbids.
      setOpError(e instanceof Error ? e.message : 'That didn’t work just now.')
    } finally {
      setRecheckBusy(null)
    }
  }

  // --- Steerable editing (PRD §6.1, §6.4) ----------------------------------------
  // ONE pending map for BOTH scopes, keyed by step id. A selection edit and an
  // article-wide edit produce the same thing — a proposal on a step — so they render
  // through one path and "Keep all" cannot mean something different depending on which
  // button opened the field.
  const [steerOpen, setSteerOpen] = useState<{
    stepId: string
    selection: string
    initial: string
  } | null>(null)
  const [pending, setPending] = useState<
    Record<string, { instruction: string; proposed: string }>
  >({})
  const [steerBusy, setSteerBusy] = useState<string | null>(null)
  const [articlePlan, setArticlePlan] = useState<ArticleProposal | null>(null)
  const [articleBusy, setArticleBusy] = useState(false)
  const [articleErr, setArticleErr] = useState<string | null>(null)

  async function askSteer(step: StepRow, instruction: string, selection: string) {
    setSteerOpen(null)
    setSteerBusy(step.id)
    try {
      const out = await steerBlock(articleId!, step.step_number, instruction, selection)
      setPending((p) => ({
        ...p,
        [step.id]: { instruction: out.instruction, proposed: out.proposed_text },
      }))
      clearError()
    } catch (e) {
      setOpError(e instanceof Error ? e.message : 'That didn’t work just now.')
    } finally {
      setSteerBusy(null)
    }
  }

  async function askArticleSteer(instruction: string) {
    setArticleBusy(true)
    setArticleErr(null)
    try {
      const out = await steerArticle(articleId!, instruction)
      if (!out.steps.length) {
        // A steer that changes nothing is a real answer and says so — silently showing an
        // empty plan would read as a failure.
        setArticleErr('Nothing in the guide needed that change.')
        return
      }
      const byNumber = new Map(steps.map((s) => [s.step_number, s.id]))
      const next: Record<string, { instruction: string; proposed: string }> = {}
      for (const p of out.steps) {
        const id = byNumber.get(p.step_number)
        if (id) next[id] = { instruction: out.instruction, proposed: p.proposed_text }
      }
      setPending((prev) => ({ ...prev, ...next }))
      setArticlePlan(out)
    } catch (e) {
      setArticleErr(e instanceof Error ? e.message : 'That didn’t work just now.')
    } finally {
      setArticleBusy(false)
    }
  }

  // Keep is the ONLY write in this feature, and it happens because the user pressed it.
  // It goes through saveStep like a hand edit, so it rides the same conflict guard (§10k)
  // and the same undo history — an AI change must not be a privileged kind of change.
  function keepSteer(stepId: string) {
    const p = pending[stepId]
    if (!p) return
    dropPending(stepId)
    saveStep(stepId, { body_text: canonicalBody(p.proposed) })
    bumpRev(stepId)
  }

  // The questions the run never got to ask (§5.4). Answering one composes an instruction
  // from OUR template and sends it through the same steer call as everything else, so the
  // answer lands as a diff on the step its evidence points at — reviewable, like every
  // other AI change. An option whose answer is the default we already applied changes
  // nothing and just clears itself, because pretending otherwise would be the form field
  // in a costume that admission test 2 exists to reject.
  const [openClar, setOpenClar] = useState<Clarification[] | null>(null)
  useEffect(() => {
    setOpenClar(article?.open_clarifications ?? null)
  }, [article?.id, article?.open_clarifications])

  function dismissOpenClar() {
    setOpenClar(null)
    if (articleId) void clearOpenClarifications(articleId).catch(() => {})
  }

  async function answerOpenClar(c: Clarification, optionId: string) {
    setOpenClar((prev) => (prev ? prev.filter((x) => x !== c) : prev))
    const instruction = instructionFor(c, optionId)
    const step = steps[c.evidence.step_index]
    if (!instruction || !step) return
    await askSteer(step, instruction, '')
  }

  function dropPending(stepId: string) {
    setPending((prev) => {
      const next = { ...prev }
      delete next[stepId]
      // The plan describes the pending set. Once it is empty the bar has nothing to
      // announce and goes back to being one line.
      if (!Object.keys(next).length) setArticlePlan(null)
      return next
    })
  }

  // The ONLY write in this feature, and it happens because the user pressed Keep. It goes
  // through saveStep like any hand edit, so it rides the same conflict guard (§10k) and the
  // same undo history — an AI correction must not be a privileged kind of change.
  function keepRecheck(stepId: string, proposed: string) {
    setRecheck(null)
    if (!proposed) return
    saveStep(stepId, { body_text: canonicalBody(proposed) })
    // TipTap holds its own copy of the body, so the card has to be told the text moved
    // underneath it — the same remount split and merge used to need.
    bumpRev(stepId)
  }

  const refreshUndoFlags = () => {
    const h = history.current
    setCanUndo(h.pointer > 0)
    setCanRedo(h.pointer < h.stack.length - 1)
  }

  useEffect(() => {
    if (loading || !article) return
    if (applying.current) return
    if (commitTimer.current) clearTimeout(commitTimer.current)
    const snap = snapshotOf(article, steps)
    commitTimer.current = setTimeout(() => {
      const h = history.current
      if (JSON.stringify(snap) === JSON.stringify(h.stack[h.pointer])) return
      h.stack = h.stack.slice(0, h.pointer + 1)
      h.stack.push(snap)
      h.pointer = h.stack.length - 1
      refreshUndoFlags()
    }, 500)
    return () => {
      if (commitTimer.current) clearTimeout(commitTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, article, loading])

  // Restore a snapshot: replace the step rows wholesale (delete + reinsert) and reset the
  // article fields. Frame objects in Storage are untouched, so screenshot paths stay valid.
  async function applySnapshot(snap: Snapshot) {
    applying.current = true
    if (commitTimer.current) clearTimeout(commitTimer.current)
    await flush()
    try {
      // Four-places rule, site 3 — now ONE guarded, atomic call (migration 0038) instead of
      // a delete and an insert the browser fired separately. Two admins both pressing Ctrl+Z
      // used to interleave into `C1 delete → C2 delete → C1 insert → C2 insert` and duplicate
      // every step in the article; a delete that landed with an insert that did not used to
      // leave no steps at all. The article patch rides along in the same transaction.
      if (!articleId || !base.current) return
      const res = await replaceSteps(
        articleId,
        base.current,
        snap.title,
        snap.subtitle,
        snap.faqs,
        snap.steps,
      )
      if (!res.ok) {
        // Somebody else saved first. The server wrote NOTHING, so there is nothing to roll
        // back — the history stack keeps its position and the strip lets the user choose.
        await showConflict()
        return
      }
      base.current = res.updatedAt
      const rows = res.steps
      setSteps(rows)
      setArticle((a) =>
        a ? { ...a, title: snap.title, subtitle: snap.subtitle, faqs: snap.faqs } : a,
      )
      // Site 3. `faqs` is written whole because it IS one value — reordering, editing and
      // deleting a question are all "the array is different now".
      setFaqRev((r) => r + 1)
      setShotUrls(shotMap(rows))
      setDirty(true)
      clearError()
    } catch {
      setOpError('Couldn’t undo that')
    } finally {
      setTimeout(() => {
        applying.current = false
      }, 0)
    }
  }

  function undo() {
    const h = history.current
    if (h.pointer <= 0) return
    h.pointer -= 1
    refreshUndoFlags()
    void applySnapshot(h.stack[h.pointer])
  }

  function redo() {
    const h = history.current
    if (h.pointer >= h.stack.length - 1) return
    h.pointer += 1
    refreshUndoFlags()
    void applySnapshot(h.stack[h.pointer])
  }

  // Claim the article row for this save, and optionally carry an article patch with it.
  //
  // ONE conditional update does both, because two would race each other: claiming first and
  // then writing the patch would bump `updated_at` a second time and leave our own base
  // stale, so the NEXT save would conflict with ourselves. A step write is different — it
  // touches `steps`, not `articles` — so there the claim runs first and stands alone.
  //
  // `last_edited_by` / `last_edited_at` ride along on every successful save. Phase 1 added
  // both columns and nothing wrote them; they are what lets the conflict strip name a
  // person instead of saying "someone".
  // Raise the conflict strip, naming whoever got there first. ONE copy, because there are now
  // two ways to lose a race — the debounced `claim` below, and the whole-document replacement
  // undo and discard go through — and a second copy would be a second place for the strip to
  // say "Someone else" when we could have said a name.
  const showConflict = useCallback(async () => {
    const { data: row } = await supabase
      .from('articles')
      .select('last_edited_by')
      .eq('id', articleId!)
      .maybeSingle()
    const who = people.find((p) => p.id === row?.last_edited_by)
    setConflict({ name: who?.name || who?.email?.split('@')[0] || 'Someone else' })
  }, [articleId, people])

  const claim = useCallback(
    async (patch: Partial<ArticleRow> = {}) => {
      // Before the article row exists (the first ~15s of a run) there is nothing to guard
      // and nothing to guard against: the pipeline owns the document and the editor is
      // locked.
      if (!articleId || !base.current) return
      const { data, error } = await supabase
        .from('articles')
        .update({
          ...patch,
          last_edited_by: me?.user_id ?? null,
          last_edited_at: new Date().toISOString(),
        })
        .eq('id', articleId)
        .eq('updated_at', base.current)
        .select('updated_at, last_edited_by')
      if (error) throw error

      if (!data || data.length === 0) {
        // Zero rows: someone else saved between our last read and now. REFUSE — nothing is
        // written, including the patch that was riding along.
        await showConflict()
        throw new Error('stale-write')
      }

      base.current = (data[0] as { updated_at: string }).updated_at
    },
    [articleId, me?.user_id, people],
  )

  // Every debounced write goes through here, so there is exactly one place the guard can be
  // forgotten from. A step write claims first and then writes; an article write IS the
  // claim.
  const guarded = useCallback(
    (write: (() => Promise<void>) | null, patch?: Partial<ArticleRow>) => {
      schedule(async () => {
        await claim(patch ?? {})
        if (write) await write()
      })
    },
    [schedule, claim],
  )

  // "Keep mine" — dismiss, and write NOTHING now. The next edit rebases onto what is on the
  // server and saves over it, which is a choice this person just made with the other
  // version's author named on screen. It is never silent, and it never happens on its own.
  async function keepMine() {
    const { data } = await supabase
      .from('articles')
      .select('updated_at')
      .eq('id', articleId!)
      .maybeSingle()
    if (data) base.current = (data as { updated_at: string }).updated_at
    setConflict(null)
  }

  // "Reload their version" — discard the LOCAL copy only. Their save is already in the
  // database; this just stops pretending ours exists.
  function reloadTheirs() {
    setConflict(null)
    setReloadKey((k) => k + 1)
  }

  function saveArticle(patch: Partial<ArticleRow>) {
    setArticle((a) => (a ? { ...a, ...patch } : a))
    setDirty(true)
    guarded(null, patch)
  }

  // FAQ writes ride the SAME 700ms debounce and the same stale-write guard as title and
  // subtitle — `faqs` is a column on `articles`, so this is an article write and the claim
  // IS the patch (CLAUDE.md §10k).
  function saveFaqs(faqs: Faq[]) {
    saveArticle({ faqs })
  }

  function saveStep(id: string, patch: Partial<StepRow>) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
    setDirty(true)
    guarded(async () => {
      const { error } = await supabase.from('steps').update(patch).eq('id', id)
      if (error) throw error
    })
  }

  // A manual frame pick/capture/upload. Sets is_edited so a re-run won't overwrite it
  // (CLAUDE.md §8) and swaps the preview in place.
  //
  // SYNCHRONOUS, and public rather than signed (item 3). Minting a signed URL was an await
  // and a guaranteed cache miss on every pick — the image blanked and repainted, which is
  // most of what "the picker reloads" actually looked like. The frames bucket has been
  // public since migration 0007, so getPublicUrl is a string build: the new frame is on
  // screen in the same frame the user clicked, and browsing five is five instant swaps.
  // Nothing refetches, nothing remounts, no StepCard key changes.
  function pickFrame(id: string, newPath: string) {
    saveStep(id, { screenshot_url: newPath, is_edited: true })
    setShotUrls((m) => ({ ...m, [id]: publicFrameUrl(newPath) }))
  }

  // 4g: annotating must NOT set is_edited. That flag means "a human chose this FRAME", and
  // StepCard passes currentSecond = null whenever it is set — so annotating a step whose
  // underlying frame never changed would blank the frame picker's current-frame marker and
  // make the strip open at second 0 with nothing highlighted. Annotations are their own
  // signal; the column's own presence is what pendingEditCount compares.
  function annotateStep(id: string, annotations: Annotation[]) {
    saveStep(id, { annotations })
  }

  function removeFrame(id: string) {
    saveStep(id, { screenshot_url: null, is_edited: true })
    setShotUrls((m) => ({ ...m, [id]: null }))
  }

  function persistOrder(list: StepRow[]) {
    setDirty(true)
    guarded(async () => {
      const results = await Promise.all(
        list.map((s, i) =>
          supabase.from('steps').update({ step_number: i + 1 }).eq('id', s.id),
        ),
      )
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    })
  }

  // --- Reorder (drag). Live-renumber as a card crosses another. -----------------
  function onDragEnter(toIndex: number) {
    const from = dragFrom.current
    if (from === null || from === toIndex) return
    setSteps((prev) => renumber(move(prev, from, toIndex)))
    dragFrom.current = toIndex
  }

  function onDrop() {
    if (dragFrom.current === null) return
    dragFrom.current = null
    setSteps((prev) => {
      persistOrder(prev)
      return prev
    })
    flush()
  }

  // Merge, split and duplicate are GONE (PRD "Context & AI Editing" §6.5). Merge existed
  // to fix our own over-segmentation rather than a user need, and "this is too broken up"
  // is an instruction, not a structural gesture — it belongs in the steer channel. Their
  // real payoff is what is left behind: a two-item step menu, where "Check the recording"
  // cannot be missed.
  //
  // They were also three of the four single-row step writes OPEN-ITEMS D.2 records as
  // unguarded against a concurrent editor, so this shrinks that gap rather than widening it.

  // --- Insert an EMPTY step at a position. Different job from split: this is "I missed a
  // step", not "this step covers two things". `at` is the array index it lands on.
  async function insertStep(at: number) {
    const { data, error } = await supabase
      .from('steps')
      .insert({
        article_id: articleId,
        step_number: at + 1,
        heading: '',
        body_text: '',
        screenshot_url: null,
      })
      .select()
      .single()
    if (error || !data) {
      setOpError('Couldn’t add a step')
      return
    }
    const next = renumber([...steps.slice(0, at), data as StepRow, ...steps.slice(at)])
    setSteps(next)
    clearError()
    persistOrder(next)
    flush()
    // Land the caret in the thing that was just made.
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLInputElement>(`#step-${at + 1} .ed-h-in`)
        ?.focus()
    })
  }

  async function deleteStep(index: number) {
    const victim = steps[index]
    const next = renumber(steps.filter((_, i) => i !== index))
    setSteps(next)
    setDirty(true)
    const { error } = await supabase.from('steps').delete().eq('id', victim.id)
    if (error) {
      setOpError('Couldn’t delete that step')
      return
    }
    clearError()
    persistOrder(next)
    flush()
  }

  // Publish (build spec §2): freeze the draft into published_content AND freeze the slug.
  // The slug is generated from the title on FIRST publish and never changes after — links
  // pasted into support tickets must survive a title change, an unpublish and a republish.
  async function doPublish(
    nextVisibility: 'listed' | 'unlisted',
    folderId?: string | null,
  ): Promise<boolean> {
    // No article id means the run has not created one yet, and `building` has the whole header
    // inert anyway — this is the type-level statement of the same rule.
    if (!article || !articleId) return false
    setPublishing(true)
    setOpError(null)
    await flush()
    const finalSlug =
      slug || (await uniqueArticleSlug(kb.id, article.title || 'article', articleId))
    // ONE builder, shared with lib/articles.publishArticle (the row menu and bulk publish).
    // The reader renders from published_content, so two hand-rolled copies of this object
    // meant the same article could ship annotated or bare depending on which button was
    // pressed. Add a published field there, not here.
    const snapshot = publishSnapshot(
      article.title,
      article.subtitle,
      steps,
      article.faqs ?? [],
      // Read fresh, not from the `linkTargets` this editor has been holding: a target may
      // have been deleted or renamed by someone else while this article was open, and
      // publish is the moment the links become real URLs.
      await articleHrefResolver(kb.id, articleId),
    )
    const now = new Date().toISOString()
    const folderPatch = folderId !== undefined ? { folder_id: folderId } : {}
    const { error } = await supabase
      .from('articles')
      .update({
        // `status` is the PIPELINE lifecycle (generating -> ready) and is deliberately not
        // touched here: publish state lives in `visibility`, and migration 0015 retired the
        // 'published' value from the status check constraint.
        published_content: snapshot,
        published_at: now,
        visibility: nextVisibility,
        slug: finalSlug,
        ...folderPatch,
      })
      .eq('id', articleId)
    setPublishing(false)
    if (error) {
      setOpError('Couldn’t publish')
      return false
    }
    setDirty(false)
    setVisibility(nextVisibility)
    setSlug(finalSlug)
    setArticle((a) =>
      a
        ? {
            ...a,
            published_at: now,
            visibility: nextVisibility,
            published_content: snapshot as Article,
            ...folderPatch,
          }
        : a,
    )

    // The recording SURVIVES a publish now (PRD "Context & AI Editing" §8) — it is what
    // "Check the recording" re-reads, and it is collected by the worker's retention sweep
    // on the plan's window instead. `source_video_path` is deliberately no longer nulled
    // here: the article state has to keep naming the recording for the step menu to know
    // whether the action exists at all.
    return true
  }

  function openPublish() {
    setPubFolderId(article?.folder_id ?? null)
    setPubDone(false)
    setRecategorize(false)
    setShowPublish(true)
  }

  function openRecategorize() {
    setPubFolderId(article?.folder_id ?? null)
    setPubDone(false)
    setRecategorize(true)
    setShowPublish(true)
  }

  async function confirmPublish() {
    if (recategorize) {
      setPublishing(true)
      const { error } = await supabase
        .from('articles')
        .update({ folder_id: pubFolderId })
        .eq('id', articleId)
      setPublishing(false)
      if (error) {
        setOpError('Couldn’t change the category')
        return
      }
      setArticle((a) => (a ? { ...a, folder_id: pubFolderId } : a))
      setShowPublish(false)
      notify('Category changed')
      return
    }
    const ok = await doPublish('listed', pubFolderId)
    if (ok) setPubDone(true)
  }

  async function newFolderForPublish(name: string): Promise<Folder | null> {
    const f = await createFolder(kb.id, folders)
    if (!f) {
      setOpError('Couldn’t create that category')
      return null
    }
    setFolders((prev) => [...prev, { ...f, name }])
    const { error } = await supabase.from('folders').update({ name }).eq('id', f.id)
    if (error) setOpError('Category created, but the name didn’t save')
    return { ...f, name }
  }

  // NOT optimistic. The old version set local state first and never reverted on failure, so
  // the menu could show "hidden" while the database still said listed — a lie about a
  // reader-facing setting. It now waits for the write; the switch is in a menu, so the
  // round-trip costs nothing anyone notices.
  async function changeVisibility(v: 'listed' | 'unlisted') {
    setChangingVisibility(true)
    const { error } = await supabase
      .from('articles')
      .update({ visibility: v })
      .eq('id', articleId)
    setChangingVisibility(false)
    if (error) {
      setOpError('Couldn’t change who can find this')
      return
    }
    setVisibility(v)
    clearError()
    notify(v === 'unlisted' ? 'Hidden from search and browsing' : 'Listed in your help center')
  }

  async function unpublish() {
    setUnpublishing(true)
    setOpError(null)
    const { error } = await supabase
      .from('articles')
      .update({ visibility: 'draft' })
      .eq('id', articleId)
    setUnpublishing(false)
    if (error) {
      setOpError('Couldn’t unpublish')
      return
    }
    setVisibility('draft')
    notify('Taken off your help center')
  }

  // Throw the working draft away and restore the published version. Irreversible by design
  // — it also resets the undo stack, because an "undo" that resurrected the discarded draft
  // would make the confirm copy a lie. One draft, one published snapshot, no history.
  async function discardChanges() {
    const pub = article?.published_content
    if (!article || !pub) return
    setDiscarding(true)
    setOpError(null)
    if (commitTimer.current) clearTimeout(commitTimer.current)
    applying.current = true
    await flush()
    try {
      // Frame provenance, carried across the rebuild. `pub` is the PUBLISHED snapshot,
      // which is the Article contract and deliberately holds neither of these — so this
      // rebuild used to reset both to their defaults on every discard, silently.
      //
      // Neither is published content, and neither is an "unpublished edit" the user asked
      // to throw away: is_edited means a human chose this FRAME (CLAUDE.md §8, and a
      // pipeline re-run may overwrite the frame once it is lost), timestamp_seconds is the
      // second it was cut from (and centres the frame picker's In-use marker). They are
      // carried over only where the step still points at the SAME object — if the discard
      // restores a different screenshot_url, the old provenance describes a frame that is
      // no longer there and the defaults are the honest answer.
      const before = new Map(steps.map((s) => [s.step_number, s]))
      // Four-places rule, site 4 — and the worst of the four, because "discard my
      // unpublished edits" is a destructive action the user consented to, so anything extra
      // it destroys is indistinguishable from what they asked for. Guarded and atomic since
      // migration 0038, for the same reason undo is: this replaces every step row, and doing
      // that as a separate delete and insert let a second editor's copy survive the delete
      // and double the article.
      if (!articleId || !base.current) return
      const res = await replaceSteps(
        articleId,
        base.current,
        pub.title,
        pub.subtitle,
        pub.faqs ?? [],
        pub.steps.map((s) => {
          const kept = before.get(s.step_number)
          const sameFrame = kept?.screenshot_url === s.screenshot_url
          return {
            step_number: s.step_number,
            heading: s.heading,
            body_text: s.body_text,
            screenshot_url: s.screenshot_url,
            // Annotations DO come from the snapshot — they are published content and the
            // reader renders them, so the published version's annotations are the thing
            // being restored to.
            annotations: s.annotations ?? [],
            is_edited: sameFrame ? (kept?.is_edited ?? false) : false,
            timestamp_seconds: sameFrame ? (kept?.timestamp_seconds ?? null) : null,
          }
        }),
      )
      if (!res.ok) {
        await showConflict()
        return
      }
      base.current = res.updatedAt
      const rows = res.steps
      // Site 4, article level. The published snapshot IS the thing being restored to, and
      // a pre-0037 snapshot genuinely has no questions — so `?? []` here means "discard the
      // ones added since", which is exactly what the user asked for.
      const restored = {
        ...article,
        title: pub.title,
        subtitle: pub.subtitle,
        faqs: pub.faqs ?? [],
      }
      setSteps(rows)
      setArticle(restored)
      setFaqRev((r) => r + 1)
      setShotUrls(shotMap(rows))
      setDirty(false)
      history.current = { stack: [snapshotOf(restored, rows)], pointer: 0 }
      refreshUndoFlags()
      notify('Back to the published version')
    } catch {
      setOpError('Couldn’t discard those edits')
    } finally {
      setTimeout(() => {
        applying.current = false
      }, 0)
      setDiscarding(false)
    }
  }

  async function handleDelete() {
    if (!article) return
    setDeleting(true)
    try {
      await deleteArticle(article)
      onBack()
    } catch {
      setOpError('Couldn’t delete this article')
      setDeleting(false)
    }
  }

  // Ctrl/Cmd-Z undo, Ctrl/Cmd-Shift-Z or Ctrl-Y redo, Ctrl/Cmd-Enter adds a step.
  // Plain Enter is NOT bound: it is a newline inside a step body and must stay one.
  //
  // INERT WHILE THE RUN OWNS THE DOCUMENT. Every button on this screen is disabled during a
  // run, but these shortcuts bypassed all of them: Ctrl+Enter inserted a step into an
  // article the pipeline was still writing, and Ctrl+Z ran applySnapshot, which DELETES
  // every step row and re-inserts it — against rows Stage 1 and the frame pass are still
  // filling in. A keyboard path is an editing affordance like any other.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (building) return
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        redo()
      } else if (key === 'enter' && mode === 'edit') {
        e.preventDefault()
        void insertStep(steps.length)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.length, mode, building])

  // Rail scroll-spy, so the map shows where you are.
  useEffect(() => {
    if (mode !== 'edit' || !steps.length) return
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (vis[0]) setActiveStep(Number(vis[0].target.id.replace('step-', '')))
      },
      { rootMargin: '-10% 0px -70% 0px', threshold: 0 },
    )
    steps.forEach((s) => {
      const el = document.getElementById(`step-${s.step_number}`)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [mode, steps])

  // How far the draft is ahead of what readers see. A real count, not a boolean dressed up
  // as one: it compares the working steps against the published snapshot. Lives in
  // lib/articles so the article list's "N unpublished edits" badge is the SAME number.
  const pendingEdits = useMemo(
    () =>
      article
        ? pendingEditCount(
            article.published_content,
            article.title,
            article.subtitle,
            steps,
            article.faqs ?? [],
          )
        : 0,
    [article, steps],
  )

  // The draft, shaped as the reader's own article type, for in-place preview.
  const previewArticle: Article | null = article
    ? {
        title: article.title,
        subtitle: article.subtitle,
        steps: steps.map((s) => ({
          step_number: s.step_number,
          heading: s.heading,
          body_text: s.body_text,
          screenshot_url: s.screenshot_url,
          annotations: s.annotations ?? [],
        })),
        // The DRAFT questions, unresolved. Preview is what this article looks like now, not
        // what publishing would freeze — a link whose target has gone still renders as a
        // link here, and the panel says so in the editor next to it.
        faqs: article.faqs ?? [],
      }
    : null

  // The KB as the reader RPC would return it, so preview is the real component against the
  // real theme. noindex is forced: this is a preview, never a crawlable page.
  const previewKb: ReaderKb | null = article
    ? {
        id: kb.id,
        name: kb.name,
        about: kb.about,
        headline: kb.headline,
        search_placeholder: kb.search_placeholder,
        primary_color: kb.primary_color,
        brand_wash: kb.brand_wash,
        font_pairing: kb.font_pairing,
        logo_path: kb.logo_path,
        favicon_path: kb.favicon_path,
        subdomain: kb.subdomain,
        custom_domain: kb.custom_domain,
        domain_status: kb.domain_status,
        noindex: true,
        // The database's own answer, computed by the same function the reader calls
        // (kb_watermark, migration 0036) — not re-derived from a plan id here. Deriving it
        // locally is how the preview came to disagree with the live site for anyone who
        // was not the owner.
        watermark: !!ent?.watermark,
        header_style: kb.header_style,
        header_image_path: kb.header_image_path,
        header_link_label: kb.header_link_label,
        header_link_url: kb.header_link_url,
        offline: false,
      }
    : null

  const folderName = folders.find((f) => f.id === article?.folder_id)?.name ?? null

  // ONE answer to "is the draft ahead of what readers see", so the pill and the button can
  // never disagree. Once there is a published snapshot the content comparison is the honest
  // measure — `dirty` is timestamp-based and said "clean" while the pill was counting three
  // real differences. Before a first publish there is nothing to compare to, so `dirty`
  // (which starts true) stands in.
  const unpublished = article?.published_content ? pendingEdits > 0 : dirty

  // --- What the run is doing, in numbers that are all real -------------------------
  // While the run owns the document the rows come from the poll; afterwards from local
  // editing state. One expression, so the rail, the canvas and the bar cannot disagree.
  // The poll's rows win once it has any, but the load's rows stand in until then — opening
  // a half-written article from the list has everything on screen already, and dropping to
  // the skeleton for one poll interval would be a flash of LESS than we know.
  const shownSteps = building && gen.steps.length ? gen.steps : steps
  // Steps done / steps that exist. `total` is 0 until Stage 1 lands, which is what puts the
  // bar in its indeterminate state — see lib/buildState for why the unit is a step with its
  // screenshot rather than a step row.
  const { done: stepsReady, total: stepTotal } = buildProgress(shownSteps)
  const skeleton = building && shownSteps.length === 0

  // NULL when there is no job row to read, and deliberately not 'analyzing'. The old
  // default meant an editor that could not see its run lit "Watching your recording"
  // and held it there forever — which is the screen a user reports as stuck, and the
  // same condition that hides the clarification panel (`awaitingInput` is false with
  // no job). Naming a phase we cannot observe made one bug look like a different one.
  const stage: BuildStage | null = uploading ? 'uploading' : (gen.job?.stage ?? null)

  // The pause (PRD §5.4). `awaiting_input` and not the stage: the stage is still
  // `capturing`, because screenshots really are still being taken — writing has not begun,
  // which is exactly the point being made to the user.
  const awaitingInput = !!gen.job?.awaiting_input && (gen.job?.clarifications?.length ?? 0) > 0

  // A run that died BEFORE producing an article has nothing to show and nothing to edit —
  // that is the one case still worth a failure screen. Once steps exist the user is looking
  // at their draft, so the article stays open and editable (2g: the steps exist and are
  // editable, which is a draft, not a failure).
  const deadOnArrival =
    (gen.lost || gen.job?.status === 'error') && shownSteps.length === 0 && !article

  if (deadOnArrival) {
    return (
      <FailureScreen
        code={gen.lost ? null : (gen.job?.failure_code ?? null)}
        // The job actually being watched, not the prop — after a retry that is the RETRY.
        // Retrying the original again would ask the worker to re-run a job whose newer
        // attempt already failed, and would show support the wrong reference.
        jobId={watchJobId}
        videoPurged={!!gen.job?.video_purged_at}
        onRetryStarted={(id) => {
          setRetryJobId(id)
          onRetryStarted?.(id)
        }}
        onReupload={() => onReupload?.()}
      />
    )
  }

  if (loading || (!article && !building)) return <div className="page" />

  // Stands in for the ~15 seconds between "the run started" and "Stage 1 wrote the article
  // row". Everything it holds renders as a skeleton, so no placeholder text is ever visible.
  const doc: ArticleRow = article ?? PENDING_ARTICLE

  // THE PAUSE SITS BESIDE THE ARTICLE, IN THE RAIL'S COLUMN — the arrangement in the design
  // system's first-run kit (ui_kits/first-run, screen 4). It used to be a full-width block
  // between the build bar and the canvas, which on any normal laptop pushed the whole
  // assembling article below the fold: the panel's own argument for not being a modal
  // ("hiding the screenshots landing would remove the evidence that the pause holds up one
  // stage and not the machine") was the exact thing the layout did.
  //
  // It takes the RAIL's column rather than adding a third, because the rail is a navigation
  // map for an article that is still arriving — during the pause it holds three skeleton
  // rows and nothing to navigate to. It comes straight back when the run is released.
  // Nothing about the pause itself changes: same component, same props, same submit.
  const clarify =
    building && awaitingInput && gen.job ? (
      <ClarifyPanel
        // Remounts if the job changes (a retry), so answers to a previous run's questions
        // cannot be carried into a new one.
        key={gen.job.id}
        clarifications={gen.job.clarifications ?? []}
        shotsDone={stepsReady}
        shotsTotal={stepTotal}
        busy={releasing}
        onSubmit={async (answers, note) => {
          setReleasing(true)
          try {
            await submitClarificationAnswers(gen.job!.id, answers, note)
          } catch {
            // The write stage stays held and the panel stays up — which is the honest
            // state. Nothing is lost and the button can be pressed again.
          } finally {
            setReleasing(false)
          }
        }}
      />
    ) : null

  return (
    <div className={`ed${building ? ' ed-building' : ''}`}>
      <header className="ed-bar">
        <button className="ed-back" onClick={onBack}>
          ← Help center
        </button>

        {/* Everything below is present and INERT while the run writes. Hiding it and
            revealing it at the end would be a screen change by another name — and the wait
            is exactly when someone wants to see what they will be able to do. */}
        <div className="ed-seg" role="group" aria-label="Editor mode">
          <button
            aria-pressed={mode === 'edit'}
            disabled={building}
            onClick={() => setMode('edit')}
          >
            Edit
          </button>
          <button
            aria-pressed={mode === 'preview'}
            disabled={building}
            onClick={() => setMode('preview')}
          >
            Preview
          </button>
        </div>

        <button
          className="ed-icbtn"
          onClick={undo}
          disabled={building || !canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <UndoIcon />
        </button>
        <button
          className="ed-icbtn"
          onClick={redo}
          disabled={building || !canRedo}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          <RedoIcon />
        </button>

        <div className="ed-spacer" />
        <ThemeToggle />
        {/* One face and one line. Nothing floating, no cursors, no typing indicator. */}
        {peers.length > 0 && (
          <span className="ed-presence" title={peers.map((p) => p.display_name).join(', ')}>
            <span className="avatar av-t2" aria-hidden>
              {peers[0].display_name.slice(0, 2).toUpperCase()}
            </span>
            {peers.length === 1
              ? `${peers[0].display_name} is editing`
              : `${peers.length} others are editing`}
          </span>
        )}
        {notice && <span className="ed-notice">{notice}</span>}

        {/* The reason, next to the thing it disables. A grey button on its own says
            something is broken; a grey button with a sentence says to wait. */}
        {building && <span className="ed-lockwhy">{COPY.buildPublishHint}</span>}

        <ShareControls
          building={building}
          locked={building}
          visibility={visibility}
          slug={slug}
          dirty={unpublished}
          pendingEdits={pendingEdits}
          publishing={publishing}
          everPublished={!!doc.published_at}
          unpublishing={unpublishing}
          discarding={discarding}
          deleting={deleting}
          changingVisibility={changingVisibility}
          subdomain={kb.subdomain}
          saveState={state}
          conflict={!!conflict}
          opError={opError}
          folderName={folderName}
          onPublish={openPublish}
          onPublishChanges={() => doPublish(visibility === 'draft' ? 'listed' : visibility)}
          onSetVisibility={changeVisibility}
          onUnpublish={unpublish}
          onDiscard={discardChanges}
          onDelete={handleDelete}
          onChangeCategory={openRecategorize}
          onNotify={notify}
        />
      </header>

      {/* Non-destructive, evergreen not amber: this is information, not damage. Their save
          landed; ours did not, and every character of it is still on screen. */}
      {conflict && (
        <div className="ed-conflict" role="status">
          <span className="ed-conflict-txt">
            <b>{conflict.name} updated this article.</b>
            <span>Your changes aren't saved yet.</span>
          </span>
          <span className="ed-conflict-acts">
            <button className="btn btn-ghost" onClick={keepMine}>
              Keep mine
            </button>
            <button className="btn" onClick={reloadTheirs}>
              Reload their version
            </button>
          </span>
        </div>
      )}

      {/* The build bar. Directly under the toolbar, only while building — and it is the ONLY
          thing on this screen that appears and disappears, because it is the only thing that
          is genuinely about a run rather than about the article. */}
      {building && (
        <BuildBar
          stage={stage}
          done={stepsReady}
          total={stepTotal}
          uploadProgress={uploadProgress}
          awaitingInput={awaitingInput}
        />
      )}

      {/* Completion, as an event. It drops in at the same moment the bar collapses, the pill
          flips and Publish comes back — all of them ride on `building` turning false, so
          they are one transition rather than four things quietly stopping.
          Dismissed BY HAND only: a self-clearing banner means someone who looked away got
          no completion signal at all, which is the bug this exists to fix. */}
      {finished && !building && (
        <div className="ed-ready" role="status">
          <span>{COPY.buildDone}</span>
          <button type="button" onClick={() => setFinished(false)}>
            Dismiss
          </button>
        </div>
      )}

      {/* One line, under the header, above everything the run produced. Not a banner: it
          sits in the same slot as the preview note and pushes the canvas by its own height,
          once, on an article that genuinely has a gap in it. */}
      {degradedMsg && (
        <div className="ed-degraded" role="status">
          <span>{degradedMsg}</span>
          <button
            type="button"
            onClick={() => {
              if (dismissKey) sessionStorage.setItem(dismissKey, '1')
              setDegradedMsg(null)
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {showPublish && (
        <PublishModal
          articleTitle={doc.title}
          subdomain={kb.subdomain}
          slug={slug}
          hasSourceVideo={!!doc.source_video_path}
          folders={folders}
          selectedFolderId={pubFolderId}
          onSelectFolder={setPubFolderId}
          onCreateFolder={newFolderForPublish}
          publishing={publishing}
          published={pubDone}
          recategorizeOnly={recategorize}
          onPublish={confirmPublish}
          onClose={() => setShowPublish(false)}
          onViewSite={() =>
            window.open(helpCenterUrl(kb.subdomain, slug ? `/${slug}` : ''), '_blank')
          }
          onCustomize={() => {
            setShowPublish(false)
            onOpenTheme()
          }}
          onNotify={notify}
        />
      )}

      {mode === 'preview' ? (
        <>
          <div className="ed-pv-note">
            <InfoIcon />
            <span>
              <b>Preview.</b> This is your unpublished draft, in your help center’s branding.
              Readers still see the published version.
            </span>
          </div>
          {/* inert makes the whole preview non-interactive and removes it from the tab
              order in one attribute — no reader-component changes needed to make it
              read-only. */}
          <div className="ed-pv" {...({ inert: '' } as Record<string, string>)}>
            {previewKb && previewArticle && (
              <ReaderChrome
                kb={previewKb}
                view="article"
                categories={[]}
                article={previewArticle}
                activeSlug={slug}
                articleUpdatedAt={doc.updated_at}
                articleCategory={folderName}
              />
            )}
          </div>
        </>
      ) : (
        <div className={`ed-body${clarify ? ' ed-body-clar' : ''}`}>
          {clarify && <aside className="ed-side">{clarify}</aside>}
          {/* The rail is a MAP: it navigates and nothing else. */}
          <nav className="ed-rail" aria-label="Steps in this article" hidden={!!clarify}>
            <p className="ed-rail-cap">Steps</p>
            <ol>
              {skeleton
                ? // Three, because the rail's job right now is to say "a list is coming",
                  // and any count here would be a guess — the real one arrives with Stage 1.
                  [0, 1, 2].map((i) => (
                    <li key={i}>
                      <span className="ed-rail-item ed-rail-sk" aria-hidden>
                        <span className="ed-rail-idx" />
                        <span className="sk" style={{ width: `${64 - i * 12}%`, height: 9 }} />
                      </span>
                    </li>
                  ))
                : shownSteps.map((s, i) => (
                    <li key={s.id}>
                      <button
                        className="ed-rail-item"
                        aria-current={activeStep === s.step_number ? 'true' : undefined}
                        draggable={!building}
                        onDragStart={() => (dragFrom.current = i)}
                        onDragEnter={() => !building && onDragEnter(i)}
                        onDragOver={(e) => e.preventDefault()}
                        onDragEnd={building ? undefined : onDrop}
                        onDrop={building ? undefined : onDrop}
                        onClick={() =>
                          document
                            .getElementById(`step-${s.step_number}`)
                            ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }
                      >
                        <span className="ed-rail-idx">{s.step_number}</span>
                        <StepThumb
                          stepNumber={s.step_number}
                          screenshotPath={s.screenshot_url}
                        />
                        <span className="ed-rail-lb">{s.heading || 'Untitled step'}</span>
                      </button>
                    </li>
                  ))}
            </ol>
          </nav>

          <main className="ed-canvas" ref={canvasRef}>
            <div className="ed-canvas-in">
              {skeleton ? (
                <>
                  <div className="sk ed-title-sk" />
                  <div className="sk ed-sub-sk" />
                </>
              ) : (
                <>
                  <input
                    className="ed-title"
                    value={doc.title}
                    readOnly={building}
                    placeholder="Article title"
                    onChange={(e) => saveArticle({ title: e.target.value })}
                    aria-label="Article title"
                  />
                  <input
                    className="ed-sub"
                    value={doc.subtitle}
                    readOnly={building}
                    placeholder="A one-line summary"
                    onChange={(e) => saveArticle({ subtitle: e.target.value })}
                    aria-label="One-line summary"
                  />
                </>
              )}
              <div className="ed-divider" />

              {/* Article scope (§6.4). ABOVE the article, collapsible, and never a side
                  rail: usage is bursty and terminal, so a permanent panel would leave an
                  empty thread staring at the user and quietly reframe this as a chatbot.
                  Hidden while the run owns the document — there is nothing settled to
                  steer yet. */}
              {!building && !skeleton && articleId && (
                <ArticleSteerBar
                  busy={articleBusy}
                  pending={articlePlan}
                  error={articleErr}
                  onSubmit={askArticleSteer}
                />
              )}

              {!building && !skeleton && openClar?.length ? (
                <OpenClarifications
                  clarifications={openClar}
                  busy={!!steerBusy}
                  onAnswer={answerOpenClar}
                  onDismiss={dismissOpenClar}
                />
              ) : null}

              {!building && <InsertHere at={0} onInsert={insertStep} first />}

              {skeleton
                ? [0, 1, 2].map((i) => (
                    <div className="ed-card ed-card-sk" key={i} aria-hidden>
                      <div className="ed-card-hd">
                        <span className="ed-num-sk" />
                        <span className="sk" style={{ height: 17, width: `${58 - i * 8}%` }} />
                      </div>
                      <div className="sk ed-line-sk" style={{ width: '92%' }} />
                      <div className="sk ed-line-sk" style={{ width: '71%' }} />
                      <div className="ed-shot-wait">
                        <span className="ed-shot-wait-sheen" />
                      </div>
                    </div>
                  ))
                : shownSteps.map((s, i) => (
                    <div key={s.id}>
                      <StepCard
                        key={`${s.id}:${revs[s.id] ?? 0}`}
                        step={s}
                        index={i}
                        screenshotUrl={
                          // The frames bucket is public (migration 0007), so a step arriving
                          // mid-run costs no round trip to show. Signed URLs stay on the
                          // settled path where the whole article is minted in one pass.
                          building
                            ? publicFrameUrl(s.screenshot_url)
                            : (shotUrls[s.id] ?? null)
                        }
                        kbId={kb.id}
                        articleId={articleId ?? ''}
                        hasVideo={doc.source === 'generated'}
                        // The RECORDING, not the origin. It is nulled when the retention
                        // sweep collects the object, which is what makes "Check the
                        // recording" disappear rather than fail.
                        hasRecording={!!doc.source_video_path}
                        readOnly={building}
                        linkTargets={linkTargets}
                        // Only while the frame pass is still running or yet to start. Once
                        // the run is past `capturing`, an empty slot is a real gap and says
                        // so instead of pretending something is still coming.
                        awaitingFrame={building && !s.screenshot_url && stage !== 'writing'}
                        settling={gen.settling.has(s.id)}
                        onHeading={(heading) => saveStep(s.id, { heading })}
                        onBody={(body_text) => saveStep(s.id, { body_text })}
                        onDelete={() => deleteStep(i)}
                        onRecheck={() => runRecheck(s)}
                        onSteerSelection={
                          articleId && !building
                            ? (selection) =>
                                setSteerOpen({ stepId: s.id, selection, initial: '' })
                            : undefined
                        }
                        onPickFrame={(path) => pickFrame(s.id, path)}
                        onRemoveFrame={() => removeFrame(s.id)}
                        onAnnotate={(annotations) => annotateStep(s.id, annotations)}
                        brandColor={kb.primary_color}
                        onError={setOpError}
                        onDragStart={() => (dragFrom.current = i)}
                        onDragEnterCard={() => onDragEnter(i)}
                        onDrop={onDrop}
                      />
                      {/* The proposal, under the step it is about. Never a modal and never
                          applied on arrival — there is no silent-write path in this feature
                          (PRD §7). */}
                      {recheck?.stepId === s.id && (
                        <RecheckCard
                          result={recheck.result}
                          current={s.body_text}
                          onKeep={() => keepRecheck(s.id, recheck.result.proposed_text)}
                          onDiscard={() => setRecheck(null)}
                        />
                      )}
                      {recheckBusy === s.id && (
                        <p className="rck-wait">Re-reading that part of the recording…</p>
                      )}
                      {steerOpen?.stepId === s.id && (
                        <SteerField
                          placeholder="Make this more… · say it as… · add…"
                          initial={steerOpen.initial}
                          onSubmit={(instruction) =>
                            askSteer(s, instruction, steerOpen.selection)
                          }
                          onCancel={() => setSteerOpen(null)}
                        />
                      )}
                      {steerBusy === s.id && <p className="rck-wait">Working on it…</p>}
                      {pending[s.id] && (
                        <SteerCard
                          instruction={pending[s.id].instruction}
                          current={s.body_text}
                          proposed={pending[s.id].proposed}
                          busy={steerBusy === s.id}
                          onKeep={() => keepSteer(s.id)}
                          onDiscard={() => dropPending(s.id)}
                          // Pre-filled, never a blind reroll: editing the ask is steering.
                          onRetry={() => {
                            const instruction = pending[s.id].instruction
                            dropPending(s.id)
                            setSteerOpen({ stepId: s.id, selection: '', initial: instruction })
                          }}
                          // The chips DO fire — by this point there is a concrete result to
                          // react to, which is not true of the quick words under the field.
                          onRefine={(word) =>
                            askSteer(s, `${pending[s.id].instruction}, ${word}`, '')
                          }
                        />
                      )}
                      {!building && <InsertHere at={i + 1} onInsert={insertStep} />}
                    </div>
                  ))}

              <button
                className="ed-addstep"
                disabled={building}
                onClick={() => insertStep(steps.length)}
              >
                + Add a step <kbd>{key('⏎')}</kbd>
              </button>

              {/* The tail (migration 0037). Below the last step because that is where it is
                  on the reader — the editor's canvas and the published page are the same
                  document in the same order, which is the whole reason there is no separate
                  preview to reconcile. Hidden while a run owns the document: the pipeline
                  does not author questions, so an empty panel mid-generation would read as
                  something still to come. */}
              {!skeleton && !building && (
                <FaqPanel
                  faqs={doc.faqs ?? []}
                  onChange={saveFaqs}
                  rev={faqRev}
                  targets={linkTargets}
                  href={linkHref}
                />
              )}
            </div>
            {/* One decision for a whole change set, so a fourteen-step terminology pass is
                not fourteen taps. Every diff still stands on its own step and can be taken
                or left there — this is an accelerator, never the only way through. */}
            <KeepAllBar
              count={Object.keys(pending).length}
              onKeepAll={() => Object.keys(pending).forEach(keepSteer)}
              onDiscardAll={() => {
                setPending({})
                setArticlePlan(null)
              }}
            />
          </main>
        </div>
      )}
    </div>
  )
}

// The hairline between two cards. Quiet until hovered — but ALSO reachable on touch and by
// keyboard: `.ed-ins` is revealed by :focus-within and, on a coarse pointer, is simply
// always visible (one media query in the stylesheet covers both this and the step tools,
// rather than a separate touch mechanism).
function InsertHere({
  at,
  onInsert,
  first = false,
}: {
  at: number
  onInsert: (at: number) => void
  first?: boolean
}) {
  return (
    <div className={`ed-ins${first ? ' first' : ''}`}>
      <button type="button" onClick={() => onInsert(at)}>
        + Add a step here
      </button>
    </div>
  )
}

