import { useState } from 'react'
import { SUPPORT_EMAIL, WORKER_URL } from '../lib/config'
import { failureFor } from '../lib/failures'
import { supabase } from '../lib/supabase'

// The honest end of a failed generation (build spec: failure taxonomy).
//
// One screen, driven entirely by `failure_code`. It never renders failure_detail — it
// cannot: migration 0020 revokes that column from the client, so there is nothing to leak
// even by accident.
//
// The recovery that matters is `retry`, and it re-runs from the recording already in
// Storage. No file picker, no second upload, no duplicate video object. Past the 7-day
// retention window the worker answers `video_purged` and we swap to the upload-again
// state — a clean instruction, never a signed-URL error.

type Props = {
  code: string | null
  // Null for a failure refused before a job row existed (spend cap, an upload that never
  // started). Retry needs a job to re-run, so those get the re-upload path instead.
  jobId: string | null
  // The retention sweep already collected this recording — retry is impossible, don't
  // offer it. Known from the jobs row, so the common case costs no round trip.
  videoPurged?: boolean
  // The run failed, but it got far enough to leave a populated, editable article. Since the
  // 2g worker change that article reaches 'ready' on every failure path, so it is a DRAFT,
  // not wreckage — and "Try again" would fork a SECOND article from the same recording,
  // duplicating work the user already has. Opening the draft becomes the primary action and
  // retry is withdrawn; the failure is now about the polish they didn't get, not the article.
  draftArticleId?: string | null
  onOpenDraft?: (articleId: string) => void
  onRetryStarted: (jobId: string) => void
  onReupload: () => void
}

export default function FailureScreen({
  code,
  jobId,
  videoPurged,
  draftArticleId,
  onOpenDraft,
  onRetryStarted,
  onReupload,
}: Props) {
  // `purged` starts from the jobs row but can also be learned from the retry call itself:
  // an object can go between the poll and the click, and checking is the worker's job.
  const [purged, setPurged] = useState(!!videoPurged)
  const [busy, setBusy] = useState(false)
  const [retryFailed, setRetryFailed] = useState<string | null>(null)

  const failure = failureFor(purged ? 'video_purged' : code)
  const hasDraft = !!draftArticleId && !!onOpenDraft
  // Retry needs both a job to re-run and a recording to re-run it from — and it must not be
  // offered when the article already exists, or one failure becomes two articles.
  const canRetry = failure.recovery === 'retry' && !!jobId && !purged && !hasDraft

  async function retry() {
    if (!jobId) return
    setBusy(true)
    setRetryFailed(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const res = await fetch(`${WORKER_URL}/api/retry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ job_id: jobId }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        // The recording went while we were looking at it — degrade to upload-again rather
        // than stacking a second error on top of the first.
        if (detail?.detail?.code === 'video_purged') {
          setPurged(true)
          setBusy(false)
          return
        }
        setRetryFailed(detail?.detail?.message ?? 'Could not start that again just yet.')
        setBusy(false)
        return
      }
      // Deliberately leaves `busy` set: the caller swaps this screen for the run it just
      // started, and re-arming the button in the gap is how one retry became five.
      onRetryStarted((await res.json()).job_id as string)
    } catch {
      setRetryFailed('Could not start that again just yet.')
      setBusy(false)
    }
  }

  // Short id: enough to find the row, short enough to read out on a call. It goes in the
  // SUBJECT, not the body — a subject line support can read without opening the mail is
  // what removes the round trip.
  const shortId = jobId ? jobId.slice(0, 8) : null
  const mailto = SUPPORT_EMAIL
    ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
        shortId ? `Generation issue [job ${shortId}]` : 'Generation issue',
      )}`
    : null

  return (
    <div className="page" style={{ justifyContent: 'center' }}>
      <div className="card generating">
        <h2>{failure.heading}</h2>
        <p className="cap" style={{ marginTop: 10 }}>
          {failure.body}
        </p>

        <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'center' }}>
          {hasDraft && (
            <button className="btn" onClick={() => onOpenDraft!(draftArticleId!)}>
              Open your draft
            </button>
          )}
          {canRetry && (
            <button className="btn" disabled={busy} onClick={retry}>
              {busy ? 'Starting…' : 'Try again'}
            </button>
          )}
          {/* Always reachable. Even on a retryable failure, some users would simply
              rather start over — refusing them that is not a kindness. */}
          <button className="btn btn-ghost" onClick={onReupload}>
            {canRetry || hasDraft ? 'Upload a different recording' : 'Upload a recording'}
          </button>
        </div>

        {retryFailed && (
          <p className="err" style={{ marginTop: 14 }}>
            {retryFailed}
          </p>
        )}

        {/* Rule 3: the job id travels with every failure, so support never has to ask for
            it. It rides in the mailto's subject when we have one.

            The no-jobId case still gets a way out: a failure refused before a job row
            existed (spend cap, an upload that never started) used to render nothing here,
            while model_blocked's copy says "get in touch" — pointing at nothing. Only the
            reference is missing then, not the route.

            With SUPPORT_EMAIL empty this degrades to a quotable reference rather than a
            dead mailto, which is a worse promise than none. */}
        {(mailto || shortId) && (
          <p className="cap" style={{ marginTop: 20, opacity: 0.8 }}>
            {mailto ? (
              <>
                Still stuck? <a href={mailto}>Get in touch</a>
                {shortId ? " — we'll have the details." : " and we'll take a look."}
              </>
            ) : (
              <>
                Still stuck? Quote reference <code>{shortId}</code> and we'll find this run.
              </>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
