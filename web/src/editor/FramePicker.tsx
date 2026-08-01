import { useEffect, useRef, useState } from 'react'
import { listDenseFrames, publicFrameUrl, uploadStepFrame } from '../lib/storage'
import { fetchArticleJob } from '../lib/jobs'

// The image picker (ux-spec §4, simplified). Originally four tiers; collapsed to one frame
// browser + upload, because the pipeline already extracts a 1fps dense set for the WHOLE
// video. A single scrollable strip of every frame — auto-scrolled to the current one —
// covers both "the timestamp drifted a bit" and "the right moment is elsewhere in the
// video," in one interaction. That also removes the client-side <video> scrubber and its
// browser-decode fragility (high-fps recordings browsers refuse).
//
// For a manual (no-video) article there are no frames, so it degrades to upload-only.
// Any manual pick/upload marks the step is_edited (CLAUDE.md §8) — the caller does that.

type Props = {
  kbId: string
  articleId: string
  stepNumber: number
  currentPath: string | null
  // The second the step's own frame was cut from. The pipeline's frame is its OWN object
  // ({kb}/{article}/step-N.webp) and is never one of the dense objects, so a path match
  // alone found nothing until the user had already picked from this strip — the picker
  // opened at second 0 with nothing marked. The timestamp is what identifies it.
  // Null when the image is a manual pick or upload, where there is nothing true to mark.
  currentSecond: number | null
  onPick: (newPath: string) => void
  onRemove: () => void
  onClose: () => void
  // Upload used to fail silently: a null path from storage just did nothing. Now it goes to
  // the one status surface in the header.
  onError: (msg: string) => void
  // Whether this article came from a recording at all. An empty strip means something
  // completely different for a manual article than for a generated one.
  hasVideo: boolean
}

// Why an empty strip is empty. The dense 1fps pass now runs AFTER the article is
// deliverable, so "no frames yet" is a real and common state — and telling someone whose
// extraction actually failed to check back shortly is a lie with a deadline on it.
type Empty = 'manual' | 'extracting' | 'failed'

// Frames are named "{second}.webp"; the strip labels them so a long video is navigable.
const clock = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function FramePicker({
  kbId,
  articleId,
  stepNumber,
  currentPath,
  currentSecond,
  onPick,
  onRemove,
  onClose,
  onError,
  hasVideo,
}: Props) {
  const [frames, setFrames] = useState<{ second: number; path: string; url: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [empty, setEmpty] = useState<Empty>(hasVideo ? 'extracting' : 'manual')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const currentRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // getPublicUrl is a string build, not a request. Signing these cost one round trip
      // PER FRAME — ~360 of them on a six-minute recording, before the strip could paint —
      // on a bucket that has been public since migration 0007.
      const dense = await listDenseFrames(kbId, articleId)
      if (cancelled) return
      setFrames(
        dense
          .map((f) => ({ second: f.second, path: f.path, url: publicFrameUrl(f.path) ?? '' }))
          .filter((f) => f.url),
      )

      // Only when there is nothing to show and there should have been. A run still going is
      // still pulling them; a run that ENDED with nothing is never going to produce any,
      // whether it failed outright or degraded to frames_partial.
      if (!dense.length && hasVideo) {
        const job = await fetchArticleJob(articleId)
        if (cancelled) return
        const running = job?.status === 'queued' || job?.status === 'running'
        setEmpty(running ? 'extracting' : 'failed')
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [kbId, articleId])

  // The frame in use. Exact path first — that is the truth once anything has been picked
  // from this strip. Otherwise the nearest second to the step's timestamp: the dense set is
  // 1fps and the step's frame was cut at an arbitrary second, so "nearest" is the same
  // moment, not a guess.
  const current =
    frames.find((f) => f.path === currentPath) ??
    (currentSecond === null
      ? undefined
      : frames.reduce<(typeof frames)[number] | undefined>(
          (best, f) =>
            !best || Math.abs(f.second - currentSecond) < Math.abs(best.second - currentSecond)
              ? f
              : best,
          undefined,
        ))

  // Start the strip on the frame that's currently in use.
  useEffect(() => {
    currentRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [frames])

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      const blob = await toWebp(file)
      const path = await uploadStepFrame(kbId, articleId, stepNumber, blob)
      if (path) onPick(path)
      else onError('Image didn’t upload. Check your connection and try again.')
    } catch {
      onError('That file couldn’t be read as an image. Try a JPG or PNG.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const hasFrames = frames.length > 0

  return (
    <div className="ed-picker">
      <div className="ed-picker-hd">
        <span className="ed-picker-ti">
          {!hasFrames
            ? 'Add an image'
            : current
              ? `Pick a frame — now using ${clock(current.second)}`
              : 'Pick a frame'}
        </span>
        <span className="ed-picker-alt">
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? 'Uploading…' : 'Upload an image'}
          </button>
          {currentPath && (
            <button type="button" className="danger" onClick={onRemove}>
              Remove image
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close frame picker">
            Close
          </button>
        </span>
      </div>

      {loading ? (
        <p className="ed-picker-msg">Loading frames…</p>
      ) : hasFrames ? (
        <div className="ed-strip">
          {frames.map((f) => {
            const isCurrent = f === current
            return (
              <button
                key={f.path}
                ref={isCurrent ? currentRef : undefined}
                className="ed-frame"
                aria-current={isCurrent ? 'true' : undefined}
                onClick={() => onPick(f.path)}
                title={isCurrent ? 'Current frame' : 'Use this frame'}
              >
                <img src={f.url} alt="" decoding="async" />
                <span className={`ed-frame-ts${isCurrent ? ' now' : ''}`}>
                  {isCurrent ? 'In use' : clock(f.second)}
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="ed-picker-msg">
          {empty === 'manual'
            ? 'This article has no video. Upload an image to illustrate the step.'
            : empty === 'extracting'
              ? 'Still pulling frames from your recording. This finishes shortly — or upload your own image.'
              : 'We couldn’t pull the frames from this recording. Upload your own image instead.'}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </div>
  )
}

// Normalize any uploaded image to WebP via canvas, so storage stays WebP-only.
function toWebp(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d')?.drawImage(img, 0, 0)
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('encode failed'))),
        'image/webp',
        0.85,
      )
      URL.revokeObjectURL(img.src)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}
