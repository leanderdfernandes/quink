import { useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { DOMSerializer } from '@tiptap/pm/model'
import FramePicker from './FramePicker'
import type { StepRow } from '../lib/types'

// The step block — the unit of everything (CLAUDE.md §9): { heading, body, image }.
// Body is TipTap, never a textarea. Heading is a title field (a single-line input).
//
// Structural vocabulary is exactly three gestures (CLAUDE.md §9): reorder (drag handle),
// merge (fuse into the step above), split (cleave the body at the cursor). No duplicate,
// no delete — a good editor is defined by what it refuses.

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
  onPickFrame: (newPath: string) => void
  onRemoveFrame: () => void
  hasVideo: boolean
  // Native drag-reorder wiring (from the parent).
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
  onPickFrame,
  onRemoveFrame,
  hasVideo,
  onDragStart,
  onDragEnterCard,
  onDrop,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
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
      className="step-card"
      id={`step-${step.step_number}`}
      data-index={index}
      onDragEnter={onDragEnterCard}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="step-head">
        {/* Only the handle is draggable, so text selection inside the body still works. */}
        <span
          className="drag-handle"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDrop}
          title="Drag to reorder"
          aria-label="Drag to reorder"
        >
          ⠿
        </span>
        <span className="step-num">{step.step_number}</span>
        <input
          className="step-heading"
          value={step.heading}
          placeholder="What's the first thing they do?"
          onChange={(e) => onHeading(e.target.value)}
        />

        {/* Control cluster — hover only. Restraint is the design for this buyer. */}
        <div className="step-controls">
          {!isFirst && (
            <button type="button" className="ctrl" onClick={onMergeUp} title="Merge into step above">
              ⤒ Merge up
            </button>
          )}
          {/* preventDefault on mousedown keeps focus in the editor, so splitHere reads
              the real caret position instead of a blurred selection collapsing to 0. */}
          <button
            type="button"
            className="ctrl"
            onMouseDown={(e) => e.preventDefault()}
            onClick={splitHere}
            title="Split at cursor"
          >
            ⤢ Split
          </button>
        </div>
      </div>

      <EditorContent editor={editor} className="step-body" />

      {/* Not every step needs an image. With one: the picture + a hover affordance to
          change it. Without: a quiet "Add image" — no big empty placeholder box. */}
      {screenshotUrl ? (
        <div className="step-shot">
          <img src={screenshotUrl} alt={`Step ${step.step_number}`} />
          {step.is_edited && <span className="edited-badge">✓ edited</span>}
          <button
            className="wrong-frame"
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
          >
            {/* "Wrong frame?" only makes sense for a video-drafted step; a manual step
                just changes its image. */}
            {hasVideo ? '⟳ Wrong frame?' : '⟳ Change image'}
          </button>
        </div>
      ) : (
        <button className="add-image" type="button" onClick={() => setPickerOpen((o) => !o)}>
          + Add image
        </button>
      )}

      {pickerOpen && (
        <FramePicker
          kbId={kbId}
          articleId={articleId}
          stepNumber={step.step_number}
          currentUrl={screenshotUrl}
          currentPath={step.screenshot_url}
          onPick={(path) => {
            onPickFrame(path)
            setPickerOpen(false)
          }}
          onRemove={() => {
            onRemoveFrame()
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
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
