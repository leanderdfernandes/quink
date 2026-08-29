import Icon from './Icon'
import type { ProductNote } from '../lib/types'

// The notes editor, in ONE place, because it now has two hosts.
//
// It lived inside Settings → Product & context, which meant the upload card could neither
// show nor change the grounding the run it was about to start would be written against.
// You could see a product NAME you had typed once and nothing else — so "what does Quink
// actually know about my product" was unanswerable from the screen where it mattered most.
//
// Copying the list into the upload card was the other option and would have been two
// editors for one field: they drift, and the one people use less becomes the wrong one.
// Both hosts still write through saveProductContext() → set_product_context(), so this is
// a second SURFACE and deliberately not a second write path (PRD §4).
//
// Collapsed rows, one open at a time. Expanded cards do not scale — by the third note the
// screen is a wall of textareas and you can no longer see what you already wrote, only what
// you are typing. The row's name IS the title field: a label until you click it, an input
// the moment you do, so a card holds exactly one of everything it is about.

const newNote = (): ProductNote => ({ id: crypto.randomUUID(), title: '', body: '' })

type Props = {
  notes: ProductNote[]
  onChange: (notes: ProductNote[]) => void
  /** Which note is expanded, owned by the host so adding one can open it. */
  open: string | null
  onOpen: (id: string | null) => void
}

export default function ProductNotes({ notes, onChange, open, onOpen }: Props) {
  function patch(id: string, p: Partial<ProductNote>) {
    onChange(notes.map((n) => (n.id === id ? { ...n, ...p } : n)))
  }

  return (
    <div className="ps-notes">
      {notes.map((n, i) => {
        const isOpen = open === n.id
        const chars = n.title.length + n.body.length
        return (
          <div className={`ps-note${isOpen ? ' open' : ''}`} key={n.id}>
            <div className="ps-note-hd">
              <button
                type="button"
                className="ps-note-tw"
                aria-expanded={isOpen}
                aria-label={`${isOpen ? 'Collapse' : 'Open'} ${n.title.trim() || `note ${i + 1}`}`}
                onClick={() => onOpen(isOpen ? null : n.id)}
              >
                <Icon name="chevron" size={15} rotate={isOpen ? 0 : -90} />
              </button>
              {isOpen ? (
                <input
                  className="ps-note-t"
                  type="text"
                  placeholder="Name it — Glossary, Roles, What's in each plan"
                  value={n.title}
                  maxLength={120}
                  autoFocus
                  aria-label="Note title"
                  onChange={(e) => patch(n.id, { title: e.target.value })}
                />
              ) : (
                <button type="button" className="ps-note-nm" onClick={() => onOpen(n.id)}>
                  {n.title.trim() || <i>Untitled note</i>}
                </button>
              )}
              <span className="ps-note-c">{chars}</span>
              <button
                type="button"
                className="ps-note-x"
                aria-label={`Delete ${n.title.trim() || `note ${i + 1}`}`}
                onClick={() => {
                  onChange(notes.filter((x) => x.id !== n.id))
                  if (open === n.id) onOpen(null)
                }}
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
            {isOpen && (
              <div className="ps-note-body">
                <textarea
                  className="ps-note-b"
                  placeholder="The facts a guide should get right."
                  value={n.body}
                  aria-label="Note body"
                  onChange={(e) => patch(n.id, { body: e.target.value })}
                />
              </div>
            )}
          </div>
        )
      })}
      <button
        type="button"
        className="ps-note-add"
        onClick={() => {
          const n = newNote()
          onChange([...notes, n])
          // Opens straight away: adding a note you then have to click to write in is one
          // click too many.
          onOpen(n.id)
        }}
      >
        <Icon name="plus" size={15} />
        Add note
      </button>
    </div>
  )
}
