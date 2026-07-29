import { useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { DOMSerializer } from '@tiptap/pm/model'
import FramePicker from './FramePicker'
import type { StepRow } from '../lib/types'

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
  onError: (msg: string) => void
  hasVideo: boolean
  onDragStart: () => void
  onDragEnterCard: () => void
  onDrop: () => void
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
  onError,
  hasVideo,
  onDragStart,
  onDragEnterCard,
  onDrop,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const editor = useEditor({
    immediatelyRender: false,
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
      className="ed-card"
      id={`step-${step.step_number}`}
      data-index={index}
      onDragEnter={onDragEnterCard}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
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
            <button type="button" onClick={onMergeUp} title="Join this step onto the one above">
              Merge up
            </button>
          )}
          {/* preventDefault on mousedown keeps focus in the editor, so splitHere reads
              the real caret position instead of a blurred selection collapsing to 0. */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={splitHere}
            title="Cut this step in two at the cursor"
          >
            Split here
          </button>
          <button type="button" onClick={onDuplicate} title="Make a copy of this step">
            Duplicate
          </button>
          <button
            type="button"
            className="danger"
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
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDrop}
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
          placeholder="What's the first thing they do?"
          onChange={(e) => onHeading(e.target.value)}
          aria-label={`Step ${step.step_number} heading`}
        />
      </div>

      <EditorContent editor={editor} className="ed-prose" />

      {screenshotUrl ? (
        <div className="ed-shotwrap">
          <div className="ed-shot">
            <img src={screenshotUrl} alt={`Step ${step.step_number}`} />
            <div className="ed-shot-ov">
              <button type="button" onClick={() => setPickerOpen((o) => !o)}>
                {hasVideo ? 'Change frame' : 'Change image'}
              </button>
            </div>
          </div>
          {step.is_edited && (
            <p className="ed-edited">✓ Edited — a re-run won’t overwrite this</p>
          )}
        </div>
      ) : (
        // Not a quiet "+ Add image": a step with no screenshot is the visible face of a
        // frames_partial degrade, and the reader navigates by pictures. It says why.
        <div className="ed-noshot">
          <p>No screenshot for this step. Readers follow steps by what the screen looked like.</p>
          <button type="button" onClick={() => setPickerOpen((o) => !o)}>
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
          onPick={(path) => {
            onPickFrame(path)
            setPickerOpen(false)
          }}
          onRemove={() => {
            onRemoveFrame()
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
          onError={onError}
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
