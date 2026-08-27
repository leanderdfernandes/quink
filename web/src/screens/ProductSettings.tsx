import { useState } from 'react'
import {
  AUDIENCE_OPTIONS,
  DEFAULT_AUDIENCE,
  DEFAULT_TONE,
  PRODUCT_DESCRIPTION_MAX,
  TONE_OPTIONS,
} from '../lib/config'
import { saveProductContext } from '../lib/kbs'
import type { KnowledgeBase as KB } from '../lib/types'

// Settings → Product (PRD "Context & AI Editing" §4).
//
// The SAME two fields the upload card asks for, on a screen that can be reached at any
// time. It exists because context is a property of the WORKSPACE, not of an upload: the
// upload card asks once, and after that the only honest place to change it is here.
//
// Deliberately NOT a second write path. Both surfaces go through saveProductContext(),
// which calls set_product_context() (migration 0040) — the four columns are no longer
// client-writable, so the 600-char cap and the who/when stamp cannot be routed around by
// whichever screen was written second.

type Props = {
  kb: KB
  onBack: () => void
  onSaved: (kb: KB) => void
}

function updatedLine(kb: KB): string | null {
  if (!kb.product_context_updated_at) return null
  const when = new Date(kb.product_context_updated_at).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const who = kb.product_context_updated_by_name
  return who ? `Last updated ${when} by ${who}` : `Last updated ${when}`
}

export default function ProductSettings({ kb, onBack, onSaved }: Props) {
  const [name, setName] = useState(kb.product_name ?? '')
  const [description, setDescription] = useState(kb.product_description ?? '')
  const [audience, setAudience] = useState(kb.audience || DEFAULT_AUDIENCE)
  const [tone, setTone] = useState(kb.tone || DEFAULT_TONE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const dirty =
    name.trim() !== (kb.product_name ?? '') ||
    description.trim() !== (kb.product_description ?? '') ||
    audience !== (kb.audience || DEFAULT_AUDIENCE) ||
    tone !== (kb.tone || DEFAULT_TONE)

  async function save() {
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const updated = await saveProductContext(kb, {
        product_name: name.trim(),
        description: description.trim(),
        audience,
        tone,
      })
      onSaved(updated)
      setSaved(true)
    } catch (e) {
      // The RPC refuses rather than truncates, so the only errors reachable here are a
      // length the field should have prevented and a lost session. Say which.
      setError(e instanceof Error ? e.message : 'That did not save. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const stamp = updatedLine(kb)

  return (
    <div className="settings">
      <header className="settings-top">
        <button
          className="btn btn-ghost"
          style={{ padding: '6px 12px', fontSize: 13 }}
          onClick={onBack}
        >
          ← Help center
        </button>
      </header>

      <div className="settings-single">
        <h1>Product details</h1>
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
              onChange={(e) => {
                setName(e.target.value)
                setSaved(false)
              }}
              required
            />
            <p className="hint">Used so the guide calls things by their real names.</p>
          </div>

          <div className="up-row" style={{ marginTop: 18 }}>
            <div className="field">
              <label htmlFor="ps-audience">
                Who reads it? <span className="optional">Optional</span>
              </label>
              <select
                id="ps-audience"
                value={audience}
                onChange={(e) => {
                  setAudience(e.target.value)
                  setSaved(false)
                }}
              >
                {AUDIENCE_OPTIONS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ps-tone">
                Tone <span className="optional">Optional</span>
              </label>
              <select
                id="ps-tone"
                value={tone}
                onChange={(e) => {
                  setTone(e.target.value)
                  setSaved(false)
                }}
              >
                {TONE_OPTIONS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field" style={{ marginTop: 18 }}>
            <label htmlFor="ps-desc">
              Anything else we should know? <span className="optional">Optional</span>
            </label>
            <textarea
              id="ps-desc"
              placeholder="What this workflow is for, terms we should use, anything the recording does not say out loud."
              value={description}
              maxLength={PRODUCT_DESCRIPTION_MAX}
              onChange={(e) => {
                setDescription(e.target.value)
                setSaved(false)
              }}
            />
            <p className="hint">
              {PRODUCT_DESCRIPTION_MAX - description.length} characters left.
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

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginTop: 20,
              flexWrap: 'wrap',
            }}
          >
            <button className="btn" disabled={!name.trim() || !dirty || busy} onClick={save}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            {saved && !dirty && <span className="hint">Saved.</span>}
            {stamp && (
              <span className="hint" style={{ marginLeft: 'auto' }}>
                {stamp}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
