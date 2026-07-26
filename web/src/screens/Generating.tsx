import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { COPY, PIPELINE_STAGES } from '../lib/config'
import FailureScreen from '../components/FailureScreen'
import type { Job } from '../lib/types'

// Screen 3 — Generating (ux-spec §2).
//
// The ~90s wait is the first in-product experience. Stages map to the REAL pipeline by
// polling the jobs row — never a timer-driven lie (LEARNINGS #3). The four labels are
// load-bearing for the wait-bounce problem, so they must stay honest: if the pipeline
// stalls in "Detecting each action", the UI stalls there too.
//
// Honest also means this screen must be able to LEAVE. Every terminal state the worker can
// reach is reachable from here: done -> the article, error -> a classified failure screen.
// The one state it must never sit in is a spinner over a job nobody is working on, which
// is why the worker's timeout sweep exists — it turns an abandoned row into `timeout`, and
// this poll picks that up like any other failure.

const POLL_MS = 2000

// The columns the client is GRANTED (migration 0020). failure_detail is not among them and
// asking for it would 401 the whole query — which is the point.
const JOB_COLUMNS = 'id,kb_id,article_id,stage,status,failure_code,degraded,video_purged_at'

type Props = {
  jobId: string
  onDone: () => void
  // A retry starts a NEW job; the parent re-points this screen at it so the progress
  // bar tracks the attempt actually running.
  onRetryStarted: (jobId: string) => void
  onReupload: () => void
}

export default function Generating({ jobId, onDone, onRetryStarted, onReupload }: Props) {
  const [job, setJob] = useState<Job | null>(null)

  useEffect(() => {
    let stop = false
    // A retry swaps jobId under us. Clear first, or the new run renders the old run's
    // failure for one poll interval — a failure screen that flashes over a working job.
    setJob(null)

    async function poll() {
      const { data } = await supabase
        .from('jobs')
        .select(JOB_COLUMNS)
        .eq('id', jobId)
        .maybeSingle()

      if (stop) return
      if (data) {
        setJob(data as Job)
        if (data.status === 'done') {
          onDone()
          return
        }
        if (data.status === 'error') return
      }
      // No row yet (the insert is still landing) or still in flight — keep asking.
      setTimeout(poll, POLL_MS)
    }

    poll()
    return () => {
      stop = true
    }
  }, [jobId, onDone])

  const activeIndex = job ? PIPELINE_STAGES.findIndex((s) => s.key === job.stage) : 0

  if (job?.status === 'error') {
    return (
      <FailureScreen
        code={job.failure_code}
        jobId={job.id}
        videoPurged={!!job.video_purged_at}
        onRetryStarted={onRetryStarted}
        onReupload={onReupload}
      />
    )
  }

  return (
    <div className="page" style={{ justifyContent: 'center' }}>
      <div className="card generating">
        <h2>Building your guide</h2>
        <p className="cap" style={{ marginTop: 8 }}>
          {COPY.generatingReassurance}
        </p>

        {/* The timeline seam as a progress meter: filled ticks = stages done,
            dot = working now, faint ticks = pending. */}
        <div className="seam" style={{ height: 16, marginTop: 26 }}>
          <span className={`line${activeIndex > 0 ? ' done' : ''}`} />
          <div className="ticks">
            {PIPELINE_STAGES.map((s, i) => (
              <span key={s.key}>
                {i === activeIndex ? (
                  <span className="dot" />
                ) : (
                  <span className={`tick${i < activeIndex ? ' done' : ''}`} />
                )}
              </span>
            ))}
          </div>
          <span
            className={`line${activeIndex >= PIPELINE_STAGES.length - 1 ? ' done' : ''}`}
          />
        </div>

        <div className="stages">
          {PIPELINE_STAGES.map((s, i) => (
            <div
              key={s.key}
              className={`stage${i < activeIndex ? ' done' : ''}${i === activeIndex ? ' active' : ''}`}
            >
              <span className="mark">
                {i < activeIndex ? '✓' : i === activeIndex ? '•' : ''}
              </span>
              {s.label}
            </div>
          ))}
        </div>

        <p className="cap" style={{ marginTop: 18 }}>
          {COPY.generatingTip}
        </p>
      </div>
    </div>
  )
}
