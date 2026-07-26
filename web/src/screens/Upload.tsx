import { useState, useRef } from 'react'
import {
  ACCEPTED_VIDEO_EXTENSIONS,
  ACCEPTED_VIDEO_TYPES,
  AUDIENCE_OPTIONS,
  COPY,
  DEFAULT_AUDIENCE,
  DEFAULT_TONE,
  MAX_VIDEO_BYTES,
  TONE_OPTIONS,
} from '../lib/config'
import Wordmark from '../components/Wordmark'
import type { VideoContext } from '../lib/types'

// Upload + context — reached from the marketing home's "Build my article" CTA.
//
// The dropzone and the context form are ONE visual unit on purpose: the form should
// read as part of uploading, not as a gate before it. Committing the file first is
// what makes the account wall land as a next step rather than a barrier (ux-spec §2).

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

// File-type validation is never cut (CLAUDE.md §10). Some browsers report an empty
// or odd MIME for .mov, so accept either a known MIME or a known extension.
function validateVideo(file: File): string | null {
  const okType = (ACCEPTED_VIDEO_TYPES as readonly string[]).includes(file.type)
  const okExt = ACCEPTED_VIDEO_EXTENSIONS.some((e) =>
    file.name.toLowerCase().endsWith(e),
  )
  if (!okType && !okExt) return 'That file type isn’t supported. Upload an MP4 or MOV.'

  // Gemini's inline limit is 100MB and we haven't built the File API fallback.
  // Reject here, loudly, rather than fail deep inside the pipeline.
  if (file.size > MAX_VIDEO_BYTES) {
    return `That recording is ${mb(file.size)}. The limit is ${mb(MAX_VIDEO_BYTES)} — try a shorter clip.`
  }
  return null
}

type Props = {
  onSubmit: (file: File, context: VideoContext) => void
  onHome: () => void
  // Video runs left on this account, or null when there is no cap (a paid plan) or no
  // account yet (a visitor, who gets the full free allowance on signup).
  runsLeft: number | null
  // Fired the moment a capped user picks a file — BEFORE the upload starts. Watching a
  // 90-second progress bar that was doomed from the start is the worst version of this.
  onCapped: () => void
}

export default function Upload({ onSubmit, onHome, runsLeft, onCapped }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const [productName, setProductName] = useState('')
  const [audience, setAudience] = useState<string>(DEFAULT_AUDIENCE)
  const [tone, setTone] = useState<string>(DEFAULT_TONE)
  const [description, setDescription] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function accept(next: File | undefined) {
    if (!next) return
    // The quota check happens HERE — at file selection, before a byte is uploaded. Doing
    // it at POST /api/generate (where it is also enforced, because the UI is not a
    // security boundary) would mean a full upload and a spinner before the refusal.
    if (runsLeft !== null && runsLeft <= 0) {
      onCapped()
      return
    }
    const problem = validateVideo(next)
    if (problem) {
      setError(problem)
      setFile(null)
      return
    }
    setError(null)
    setFile(next)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !productName.trim()) return
    onSubmit(file, {
      product_name: productName.trim(),
      audience,
      tone,
      description: description.trim(),
    })
  }

  return (
    <div className="page">
      <div className="wrap">
        <header style={{ marginBottom: 40 }}>
          {/* Wordmark returns to the marketing home. */}
          <button
            className="home-wordmark"
            onClick={onHome}
            aria-label="Back to home"
            style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
          >
            <Wordmark height={22} />
          </button>
        </header>

        <div className="seam" style={{ marginBottom: 20 }}>
          <span className="line" />
          <span className="tick" />
          <div className="ticks">
            <span className="tick" />
            <span className="tick" />
            <span className="dot" />
            <span className="tick" />
            <span className="tick" />
          </div>
          <span className="tick" />
          <span className="line" />
        </div>

        <h1 style={{ marginBottom: 14 }}>
          Turn a recording
          <br />
          into a guide.
        </h1>
        <p className="lede" style={{ marginBottom: 32 }}>
          Drop in a screen recording and get an editable, publishable article in about
          ninety seconds — no writing, no screenshots to take.
        </p>

        {/* Dropzone + form are one card — one visual unit. */}
        <form className="card unit" onSubmit={submit}>
          <div
            className={`dropzone${over ? ' over' : ''}${file ? ' has-file' : ''}`}
            onClick={() => !file && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              accept(e.dataTransfer.files[0])
            }}
          >
            {file ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <span className="pill">
                  {COPY.wallFilePill}
                  <span className="size">{mb(file.size)}</span>
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: '7px 12px', fontSize: 13 }}
                  onClick={() => {
                    setFile(null)
                    if (inputRef.current) inputRef.current.value = ''
                  }}
                >
                  Replace
                </button>
              </div>
            ) : (
              <>
                <div className="big">Drop your recording here</div>
                <div className="cap">MP4 or MOV, up to {mb(MAX_VIDEO_BYTES)}</div>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              hidden
              accept={ACCEPTED_VIDEO_EXTENSIONS.join(',')}
              onChange={(e) => accept(e.target.files?.[0])}
            />
          </div>

          {error && <p className="err" style={{ padding: '0 12px' }}>{error}</p>}

          {/* Free-limit disclosure lives at the dropzone, stated BEFORE commitment —
              never sprung later (ux-spec §6, pricing-spec §6). */}
          <p className="cap" style={{ padding: '10px 12px 0' }}>
            {COPY.freeLimitDisclosure}
          </p>

          <div className="unit-form">
            <div className="field">
              <label htmlFor="product">What product is this?</label>
              <input
                id="product"
                type="text"
                placeholder="Acme"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                required
              />
              <p className="hint">
                Used so the guide calls things by their real names.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 14 }}>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="audience">
                  Who reads it? <span className="optional">Optional</span>
                </label>
                <select
                  id="audience"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                >
                  {AUDIENCE_OPTIONS.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="tone">
                  Tone <span className="optional">Optional</span>
                </label>
                <select id="tone" value={tone} onChange={(e) => setTone(e.target.value)}>
                  {TONE_OPTIONS.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="description">
                Anything else we should know? <span className="optional">Optional</span>
              </label>
              <textarea
                id="description"
                placeholder="What this workflow is for, terms we should use, anything the recording doesn't say out loud."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* The CTA is an action on THEIR file — never "sign up" (ux-spec §2). */}
            <button
              className="btn btn-lg"
              type="submit"
              disabled={!file || !productName.trim()}
            >
              {COPY.buildCta}
            </button>

            <p className="note">
              <span aria-hidden>🔒</span>
              {COPY.videoDeletion}
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
