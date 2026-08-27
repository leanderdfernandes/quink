import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Job, StepRow } from '../lib/types'

// Watching an article assemble itself.
//
// There is no generating SCREEN any more: a generating article renders the editor, in an
// unfinished state, at the same route. That is only possible because slice 1 made the steps
// table the channel — rows land after Stage 1, screenshots fill in during `capturing`, and
// Stage 2 polishes text in place on the same row ids. So this hook polls two things (the
// job row for the stage, the steps for the content) and hands the editor a step list that
// is already staggered for display.
//
// The poll hardening here is the one that used to live in Generating.tsx: a thrown request
// rescheduled nothing and the spinner ran forever, which is the client half of "a job must
// be able to end" (CLAUDE.md §10g). It moved rather than died.

const POLL_MS = 1500
const POLL_BACKOFF_MAX_MS = 8000
const POLL_MAX_FAILURES = 4

// Stage 2 returns EVERY step at once, so applying the poll's answer directly repaints the
// whole document in a single frame — which reads as a glitch, not as success. Release the
// changes one at a time, and cap the whole sequence: 30 steps must not become a 30-beat
// second wait. Per-step gap is the window divided by however many landed, floored so two
// steps don't cross-fade into one flash.
const POLISH_WINDOW_MS = 1600
const POLISH_MIN_GAP_MS = 90
// How long a line stays marked as just-changed. Deliberately shorter than the settle itself.
const POLISH_FLASH_MS = 800

// The columns the client is GRANTED (migration 0020). failure_detail is not among them and
// asking for it would 401 the whole query — which is the point.
const JOB_COLUMNS =
  'id,kb_id,article_id,stage,status,failure_code,degraded,video_purged_at,' +
  // Migration 0042 granted exactly these two. Its siblings awaiting_input_at and
  // clarifications_closed_at are NOT granted — they are the drop-off measure, ours not the
  // customer's — and asking for one would 401 this whole query.
  'clarifications,awaiting_input'

export type Generation = {
  job: Job | null
  // The live step rows, with Stage 2's text released gradually rather than all at once.
  steps: StepRow[]
  // Step ids whose text changed within the flash window — drives the settle treatment.
  settling: Set<string>
  // The job row stopped being readable: repeated query failures, or a row that vanished.
  // Renders the same failure screen an `error` status does.
  lost: boolean
}

const contentKey = (s: StepRow) => `${s.heading} ${s.body_text}`

export function useGeneration(
  jobId: string | null,
  articleId: string | null,
  // Fired once, the moment the pipeline creates the article. The caller puts it in the URL.
  onArticleResolved?: (articleId: string) => void,
): Generation {
  const [job, setJob] = useState<Job | null>(null)
  const [steps, setSteps] = useState<StepRow[]>([])
  const [settling, setSettling] = useState<Set<string>>(new Set())
  const [lost, setLost] = useState(false)

  // What the user is currently looking at, so a poll can tell which rows actually changed.
  // A ref, not state: the release queue reads it between renders.
  const shown = useRef<Map<string, StepRow>>(new Map())
  const queue = useRef<StepRow[]>([])
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const resolved = useRef(false)

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  useEffect(() => {
    if (!jobId && !articleId) return
    // A new job id means a new run — a retry, in practice. Everything below is about the
    // PREVIOUS one, and leaving `job` on the failed row keeps the failure screen up until
    // the first poll answers, which reads as "Try again did nothing".
    setJob(null)
    setLost(false)
    resolved.current = false
    let stop = false
    let fails = 0
    let seenJob = false
    let pollTimer: ReturnType<typeof setTimeout>

    // Release one changed row, mark it as settling, and schedule its unmark.
    function release(row: StepRow) {
      if (stop) return
      shown.current.set(row.id, row)
      setSteps([...shown.current.values()].sort((a, b) => a.step_number - b.step_number))
      setSettling((prev) => new Set(prev).add(row.id))
      timers.current.push(
        setTimeout(() => {
          if (stop) return
          setSettling((prev) => {
            const next = new Set(prev)
            next.delete(row.id)
            return next
          })
        }, POLISH_FLASH_MS),
      )
    }

    function apply(rows: StepRow[]) {
      const fresh: StepRow[] = []
      const changed: StepRow[] = []
      for (const row of rows) {
        const before = shown.current.get(row.id)
        if (!before) fresh.push(row)
        // A new screenshot is a slot filling in — it has its own arrival animation and must
        // not wait behind the text queue. Only PROSE changes are staggered.
        else if (before.screenshot_url !== row.screenshot_url) fresh.push(row)
        else if (contentKey(before) !== contentKey(row)) changed.push(row)
      }

      // New rows and landing frames apply immediately: the whole point is that the article
      // assembles in front of them.
      if (fresh.length) {
        fresh.forEach((row) => shown.current.set(row.id, row))
        setSteps([...shown.current.values()].sort((a, b) => a.step_number - b.step_number))
      }

      if (!changed.length) return
      // One changed row is not a stagger, it is just a change.
      if (changed.length === 1) {
        release(changed[0])
        return
      }
      clearTimers()
      queue.current = changed
      const gap = Math.max(POLISH_MIN_GAP_MS, Math.floor(POLISH_WINDOW_MS / changed.length))
      changed.forEach((row, i) => {
        timers.current.push(setTimeout(() => release(row), i * gap))
      })
    }

    async function poll() {
      let jobRow: Job | null = null
      let stepRows: StepRow[] | null = null
      const watching = articleId ?? (job?.article_id || null)

      try {
        const [j, s] = await Promise.all([
          jobId
            ? supabase.from('jobs').select(JOB_COLUMNS).eq('id', jobId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          watching
            ? supabase
                .from('steps')
                .select('*')
                .eq('article_id', watching)
                .order('step_number')
            : Promise.resolve({ data: null, error: null }),
        ])
        // supabase-js reports transport failures in `error` rather than rejecting, so both
        // have to be caught or half the failures still reschedule nothing.
        if (j.error) throw j.error
        if (s.error) throw s.error
        jobRow = j.data as Job | null
        stepRows = (s.data as StepRow[] | null) ?? null
      } catch {
        if (stop) return
        fails += 1
        if (fails >= POLL_MAX_FAILURES) {
          setLost(true)
          return
        }
        pollTimer = setTimeout(poll, Math.min(POLL_MS * 2 ** fails, POLL_BACKOFF_MAX_MS))
        return
      }

      if (stop) return
      fails = 0
      if (stepRows) apply(stepRows)

      if (jobRow) {
        seenJob = true
        setJob(jobRow)
        // The article exists now. Tell the caller once so the URL can catch up — the
        // component instance stays mounted, so this is a URL change, not a screen change.
        if (jobRow.article_id && !resolved.current) {
          resolved.current = true
          onArticleResolved?.(jobRow.article_id)
        }
        // Terminal. One last read already happened above; the editor takes over from here.
        if (jobRow.status === 'done' || jobRow.status === 'error') return
      } else if (jobId && seenJob) {
        // The row existed and now returns nothing: deleted, or we lost access. It is not
        // coming back, so stop asking rather than spin on an empty answer forever.
        setLost(true)
        return
      }

      pollTimer = setTimeout(poll, POLL_MS)
    }

    poll()
    return () => {
      stop = true
      clearTimeout(pollTimer)
      clearTimers()
    }
    // `job` is read inside poll() only as a fallback for the article id, which `resolved`
    // already guards; including it would restart the poll on every stage change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, articleId, onArticleResolved])

  return { job, steps, settling, lost }
}
