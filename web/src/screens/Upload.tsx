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
  PRODUCT_DESCRIPTION_MAX,
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

// Drawn to the same grid and weight as the existing set (KnowledgeBase.tsx) — no emoji as
// iconography, including the padlock that used to sit on the deletion note.
const FilmIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <path d="M7.5 5v14M16.5 5v14M2.5 12h19" />
  </svg>
)
const LockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="4" y="10" width="16" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
)
const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M15 6l-6 6 6 6" />
  </svg>
)

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
  // 4b: an escape hatch, present ONLY when this screen was reached from inside a help
  // center. Onboarding correctly has none — there is nothing to go back to — but a user who
  // opens "New article" and changes their mind is otherwise trapped on this screen.
  onBack?: () => void
  // How long we will keep this recording, from the OWNER's plan (PRD §8). `null` = for the
  // life of the article. The note under the button states it, so it must be the tier this
  // upload will actually land on — a visitor with no account yet is a free account in a
  // moment, which is why App resolves it from the plan rather than from `runsLeft`.
  videoRetentionDays: number | null | undefined
}

export default function Upload({
  onSubmit,
  onHome,
  runsLeft,
  onCapped,
  saved,
  onBack,
  videoRetentionDays,
}: Props) {
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
  // null when we do not yet know the window — then nothing is claimed at all (PRD §8).
  const retentionNote = COPY.videoDeletion(videoRetentionDays)

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
        <header className="up-head">
          {/* Wordmark returns to the marketing home. */}
          <button className="up-mark" onClick={onHome} aria-label="Back to home">
            <Wordmark height={22} />
          </button>
          {onBack && (
            <button type="button" className="up-back" onClick={onBack}>
              <BackIcon />
              Back to your help center
            </button>
          )}
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

        {/* ONE surface. The dropzone was a dashed grey rectangle nested inside a bordered
            card — two containers doing one job — so the card IS the dropzone now: the whole
            thing is the target, and the context sits inside it as part of the same act. */}
        <form
          className={`up-card${over ? ' over' : ''}${files.length ? ' has-file' : ''}`}
          onSubmit={submit}
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
          <div className="up-drop" onClick={() => !files.length && inputRef.current?.click()}>
            {files.length ? (
              <div className="up-files">
                {files.map((f, i) => (
                  <div className="up-file" key={`${f.name}-${i}`}>
                    <span className="up-file-ic" aria-hidden>
                      <FilmIcon />
                    </span>
                    <span className="up-file-n">{f.name}</span>
                    <span className="up-file-sz">{mb(f.size)}</span>
                    <button
                      type="button"
                      className="up-file-x"
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
                  className="up-more"
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
                <span className="up-drop-ic" aria-hidden>
                  <FilmIcon size={24} />
                </span>
                <p className="up-drop-t">Drop your recordings here</p>
                <p className="up-drop-s">
                  or <span className="up-drop-browse">browse</span> · MP4 or MOV, up to{' '}
                  {mb(MAX_VIDEO_BYTES)} and {MAX_VIDEO_MINUTES} minutes each
                </p>
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

          {error && <p className="up-err">{error}</p>}

          {/* Quota surface 1 of 3 (3f), given real weight rather than being small grey text
              carrying the most consequential fact on the screen. Escalates on the last run:
              run 3 should be a known moment, not a discovery made afterwards. */}
          <p className={`up-quota${runsLeft === 1 ? ' last' : ''}`}>
            {runsLeft === null
              ? COPY.freeLimitDisclosure
              : runsLeft === 1
                ? COPY.lastRunWarning
                : `${runsLeft} of ${PLANS.free.lifetime_runs} left · ${COPY.freeLimitDisclosure}`}
          </p>

          <div className="up-form">
            {/* THE COLLAPSE (3b). Conditionally rendered, NOT `hidden` — the fields carried
                an inline display:flex and a .field display rule, and both beat the hidden
                attribute, so the band said "Spotify · New users · Friendly" and then showed
                the very fields it was summarising directly underneath. The band IS the
                collapsed state. */}
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
            ) : (
              <>
                {/* Names what the block is FOR before it asks for anything, and says the
                    answer is kept — the reason nobody is asked twice (PRD §4). Meta on the
                    right, same weight as the v3 prototype's `.lbl`. */}
                <div className="up-sect-lbl">
                  <b>About your product</b>
                  <span>saved for every guide</span>
                </div>
                {saved?.product_name && (
                  /* DECIDED, not deferred: changing product context never re-runs existing
                     articles. It would burn quota the user did not spend and overwrite edits
                     they made by hand. This sentence is the whole contract — if a "re-run
                     with the new context" affordance ever lands, it belongs on one article
                     at a time, never here. */
                  <p className="up-scope">
                    Changing this affects new recordings only — articles you have already
                    built are untouched.
                  </p>
                )}
                <div className="field">
                  <label htmlFor="product">What product is this?</label>
                  <input
                    id="product"
                    type="text"
                    placeholder="Name of the product / feature"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    required
                  />
                  <p className="hint">Used so the guide calls things by their real names.</p>
                </div>

                <div className="up-row">
                  <div className="field">
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
                  <div className="field">
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
                    placeholder="What this workflow is for, terms we should use, anything the recording does not say out loud."
                    value={description}
                    maxLength={PRODUCT_DESCRIPTION_MAX}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* The RECORDING tier (3b) — the ONE visible input once the product is known. */}
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
              {files.length > 1 && (
                <p className="hint">
                  Applies to all of these. You can describe each one separately in the queue.
                </p>
              )}
            </div>

            {/* The CTA is an action on THEIR file — never "sign up" (ux-spec §2). */}
            <button
              className="btn btn-lg"
              type="submit"
              disabled={!files.length || !productName.trim()}
            >
              {files.length > 1 ? `Build ${files.length} articles` : COPY.buildCta}
            </button>

            {retentionNote && (
              <p className="up-note">
                <LockIcon />
                {retentionNote}
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
