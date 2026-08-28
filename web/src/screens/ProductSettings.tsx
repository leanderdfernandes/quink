import { useState } from 'react'
import { CONTEXT_BUDGET_WARN, CONTEXT_CHAR_BUDGET, contextCharsUsed } from '../lib/config'
import { productContextOf, saveProductContext } from '../lib/kbs'
import { runMeter, type Entitlements } from '../lib/plans'
import Icon from '../components/Icon'
import type { KnowledgeBase as KB, ProductNote } from '../lib/types'

// Settings → Product & Context (PRD "Context & AI Editing" §4).
//
// The SAME fields the upload card asks for, plus the half it deliberately does not: notes.
// Context is a property of the WORKSPACE, not of an upload — the upload card asks once for
// the minimum a run needs, and this is the only honest place to change any of it later.
//
// Deliberately NOT a second write path. Both surfaces go through saveProductContext(),
// which calls set_product_context() (migration 0044). `product_context` is not in the
// UPDATE grant, so the budget and the who/when stamp cannot be routed around by whichever
// screen was written second.

type Props = {
  kb: KB
  ent: Entitlements | null
  onSaved: (kb: KB) => void
  onUpgrade: () => void
}

function updatedLine(kb: KB, at: string | null | undefined): string | null {
  if (!at) return null
  const when = new Date(at).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const who = kb.product_context_updated_by_name
  return who ? `Last updated ${when} by ${who}` : `Last updated ${when}`
}

// Client-side only, and never sent as the id of an existing note — the RPC mints its own
// for anything arriving without one. crypto.randomUUID is on every browser the SPA targets.
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

const newNote = (): ProductNote => ({ id: crypto.randomUUID(), title: '', body: '' })

// A description written before notes existed is shown AS a note rather than left in a field
// of its own. Two ways to say the same thing was the confusing part; this keeps the text,
// keeps it editable, and lets the next save move it into the shape everything else uses.
const LEGACY_NOTE_TITLE = 'About the product'

function foldDescription(c: ReturnType<typeof productContextOf>): ProductNote[] {
  if (!c.description.trim()) return c.notes
  return [{ id: 'legacy', title: LEGACY_NOTE_TITLE, body: c.description }, ...c.notes]
}

export default function ProductSettings({ kb, ent, onSaved, onUpgrade }: Props) {
  const initial = productContextOf(kb)
  const [name, setName] = useState(initial.name)
  const [notes, setNotes] = useState<ProductNote[]>(() => foldDescription(initial))
  // One note open at a time. A list where every card is expanded is a wall of textareas by
  // the third entry — you cannot see what you have, only what you are typing.
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Summed exactly the way the RPC sums it, from the same helper, so the meter and the
  // refusal cannot disagree about what 100% means.
  const used = contextCharsUsed('', notes)
  const pct = Math.min(1, used / CONTEXT_CHAR_BUDGET)
  const over = used > CONTEXT_CHAR_BUDGET

  const baseline = foldDescription(initial)
  const dirty =
    name.trim() !== initial.name ||
    JSON.stringify(notes.map((n) => [n.title, n.body])) !==
      JSON.stringify(baseline.map((n) => [n.title, n.body]))

  function touch<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v)
      setSaved(false)
    }
  }

  function patchNote(id: string, patch: Partial<ProductNote>) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)))
    setSaved(false)
  }

  async function save() {
    if (!name.trim() || busy || over) return
    setBusy(true)
    setError(null)
    try {
      // Empty notes are dropped rather than stored: someone who clicks "+ Add note" and
      // changes their mind should not leave a blank card behind for the pipeline to read.
      const kept = notes.filter((n) => n.title.trim() || n.body.trim())
      const updated = await saveProductContext(kb, {
        name: name.trim(),
        // Always empty from here on: notes are the one mechanism. A legacy description was
        // folded into a note above, so this write is what completes the move.
        description: '',
        notes: kept.map((n) => ({
          ...n,
          // The folded note has a placeholder id; the RPC mints a real one for it.
          id: n.id === 'legacy' ? '' : n.id,
          title: n.title.trim(),
          body: n.body.trim(),
        })),
      })
      setNotes(productContextOf(updated).notes)
      onSaved(updated)
      setSaved(true)
    } catch (e) {
      // The RPC refuses rather than truncates, so the only errors reachable here are a
      // budget the meter should have caught and a lost session. Say which.
      setError(e instanceof Error ? e.message : 'That did not save. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const stamp = updatedLine(kb, initial.updated_at)
  // The run count used to be a rail row with a progress bar, which put a number the user
  // has no lever over next to the things they use every day. It is a SUBLINE now: still
  // findable, still the proactive path into pricing for someone on a cap, no longer
  // competing with "make an article".
  const meter = ent ? runMeter(ent) : null

  return (
    <div className="settings-single">
        <h1>Product &amp; context</h1>
        <p className="dm-lede">
          What this help center documents. Every guide you build is written against it, so
          you only fill it in once.
        </p>

        <div className="domain-card">
          <div className="up-sect-lbl" style={{ marginBottom: 16 }}>
            <b>About your product</b>
            <span>saved for every guide</span>
          </div>

          <div className="field">
            <label htmlFor="ps-name">What product is this?</label>
            <input
              id="ps-name"
              type="text"
              placeholder="Name of the product / feature"
              value={name}
              maxLength={120}
              onChange={(e) => touch(setName)(e.target.value)}
              required
            />
            <p className="hint">Used so the guide calls things by their real names.</p>
          </div>

          {/* CONTEXT, as a list of named notes. There is no separate "anything else"
              textarea any more: it and the notes were two ways to say the same thing, which
              is what made this screen confusing. One mechanism, and each entry has a name
              you can scan.

              Collapsed by default, one open at a time. Expanded cards do not scale — by the
              third note you are looking at a wall of textareas and cannot see what you
              already wrote. */}
          <div className="ps-sect">
            <div className="up-sect-lbl">
              <b>What a guide should get right</b>
              <span>{notes.length ? plural(notes.length, 'note') : 'no notes yet'}</span>
            </div>
            <p className="hint" style={{ marginBottom: 14 }}>
              A glossary, a feature list, who can do what — anything the recording does not
              say out loud.
            </p>

            <div className="ps-notes">
              {notes.map((n, i) => {
                const isOpen = open === n.id
                const chars = n.title.length + n.body.length
                return (
                  <div className={`ps-note${isOpen ? ' open' : ''}`} key={n.id}>
                    <div className="ps-note-hd">
                      <button
                        type="button"
                        className="ps-note-toggle"
                        aria-expanded={isOpen}
                        onClick={() => setOpen(isOpen ? null : n.id)}
                      >
                        <Icon name="file" size={17} />
                        <span className="ps-note-nm">
                          {n.title.trim() || <i>Untitled note</i>}
                        </span>
                        <span className="ps-note-c">{chars}</span>
                        <Icon name="chevron" size={15} rotate={isOpen ? 180 : 0} />
                      </button>
                      <button
                        type="button"
                        className="ps-note-x"
                        aria-label={`Delete ${n.title.trim() || `note ${i + 1}`}`}
                        onClick={() => {
                          setNotes((prev) => prev.filter((x) => x.id !== n.id))
                          if (open === n.id) setOpen(null)
                          setSaved(false)
                        }}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                    {isOpen && (
                      <div className="ps-note-body">
                        <input
                          className="ps-note-t"
                          type="text"
                          placeholder="Name it — Glossary, Roles, What's in each plan"
                          value={n.title}
                          maxLength={120}
                          autoFocus
                          aria-label="Note title"
                          onChange={(e) => patchNote(n.id, { title: e.target.value })}
                        />
                        <textarea
                          className="ps-note-b"
                          placeholder="The facts a guide should get right."
                          value={n.body}
                          aria-label="Note body"
                          onChange={(e) => patchNote(n.id, { body: e.target.value })}
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
                  setNotes((prev) => [...prev, n])
                  // Opens straight away: adding a note you then have to click to write in
                  // is one click too many.
                  setOpen(n.id)
                  setSaved(false)
                }}
              >
                <Icon name="plus" size={15} />
                Add note
              </button>
            </div>
          </div>

          {/* The budget, pinned under the list it measures. Deleting a note frees it live,
              because `used` is derived from state rather than from what was last saved. */}
          <div className={`ps-budget${pct >= CONTEXT_BUDGET_WARN ? ' warn' : ''}`}>
            <div className="q-progress">
              <div className="q-progress-fill" style={{ width: `${(pct * 100).toFixed(1)}%` }} />
            </div>
            <p className="hint">
              {Math.round(pct * 100)}% of context used
              {over && ` — ${used - CONTEXT_CHAR_BUDGET} characters over`}
            </p>
          </div>

          {/* The contract, stated on the screen that can break it. Same sentence the
              upload card shows when it re-opens a known product — changing context has
              never re-run an existing article, and saying so here is what stops someone
              editing this expecting their published guides to move. */}
          <p className="up-scope" style={{ marginTop: 18 }}>
            Changing this affects new recordings only — articles you have already built are
            untouched.
          </p>

          {error && (
            <p className="err" style={{ marginTop: 14 }}>
              {error}
            </p>
          )}

          {/* Usage. Small text under the thing it is about, not a nav row and not a
              number front-and-centre that the user has no lever to act on. On a capped
              plan it stays the proactive path into pricing (pricing-spec §6) — someone
              reading how much is left is already asking what more costs. */}
          {meter && (
            <p className="ps-usage">
              {meter.cap === null ? (
                <span>{meter.count} used</span>
              ) : (
                <button type="button" onClick={onUpgrade}>
                  {meter.count} used
                </button>
              )}
              {meter.copy && <span className="ps-usage-note"> {meter.copy}</span>}
            </p>
          )}

          {/* STICKY, and only while there is something to save. The button used to sit at
              the bottom of a long page: you typed a note, saw nothing that looked like a
              save, and left. It follows the edit now and says what it is waiting for. */}
          <div className={`ps-savebar${dirty || busy ? ' show' : ''}`}>
            <span className="ps-savebar-l">
              {over ? (
                <b>Trim {used - CONTEXT_CHAR_BUDGET} characters to save</b>
              ) : dirty ? (
                'Unsaved changes'
              ) : saved ? (
                'Saved.'
              ) : (
                stamp
              )}
            </span>
            <button
              className="btn"
              disabled={!name.trim() || !dirty || busy || over}
              onClick={save}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
      </div>
    </div>
  )
}
