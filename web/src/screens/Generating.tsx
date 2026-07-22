import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { COPY, PIPELINE_STAGES } from '../lib/config'
import type { Job } from '../lib/types'

// Screen 3 — Generating (ux-spec §2).
//
// The ~90s wait is the first in-product experience. Stages map to the REAL pipeline by
// polling the jobs row — never a timer-driven lie (LEARNINGS #3). The four labels are
// load-bearing for the wait-bounce problem, so they must stay honest: if the pipeline
// stalls in "Detecting each action", the UI stalls there too.

const POLL_MS = 2000

type Props = {
  jobId: string
  onDone: () => void
}

export default function Generating({ jobId, onDone }: Props) {
  const [job, setJob] = useState<Job | null>(null)

  useEffect(() => {
    let stop = false

    async function poll() {
      const { data } = await supabase
        .from('jobs')
        .select('id,kb_id,article_id,stage,status,error')
        .eq('id', jobId)
        .single()

      if (stop || !data) return
      setJob(data as Job)

      if (data.status === 'done') {
        onDone()
        return
      }
      if (data.status !== 'error') setTimeout(poll, POLL_MS)
    }

    poll()
    return () => {
      stop = true
    }
  }, [jobId, onDone])

  const activeIndex = job ? PIPELINE_STAGES.findIndex((s) => s.key === job.stage) : 0

  if (job?.status === 'error') {
    return (
      <div className="page" style={{ justifyContent: 'center' }}>
        <div className="card generating">
          <h2>That didn’t work</h2>
          <p className="cap" style={{ marginTop: 10 }}>
            {job.error ?? 'The pipeline failed.'}
          </p>
          <button
            className="btn btn-ghost"
            style={{ marginTop: 20 }}
            onClick={() => window.location.reload()}
          >
            Start over
          </button>
        </div>
      </div>
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
