import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { STORAGE_BUCKET_VIDEOS, WORKER_URL } from './config'
import { listInFlightJobs } from './jobs'
import { loadHeld, saveHeld, MAX_HELD_FILES, type HeldFile } from './pending'
import { QUOTA_EXCEEDED } from './failures'
import type { StageKey } from './config'
import type { ProductContext } from './types'

// The upload queue behind the dock (slice 3).
//
// Three kinds of thing live in one list, because to the user they are one list — "the
// recordings I just dropped":
//   queued/uploading/running  a run this browser started, or found already going
//   done/error                a run that finished while they watched
//   held                      refused before the backend ever saw it, over quota
//
// The lane count here mirrors the worker's (plans.ts LANES) and does one job: stop five
// recordings uploading down one connection at once. The REAL concurrency gate is the
// worker's semaphore — this copy is a courtesy, and if the two disagree the server wins.
//
// Why the client holds the queue at all rather than posting everything and letting the
// server order it: a file that has not entered a lane must stay EDITABLE (3d), so the user
// can describe recordings 2 and 3 while 1 builds. That is only possible while we still hold
// them.

export type QueueState =
  | 'queued'
  | 'uploading'
  | 'running'
  // Left the in-flight list; we have not yet read WHICH way it ended. A distinct state
  // because "it stopped running" and "it succeeded" must never be the same statement.
  | 'settling'
  | 'done'
  | 'error'
  | 'held'

export type QueueItem = {
  id: string
  name: string
  // Dropped, not yet uploaded. Null once the bytes are gone, or when this row was restored
  // from an in-flight job rather than from a file the user just chose.
  file: File | null
  recording: string
  state: QueueState
  progress: number
  jobId: string | null
  articleId: string | null
  title: string | null
  stage: StageKey | null
  failureCode: string | null
}

// How often the dock asks the ledger what is still going. Slower than the editor's 1.5s:
// this is peripheral vision, not the thing being watched.
const DOCK_POLL_MS = 4000

const uid = () => crypto.randomUUID()

class StartError extends Error {
  constructor(
    readonly code: string | null,
    message: string,
  ) {
    super(message)
  }
}

// Signed URL + XHR, for the same reason App.uploadVideo uses it: storage.upload() resolves
// once and reports nothing on the way, and every number this product shows has to be one
// something measured.
async function uploadVideo(
  kbId: string,
  file: File,
  onProgress: (p: number) => void,
): Promise<string> {
  const ext = file.name.toLowerCase().endsWith('.mov') ? 'mov' : 'mp4'
  const path = `${kbId}/${crypto.randomUUID()}.${ext}`
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET_VIDEOS)
    .createSignedUploadUrl(path)
  if (error || !data) throw error ?? new Error('Could not start the upload.')

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', data.signedUrl, true)
    xhr.setRequestHeader('content-type', file.type || 'video/mp4')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Could not upload the recording (${xhr.status}).`))
    xhr.onerror = () => reject(new Error('Could not upload the recording.'))
    xhr.send(file)
  })
  return path
}

async function startJob(
  kbId: string,
  videoPath: string,
  product: ProductContext,
  recording: string,
): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const res = await fetch(`${WORKER_URL}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    // Two tiers, both sent, both stored on the job — so a retry re-grounds on what THIS run
    // used rather than on whatever the product context says later.
    body: JSON.stringify({ kb_id: kbId, video_path: videoPath, product, recording }),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new StartError(
      detail?.detail?.code ?? null,
      detail?.detail?.message ?? `Could not start the job (${res.status}).`,
    )
  }
  return (await res.json()).job_id as string
}

type Options = {
  kbId: string | null
  ownerId: string | null
  product: ProductContext
  lanes: number
  // Runs left on this account, or null when uncapped. Read for DISPLAY and for the
  // client-side hold — the worker enforces the real wall before the Gemini call.
  runsLeft: number | null
  onQuotaBlocked: () => void
}

export function useQueue({
  kbId,
  ownerId,
  product,
  lanes,
  runsLeft,
  onQuotaBlocked,
}: Options) {
  const [items, setItems] = useState<QueueItem[]>([])
  // 3h: one level of undo for a removed queued file, so a mis-click does not cost the
  // sentence they just wrote about the recording.
  const [lastRemoved, setLastRemoved] = useState<QueueItem | null>(null)
  const starting = useRef<Set<string>>(new Set())

  const patch = useCallback((id: string, next: Partial<QueueItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...next } : i)))
  }, [])

  // --- held files: restored from this device, on every load -------------------------
  useEffect(() => {
    loadHeld()
      .then((held) => {
        if (!held.length) return
        setItems((prev) => {
          const known = new Set(prev.map((i) => i.id))
          const restored = held
            .filter((h) => !known.has(h.id))
            .map<QueueItem>((h) => ({
              id: h.id,
              name: h.name,
              file: h.file,
              recording: h.recording,
              state: 'held',
              progress: 0,
              jobId: null,
              articleId: null,
              title: null,
              stage: null,
              failureCode: null,
            }))
          return [...prev, ...restored]
        })
      })
      .catch(() => {})
  }, [])

  const persistHeld = useCallback((list: QueueItem[]) => {
    const held: HeldFile[] = list
      .filter((i) => i.state === 'held' && i.file)
      .slice(0, MAX_HELD_FILES)
      .map((i) => ({
        id: i.id,
        file: i.file!,
        name: i.name,
        recording: i.recording,
        savedAt: Date.now(),
      }))
    saveHeld(held).catch(() => {})
  }, [])

  useEffect(() => {
    persistHeld(items)
  }, [items, persistHeld])

  // --- the one window a reload can still destroy something --------------------------
  // Between "the bytes start moving" and "the job row exists" this browser holds the ONLY
  // copy of the recording: the File is in React state (persistHeld saves `held` files, not
  // in-flight ones), the XHR dies with the page, and no job row exists yet — so the
  // adoption below has nothing to find. A reload there loses the recording completely and
  // SILENTLY, which is exactly how it reads to the user: they refresh and their help center
  // looks like they never dropped anything.
  //
  // The browser's own guard is the whole fix. It cannot make an aborted upload survive —
  // that needs the file persisted and re-uploaded, which is a bigger change — but it turns
  // silent destruction into a question, and the honest answer to "are you sure?" here is
  // usually no.
  useEffect(() => {
    const holdingBytes = items.some(
      (i) => i.state === 'uploading' || (i.state === 'queued' && i.file),
    )
    if (!holdingBytes) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [items])

  // --- runs already going: the dock survives a reload (3g) --------------------------
  // This is what makes "safe to close this tab" a fact rather than a claim. Without it the
  // dock is a session artifact and the sentence is a hope.
  useEffect(() => {
    if (!ownerId) return
    let stop = false
    let timer: ReturnType<typeof setTimeout>

    async function tick() {
      const jobs = await listInFlightJobs(ownerId!)
      if (stop) return
      setItems((prev) => {
        const byJob = new Map(prev.filter((i) => i.jobId).map((i) => [i.jobId!, i]))
        const adopted = jobs
          .filter((j) => !byJob.has(j.id))
          .map<QueueItem>((j) => ({
            id: uid(),
            name: 'Your recording',
            file: null,
            recording: '',
            state: 'running',
            progress: 1,
            jobId: j.id,
            articleId: j.article_id,
            title: null,
            stage: j.stage,
            failureCode: null,
          }))
        const live = new Map(jobs.map((j) => [j.id, j]))
        const updated = prev.map((i) => {
          if (!i.jobId || i.state === 'done' || i.state === 'error') return i
          const j = live.get(i.jobId)
          if (j) return { ...i, state: 'running' as const, stage: j.stage, articleId: j.article_id }
          // Gone from the in-flight list: it finished. Which way is a question for the row
          // itself, resolved below — never guessed here.
          return i.state === 'running' ? { ...i, state: 'settling' as const } : i
        })
        return [...updated, ...adopted]
      })
      if (!stop) timer = setTimeout(tick, DOCK_POLL_MS)
    }

    tick()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [ownerId])

  // A job that left the in-flight list: read what actually happened to it. Separate from the
  // poll above so "it stopped running" and "it succeeded" are never the same statement.
  useEffect(() => {
    const settling = items.filter((i) => i.state === 'settling' && i.jobId)
    if (!settling.length) return
    let stop = false
    ;(async () => {
      for (const item of settling) {
        const { data } = await supabase
          .from('jobs')
          .select('status,failure_code,article_id')
          .eq('id', item.jobId!)
          .maybeSingle()
        if (stop) return
        const row = data as
          | { status: string; failure_code: string | null; article_id: string | null }
          | null
        patch(item.id, {
          state: row?.status === 'error' ? 'error' : 'done',
          failureCode: row?.failure_code ?? null,
          articleId: row?.article_id ?? item.articleId,
        })
      }
    })()
    return () => {
      stop = true
    }
  }, [items, patch])

  // --- the lane runner --------------------------------------------------------------
  useEffect(() => {
    if (!kbId) return
    const active = items.filter((i) => i.state === 'uploading' || i.state === 'running').length
    if (active >= lanes) return
    const next = items.find((i) => i.state === 'queued' && i.file && !starting.current.has(i.id))
    if (!next) return

    starting.current.add(next.id)
    ;(async () => {
      patch(next.id, { state: 'uploading', progress: 0 })
      try {
        const path = await uploadVideo(kbId, next.file!, (p) => patch(next.id, { progress: p }))
        const jobId = await startJob(kbId, path, product, next.recording)
        // The File is released here and not before: until the bytes are in Storage it is the
        // only copy of the recording this app has.
        patch(next.id, { state: 'running', progress: 1, jobId, file: null })
      } catch (e) {
        if (e instanceof StartError && e.code === QUOTA_EXCEEDED) {
          // Not a failure (pricing-spec §7). The client normally refuses these before the
          // upload; reaching here means the count moved underneath us, so the file becomes
          // held rather than lost.
          patch(next.id, { state: 'held', progress: 0 })
          onQuotaBlocked()
          return
        }
        patch(next.id, { state: 'error', failureCode: null })
      } finally {
        starting.current.delete(next.id)
      }
    })()
  }, [items, kbId, lanes, product, patch, onQuotaBlocked])

  // --- adding files -----------------------------------------------------------------
  // Returns how many were held, so the dropzone can say WHICH files bounced and why (3f)
  // rather than a single global refusal.
  const add = useCallback(
    (files: File[]): { queued: number; held: number; refused: number } => {
      let queued = 0
      let held = 0
      let refused = 0

      setItems((prev) => {
        // Runs already committed by this queue count against the allowance: three files
        // dropped with two runs left is two runs and one held file, not three attempts.
        const committed = prev.filter((i) => i.state !== 'held' && i.state !== 'error').length
        let allowance =
          runsLeft === null
            ? Number.POSITIVE_INFINITY
            : Math.max(0, runsLeft - committed)
        let heldSlots = MAX_HELD_FILES - prev.filter((i) => i.state === 'held').length

        const taken: QueueItem[] = []
        for (const f of files) {
          let state: QueueState
          if (allowance > 0) {
            allowance -= 1
            queued += 1
            state = 'queued'
          } else if (heldSlots > 0) {
            heldSlots -= 1
            held += 1
            state = 'held'
          } else {
            // Past the hold cap this file is simply not taken. Saying so beats accepting it
            // and quietly dropping it on the next reload.
            refused += 1
            continue
          }
          taken.push({
            id: uid(),
            name: f.name,
            file: f,
            recording: '',
            state,
            progress: 0,
            jobId: null,
            articleId: null,
            title: null,
            stage: null,
            failureCode: null,
          })
        }
        return [...prev, ...taken]
      })

      return { queued, held, refused }
    },
    [runsLeft],
  )

  const setRecording = useCallback(
    (id: string, recording: string) => patch(id, { recording }),
    [patch],
  )

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const gone = prev.find((i) => i.id === id) ?? null
      // Only a file that has not started is removable, so the undo can always put it back
      // exactly as it was — including the sentence they typed about it.
      setLastRemoved(gone && (gone.state === 'queued' || gone.state === 'held') ? gone : null)
      return prev.filter((i) => i.id !== id)
    })
  }, [])

  const undoRemove = useCallback(() => {
    setItems((prev) => (lastRemoved ? [...prev, lastRemoved] : prev))
    setLastRemoved(null)
  }, [lastRemoved])

  const dismiss = useCallback(() => {
    setItems((prev) => prev.filter((i) => i.state !== 'done' && i.state !== 'error'))
  }, [])

  return {
    items,
    add,
    remove,
    undoRemove,
    lastRemoved,
    setRecording,
    dismiss,
    heldCount: items.filter((i) => i.state === 'held').length,
    activeCount: items.filter(
      (i) => i.state === 'queued' || i.state === 'uploading' || i.state === 'running',
    ).length,
  }
}
