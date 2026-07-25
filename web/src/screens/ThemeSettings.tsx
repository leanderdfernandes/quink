import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { uploadBranding } from '../lib/storage'
import { limitsFor } from '../lib/plans'
import {
  COLOR_PRESETS,
  DEFAULT_PRIMARY_COLOR,
  FONT_PAIRINGS,
  READER_DOMAIN,
  helpCenterUrl,
} from '../lib/config'
import { isValidHex, normalizeHex } from '../reader/theme'
import { ReaderChrome } from '../reader/ReaderSite'
import { fetchReaderArticles, groupCategories } from '../reader/readerData'
import type {
  FontPairing,
  KnowledgeBase as KB,
  ReaderCategory,
  ReaderKb,
} from '../lib/types'

// Theming (build spec §1). A LIVE split-preview: controls on the left, the REAL reader
// component (ReaderChrome — the same one the public site renders) on the right, repainting
// on every keystroke. Save is confirmation, not "go look". Primary colour is the ONLY
// colour stored; hover/tint/active/rail all derive from it.

type Props = {
  kb: KB
  // The owner's plan — the split-preview has to show the watermark exactly as the live
  // reader will, and that is an owner-level entitlement.
  plan: string
  onBack: () => void
  onSaved: (kb: KB) => void
}

// Stand-in category so the preview is never empty before anything is published.
const SAMPLE_CATEGORIES: ReaderCategory[] = [
  {
    id: 'sample',
    name: 'Getting started',
    articles: [
      { id: 's1', slug: 'getting-started', title: 'Getting started', subtitle: 'A quick tour of the basics.', published_at: '', folder_id: 'sample', folder_name: 'Getting started', folder_position: 0 },
      { id: 's2', slug: 'next-steps', title: 'Next steps', subtitle: 'Go further once set up.', published_at: '', folder_id: 'sample', folder_name: 'Getting started', folder_position: 0 },
    ],
  },
]

// Contain a logo onto a 64×64 transparent canvas → favicon PNG (build spec §1: don't make
// them upload twice).
async function deriveFavicon(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = rej
      i.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const scale = Math.min(64 / img.width, 64 / img.height)
    const w = img.width * scale
    const h = img.height * scale
    ctx.drawImage(img, (64 - w) / 2, (64 - h) / 2, w, h)
    return await new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'))
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

export default function ThemeSettings({ kb, plan, onBack, onSaved }: Props) {
  const [name, setName] = useState(kb.name)
  const [about, setAbout] = useState(kb.about ?? '')
  const [headline, setHeadline] = useState(kb.headline ?? '')
  const [placeholder, setPlaceholder] = useState(kb.search_placeholder ?? '')
  const [color, setColor] = useState(kb.primary_color || DEFAULT_PRIMARY_COLOR)
  const [hexInput, setHexInput] = useState(kb.primary_color || DEFAULT_PRIMARY_COLOR)
  const [font, setFont] = useState<FontPairing>(kb.font_pairing)
  const [logoPath, setLogoPath] = useState(kb.logo_path)
  const [faviconPath, setFaviconPath] = useState(kb.favicon_path)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Real published articles grouped into categories for the preview, so it looks like the
  // actual site. Falls back to the sample until something is published.
  const [categories, setCategories] = useState<ReaderCategory[]>(SAMPLE_CATEGORIES)

  useEffect(() => {
    fetchReaderArticles(kb.id).then((rows) => {
      if (rows.length) setCategories(groupCategories(rows))
    })
  }, [kb.id])

  // Malformed hex must NOT blank the preview — keep the last valid colour (build spec §1).
  function onHex(v: string) {
    setHexInput(v)
    setSaved(false)
    if (isValidHex(v)) setColor(normalizeHex(v))
  }

  function pickPreset(c: string) {
    setColor(c)
    setHexInput(c)
    setSaved(false)
  }

  async function onLogo(file: File) {
    setUploading(true)
    setSaved(false)
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
    const lp = await uploadBranding(kb.id, 'logo', file, ext)
    if (lp) setLogoPath(lp)
    const fav = await deriveFavicon(file)
    if (fav) {
      const fp = await uploadBranding(kb.id, 'favicon', fav, 'png')
      if (fp) setFaviconPath(fp)
    }
    setUploading(false)
  }

  async function save() {
    setSaving(true)
    const patch = {
      name: name.trim() || kb.name,
      about: about.trim(),
      headline: headline.trim(),
      search_placeholder: placeholder.trim(),
      primary_color: normalizeHex(color),
      font_pairing: font,
      logo_path: logoPath,
      favicon_path: faviconPath,
    }
    // Select the row back: renaming can move the help-center address (a DB trigger keeps
    // the subdomain following the name until the KB is published), so patching local state
    // with what we sent would leave the UI showing the old address until a reload.
    const { data, error } = await supabase
      .from('knowledge_bases')
      .update(patch)
      .eq('id', kb.id)
      .select()
      .single()
    setSaving(false)
    if (!error) {
      setSaved(true)
      onSaved((data as KB | null) ?? { ...kb, ...patch })
    }
  }

  // The exact object the reader RPC would return — so the preview is the real thing.
  const previewKb: ReaderKb = {
    id: kb.id,
    name: name.trim() || kb.name,
    about: about,
    headline: headline,
    search_placeholder: placeholder,
    primary_color: isValidHex(color) ? normalizeHex(color) : DEFAULT_PRIMARY_COLOR,
    font_pairing: font,
    logo_path: logoPath,
    favicon_path: faviconPath,
    subdomain: kb.subdomain,
    custom_domain: kb.custom_domain,
    domain_status: kb.domain_status,
    noindex: limitsFor(plan).noindex,
    watermark: limitsFor(plan).watermark,
  }

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {saved && <span className="save-state saved">Saved</span>}
          <a
            className="settings-viewlive"
            href={helpCenterUrl(kb.subdomain ?? '')}
            target="_blank"
            rel="noreferrer"
          >
            View live site ↗
          </a>
          <button className="btn" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save theme'}
          </button>
        </div>
      </header>

      <div className="settings-split">
        <div className="settings-controls">
          <h2 style={{ marginBottom: 4 }}>Customize your help center</h2>
          <p className="cap" style={{ marginBottom: 24 }}>
            Every change appears instantly in the preview.
          </p>

          <p className="settings-group">Branding</p>

          <div className="field">
            <label>Logo</label>
            <div className="logo-row">
              <label className="btn btn-ghost logo-upload">
                {uploading ? 'Uploading…' : logoPath ? 'Replace logo' : 'Upload logo'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  hidden
                  onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])}
                />
              </label>
              {logoPath && (
                <button
                  className="linklike"
                  style={{ fontSize: 13 }}
                  onClick={() => {
                    setLogoPath(null)
                    setFaviconPath(null)
                    setSaved(false)
                  }}
                >
                  Remove
                </button>
              )}
            </div>
            <p className="hint">The favicon is made from your logo automatically.</p>
          </div>

          <div className="field">
            <label>Brand colour</label>
            <div className="preset-row">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  className={`swatch${normalizeHex(color) === c ? ' on' : ''}`}
                  style={{ background: c }}
                  onClick={() => pickPreset(c)}
                  aria-label={`Use ${c}`}
                  type="button"
                />
              ))}
            </div>
            <div className="hex-row">
              <input
                type="color"
                className="color-native"
                value={isValidHex(color) ? normalizeHex(color) : DEFAULT_PRIMARY_COLOR}
                onChange={(e) => pickPreset(e.target.value)}
                aria-label="Colour picker"
              />
              <input
                type="text"
                className={`hex-input${!isValidHex(hexInput) ? ' invalid' : ''}`}
                value={hexInput}
                onChange={(e) => onHex(e.target.value)}
                placeholder="#1F6E6B"
                spellCheck={false}
              />
            </div>
            {!isValidHex(hexInput) && (
              <p className="hint" style={{ color: 'var(--danger)' }}>
                Not a valid hex colour — the preview keeps the last good one.
              </p>
            )}
          </div>

          <p className="settings-group">Content</p>

          <div className="field">
            <label>Help center name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setSaved(false)
              }}
            />
            {/* Show the address as it IS, never a prediction of what it will become —
                the DB resolves collisions and freezes it once published, so a guess here
                would sometimes be wrong. It updates on save, which is the honest moment. */}
            <p className="cap">
              {kb.custom_domain && kb.domain_status === 'live' ? (
                <>
                  Your help center is at <code>{kb.custom_domain}</code>.
                </>
              ) : (
                <>
                  Your address: <code>{kb.subdomain}.{READER_DOMAIN}</code>. It follows this
                  name until you publish your first article, then it stays put so existing
                  links keep working.
                </>
              )}
            </p>
          </div>

          <div className="field">
            <label>Headline</label>
            <input
              type="text"
              value={headline}
              onChange={(e) => {
                setHeadline(e.target.value)
                setSaved(false)
              }}
              placeholder="How can we help?"
            />
          </div>

          <div className="field">
            <label>Description</label>
            <input
              type="text"
              value={about}
              onChange={(e) => {
                setAbout(e.target.value)
                setSaved(false)
              }}
              placeholder="A line about your product, shown under the headline."
            />
          </div>

          <div className="field">
            <label>Search placeholder</label>
            <input
              type="text"
              value={placeholder}
              onChange={(e) => {
                setPlaceholder(e.target.value)
                setSaved(false)
              }}
              placeholder="Search the help center…"
            />
          </div>

          <p className="settings-group">Typography</p>

          <div className="field">
            <div className="font-row">
              {Object.entries(FONT_PAIRINGS).map(([key, p]) => (
                <button
                  key={key}
                  className={`font-option${font === key ? ' on' : ''}`}
                  onClick={() => {
                    setFont(key as FontPairing)
                    setSaved(false)
                  }}
                  type="button"
                >
                  <span style={{ fontFamily: p.heading, fontSize: 17, fontWeight: 600 }}>
                    {p.label}
                  </span>
                  <span style={{ fontFamily: p.body, fontSize: 12, color: 'var(--muted)' }}>
                    Aa Bb Cc
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="settings-preview">
          <div className="preview-frame">
            {/* Preview the HOME page — the customer's first screen, and where the intro,
                logo and name land. Article rails are themed the same way on the live site. */}
            <ReaderChrome kb={previewKb} view="home" categories={categories} article={null} activeSlug={null} />
          </div>
          <p className="cap" style={{ marginTop: 10, textAlign: 'center' }}>
            This is your home page. Open any article to see the same theme on its steps.
          </p>
        </div>
      </div>
    </div>
  )
}
