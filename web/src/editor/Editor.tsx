import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { signedFrameUrl, signedFrameUrls } from '../lib/storage'
import { useAutosave } from '../lib/useAutosave'
import { slugify, uniqueArticleSlug } from '../lib/slug'
import { deleteArticle } from '../lib/articles'
import { createFolder, listFolders } from '../lib/folders'
import { helpCenterUrl } from '../lib/config'
import StepCard from './StepCard'
import ShareControls from './ShareControls'
import PublishModal from './PublishModal'
import type { ArticleRow, Folder, KnowledgeBase as KB, StepRow, Visibility } from '../lib/types'

// The editor (ux-spec §4). Step 5: render + text + autosave. Step 6: the three structural
// gestures — reorder (drag, live renumber), merge (fuse into the step above), split
// (cleave the body at the cursor). Exactly three (CLAUDE.md §9).

type Props = {
  articleId: string
  kb: KB
  // The OWNER's plan (profiles.plan), not the KB's — entitlements are owner-level.
  plan: string
  onBack: () => void
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

export default function Editor({ articleId, kb, plan, onBack }: Props) {
  const [article, setArticle] = useState<ArticleRow | null>(null)
  const [steps, setSteps] = useState<StepRow[]>([])
  const [shotUrls, setShotUrls] = useState<Record<string, string | null>>({})
  // A per-step remount counter. TipTap owns its document after mount, so when a structural
  // op changes a step's body externally (merge/split) we bump its rev to force a fresh
  // editor with the new content. Plain typing never bumps it.
  const [revs, setRevs] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [opError, setOpError] = useState<string | null>(null)
  // Draft-vs-published tracking. The reader shows the last published snapshot; `dirty`
  // means the draft is ahead of it, so a "Publish changes" nudge shows.
  const [dirty, setDirty] = useState(false)
  const [publishing, setPublishing] = useState(false)
  // Publish/link state + frozen slug (build spec §2).
  const [visibility, setVisibility] = useState<Visibility>('draft')
  const [slug, setSlug] = useState<string | null>(null)
  // The publish gate (build spec §7): folders to file into, and the modal that gates
  // first-publish on picking one.
  const [folders, setFolders] = useState<Folder[]>([])
  const [showPublish, setShowPublish] = useState(false)
  const [pubFolderId, setPubFolderId] = useState<string | null>(null)
  const [pubDone, setPubDone] = useState(false)
  // Delete is irreversible → two-step confirm, same as the KB list.
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { state, schedule, flush } = useAutosave()
  const dragFrom = useRef<number | null>(null)

  // --- Undo/redo (unified, app-level) ---------------------------------------------
  // One history for the whole editor: text, reorder, merge, split, add-step, frame
  // swap/remove. TipTap's own per-editor history is disabled (StepCard), so a single
  // Ctrl-Z covers everything. Typing coalesces into checkpoints (debounced); structural
  // ops land as their own checkpoint. This is what makes silent autosave safe.
  const history = useRef<{ stack: Snapshot[]; pointer: number }>({ stack: [], pointer: -1 })
  const applying = useRef(false) // true while restoring, so restores don't self-record
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // No getUser() round-trip any more: storage paths are keyed by KB, not by owner, so
      // the editor never needs to know who is signed in to build one.
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
      // Ahead of the published snapshot? (never published, or any row edited since).
      const lastEdit = Math.max(
        Date.parse(art.updated_at),
        ...rows.map((r) => Date.parse(r.updated_at)),
      )
      setDirty(!art.published_at || lastEdit > Date.parse(art.published_at))
      // Seed the undo history with the loaded state.
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
  }, [articleId])

  const bumpRev = (id: string) =>
    setRevs((r) => ({ ...r, [id]: (r[id] ?? 0) + 1 }))

  const refreshUndoFlags = () => {
    const h = history.current
    setCanUndo(h.pointer > 0)
    setCanRedo(h.pointer < h.stack.length - 1)
  }

  // Record a checkpoint whenever the editor state settles. Typing debounces into one
  // checkpoint; a restore (undo/redo) sets `applying` so it doesn't record itself.
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
  // article fields. Simple and correct for a handful of steps; frame objects in Storage
  // are untouched, so screenshot paths in the snapshot stay valid.
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
    } catch {
      setOpError('Could not undo.')
    } finally {
      // Let the state-change effect run (and skip) before re-enabling recording.
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

  // Ctrl/Cmd-Z undo, Ctrl/Cmd-Shift-Z or Ctrl-Y redo. Window-level so it works wherever
  // focus is (a step body, the title field, or nowhere).
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
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    setShotUrls((m) => ({ ...m, [id]: url }))
  }

  // Remove a step's image (make it text-only). A manual removal is a human edit.
  function removeFrame(id: string) {
    saveStep(id, { screenshot_url: null, is_edited: true })
    setShotUrls((m) => ({ ...m, [id]: null }))
  }

  // Persist the step_number of every row (after reorder/merge/split).
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
    bumpRev(prevStep.id) // remount so the merged body shows

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

    // Insert first so the new step has a real id for its React key.
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
    if (error || !data) return

    const newStep = data as StepRow
    const next = renumber([
      ...steps.slice(0, index),
      { ...cur, body_text: beforeHtml },
      newStep,
      ...steps.slice(index + 1),
    ])
    setSteps(next)
    bumpRev(cur.id) // remount current so it shows only "before"

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

  // --- Add a blank step at the end (manual authoring + fixing a missed action). -------
  async function addStep() {
    const { data, error } = await supabase
      .from('steps')
      .insert({
        article_id: articleId,
        step_number: steps.length + 1,
        heading: '',
        body_text: '',
        screenshot_url: null,
      })
      .select()
      .single()
    if (error || !data) {
      setOpError('Could not add a step.')
      return
    }
    setSteps((prev) => [...prev, data as StepRow])
    setDirty(true)
  }

  // Publish (build spec §2): freeze the draft into published_content AND freeze the slug.
  // The slug is generated from the title on first publish and never changes after — links
  // pasted into support tickets must survive a later title change. `nextVisibility` is the
  // publish/link state; there is no separate "share" flag.
  async function doPublish(
    nextVisibility: 'listed' | 'unlisted',
    folderId?: string | null,
  ): Promise<boolean> {
    if (!article) return false
    setPublishing(true)
    setOpError(null)
    // Flush any pending autosave first so the snapshot captures the latest text.
    await flush()
    // Freeze the slug: generate on first publish, keep thereafter.
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
    // folderId is passed only on first publish (the gate); undefined = leave it as-is.
    const folderPatch = folderId !== undefined ? { folder_id: folderId } : {}
    const { error } = await supabase
      .from('articles')
      .update({
        published_content: snapshot,
        published_at: now,
        status: 'published',
        visibility: nextVisibility,
        slug: finalSlug,
        ...folderPatch,
      })
      .eq('id', articleId)
    setPublishing(false)
    if (error) {
      setOpError('Could not publish.')
      return false
    }
    setDirty(false)
    setVisibility(nextVisibility)
    setSlug(finalSlug)
    setArticle((a) =>
      a
        ? {
            ...a,
            status: 'published',
            published_at: now,
            visibility: nextVisibility,
            ...folderPatch,
          }
        : a,
    )
    return true
  }

  // First publish goes through the modal so a category is chosen (build spec §7). An
  // article that never got filed can't go live — its readers browse by category.
  function openPublish() {
    setPubFolderId(article?.folder_id ?? null)
    setPubDone(false)
    setShowPublish(true)
  }

  async function confirmPublish() {
    const ok = await doPublish('listed', pubFolderId)
    if (ok) setPubDone(true)
  }

  async function newFolderForPublish(name: string): Promise<Folder | null> {
    const f = await createFolder(kb.id, folders)
    if (!f) return null
    await renameLocalFolder(f, name)
    return { ...f, name }
  }

  // createFolder seeds "New folder"; give it the name the user typed, in DB + local list.
  async function renameLocalFolder(f: Folder, name: string) {
    setFolders((prev) => [...prev, { ...f, name }])
    await supabase.from('folders').update({ name }).eq('id', f.id)
  }

  // Flip listed ⇄ unlisted without re-snapshotting (build spec §2). Publish state = link
  // state, so this is the only visibility control; the copy button just reports it.
  async function changeVisibility(v: 'listed' | 'unlisted') {
    setVisibility(v)
    const { error } = await supabase
      .from('articles')
      .update({ visibility: v })
      .eq('id', articleId)
    if (error) setOpError('Could not change visibility.')
  }

  // Delete this article, then return to the help center. Storage assets are cleaned up
  // best-effort (deleteArticle); steps cascade in the DB.
  async function handleDelete() {
    if (!article) return
    setDeleting(true)
    try {
      await deleteArticle(article)
      onBack()
    } catch {
      setOpError('Could not delete the article.')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  // Slug is editable only while draft (it freezes on publish). Slugify live; dedup on blur.
  async function saveSlug(raw: string) {
    const clean = slugify(raw)
    const unique = clean ? await uniqueArticleSlug(kb.id, clean, articleId) : null
    setSlug(unique)
    await supabase.from('articles').update({ slug: unique }).eq('id', articleId)
  }

  const savedLabel = useMemo(
    () =>
      ({
        idle: '',
        saving: 'Saving…',
        saved: 'Saved',
        error: 'Save failed — retrying on next edit',
      })[state],
    [state],
  )

  if (loading || !article) return <div className="page" />

  return (
    <div className="editor">
      <header className="editor-top">
        <div className="editor-top-left">
          <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={onBack}>
            ← Help center
          </button>
          {confirmDelete ? (
            <span className="del-confirm">
              Delete this article?
              <button className="row-confirm" disabled={deleting} onClick={handleDelete}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button className="row-cancel" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button
              className="icon-btn del-btn"
              title="Delete article"
              aria-label="Delete article"
              onClick={() => setConfirmDelete(true)}
            >
              🗑
            </button>
          )}
        </div>
        <div className="editor-top-right">
          <div className="undo-group">
            <button
              className="icon-btn"
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              ↶
            </button>
            <button
              className="icon-btn"
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Ctrl+Shift+Z)"
              aria-label="Redo"
            >
              ↷
            </button>
          </div>
          <span className={`save-state ${state}`}>{opError ?? savedLabel}</span>
          <ShareControls
            visibility={visibility}
            slug={slug}
            dirty={dirty}
            publishing={publishing}
            subdomain={kb.subdomain}
            plan={plan}
            onPublish={openPublish}
            onPublishChanges={() => doPublish(visibility === 'draft' ? 'listed' : visibility)}
            onSetVisibility={changeVisibility}
          />
        </div>
      </header>

      {showPublish && (
        <PublishModal
          articleTitle={article.title}
          subdomain={kb.subdomain}
          folders={folders}
          selectedFolderId={pubFolderId}
          onSelectFolder={setPubFolderId}
          onCreateFolder={newFolderForPublish}
          publishing={publishing}
          published={pubDone}
          onPublish={confirmPublish}
          onClose={() => setShowPublish(false)}
          onViewSite={() => window.open(helpCenterUrl(kb.subdomain), '_blank')}
        />
      )}

      <div className="editor-body">
        <nav className="editor-rail">
          {steps.map((s, i) => (
            <a
              key={s.id}
              href={`#step-${s.step_number}`}
              className="rail-step"
              draggable
              onDragStart={() => (dragFrom.current = i)}
              onDragEnter={() => onDragEnter(i)}
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={onDrop}
              onDrop={onDrop}
            >
              <span className="rail-num">{s.step_number}</span>
              <span className="rail-heading">{s.heading || 'Untitled step'}</span>
            </a>
          ))}
        </nav>

        <main className="editor-canvas">
          <input
            className="article-title"
            value={article.title}
            placeholder="Article title"
            onChange={(e) => saveArticle({ title: e.target.value })}
          />
          <input
            className="article-subtitle"
            value={article.subtitle}
            placeholder="A one-line summary"
            onChange={(e) => saveArticle({ subtitle: e.target.value })}
          />

          {/* Public URL slug (build spec §2): editable while draft, frozen once published. */}
          <div className="slug-row">
            <span className="slug-prefix">{kb.subdomain}/</span>
            {visibility === 'draft' ? (
              <input
                className="slug-input"
                value={slug ?? ''}
                placeholder={slugify(article.title) || 'article-url'}
                onChange={(e) => setSlug(slugify(e.target.value))}
                onBlur={(e) => saveSlug(e.target.value)}
                spellCheck={false}
                aria-label="Article URL"
              />
            ) : (
              <span className="slug-frozen" title="The URL is frozen after publishing">
                {slug} · locked
              </span>
            )}
          </div>

          {steps.map((s, i) => (
            <StepCard
              key={`${s.id}:${revs[s.id] ?? 0}`}
              step={s}
              index={i}
              isFirst={i === 0}
              screenshotUrl={shotUrls[s.id] ?? null}
              kbId={kb.id}
              articleId={articleId}
              hasVideo={!!article.source_video_path}
              onHeading={(heading) => saveStep(s.id, { heading })}
              onBody={(body_text) => saveStep(s.id, { body_text })}
              onMergeUp={() => mergeUp(i)}
              onSplit={(before, after) => split(i, before, after)}
              onPickFrame={(path) => pickFrame(s.id, path)}
              onRemoveFrame={() => removeFrame(s.id)}
              onDragStart={() => (dragFrom.current = i)}
              onDragEnterCard={() => onDragEnter(i)}
              onDrop={onDrop}
            />
          ))}

          <button className="add-step" onClick={addStep}>
            + Add a step
          </button>
        </main>
      </div>
    </div>
  )
}

// Concatenate two step bodies (both HTML). Keep them as separate paragraphs rather than
// fusing mid-sentence — the merge target is usually two actions that belong together.
// An empty-paragraph body ("<p></p>") counts as empty so a merge doesn't leave a blank
// line above the text.
const EMPTY_HTML = /^(\s*<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+$/i

function joinBodies(a: string, b: string): string {
  const top = EMPTY_HTML.test(a) ? '' : a.trim()
  const bottom = EMPTY_HTML.test(b) ? '' : b.trim()
  if (!top) return bottom
  if (!bottom) return top
  return `${top}${bottom}`
}
