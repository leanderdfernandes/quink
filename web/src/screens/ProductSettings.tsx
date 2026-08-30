import { useState } from 'react'
import { AUDIENCE_MAX, CONTEXT_BUDGET_WARN, CONTEXT_CHAR_BUDGET, contextCharsUsed } from '../lib/config'
import { TONE_DEFAULT, toneIndices, toneLabel } from '../lib/tone'
import { productContextOf, saveProductContext } from '../lib/kbs'
import { runMeter, type Entitlements } from '../lib/plans'
import ContextSummary from '../components/ContextSummary'
import ProductNotes from '../components/ProductNotes'
import ToneSliders from '../components/ToneSliders'
import Icon from '../components/Icon'
import type { KnowledgeBase as KB, ProductNote } from '../lib/types'

// Settings → Product & Context (PRD "Context & AI Editing" §4, as amended by migration 0048).
//
// TWO QUESTIONS UP FRONT, EVERYTHING ELSE BEHIND ONE DISCLOSURE. Five open boxes on arrival
// is a blank-page problem, and the people filling this in are support staff, not technical
// writers — they answer two and leave. So the card opens on what the product is and who it
// is for, and tone plus the notes list sit behind "Add more context", visibly optional and
// one click away.
//
// AUDIENCE AND TONE ARE BACK (0048). 0044 cut them on §4's reading that they "move voice,
// not accuracy". That is superseded: the complaint §4 recorded was that the fields did very
// little, and the fix is showing what they do — hence ToneSliders' live sample — rather than
// removing the controls. The worker never stopped reading either key, so nothing in the
// pipeline changed to bring them back.
//
// Deliberately NOT a second write path. Both this screen and the upload card go through
// saveProductContext(), which calls set_product_context(): `product_context` is not in the
// UPDATE grant, so the budget, the caps and the who/when stamp cannot be routed around by
// whichever screen was written second.

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

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

export default function ProductSettings({ kb, ent, onSaved, onUpgrade }: Props) {
  const initial = productContextOf(kb)
  const initialTone = toneIndices(initial.tone)
  const [name, setName] = useState(initial.name)
  // `description` is a first-class field again. It used to be folded into a note titled
  // "About the product" on read and written back as '' — a sensible move when notes were
  // the only mechanism, but the screen now leads with "What is this product?" and folding it
  // would put that answer somewhere the user did not type it. Notes written by the old fold
  // stay notes; nothing is migrated and nothing is lost.
  const [description, setDescription] = useState(initial.description)
  const [audience, setAudience] = useState(initial.audience)
  const [voice, setVoice] = useState(initialTone[0])
  const [detail, setDetail] = useState(initialTone[1])
  const [notes, setNotes] = useState<ProductNote[]>(initial.notes)
  // One note open at a time. A list where every card is expanded is a wall of textareas by
  // the third entry — you cannot see what you have, only what you are typing.
  const [openNote, setOpenNote] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const tone = toneLabel(voice, detail)

  // Summed exactly the way the RPC sums it, from the same helper, so the meter and the
  // refusal cannot disagree about what 100% means. Audience and tone are NOT in it — they
  // are structural and separately capped (0048), the same exemption `name` has always had.
  const used = contextCharsUsed(description, notes)
  const pct = Math.min(1, used / CONTEXT_CHAR_BUDGET)
  const over = used > CONTEXT_CHAR_BUDGET

  // What the disclosure's subline counts, so a collapsed section still says whether there is
  // anything inside it. Tone counts as "added" only when it has been moved off the default.
  const touchedTone = voice !== TONE_DEFAULT[0] || detail !== TONE_DEFAULT[1]
  const extras = (touchedTone ? 1 : 0) + (notes.length ? 1 : 0)

  const dirty =
    name.trim() !== initial.name ||
    description.trim() !== initial.description ||
    audience.trim() !== initial.audience ||
    tone !== (initial.tone || toneLabel(TONE_DEFAULT[0], TONE_DEFAULT[1])) ||
    JSON.stringify(notes.map((n) => [n.title, n.body])) !==
      JSON.stringify(initial.notes.map((n) => [n.title, n.body]))

  function touch<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v)
      setSaved(false)
    }
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
        notes: kept.map((n) => ({
          ...n,
          title: n.title.trim(),
          body: n.body.trim(),
        })),
        audience: audience.trim(),
        // Always written, even at the default, so a KB's stored tone says what its guides
        // will sound like rather than leaving the reader of the row to know the default.
        tone,
      })
      const next = productContextOf(updated)
      setNotes(next.notes)
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
  // The run count is a SUBLINE, not a rail row with a progress bar: a number the user has no
  // lever over should not compete with the things they use every day. Still findable, still
  // the proactive path into pricing for someone on a cap.
  const meter = ent ? runMeter(ent) : null

  return (
    <div className="settings-single">
      <h1>Product &amp; context</h1>
      <p className="dm-lede">
        What this help center documents. Every guide you build is written against it, so you
        only fill it in once.
      </p>

      <div className="domain-card">
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

        <div className="field">
          <label htmlFor="ps-what">What is this product?</label>
          <textarea
            id="ps-what"
            rows={6}
            value={description}
            onChange={(e) => touch(setDescription)(e.target.value)}
            placeholder="e.g. Memory is a shared bookmarking tool for teachers. You save links, group them into collections, and share a collection with a class as a single link.&#10;&#10;There is no mobile app yet — the site works on a phone browser. Free for one teacher and 200 links; School plan adds shared collections and SSO."
          />
          <p className="hint">
            Describe it the way you would to a new customer: what it does, the main features,
            what it deliberately does not do, and anything only some plans get. The more of
            this there is, the fewer things a guide has to guess.
          </p>
        </div>

        <div className="field">
          <label htmlFor="ps-who">Who is it for?</label>
          <input
            id="ps-who"
            type="text"
            value={audience}
            maxLength={AUDIENCE_MAX}
            onChange={(e) => touch(setAudience)(e.target.value)}
            placeholder="e.g. Teachers building reading lists for a class — not especially technical, usually in a hurry"
          />
          <p className="hint">
            Guides pitch themselves at this person — how much they already know, and what
            they came to do.
          </p>
        </div>

        {/* ONE disclosure, and it says what is inside before you open it. Everything here is
            optional and the subline is the proof: a section that only ever says "more
            settings" is a section nobody opens. */}
        <button type="button" className="ps-more" onClick={() => setMore(!more)}>
          <Icon name="chevron" size={17} rotate={more ? 0 : -90} />
          <b>Add more context</b>
          <span>
            {extras
              ? `${extras} of 2 added`
              : 'Tone of voice, and anything else worth knowing — both optional'}
          </span>
        </button>

        {more && (
          <div className="ps-more-body">
            <div className="ps-sect">
              <div className="up-sect-lbl">
                <b>Tone of voice</b>
                <span>{tone}</span>
              </div>
              <p className="hint" style={{ marginBottom: 14 }}>
                Move these and watch the sample rewrite itself. That is exactly how your
                guides will read.
              </p>
              <ToneSliders
                voice={voice}
                detail={detail}
                onChange={(v, d) => {
                  setVoice(v)
                  setDetail(d)
                  setSaved(false)
                }}
              />
            </div>

            {/* CONTEXT, as a list of named notes. Collapsed by default, one open at a time —
                by the third expanded note you are looking at a wall of textareas and cannot
                see what you already wrote. */}
            <div className="ps-sect">
              <div className="up-sect-lbl">
                <b>Anything else worth knowing</b>
                <span>{notes.length ? plural(notes.length, 'note') : 'no notes yet'}</span>
              </div>
              <p className="hint" style={{ marginBottom: 14 }}>
                What you call things, what you never say, what each plan includes, a feature
                that is about to change. All of it is used when a guide is written.
              </p>

              <ProductNotes
                notes={notes}
                onChange={(next) => {
                  setNotes(next)
                  setSaved(false)
                }}
                open={openNote}
                onOpen={setOpenNote}
              />

              {/* The budget, pinned under what it measures. Deleting a note frees it live,
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
            </div>
          </div>
        )}

        {/* The contract, stated on the screen that can break it. Changing context has never
            re-run an existing article, and saying so here is what stops someone editing this
            expecting their published guides to move. */}
        <p className="up-scope" style={{ marginTop: 18 }}>
          Changing this affects new recordings only — articles you have already built are
          untouched.
        </p>

        {error && (
          <p className="err" style={{ marginTop: 14 }}>
            {error}
          </p>
        )}

        {/* Usage. Small text under the thing it is about, not a nav row and not a number
            front-and-centre the user has no lever to act on. */}
        {/* Null on an uncapped plan, and then there is no line at all — a run count with
            no ceiling is a statistic the user has no lever over (lib/plans runMeter). */}
        {meter && (
          <p className="ps-usage">
            <button type="button" onClick={onUpgrade}>
              {meter.count} used
            </button>
            {meter.copy && <span className="ps-usage-note"> {meter.copy}</span>}
          </p>
        )}

        {/* STICKY, and only while there is something to save. The button used to sit at the
            bottom of a long page: you typed a note, saw nothing that looked like a save, and
            left. It follows the edit now and says what it is waiting for. */}
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
          <button className="btn" disabled={!name.trim() || !dirty || busy || over} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Where this ends up, shown rather than described. Someone filling in a form has no
          idea what it is for until they see the surface it feeds — and this one is the last
          screen before a run is spent, which is exactly where the answer matters. */}
      <div className="ps-tell">
        <p>
          This is used every time you build a guide. You can check it — and change it for that
          guide only — while your recording uploads.
        </p>
        <button type="button" className="btn btn-ghost" onClick={() => setPreview(true)}>
          Show me
        </button>
      </div>

      {preview && (
        <div className="pub-overlay" onClick={() => setPreview(false)} role="presentation">
          <div className="card ps-preview" onClick={(e) => e.stopPropagation()}>
            <h2>During upload, it looks like this</h2>
            <p className="cap">
              The same context, in one glance, at the moment it is about to be used.
            </p>
            {/* The real component, not a drawing of it (components/ContextSummary). A
                preview that can disagree with the thing it previews is worse than none. */}
            <ContextSummary
              product={{ name: name.trim(), description, notes, audience, tone }}
              action={<span className="ctxs-act">Change for this one</span>}
            />
            <p className="note">
              Changing it there changes that guide only. Changing it here changes every guide
              you build next.
            </p>
            <button className="btn" onClick={() => setPreview(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
