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
const newNote = (): ProductNote => ({ id: crypto.randomUUID(), title: '', body: '' })

export default function ProductSettings({ kb, ent, onSaved, onUpgrade }: Props) {
  const initial = productContextOf(kb)
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description)
  const [notes, setNotes] = useState<ProductNote[]>(initial.notes)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Summed exactly the way the RPC sums it, from the same helper, so the meter and the
  // refusal cannot disagree about what 100% means.
  const used = contextCharsUsed(description, notes)
  const pct = Math.min(1, used / CONTEXT_CHAR_BUDGET)
  const over = used > CONTEXT_CHAR_BUDGET

  const dirty =
    name.trim() !== initial.name ||
    description.trim() !== initial.description ||
    JSON.stringify(notes.map((n) => [n.title, n.body])) !==
      JSON.stringify(initial.notes.map((n) => [n.title, n.body]))

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
        description: description.trim(),
        notes: kept.map((n) => ({ ...n, title: n.title.trim(), body: n.body.trim() })),
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

          <div className="field" style={{ marginTop: 18 }}>
            <label htmlFor="ps-desc">
              Anything else we should know? <span className="optional">Optional</span>
            </label>
            <textarea
              id="ps-desc"
              placeholder="What this workflow is for, terms we should use, anything the recording does not say out loud."
              value={description}
              onChange={(e) => touch(setDescription)(e.target.value)}
            />
          </div>

          {/* Notes. Same purpose as the description, chunked — a glossary entry, a feature
              list, a roles breakdown — so unrelated facts are not forced into one
              paragraph. They share the description's budget rather than having their own. */}
          <div className="ps-notes">
            {notes.map((n, i) => (
              <div className="ps-note" key={n.id}>
                <input
                  className="ps-note-t"
                  type="text"
                  placeholder="Note title — e.g. Glossary, Roles, What's in each plan"
                  value={n.title}
                  maxLength={120}
                  aria-label={`Note ${i + 1} title`}
                  onChange={(e) => patchNote(n.id, { title: e.target.value })}
                />
                <textarea
                  className="ps-note-b"
                  placeholder="The facts a guide should get right."
                  value={n.body}
                  aria-label={`Note ${i + 1} body`}
                  onChange={(e) => patchNote(n.id, { body: e.target.value })}
                />
                <button
                  type="button"
                  className="ps-note-x"
                  aria-label={`Remove note ${i + 1}`}
                  onClick={() => {
                    setNotes((prev) => prev.filter((x) => x.id !== n.id))
                    setSaved(false)
                  }}
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="ps-note-add"
              onClick={() => {
                setNotes((prev) => [...prev, newNote()])
                setSaved(false)
              }}
            >
              <Icon name="plus" size={15} />
              Add note
            </button>
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

          <div className="ps-actions">
            <button
              className="btn"
              disabled={!name.trim() || !dirty || busy || over}
              onClick={save}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            {/* Never a bare disabled button: the sentence says when it opens. */}
            {over && <span className="hint">Trim {used - CONTEXT_CHAR_BUDGET} characters to save.</span>}
            {saved && !dirty && <span className="hint">Saved.</span>}
            {stamp && (
              <span className="hint" style={{ marginLeft: 'auto' }}>
                {stamp}
              </span>
            )}
          </div>
      </div>
    </div>
  )
}
