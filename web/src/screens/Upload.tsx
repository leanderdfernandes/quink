import { useEffect, useState, useRef } from 'react'
import {
  ACCEPTED_VIDEO_EXTENSIONS,
  ACCEPTED_VIDEO_TYPES,
  CONTEXT_BUDGET_WARN,
  CONTEXT_CHAR_BUDGET,
  RECORDING_NOTE_MAX,
  AUDIENCE_MAX,
  ONE_OFF_NOTE_MAX,
  ONE_OFF_NOTE_TITLE,
  contextCharsUsed,
  COPY,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_MINUTES,
  wakeWorker,
} from '../lib/config'
import { PLANS } from '../lib/plans'
import { toneIndices, toneLabel } from '../lib/tone'
import ProductNotes from '../components/ProductNotes'
import ContextSummary from '../components/ContextSummary'
import ToneSliders from '../components/ToneSliders'
import Wordmark from '../components/Wordmark'

import { EMPTY_PRODUCT_CONTEXT } from '../lib/kbs'
import type { ProductContext, ProductNote, VideoContext } from '../lib/types'

// Upload + context — reached from the marketing home's "Build my article" CTA.
//
// The dropzone and the context form are ONE visual unit on purpose: the form should
// read as part of uploading, not as a gate before it. Committing the file first is
// what makes the account wall land as a next step rather than a barrier (ux-spec §2).

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

// Drawn to the same grid and weight as the existing set (KnowledgeBase.tsx) — no emoji as
// iconography, including the padlock that used to sit on the deletion note.
const FilmIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <path d="M7.5 5v14M16.5 5v14M2.5 12h19" />
  </svg>
)
const LockIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="4" y="10" width="16" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
)
const BackIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
  // `persistProduct` says whether the product tier in `context` should be SAVED to the KB
  // as well as used for this run. True only on the run that has no saved context to start
  // from — every later run may override it for itself and must never write back (below).
  onSubmit: (files: File[], context: VideoContext, persistProduct: boolean) => void
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
  const [productName, setProductName] = useState(saved?.name ?? '')
  // THE FORK, and the whole shape of this screen.
  //
  //   No saved context  -> this IS the product form. What you type is saved to the help
  //                        centre, because there is nothing there yet and asking again on
  //                        the next run would be asking someone to retype what they told us.
  //   Saved context     -> a three-line summary and a PER-RUN OVERRIDE. Nothing typed here
  //                        is written back. It used to be: expanding this card edited the
  //                        workspace, so tightening the voice for one awkward recording
  //                        silently re-voiced every guide built afterwards, from a screen
  //                        whose whole subject is the file in the dropzone.
  const hasSaved = !!saved?.name
  const savedCtx = saved ?? EMPTY_PRODUCT_CONTEXT
  const savedTone = toneIndices(savedCtx.tone)
  const [ovOpen, setOvOpen] = useState(false)
  const [ovAudience, setOvAudience] = useState(savedCtx.audience)
  const [ovVoice, setOvVoice] = useState(savedTone[0])
  const [ovDetail, setOvDetail] = useState(savedTone[1])
  // ADDED to the workspace context for this run, never instead of it. That is what the
  // field says and what the payload below does — a one-off that replaced the notes would
  // quietly un-ground a run at the moment someone was trying to ground it harder.
  const [oneOff, setOneOff] = useState('')
  const ovTone = toneLabel(ovVoice, ovDetail)
  const overridden =
    !!oneOff.trim() || ovAudience.trim() !== savedCtx.audience || ovTone !== savedCtx.tone
  // The recording tier (3b). Every field above describes the PRODUCT and is reused by every
  // run; this one describes the video in the dropzone. Its absence is why the run that
  // matters most — the first one — has had no per-video grounding at all.
  const [recording, setRecording] = useState('')
  // The workspace's notes, on the BOOTSTRAP run only (`hasSaved` below). App persists what
  // this form submits, so it is the same write the Settings screen makes — not a second
  // one. Once context exists, notes are a Settings surface and this screen overrides.
  const [notes, setNotes] = useState<ProductNote[]>(saved?.notes ?? [])
  const [openNote, setOpenNote] = useState<string | null>(null)
  // Summed exactly the way set_product_context sums it, so the meter and the refusal
  // cannot disagree about what 100% means. Only the bootstrap branch can reach it: the
  // override writes nothing, so it cannot be over budget.
  const used = contextCharsUsed('', notes)
  const pct = Math.min(1, used / CONTEXT_CHAR_BUDGET)
  const overBudget = used > CONTEXT_CHAR_BUDGET
  const inputRef = useRef<HTMLInputElement>(null)
  // null when we do not yet know the window — then nothing is claimed at all (PRD §8).
  const retentionNote = COPY.videoDeletion(videoRetentionDays)

  // Landing here is the earliest honest signal that a run is coming, and it is minutes
  // ahead of POST /api/generate — plenty to absorb a ~30s cold start on Render's free tier
  // (see wakeWorker). Once per mount; StrictMode's double mount costs one extra no-op GET.
  useEffect(wakeWorker, [])

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

  // The product tier THIS RUN is grounded on. Two shapes, one payload — and in both cases
  // it is what gets stored on the job, so a retry replays exactly this and not whatever the
  // workspace says weeks later (CLAUDE.md §10g).
  function runProduct(): ProductContext {
    if (!hasSaved) {
      return {
        name: productName.trim(),
        // This screen has never owned a second copy of the workspace description; Settings
        // is where that question is asked.
        description: '',
        // Empty notes are dropped rather than stored, the same rule Settings applies:
        // someone who taps "Add note" and changes their mind should not leave a blank card
        // behind for the pipeline to read.
        notes: notes
          .filter((n) => n.title.trim() || n.body.trim())
          .map((n) => ({ ...n, title: n.title.trim(), body: n.body.trim() })),
        audience: '',
        tone: '',
      }
    }
    // The override. Everything the workspace knows, with the two style fields replaced and
    // the one-off APPENDED as a note — which is how it reaches the prompt at all: the
    // builder already walks `notes`, so nothing in the worker had to learn a new key.
    return {
      ...savedCtx,
      audience: ovAudience.trim(),
      tone: ovTone,
      notes: oneOff.trim()
        ? [
            ...savedCtx.notes,
            { id: 'one-off', title: ONE_OFF_NOTE_TITLE, body: oneOff.trim() },
          ]
        : savedCtx.notes,
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!files.length || !productName.trim() || overBudget) return
    // PERSIST ONLY ON THE BOOTSTRAP RUN. `hasSaved` is the whole condition: with context
    // already on the KB this screen is a per-run override and App must not write it back.
    onSubmit(files, { product: runProduct(), recording: recording.trim() }, !hasSaved)
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
            {hasSaved ? (
              <div className="up-ctx">
                {/* The same component Settings previews under "Show me" — one summary, two
                    hosts, so the preview cannot disagree with the thing it previews. */}
                <ContextSummary
                  product={savedCtx}
                  changed={overridden}
                  oneOff={oneOff}
                  action={
                    <button
                      type="button"
                      className="up-known-a"
                      onClick={() => setOvOpen((o) => !o)}
                    >
                      {ovOpen ? 'Done' : 'Change for this one'}
                    </button>
                  }
                />

                {ovOpen && (
                  <div className="up-ov">
                    <div className="field">
                      <label htmlFor="ov-audience">Who is this one for?</label>
                      <input
                        id="ov-audience"
                        type="text"
                        value={ovAudience}
                        maxLength={AUDIENCE_MAX}
                        onChange={(e) => setOvAudience(e.target.value)}
                        placeholder="e.g. Teachers building reading lists for a class"
                      />
                    </div>

                    <ToneSliders
                      voice={ovVoice}
                      detail={ovDetail}
                      onChange={(v, d) => {
                        setOvVoice(v)
                        setOvDetail(d)
                      }}
                    />

                    <div className="field">
                      <label htmlFor="ov-note">
                        Anything else, just for this guide{' '}
                        <span className="optional">Optional</span>
                      </label>
                      <textarea
                        id="ov-note"
                        rows={3}
                        value={oneOff}
                        maxLength={ONE_OFF_NOTE_MAX}
                        onChange={(e) => setOneOff(e.target.value)}
                        placeholder="e.g. This shows the new share sheet that ships next week — do not mention the old Share button."
                      />
                      <p className="hint">
                        Your saved product context still applies — this is added to it.
                      </p>
                    </div>

                    {/* The contract, on the screen that could break it in the other
                        direction. Nothing above this line is written back to the help
                        center, and the sentence is the only thing that says so. */}
                    <p className="up-scope">
                      Changes here apply to this guide only. To change every guide, edit
                      Product &amp; context in Settings.
                    </p>
                  </div>
                )}
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
                {saved?.name && (
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

                {/* THE CONTEXT ITSELF, not just its name. This card could previously show
                    a product name and nothing else, so the one screen where it matters —
                    the one about to spend a run — was the one screen where you could not
                    read or change what the run would be written against. Same editor as
                    Settings (components/ProductNotes), and the same write: App already
                    calls saveProductContext() with whatever this form submits, so nothing
                    new persists it and there is no second write path (PRD §4). */}
                <div className="ps-sect">
                  <div className="up-sect-lbl">
                    <b>What a guide should get right</b>
                    <span>{notes.length ? plural(notes.length, 'note') : 'no notes yet'}</span>
                  </div>
                  <p className="hint" style={{ marginBottom: 14 }}>
                    A glossary, a feature list, who can do what — anything the recording does
                    not say out loud. Kept for every guide you build.
                  </p>
                  <ProductNotes
                    notes={notes}
                    onChange={setNotes}
                    open={openNote}
                    onOpen={setOpenNote}
                  />
                  {/* The same meter Settings shows, for the same reason: set_product_context
                      REFUSES over budget rather than truncating, and App saves this in the
                      background — so without a wall here an over-budget note would silently
                      fail to persist while the run started anyway. */}
                  <div className={`ps-budget${pct >= CONTEXT_BUDGET_WARN ? ' warn' : ''}`}>
                    <div className="q-progress">
                      <div
                        className="q-progress-fill"
                        style={{ width: `${(pct * 100).toFixed(1)}%` }}
                      />
                    </div>
                    <p className="hint">
                      {Math.round(pct * 100)}% of context used
                      {overBudget && ` — ${used - CONTEXT_CHAR_BUDGET} characters over`}
                    </p>
                  </div>
                </div>

                {/* "Anything else we should know?" used to live here — a free textarea
                    writing product_context.description. It is gone, and nothing replaces
                    it on this screen. Notes are the ONE mechanism for workspace context
                    (PRD §4), they are a Settings surface, and a second field that said the
                    same thing into a different column is exactly what made the two screens
                    disagree about what the model had been told. */}
              </>
            )}

            {/* The RECORDING tier (3b) — the ONE context input on this screen, and the only
                one that is about the file in the dropzone rather than about the workspace. */}
            <div className="field">
              <label htmlFor="recording">
                What does this recording show? <span className="optional">Optional</span>
              </label>
              <input
                id="recording"
                type="text"
                placeholder={COPY.recordingPlaceholder}
                value={recording}
                maxLength={RECORDING_NOTE_MAX}
                onChange={(e) => setRecording(e.target.value)}
              />
              <p className="hint">
                A specific answer gets a specific guide. Name the task, not the product.
              </p>
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
              disabled={!files.length || !productName.trim() || overBudget}
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
