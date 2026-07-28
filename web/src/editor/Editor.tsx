import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { signedFrameUrl, signedFrameUrls } from '../lib/storage'
import { useAutosave } from '../lib/useAutosave'
import { uniqueArticleSlug } from '../lib/slug'
import { collectSourceVideo, deleteArticle } from '../lib/articles'
import { createFolder, listFolders } from '../lib/folders'
import { helpCenterUrl } from '../lib/config'
import { limitsFor } from '../lib/plans'
import { ReaderChrome } from '../reader/ReaderSite'
import StepThumb from '../components/StepThumb'
import StepCard from './StepCard'
import ShareControls from './ShareControls'
import PublishModal from './PublishModal'
import type {
  Article,
  ArticleRow,
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

type Props = {
  articleId: string
  kb: KB
  // The OWNER's plan (profiles.plan), not the KB's — entitlements are owner-level.
  plan: string
  onBack: () => void
  // The publish-moment handoff into theming (ux-spec §5). An offer, never a redirect.
  onOpenTheme: () => void
}

// An undo checkpoint — content only, no DB ids (a restore reinserts fresh rows).
type Snapshot = {
  title: string
  subtitle: string
  steps: Pick<
    StepRow,
    'step_number' | 'heading' | 'body_text' | 'screenshot_url' | 'is_edited' | 'timestamp_seconds'
  >[]
}

const snapshotOf = (article: ArticleRow, steps: StepRow[]): Snapshot => ({
  title: article.title,
  subtitle: article.subtitle,
  steps: steps.map((s) => ({
    step_number: s.step_number,
    heading: s.heading,
    body_text: s.body_text,
    screenshot_url: s.screenshot_url,
    is_edited: s.is_edited,
    timestamp_seconds: s.timestamp_seconds,
  })),
})

const renumber = (list: StepRow[]) =>
  list.map((s, i) => (s.step_number === i + 1 ? s : { ...s, step_number: i + 1 }))

function move<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice()
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

const UndoIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
  </svg>
)
const RedoIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9a5 5 0 0 0 0 10h3" />
  </svg>
)
const InfoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v.1M12 11.5V16" />
  </svg>
)

export default function Editor({ articleId, kb, plan, onBack, onOpenTheme }: Props) {
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

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [{ data: a }, { data: s }] = await Promise.all([
        supabase.from('articles').select('*').eq('id', articleId).single(),
        supabase.from('steps').select('*').eq('article_id', articleId).order('step_number'),
      ])
      if (cancelled) return
      const art = a as ArticleRow
      setArticle(art)
      const rows = (s as StepRow[]) ?? []
      setSteps(rows)
      setVisibility(art.visibility)
      setSlug(art.slug)
      setPubFolderId(art.folder_id)
      listFolders(kb.id).then((fs) => !cancelled && setFolders(fs))
      const lastEdit = Math.max(
        Date.parse(art.updated_at),
        ...rows.map((r) => Date.parse(r.updated_at)),
      )
      setDirty(!art.published_at || lastEdit > Date.parse(art.published_at))
      history.current = { stack: [snapshotOf(art, rows)], pointer: 0 }
      setLoading(false)
      const urls = await signedFrameUrls(rows.map((r) => r.screenshot_url))
      if (cancelled) return
      const map: Record<string, string | null> = {}
      rows.forEach((r, i) => (map[r.id] = urls[i]))
      setShotUrls(map)
    })()
    return () => {
      cancelled = true
    }
  }, [articleId, kb.id])

  const bumpRev = (id: string) => setRevs((r) => ({ ...r, [id]: (r[id] ?? 0) + 1 }))

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
      const del = await supabase.from('steps').delete().eq('article_id', articleId)
      if (del.error) throw del.error
      const { data, error } = await supabase
        .from('steps')
        .insert(
          snap.steps.map((s) => ({
            article_id: articleId,
            step_number: s.step_number,
            heading: s.heading,
            body_text: s.body_text,
            screenshot_url: s.screenshot_url,
            is_edited: s.is_edited,
            timestamp_seconds: s.timestamp_seconds,
          })),
        )
        .select()
        .order('step_number')
      if (error || !data) throw error
      const rows = data as StepRow[]
      setSteps(rows)
      setArticle((a) => (a ? { ...a, title: snap.title, subtitle: snap.subtitle } : a))
      await supabase
        .from('articles')
        .update({ title: snap.title, subtitle: snap.subtitle })
        .eq('id', articleId)
      const urls = await signedFrameUrls(rows.map((r) => r.screenshot_url))
      const map: Record<string, string | null> = {}
      rows.forEach((r, i) => (map[r.id] = urls[i]))
      setShotUrls(map)
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

  function saveArticle(patch: Partial<ArticleRow>) {
    setArticle((a) => (a ? { ...a, ...patch } : a))
    setDirty(true)
    schedule(async () => {
      const { error } = await supabase.from('articles').update(patch).eq('id', articleId)
      if (error) throw error
    })
  }

  function saveStep(id: string, patch: Partial<StepRow>) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
    setDirty(true)
    schedule(async () => {
      const { error } = await supabase.from('steps').update(patch).eq('id', id)
      if (error) throw error
    })
  }

  // A manual frame pick/capture/upload. Sets is_edited so a re-run won't overwrite it
  // (CLAUDE.md §8), and refreshes the signed URL so the new frame shows immediately.
  async function pickFrame(id: string, newPath: string) {
    saveStep(id, { screenshot_url: newPath, is_edited: true })
    const url = await signedFrameUrl(newPath)
    if (!url) setOpError('Picked the frame, but its preview didn’t load. Reload the page.')
    setShotUrls((m) => ({ ...m, [id]: url }))
  }

  function removeFrame(id: string) {
    saveStep(id, { screenshot_url: null, is_edited: true })
    setShotUrls((m) => ({ ...m, [id]: null }))
  }

  function persistOrder(list: StepRow[]) {
    setDirty(true)
    schedule(async () => {
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

  // --- Merge into the step above: concat bodies, keep the upper screenshot. ------
  function mergeUp(index: number) {
    if (index === 0) return
    const prevStep = steps[index - 1]
    const cur = steps[index]
    const mergedBody = joinBodies(prevStep.body_text, cur.body_text)
    const next = renumber(
      steps
        .map((s, i) => (i === index - 1 ? { ...s, body_text: mergedBody } : s))
        .filter((_, i) => i !== index),
    )
    setSteps(next)
    bumpRev(prevStep.id)
    schedule(async () => {
      const a = await supabase
        .from('steps')
        .update({ body_text: mergedBody })
        .eq('id', prevStep.id)
      const b = await supabase.from('steps').delete().eq('id', cur.id)
      if (a.error) throw a.error
      if (b.error) throw b.error
    })
    flush()
    persistOrder(next)
  }

  // --- Split at the cursor: current keeps "before", a new step gets "after". -----
  async function split(index: number, beforeHtml: string, afterHtml: string) {
    const cur = steps[index]
    const { data, error } = await supabase
      .from('steps')
      .insert({
        article_id: articleId,
        step_number: cur.step_number + 1,
        heading: '',
        body_text: afterHtml,
        screenshot_url: null,
      })
      .select()
      .single()
    if (error || !data) {
      setOpError('Couldn’t split that step')
      return
    }
    const newStep = data as StepRow
    const next = renumber([
      ...steps.slice(0, index),
      { ...cur, body_text: beforeHtml },
      newStep,
      ...steps.slice(index + 1),
    ])
    setSteps(next)
    bumpRev(cur.id)
    clearError()
    schedule(async () => {
      const { error } = await supabase
        .from('steps')
        .update({ body_text: beforeHtml })
        .eq('id', cur.id)
      if (error) throw error
    })
    flush()
    persistOrder(next)
  }

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

  async function duplicateStep(index: number) {
    const src = steps[index]
    const { data, error } = await supabase
      .from('steps')
      .insert({
        article_id: articleId,
        step_number: src.step_number + 1,
        heading: src.heading,
        body_text: src.body_text,
        screenshot_url: src.screenshot_url,
        // The copy points at the same human-chosen frame, so it inherits the marker that
        // protects it from a re-run (§8).
        is_edited: src.is_edited,
        timestamp_seconds: src.timestamp_seconds,
      })
      .select()
      .single()
    if (error || !data) {
      setOpError('Couldn’t duplicate that step')
      return
    }
    const copy = data as StepRow
    const next = renumber([...steps.slice(0, index + 1), copy, ...steps.slice(index + 1)])
    setSteps(next)
    setShotUrls((m) => ({ ...m, [copy.id]: shotUrls[src.id] ?? null }))
    clearError()
    persistOrder(next)
    flush()
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
    if (!article) return false
    setPublishing(true)
    setOpError(null)
    await flush()
    const finalSlug =
      slug || (await uniqueArticleSlug(kb.id, article.title || 'article', articleId))
    const snapshot = {
      title: article.title,
      subtitle: article.subtitle,
      steps: steps.map((s) => ({
        step_number: s.step_number,
        heading: s.heading,
        body_text: s.body_text,
        screenshot_url: s.screenshot_url,
      })),
    }
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
            source_video_path: null,
          }
        : a,
    )

    // Keep the promise made on the upload screen: "We delete the source video once your
    // article is published." Only on the FIRST publish — re-publishing finds nothing left
    // to delete and quietly does nothing, which is what makes this idempotent.
    if (article.source_video_path) {
      await collectSourceVideo(articleId, article.source_video_path)
    }
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
      const del = await supabase.from('steps').delete().eq('article_id', articleId)
      if (del.error) throw del.error
      const { data, error } = await supabase
        .from('steps')
        .insert(
          pub.steps.map((s) => ({
            article_id: articleId,
            step_number: s.step_number,
            heading: s.heading,
            body_text: s.body_text,
            screenshot_url: s.screenshot_url,
          })),
        )
        .select()
        .order('step_number')
      if (error || !data) throw error
      const rows = data as StepRow[]
      const restored = { ...article, title: pub.title, subtitle: pub.subtitle }
      setSteps(rows)
      setArticle(restored)
      const up = await supabase
        .from('articles')
        .update({ title: pub.title, subtitle: pub.subtitle })
        .eq('id', articleId)
      if (up.error) throw up.error
      const urls = await signedFrameUrls(rows.map((r) => r.screenshot_url))
      const map: Record<string, string | null> = {}
      rows.forEach((r, i) => (map[r.id] = urls[i]))
      setShotUrls(map)
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
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
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
  }, [steps.length, mode])

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
  // as one: it compares the working steps against the published snapshot.
  const pendingEdits = useMemo(() => {
    const pub = article?.published_content
    if (!article || !pub) return 0
    let n = 0
    if ((pub.title ?? '') !== article.title) n += 1
    if ((pub.subtitle ?? '') !== article.subtitle) n += 1
    const byNum = new Map(pub.steps.map((s) => [s.step_number, s]))
    for (const s of steps) {
      const p = byNum.get(s.step_number)
      if (
        !p ||
        p.heading !== s.heading ||
        p.body_text !== s.body_text ||
        p.screenshot_url !== s.screenshot_url
      ) {
        n += 1
      }
    }
    n += Math.max(0, pub.steps.length - steps.length)
    return n
  }, [article, steps])

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
        })),
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
        font_pairing: kb.font_pairing,
        logo_path: kb.logo_path,
        favicon_path: kb.favicon_path,
        subdomain: kb.subdomain,
        custom_domain: kb.custom_domain,
        domain_status: kb.domain_status,
        noindex: true,
        watermark: limitsFor(plan).watermark,
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

  if (loading || !article) return <div className="page" />

  return (
    <div className="ed">
      <header className="ed-bar">
        <button className="ed-back" onClick={onBack}>
          ← Help center
        </button>

        <div className="ed-seg" role="group" aria-label="Editor mode">
          <button aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}>
            Edit
          </button>
          <button aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}>
            Preview
          </button>
        </div>

        <button
          className="ed-icbtn"
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <UndoIcon />
        </button>
        <button
          className="ed-icbtn"
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          <RedoIcon />
        </button>

        <div className="ed-spacer" />
        {notice && <span className="ed-notice">{notice}</span>}

        <ShareControls
          visibility={visibility}
          slug={slug}
          dirty={unpublished}
          pendingEdits={pendingEdits}
          publishing={publishing}
          everPublished={!!article.published_at}
          unpublishing={unpublishing}
          discarding={discarding}
          deleting={deleting}
          changingVisibility={changingVisibility}
          subdomain={kb.subdomain}
          saveState={state}
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

      {showPublish && (
        <PublishModal
          articleTitle={article.title}
          subdomain={kb.subdomain}
          slug={slug}
          hasSourceVideo={!!article.source_video_path}
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
                articleUpdatedAt={article.updated_at}
                articleCategory={folderName}
              />
            )}
          </div>
        </>
      ) : (
        <div className="ed-body">
          {/* The rail is a MAP: it navigates and nothing else. */}
          <nav className="ed-rail" aria-label="Steps in this article">
            <p className="ed-rail-cap">Steps</p>
            <ol>
              {steps.map((s, i) => (
                <li key={s.id}>
                  <button
                    className="ed-rail-item"
                    aria-current={activeStep === s.step_number ? 'true' : undefined}
                    draggable
                    onDragStart={() => (dragFrom.current = i)}
                    onDragEnter={() => onDragEnter(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDragEnd={onDrop}
                    onDrop={onDrop}
                    onClick={() =>
                      document
                        .getElementById(`step-${s.step_number}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                  >
                    <span className="ed-rail-idx">{s.step_number}</span>
                    <StepThumb stepNumber={s.step_number} screenshotPath={s.screenshot_url} />
                    <span className="ed-rail-lb">{s.heading || 'Untitled step'}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <main className="ed-canvas" ref={canvasRef}>
            <div className="ed-canvas-in">
              <input
                className="ed-title"
                value={article.title}
                placeholder="Article title"
                onChange={(e) => saveArticle({ title: e.target.value })}
                aria-label="Article title"
              />
              <input
                className="ed-sub"
                value={article.subtitle}
                placeholder="A one-line summary"
                onChange={(e) => saveArticle({ subtitle: e.target.value })}
                aria-label="One-line summary"
              />
              <div className="ed-divider" />

              <InsertHere at={0} onInsert={insertStep} first />

              {steps.map((s, i) => (
                <div key={s.id}>
                  <StepCard
                    key={`${s.id}:${revs[s.id] ?? 0}`}
                    step={s}
                    index={i}
                    isFirst={i === 0}
                    screenshotUrl={shotUrls[s.id] ?? null}
                    kbId={kb.id}
                    articleId={articleId}
                    hasVideo={article.source === 'generated'}
                    onHeading={(heading) => saveStep(s.id, { heading })}
                    onBody={(body_text) => saveStep(s.id, { body_text })}
                    onMergeUp={() => mergeUp(i)}
                    onSplit={(before, after) => split(i, before, after)}
                    onDuplicate={() => duplicateStep(i)}
                    onDelete={() => deleteStep(i)}
                    onPickFrame={(path) => pickFrame(s.id, path)}
                    onRemoveFrame={() => removeFrame(s.id)}
                    onError={setOpError}
                    onDragStart={() => (dragFrom.current = i)}
                    onDragEnterCard={() => onDragEnter(i)}
                    onDrop={onDrop}
                  />
                  <InsertHere at={i + 1} onInsert={insertStep} />
                </div>
              ))}

              <button className="ed-addstep" onClick={() => insertStep(steps.length)}>
                + Add a step <kbd>{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} ⏎</kbd>
              </button>
            </div>
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

// Concatenate two step bodies (both HTML). Keep them as separate paragraphs rather than
// fusing mid-sentence — the merge target is usually two actions that belong together.
const EMPTY_HTML = /^(\s*<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+$/i

function joinBodies(a: string, b: string): string {
  const top = EMPTY_HTML.test(a) ? '' : a.trim()
  const bottom = EMPTY_HTML.test(b) ? '' : b.trim()
  if (!top) return bottom
  if (!bottom) return top
  return `${top}${bottom}`
}
