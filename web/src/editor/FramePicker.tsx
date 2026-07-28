import { useEffect, useRef, useState } from 'react'
import { listDenseFrames, signedFrameUrl, uploadStepFrame } from '../lib/storage'

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
  onPick: (newPath: string) => void
  onRemove: () => void
  onClose: () => void
  // Upload used to fail silently: a null path from storage just did nothing. Now it goes to
  // the one status surface in the header.
  onError: (msg: string) => void
}

// Frames are named "{second}.webp"; the strip labels them so a long video is navigable.
const clock = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function FramePicker({
  kbId,
  articleId,
  stepNumber,
  currentPath,
  onPick,
  onRemove,
  onClose,
  onError,
}: Props) {
  const [frames, setFrames] = useState<{ second: number; path: string; url: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const currentRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const dense = await listDenseFrames(kbId, articleId)
      const withUrls = await Promise.all(
        dense.map(async (f) => ({
          second: f.second,
          path: f.path,
          url: (await signedFrameUrl(f.path)) ?? '',
        })),
      )
      if (!cancelled) {
        setFrames(withUrls.filter((f) => f.url))
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [kbId, articleId])

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
        <span className="ed-picker-ti">{hasFrames ? 'Pick a frame' : 'Add an image'}</span>
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
            const isCurrent = f.path === currentPath
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
                <span className="ed-frame-ts">{clock(f.second)}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="ed-picker-msg">
          This article has no video. Upload an image to illustrate the step.
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
