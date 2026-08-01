import { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { DOMSerializer } from '@tiptap/pm/model'
import FramePicker from './FramePicker'
import Annotator from './Annotator'
import AnnotationLayer from '../components/AnnotationLayer'
import type { Annotation, StepRow } from '../lib/types'

// The step block — the unit of everything (CLAUDE.md §9): { heading, body, image }.
// Body is TipTap, never a textarea — editability is half the product, and the design file's
// <textarea> is comp shorthand, not a spec (see notes).
//
// The control cluster is the four gestures ux-spec §4 actually lists: merge up, split,
// duplicate, delete. Split and Insert are deliberately different jobs and their labels say
// so — Split means "this step covers two things" and carries the text below the cursor into
// a new step; Insert (the hairline between cards, in Editor) means "I missed a step" and
// makes an empty one.

type Props = {
  step: StepRow
  index: number
  isFirst: boolean
  screenshotUrl: string | null
  kbId: string
  articleId: string
  onHeading: (heading: string) => void
  onBody: (html: string) => void
  onMergeUp: () => void
  onSplit: (beforeHtml: string, afterHtml: string) => void
  onDuplicate: () => void
  onDelete: () => void
  onPickFrame: (newPath: string) => void
  onRemoveFrame: () => void
  onAnnotate: (annotations: Annotation[]) => void
  // The KB's brand colour, so annotations default to on-brand with zero decisions.
  brandColor: string
  onError: (msg: string) => void
  hasVideo: boolean
  onDragStart: () => void
  onDragEnterCard: () => void
  onDrop: () => void
  // The run that is writing this article is still going. Every affordance stays VISIBLE and
  // goes inert — revealing them at the end would be a screen change by another name, and
  // the user needs to see what the finished thing will let them do while they wait. It also
  // closes the race where a heading typed mid-run is overwritten by Stage 2.
  readOnly?: boolean
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
  isFirst,
  screenshotUrl,
  kbId,
  articleId,
  onHeading,
  onBody,
  onMergeUp,
  onSplit,
  onDuplicate,
  onDelete,
  onPickFrame,
  onRemoveFrame,
  onAnnotate,
  brandColor,
  onError,
  hasVideo,
  onDragStart,
  onDragEnterCard,
  onDrop,
  readOnly = false,
  awaitingFrame = false,
  settling = false,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [annotating, setAnnotating] = useState(false)
  // 4h: a frame swap on an annotated step. Shapes are positioned against a SPECIFIC frame,
  // so a new one leaves arrows pointing at nothing. Neither answer may be silent — keeping
  // them silently leaves visible nonsense, clearing them silently destroys work — so the
  // pick is held here until the user says which.
  const [pendingFrame, setPendingFrame] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
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
      }),
      // Ghost-text scaffolding so a blank manual step is never a blinking cursor on an
      // empty canvas (ux-spec §4: the step schema is the writing coach).
      Placeholder.configure({ placeholder: 'Describe the action in one line.' }),
    ],
    content: step.body_text || '',
    onUpdate: ({ editor }) => onBody(editor.getHTML()),
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

  // Split at the cursor: serialize the doc before and after the caret to HTML.
  function splitHere() {
    if (!editor) return
    const { state } = editor
    const pos = state.selection.from
    const end = state.doc.content.size
    onSplit(sliceHtml(editor, 0, pos), sliceHtml(editor, pos, end))
  }

  return (
    <article
      className={`ed-card${readOnly ? ' ed-card-live' : ''}`}
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
          {!isFirst && (
            <button
              type="button"
              disabled={readOnly}
              onClick={onMergeUp}
              title="Join this step onto the one above"
            >
              Merge up
            </button>
          )}
          {/* preventDefault on mousedown keeps focus in the editor, so splitHere reads
              the real caret position instead of a blurred selection collapsing to 0. */}
          <button
            type="button"
            disabled={readOnly}
            onMouseDown={(e) => e.preventDefault()}
            onClick={splitHere}
            title="Cut this step in two at the cursor"
          >
            Split here
          </button>
          <button
            type="button"
            disabled={readOnly}
            onClick={onDuplicate}
            title="Make a copy of this step"
          >
            Duplicate
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

      {screenshotUrl ? (
        <div className="ed-shotwrap">
          <div className="ed-shot ed-shot-landed">
            <img src={screenshotUrl} alt={`Step ${step.step_number}`} />
            {/* Same component the reader renders from, so the draft and the live page
                cannot disagree about where an arrow points. */}
            <AnnotationLayer annotations={step.annotations} />
            <div className="ed-shot-ov">
              <button
                type="button"
                disabled={readOnly}
                onClick={() => setAnnotating(true)}
              >
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
          </div>
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
            setPickerOpen(false)
            // 4h. Annotations are positioned against a specific frame, so swapping it
            // leaves arrows pointing at nothing. Ask — never silently keep (visible
            // nonsense) and never silently clear (destroyed work).
            if (step.annotations?.length) setPendingFrame(path)
            else onPickFrame(path)
          }}
          onRemove={() => {
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
                setPendingFrame(null)
              }}
            >
              Clear them
            </button>
          </div>
        </div>
      )}

      {annotating && screenshotUrl && (
        <Annotator
          imageUrl={screenshotUrl}
          annotations={step.annotations ?? []}
          brandColor={brandColor}
          onDone={(next) => {
            // No Save button (4e): this commits to local state and rides the editor's
            // existing 700ms autosave. Nothing refetches, nothing remounts.
            onAnnotate(next)
            setAnnotating(false)
          }}
          onCancel={() => setAnnotating(false)}
        />
      )}
    </article>
  )
}

// Serialize a document range [from, to] to an HTML string.
function sliceHtml(editor: NonNullable<ReturnType<typeof useEditor>>, from: number, to: number) {
  const slice = editor.state.doc.slice(from, to)
  const fragment = DOMSerializer.fromSchema(editor.schema).serializeFragment(slice.content)
  const div = document.createElement('div')
  div.appendChild(fragment)
  return div.innerHTML
}
