import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import FramePicker from './FramePicker'
import AnnotateBar from './AnnotateBar'
import { useAnnotator } from './useAnnotator'
import AnnotatedImage, { Shape } from '../components/AnnotatedImage'
import { handlePoints, rectOf, rotAnchorPx, type Natural } from '../lib/annotations'
import SelectionToolbar from './SelectionToolbar'
import { ArticleLink } from './marks'
import type { LinkTarget } from '../lib/articleLinks'
import { COPY } from '../lib/config'
import type { Annotation, StepRow } from '../lib/types'

// The step block — the unit of everything (CLAUDE.md §9): { heading, body, image }.
// Body is TipTap, never a textarea — editability is half the product, and the design file's
// <textarea> is comp shorthand, not a spec (see notes).
//
// THE CONTROL CLUSTER IS NOW TWO ACTIONS AND A DELETE (PRD "Context & AI Editing" §6.5).
//
// Merge, split and duplicate are gone. Merge existed to fix OUR over-segmentation, not a
// user need, and shipping permanent UI to paper over a pipeline defect is the wrong trade —
// "this is too broken up" is an instruction, and instructions belong in the steer channel.
// Split went with it for the same reason. Their real payoff is what is left: with the menu
// down to two items, "Check the recording" is unmissable, and hierarchy is how the user
// learns which action is the product.
//
// "Check the recording" is the ONLY accented item on the card. Everything else is neutral.
//
// DELETE STAYS, against the letter of "two items only", and this is a deliberate
// divergence: the hover cluster is the sole entry point for deleting a step, and removing
// it would take away the ability to delete a step at all — a regression §6.5 does not ask
// for and the PRD never mentions. Flagged in OPEN-ITEMS rather than decided quietly.
//
// Drag-to-reorder is untouched. It is one of the three structural gestures CLAUDE.md §9
// keeps, and the only one this change does not remove.

type Props = {
  step: StepRow
  index: number
  screenshotUrl: string | null
  kbId: string
  articleId: string
  onHeading: (heading: string) => void
  onBody: (html: string) => void
  onDelete: () => void
  // "Check the recording" (§6.3). Absent — not disabled, not failing — when there is no
  // recording left to check: `hasVideo` is false once the retention sweep collected it, and
  // a step whose image was hand-uploaded has no moment to go back to either.
  onRecheck: () => void
  // "Change this…" from the selection bubble (§6.1). Carries the selected text up as
  // CONTEXT — the worker reads the step's real body from the database, so this is a hint
  // about where the user's attention was, never the thing being edited.
  onSteerSelection?: (selection: string) => void
  onPickFrame: (newPath: string) => void
  onRemoveFrame: () => void
  onAnnotate: (annotations: Annotation[]) => void
  // The KB's brand colour, so annotations default to on-brand with zero decisions.
  brandColor: string
  onError: (msg: string) => void
  // Whether a FILMSTRIP is available — i.e. whether this article came from a recording at
  // all. Chooses "Change frame" over "Change image" and drives the frame picker, both of
  // which run off the dense frame set, which survives the recording (§10f).
  hasVideo: boolean
  // Whether the RECORDING ITSELF is still in Storage. A different question from `hasVideo`
  // and the only correct gate for "Check the recording".
  hasRecording: boolean
  onDragStart: () => void
  onDragEnterCard: () => void
  onDrop: () => void
  // The run that is writing this article is still going. Every affordance stays VISIBLE and
  // goes inert — revealing them at the end would be a screen change by another name, and
  // the user needs to see what the finished thing will let them do while they wait. It also
  // closes the race where a heading typed mid-run is overwritten by Stage 2.
  readOnly?: boolean
  /** Other articles in this help center, for the bubble's link picker. */
  linkTargets: LinkTarget[]
  // Generating, and this step's frame has not landed yet. Distinct from "no screenshot":
  // one is a slot waiting to be filled, the other is a gap to fix.
  awaitingFrame?: boolean
  // The text on this step changed a moment ago — Stage 2 landing. Marks the line as it
  // settles, then clears itself.
  settling?: boolean
}

export default function StepCard({
  step,
  index,
  screenshotUrl,
  kbId,
  articleId,
  onHeading,
  onBody,
  onDelete,
  onRecheck,
  onSteerSelection,
  onPickFrame,
  onRemoveFrame,
  onAnnotate,
  brandColor,
  onError,
  hasVideo,
  hasRecording,
  onDragStart,
  onDragEnterCard,
  onDrop,
  readOnly = false,
  linkTargets,
  awaitingFrame = false,
  settling = false,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [annotating, setAnnotating] = useState(false)
  // 4h fires ONCE per step per session. Browsing five frames must not ask five times — the
  // question is "do these shapes still belong on a different frame", and it is answered the
  // first time it is asked.
  const [frameAsked, setFrameAsked] = useState(false)
  // Guards the one-shot focus of the text field. Reset whenever the field goes away, so the
  // next placement focuses again.
  const textMounted = useRef(false)
  // 4h: a frame swap on an annotated step. Shapes are positioned against a SPECIFIC frame,
  // so a new one leaves arrows pointing at nothing. Neither answer may be silent — keeping
  // them silently leaves visible nonsense, clearing them silently destroys work — so the
  // pick is held here until the user says which.
  const [pendingFrame, setPendingFrame] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // True while text is selected inside this step. The selection bubble is placed ABOVE the
  // selection, which on the first line of a body puts it exactly where `.ed-tools` sits
  // (top:22px, right:0) — so the two overlapped and the marks became unclickable, which is
  // how a formatting bar reads as broken.
  //
  // The tools lose. They are hover-revealed convenience; the bubble is the thing the user
  // is deliberately reaching for, and someone mid-selection is not reaching for Delete.
  const [selecting, setSelecting] = useState(false)

  const anno = useAnnotator(
    step.annotations ?? [],
    brandColor,
    onAnnotate,
    () => setAnnotating(false),
  )

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        // Disable TipTap's per-editor history so ONE app-level undo (Editor.tsx) covers
        // text and structural gestures together, instead of two competing undo systems.
        undoRedo: false,
        // Replaced below by the id-carrying variant, same as the FAQ answer editor.
        link: false,
      }),
      ArticleLink.configure({ openOnClick: false, autolink: false }),
      // Ghost-text scaffolding so a blank manual step is never a blinking cursor on an
      // empty canvas (ux-spec §4: the step schema is the writing coach).
      Placeholder.configure({ placeholder: 'Describe the action in one line.' }),
    ],
    content: step.body_text || '',
    onUpdate: ({ editor }) => onBody(editor.getHTML()),
    // THE SELECTION HIDES THE STEP TOOLS (see `selecting` below). Tracked here rather than
    // with a useEditorState subscription: this fires only on selection changes in THIS
    // card's editor, which is exactly the event, and costs nothing on the other cards.
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection
      setSelecting(to > from)
    },
    onBlur: () => setSelecting(false),
  })

  // The run finishing flips this without remounting the editor — a remount would drop the
  // caret and count as the screen change this whole slice exists to avoid.
  useEffect(() => {
    editor?.setEditable(!readOnly)
  }, [editor, readOnly])

  // While the run owns the text, the document is written from outside TipTap. TipTap owns
  // its content after mount, so Stage 2's polish has to be pushed in — and only while
  // read-only, so it can never fight a user's typing.
  useEffect(() => {
    if (!editor || !readOnly) return
    const next = step.body_text || ''
    if (editor.getHTML() !== next) editor.commands.setContent(next, { emitUpdate: false })
  }, [editor, readOnly, step.body_text])

  // Whether "Check the recording" can exist at all. Two ways it cannot: the RECORDING IS
  // GONE, collected by the retention sweep, or this step's image was hand-uploaded and so
  // has no moment in the recording to go back to. Either way the action is ABSENT.
  //
  // `hasRecording`, NOT `hasVideo`. They diverged the moment retention replaced
  // delete-on-publish: `hasVideo` is `source === 'generated'`, which is the article's
  // ORIGIN and stays true forever (§10f is explicit that the recording's absence stops
  // meaning anything about origin). Gating on it would render the action on every generated
  // article for the rest of time and 409 the moment anyone pressed it — present-and-failing,
  // which is the one thing §10f says this must never be.
  const canRecheck = hasRecording && step.timestamp_seconds !== null

  return (
    <article
      className={`ed-card${readOnly ? ' ed-card-live' : ''}${annotating ? ' ed-card-anno' : ''}${selecting ? ' ed-card-selecting' : ''}`}
      // The tooltip for a locked step, drawn from this attribute in CSS rather than by the
      // browser's own `title` — a native tooltip waits a second, appears at the cursor and
      // would duplicate the styled one. Without any tooltip a locked editor just feels
      // broken, which is most of what the "is it finished?" confusion actually is.
      data-locked={readOnly ? COPY.buildLockHint : undefined}
      id={`step-${step.step_number}`}
      data-index={index}
      onDragEnter={readOnly ? undefined : onDragEnterCard}
      onDragOver={(e) => e.preventDefault()}
      onDrop={readOnly ? undefined : onDrop}
    >
      {confirmDelete ? (
        <div className="ed-tools ed-tools-confirm">
          <span>Delete this step?</span>
          <button
            className="row-confirm"
            onClick={() => {
              setConfirmDelete(false)
              onDelete()
            }}
          >
            Delete
          </button>
          <button className="row-cancel" onClick={() => setConfirmDelete(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="ed-tools">
          {/* The one accented item on the card. Absent rather than disabled when the
              recording is gone: a greyed-out button teaches people the feature is broken,
              where an absent one teaches them nothing at all — which is correct, because
              there is nothing they can do about a collected recording (§10f). */}
          {canRecheck && (
            <button
              type="button"
              className="accent"
              disabled={readOnly}
              onClick={onRecheck}
              title="Re-read the recording around this step"
            >
              Check the recording
            </button>
          )}
          <button
            type="button"
            disabled={readOnly}
            onClick={() => setPickerOpen((o) => !o)}
            title={hasVideo ? 'Pick a different frame' : 'Upload a different image'}
          >
            New screenshot
          </button>
          <button
            type="button"
            className="danger"
            disabled={readOnly}
            onClick={() => setConfirmDelete(true)}
            title="Delete this step"
          >
            Delete
          </button>
        </div>
      )}

      <div className="ed-card-hd">
        {/* Only the handle is draggable, so text selection inside the body still works. */}
        <span
          className="ed-grip"
          draggable={!readOnly}
          onDragStart={readOnly ? undefined : onDragStart}
          onDragEnd={readOnly ? undefined : onDrop}
          title="Drag to reorder"
          aria-label="Drag to reorder"
        >
          ⠿
        </span>
        <span className="ed-num" aria-hidden>
          {String(step.step_number).padStart(2, '0')}
        </span>
        <input
          className="ed-h-in"
          value={step.heading}
          readOnly={readOnly}
          placeholder="What's the first thing they do?"
          onChange={(e) => onHeading(e.target.value)}
          aria-label={`Step ${step.step_number} heading`}
        />
      </div>

      <EditorContent
        editor={editor}
        className={`ed-prose${settling ? ' ed-settling' : ''}`}
      />
      {/* Renders itself out of existence when the selection is collapsed or the editor is
          read-only, so there is nothing to gate here. */}
      <SelectionToolbar
        editor={editor}
        targets={linkTargets}
        onSteer={onSteerSelection}
      />

      {screenshotUrl ? (
        <div className="ed-shotwrap">
          {/* The step card's screenshot IS the drawing surface. There is no second surface:
              two boxes rendering the same shapes at two sizes was the whole cause of the
              distortion, and a modal that is no bigger than this bought no precision to
              justify it. */}
          <div className={`ed-shot ed-shot-landed${annotating ? ' annotating' : ''}`}>
            <AnnotatedImage
              src={screenshotUrl}
              alt={`Step ${step.step_number}`}
              annotations={annotating ? anno.items : step.annotations}
              drawing={annotating}
              overlay={
                annotating
                  ? (nat) => (
                      <>
                        {anno.draft && <Shape a={anno.draft} nat={nat} />}
                        {anno.sel !== null && anno.items[anno.sel] && (
                          <SelectionBox a={anno.items[anno.sel]} nat={nat} />
                        )}
                      </>
                    )
                  : undefined
              }
              onNatural={anno.setNatural}
              {...(annotating ? anno.handlers : {})}
            >
              {annotating && anno.typing && (
                <input
                  className="anb-text-in"
                  // Focus ONCE, on mount, and never again — a bare ref callback re-runs on
                  // every render and would yank focus back from wherever the user had moved
                  // it. autoFocus was worse still: it fires while the placing click is
                  // still settling, so focus landed and was taken away in the same tick.
                  ref={(el) => {
                    // React calls this with null on unmount, which is the natural place to
                    // arm the next placement.
                    if (!el) {
                      textMounted.current = false
                      return
                    }
                    if (textMounted.current) return
                    textMounted.current = true
                    el.focus()
                  }}
                  placeholder="Type…"
                  style={{
                    left: `${anno.typing.x * 100}%`,
                    top: `${anno.typing.y * 100}%`,
                    color: anno.colour,
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onFocus={anno.onTextFocus}
                  onKeyDown={(e) => {
                    // The surface listens for V/A/B/C/T on document — every keystroke here
                    // has to stop before it reaches that, or typing "box" changes tools.
                    e.stopPropagation()
                    if (e.key === 'Enter') anno.commitText(e.currentTarget.value)
                    if (e.key === 'Escape') anno.cancelText()
                  }}
                  onBlur={(e) => {
                    const v = e.currentTarget.value
                    if (v.trim()) {
                      anno.commitText(v)
                      return
                    }
                    // Empty AND never actually focused = the browser moving focus during
                    // mount, not the user leaving. Cancelling on that is what put the tool
                    // back to Select the instant the field appeared.
                    if (anno.textEverFocused()) anno.cancelText()
                  }}
                />
              )}
            </AnnotatedImage>

            {!annotating && (
              <div className="ed-shot-ov">
                <button type="button" disabled={readOnly} onClick={() => setAnnotating(true)}>
                  {step.annotations?.length ? 'Edit annotations' : 'Annotate'}
                </button>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => setPickerOpen((o) => !o)}
                >
                  {hasVideo ? 'Change frame' : 'Change image'}
                </button>
              </div>
            )}
          </div>

          {annotating && (
            <AnnotateBar
              tool={anno.tool}
              colour={anno.colour}
              brandColor={brandColor}
              canDelete={anno.sel !== null}
              onPick={anno.pick}
              onColour={anno.chooseColour}
              onDelete={anno.remove}
              onDone={() => setAnnotating(false)}
            />
          )}

          {step.is_edited && (
            <p className="ed-edited">✓ Edited — a re-run won’t overwrite this</p>
          )}
        </div>
      ) : awaitingFrame ? (
        // The slot, waiting. Frames do NOT arrive evenly — ffmpeg seeks, encodes and uploads
        // one at a time — so a step that sits empty for six seconds while its neighbours
        // fill in reads as a hang unless the slot itself says otherwise. Its own resting
        // animation, per slot, is what makes a slow frame legible as slow rather than dead.
        <div className="ed-shot-wait" aria-label="Capturing this screenshot">
          <span className="ed-shot-wait-sheen" aria-hidden />
          {/* On the placeholder itself. Screenshots lag the text by design — frames are
              seeked, encoded and uploaded one at a time — and saying so here is the
              difference between "still coming" and "this step has no image". */}
          <span className="ed-shot-chip">{COPY.buildShotComing}</span>
        </div>
      ) : (
        // Not a quiet "+ Add image": a step with no screenshot is the visible face of a
        // frames_partial degrade, and the reader navigates by pictures. It says why.
        <div className="ed-noshot">
          <p>No screenshot for this step. Readers follow steps by what the screen looked like.</p>
          <button type="button" disabled={readOnly} onClick={() => setPickerOpen((o) => !o)}>
            {hasVideo ? 'Pick a frame' : 'Add an image'}
          </button>
        </div>
      )}

      {pickerOpen && (
        <FramePicker
          kbId={kbId}
          articleId={articleId}
          stepNumber={step.step_number}
          currentPath={step.screenshot_url}
          // Null once the image is a human pick or upload: the timestamp still holds the
          // moment the pipeline chose, and marking that frame "in use" would be a lie.
          currentSecond={step.is_edited ? null : step.timestamp_seconds}
          hasVideo={hasVideo}
          onPick={(path) => {
            // The picker STAYS OPEN (item 3). Choosing a frame is browsing, not committing:
            // people try several and keep the one that looks right, and closing on every
            // pick made that a five-step loop of reopening a strip that then reloaded.
            // Closing is now only ever an explicit action.
            //
            // 4h. Annotations are positioned against a specific frame, so swapping it
            // leaves arrows pointing at nothing. Asked ONCE per step per session — browsing
            // five frames must not ask five times.
            if (step.annotations?.length && !frameAsked) setPendingFrame(path)
            else onPickFrame(path)
          }}
          onRemove={() => {
            // Removing the image is a decision, not browsing — there is nothing left to
            // compare, so this one does close.
            onRemoveFrame()
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
          onError={onError}
        />
      )}

      {pendingFrame && (
        <div className="ed-anno-ask" role="alertdialog" aria-label="Keep your annotations?">
          <p>Keep your annotations on the new screenshot?</p>
          <span>
            They were drawn on the old frame, so they may not line up with the new one.
          </span>
          <div className="ed-anno-ask-acts">
            <button
              type="button"
              className="row-confirm"
              onClick={() => {
                onPickFrame(pendingFrame)
                setFrameAsked(true)
                setPendingFrame(null)
              }}
            >
              Keep them
            </button>
            <button
              type="button"
              className="row-cancel"
              onClick={() => {
                onPickFrame(pendingFrame)
                onAnnotate([])
                setFrameAsked(true)
                setPendingFrame(null)
              }}
            >
              Clear them
            </button>
          </div>
        </div>
      )}

    </article>
  )
}

// The selection affordance: a frame plus the handles that actually do something.
//
// The handles are drawn INSIDE the same <svg>, in natural-pixel space, and their positions
// come from handlePoints — which rotates each offset about the box centre before placing it.
// That is the fix for the thing that was wrong: handles used to be laid out axis-aligned
// while the box turned, so on a rotated label they floated off the corners they belonged to
// and dragging one resized along the wrong axes.
function SelectionBox({ a, nat }: { a: Annotation; nat: Natural }) {
  const pts = handlePoints(a, nat)
  // Sized as a share of the picture, the same rule the stroke weight and type size already
  // follow — so a handle covers the same part of the screenshot on a 720p recording and a 4K
  // one, and nothing here has to measure the rendered box.
  const r = nat.w * 0.011
  const isRect = a.t !== 'arrow'
  const rect = isRect ? rectOf(a, nat) : null
  const rot = a.rot ?? 0
  const tether = a.t === 'text' ? rotAnchorPx(a, nat) : null
  const rotPt = pts.find((p) => p.id === 'rot')

  return (
    <g>
      {rect && (
        <rect
          className="aimg-sel"
          x={rect.x * nat.w}
          y={rect.y * nat.h}
          width={rect.w * nat.w}
          height={rect.h * nat.h}
          rx={6}
          transform={
            rot
              ? `rotate(${rot} ${(rect.x + rect.w / 2) * nat.w} ${(rect.y + rect.h / 2) * nat.h})`
              : undefined
          }
          pointerEvents="none"
        />
      )}
      {/* The rotate handle's tether. It leaves the box from the top edge IN THE ROTATED
          FRAME, so it swings round with the label instead of always pointing north. */}
      {tether && rotPt && (
        <line
          className="aimg-tether"
          x1={tether.x}
          y1={tether.y}
          x2={rotPt.x}
          y2={rotPt.y}
          pointerEvents="none"
        />
      )}
      {pts.map((p) => (
        <circle
          key={p.id}
          className={`aimg-grip${p.id === 'rot' ? ' rot' : ''}`}
          data-handle={p.id}
          cx={p.x}
          cy={p.y}
          r={p.id === 'rot' ? r * 1.05 : r}
        />
      ))}
    </g>
  )
}
