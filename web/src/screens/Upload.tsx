import { useState, useRef } from 'react'
import {
  ACCEPTED_VIDEO_EXTENSIONS,
  ACCEPTED_VIDEO_TYPES,
  AUDIENCE_OPTIONS,
  COPY,
  DEFAULT_AUDIENCE,
  DEFAULT_TONE,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_MINUTES,
  TONE_OPTIONS,
} from '../lib/config'
import { PLANS } from '../lib/plans'
import Wordmark from '../components/Wordmark'
import type { ProductContext, VideoContext } from '../lib/types'

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
  // Files, plural. One drop can be several recordings (3a) — the queue orders them and the
  // dock reports them; this screen's job ends at "these files, this context".
  onSubmit: (files: File[], context: VideoContext) => void
  onHome: () => void
  // Video runs left on this account, or null when there is no cap (a paid plan) or no
  // account yet (a visitor, who gets the full free allowance on signup).
  runsLeft: number | null
  // Fired the moment a capped user picks a file — BEFORE the upload starts. Watching a
  // 90-second progress bar that was doomed from the start is the worst version of this.
  onCapped: () => void
  // The KB's saved product context (migration 0027), if it has one. Its presence is what
  // turns this screen from a FORM into a DROP: run two onward, the product half is already
  // known and asking for it again is asking someone to retype what they told us.
  saved?: ProductContext | null
}

export default function Upload({ onSubmit, onHome, runsLeft, onCapped, saved }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const [productName, setProductName] = useState(saved?.product_name ?? '')
  const [audience, setAudience] = useState<string>(saved?.audience || DEFAULT_AUDIENCE)
  const [tone, setTone] = useState<string>(saved?.tone || DEFAULT_TONE)
  const [description, setDescription] = useState(saved?.description ?? '')
  // Known product context collapses the four fields into one line. Expanding is an explicit
  // act, and it says plainly that it only affects what happens next.
  const [showProduct, setShowProduct] = useState(!saved?.product_name)
  // The recording tier (3b). Every field above describes the PRODUCT and is reused by every
  // run; this one describes the video in the dropzone. Its absence is why the run that
  // matters most — the first one — has had no per-video grounding at all.
  const [recording, setRecording] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function accept(chosen: FileList | File[] | null | undefined) {
    const list = Array.from(chosen ?? [])
    if (!list.length) return
    // The quota check happens HERE — at file selection, before a byte is uploaded. Doing
    // it at POST /api/generate (where it is also enforced, because the UI is not a
    // security boundary) would mean a full upload and a spinner before the refusal.
    if (runsLeft !== null && runsLeft <= 0) {
      onCapped()
      return
    }
    // Per FILE, so the user sees exactly which ones bounced and why (3f) instead of one
    // global refusal that names nothing.
    const good: File[] = []
    const bad: string[] = []
    for (const f of list) {
      const problem = validateVideo(f)
      if (problem) bad.push(`${f.name} — ${problem}`)
      else good.push(f)
    }
    setError(bad.length ? bad.join('\n') : null)
    if (good.length) setFiles((prev) => [...prev, ...good])
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!files.length || !productName.trim()) return
    onSubmit(files, {
      product: {
        product_name: productName.trim(),
        description: description.trim(),
        audience,
        tone,
      },
      recording: recording.trim(),
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
            className={`dropzone${over ? ' over' : ''}${files.length ? ' has-file' : ''}`}
            onClick={() => !files.length && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              accept(e.dataTransfer.files)
            }}
          >
            {files.length ? (
              <div className="dz-files">
                {files.map((f, i) => (
                  <div className="dz-file" key={`${f.name}-${i}`}>
                    <span className="pill">
                      {COPY.wallFilePill}
                      <span className="size">{mb(f.size)}</span>
                    </span>
                    <span className="dz-file-n">{f.name}</span>
                    <button
                      type="button"
                      className="dz-file-x"
                      aria-label={`Remove ${f.name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setFiles((prev) => prev.filter((_, n) => n !== i))
                        if (inputRef.current) inputRef.current.value = ''
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-ghost dz-more"
                  onClick={(e) => {
                    e.stopPropagation()
                    inputRef.current?.click()
                  }}
                >
                  Add another recording
                </button>
              </div>
            ) : (
              <>
                <div className="big">Drop your recordings here</div>
                <div className="cap">
                  MP4 or MOV, up to {mb(MAX_VIDEO_BYTES)} and {MAX_VIDEO_MINUTES} minutes each
                </div>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              hidden
              multiple
              accept={ACCEPTED_VIDEO_EXTENSIONS.join(',')}
              onChange={(e) => accept(e.target.files)}
            />
          </div>

          {error && (
            <p className="err" style={{ padding: '0 12px', whiteSpace: 'pre-line' }}>
              {error}
            </p>
          )}

          {/* Free-limit disclosure lives at the dropzone, stated BEFORE commitment —
              never sprung later (ux-spec §6, pricing-spec §6). */}
          {/* Quota surface 1 of 3 (3f): stated at the dropzone BEFORE a file is chosen, and
              escalating on the last one — run 3 should be a known moment, not a discovery
              made afterwards (ux-spec §6, pricing-spec §6). */}
          {runsLeft === 1 ? (
            <p className="dz-last" style={{ margin: '10px 12px 0' }}>
              {COPY.lastRunWarning}
            </p>
          ) : (
            <p className="cap" style={{ padding: '10px 12px 0' }}>
              {runsLeft === null
                ? COPY.freeLimitDisclosure
                : `${runsLeft} of ${PLANS.free.lifetime_runs} free video guides left · ${COPY.freeLimitDisclosure}`}
            </p>
          )}

          <div className="unit-form">
            {/* Run two onward this is a DROP, not a form: the product context is stated as
                one line with a way to change it. Asking someone to retype what they already
                told us is the fastest way to make the second upload feel worse than the
                first (3b). */}
            {!showProduct ? (
              <div className="up-known">
                <span className="up-known-t">{productName}</span>
                <span className="up-known-d">
                  {[audience, tone].filter(Boolean).join(' · ')}
                </span>
                <button
                  type="button"
                  className="up-known-a"
                  onClick={() => setShowProduct(true)}
                >
                  Change
                </button>
              </div>
            ) : null}

            <div className="field" hidden={!showProduct}>
              {saved?.product_name && (
                /* DECIDED, not deferred: changing product context never re-runs existing
                   articles. Doing so would burn quota the user did not spend and overwrite
                   edits they made by hand. This sentence is the entire contract, so it has
                   to stay true — if a "re-run with the new context" affordance is ever
                   added, it belongs on an article, chosen one at a time, never here. */
                <p className="up-scope">
                  Changing this affects new recordings only — articles you have already built
                  are untouched.
                </p>
              )}
              <label htmlFor="product">What product is this?</label>
              <input
                id="product"
                type="text"
                placeholder="Name of the product / feature"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                required
              />
              <p className="hint">
                Used so the guide calls things by their real names.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 14 }} hidden={!showProduct}>
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

            <div className="field" hidden={!showProduct}>
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

            {/* The RECORDING tier (3b). Deliberately last and visually undifferentiated —
                first run shows ONE form with no visible tiering, and the answers are filed
                into two places behind the scenes. The placeholder teaches granularity by
                example, because "describe this recording" gets you the product description
                again. */}
            <div className="field">
              <label htmlFor="recording">
                What does this recording show? <span className="optional">Optional</span>
              </label>
              <input
                id="recording"
                type="text"
                placeholder={COPY.recordingPlaceholder}
                value={recording}
                onChange={(e) => setRecording(e.target.value)}
              />
              <p className="hint">
                {files.length > 1
                  ? 'Applies to all of these. You can describe each one separately in the queue.'
                  : 'One line about this specific video.'}
              </p>
            </div>

            {/* The CTA is an action on THEIR file — never "sign up" (ux-spec §2). */}
            <button
              className="btn btn-lg"
              type="submit"
              disabled={!files.length || !productName.trim()}
            >
              {files.length > 1 ? `Build ${files.length} articles` : COPY.buildCta}
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
