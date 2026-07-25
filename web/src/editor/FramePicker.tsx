import { useEffect, useRef, useState } from 'react'
import { listDenseFrames, signedFrameUrl, uploadStepFrame } from '../lib/storage'

// The image picker (ux-spec §4, simplified). Originally four tiers; collapsed to one
// frame browser + upload, because the pipeline already extracts a 1fps dense set for the
// WHOLE video. So a single scrollable strip of every frame — auto-scrolled to the current
// one — covers both "the timestamp drifted a bit" and "the right moment is elsewhere in
// the video," in one interaction. That also removes the client-side <video> scrubber and
// its browser-decode fragility (high-level/high-fps recordings that browsers refuse).
//
// For a manual (no-video) article there are no frames, so it degrades to upload-only.
// Any manual pick/upload marks the step is_edited (CLAUDE.md §8).

type Props = {
  kbId: string
  articleId: string
  stepNumber: number
  currentUrl: string | null // signed URL of the step's current image, to highlight it
  currentPath: string | null // storage path of the current image
  onPick: (newPath: string) => void
  onRemove: () => void
  onClose: () => void
}

export default function FramePicker({
  kbId,
  articleId,
  stepNumber,
  currentPath,
  onPick,
  onRemove,
  onClose,
}: Props) {
  const [frames, setFrames] = useState<{ path: string; url: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const currentRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const dense = await listDenseFrames(kbId, articleId)
      const withUrls = await Promise.all(
        dense.map(async (f) => ({ path: f.path, url: (await signedFrameUrl(f.path)) ?? '' })),
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
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const hasFrames = frames.length > 0

  return (
    <div className="frame-picker">
      <div className="fp-head">
        <span className="fp-title">
          {hasFrames ? 'Pick a frame from the video' : 'Add an image'}
        </span>
        <div className="fp-head-right">
          <button className="fp-upload" disabled={busy} onClick={() => inputRef.current?.click()}>
            Upload image instead
          </button>
          {currentPath && (
            <button className="fp-remove" onClick={onRemove}>
              Remove image
            </button>
          )}
          <button className="fp-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
      </div>

      <div className="fp-body">
        {loading ? (
          <p className="cap">Loading frames…</p>
        ) : hasFrames ? (
          <div className="filmstrip">
            {frames.map((f) => {
              const isCurrent = f.path === currentPath
              return (
                <button
                  key={f.path}
                  ref={isCurrent ? currentRef : undefined}
                  className={`filmstrip-frame${isCurrent ? ' on' : ''}`}
                  onClick={() => onPick(f.path)}
                  title={isCurrent ? 'Current frame' : 'Use this frame'}
                >
                  <img src={f.url} alt="" />
                </button>
              )
            })}
          </div>
        ) : (
          <p className="cap">
            This article has no video. Upload an image to illustrate the step.
          </p>
        )}
      </div>

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
