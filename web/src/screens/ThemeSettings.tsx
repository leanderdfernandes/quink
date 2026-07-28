import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { removeBranding, uploadBranding } from '../lib/storage'
import { limitsFor } from '../lib/plans'
import {
  COLOR_PRESETS,
  DEFAULT_PRIMARY_COLOR,
  FONT_PAIRINGS,
  READER_DOMAIN,
  helpCenterUrl,
} from '../lib/config'
import { isValidHex, normalizeHex, themeVars } from '../reader/theme'
import { ReaderChrome } from '../reader/ReaderSite'
import PreviewFrame from '../components/PreviewFrame'
import { fetchReaderArticle, fetchReaderArticles, groupCategories } from '../reader/readerData'
import type {
  Article,
  FontPairing,
  HeaderStyle,
  KnowledgeBase as KB,
  ReaderCategory,
  ReaderKb,
} from '../lib/types'

// Theming (build spec §1). A LIVE split-preview: controls on the left, the REAL reader
// component on the right, repainting on every keystroke. Save is confirmation, not "go
// look". Primary colour is the ONLY colour stored; everything else derives from it.
//
// Groups are ordered by how much they change the page: Header first, because the treatment
// is the largest visual lever AND the fix for a brand colour that turned the band grey.

type Props = {
  kb: KB
  plan: string
  onBack: () => void
  onSaved: (kb: KB) => void
}

const HEADER_STYLES: { id: HeaderStyle; name: string }[] = [
  { id: 'solid', name: 'Solid' },
  { id: 'ink', name: 'Ink' },
  { id: 'tint', name: 'Tint' },
  { id: 'image', name: 'Image' },
]

// Logical viewport widths the preview renders AT — not the size it is displayed at. The
// frame is scaled to fit the pane, so "Desktop" shows the desktop layout even in a narrow
// pane instead of quietly collapsing to the tablet breakpoint.
const DESKTOP_W = 1280
const MOBILE_W = 390

// The header image has to survive being stretched across a 1600px+ band. Anything smaller
// is upscaled and looks it, so it is refused at the point of choosing rather than after the
// customer has published a blurry masthead.
const MIN_HEADER_WIDTH = 1600

// Stand-ins so the preview is never empty before anything is published. They are LABELLED
// wherever they appear — previously they rendered silently and stayed if the fetch came
// back empty, so a customer could not tell placeholder from their own content.
const SAMPLE_CATEGORIES: ReaderCategory[] = [
  {
    id: 'sample',
    name: 'Getting started',
    articles: [
      { id: 's1', slug: 'getting-started', title: 'Create your first collection', subtitle: 'Start a collection and add your first few items.', published_at: new Date().toISOString(), folder_id: 'sample', folder_name: 'Getting started', folder_position: 0 },
      { id: 's2', slug: 'invite-your-team', title: 'Invite your team', subtitle: 'Add teammates and set what each of them can do.', published_at: new Date().toISOString(), folder_id: 'sample', folder_name: 'Getting started', folder_position: 0 },
    ],
  },
  {
    id: 'sample2',
    name: 'Billing',
    articles: [
      { id: 's3', slug: 'update-payment', title: 'Update your payment method', subtitle: 'Change the card on file and download past invoices.', published_at: new Date().toISOString(), folder_id: 'sample2', folder_name: 'Billing', folder_position: 1 },
    ],
  },
]

const SAMPLE_ARTICLE: Article = {
  title: 'Create your first collection',
  subtitle: 'Start a collection and add your first few items.',
  steps: [
    { step_number: 1, heading: 'Open your library', body_text: '<p>Select <b>Library</b> in the sidebar. Everything your team has saved lives here.</p>', screenshot_url: null },
    { step_number: 2, heading: 'Make a collection', body_text: '<p>Choose <b>New collection</b>, give it a name, and press <b>Create</b>.</p>', screenshot_url: null },
  ],
}

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

function measure(file: File): Promise<{ w: number; h: number } | null> {
  const url = URL.createObjectURL(file)
  return new Promise((res) => {
    const i = new Image()
    i.onload = () => {
      res({ w: i.naturalWidth, h: i.naturalHeight })
      URL.revokeObjectURL(url)
    }
    i.onerror = () => {
      res(null)
      URL.revokeObjectURL(url)
    }
    i.src = url
  })
}

// Customer-supplied, rendered on a page we host. Default the scheme to https and refuse
// anything that isn't http(s) — the database has the same check (0026); this is the half
// that can give the person a reason.
export function normalizeLinkUrl(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`
  try {
    const u = new URL(withScheme)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.toString()
  } catch {
    return null
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
  const [headerStyle, setHeaderStyle] = useState<HeaderStyle>(kb.header_style ?? 'solid')
  const [headerImagePath, setHeaderImagePath] = useState(kb.header_image_path)
  const [linkLabel, setLinkLabel] = useState(kb.header_link_label ?? '')
  const [linkUrl, setLinkUrl] = useState(kb.header_link_url ?? '')
  const [linkError, setLinkError] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<null | 'logo' | 'header'>(null)

  const [previewView, setPreviewView] = useState<'home' | 'article'>('home')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [categories, setCategories] = useState<ReaderCategory[]>([])
  const [previewArticle, setPreviewArticle] = useState<Article | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(true)
  const [isSample, setIsSample] = useState(true)

  const headerInputRef = useRef<HTMLInputElement>(null)
  // Branding objects this session has replaced, deleted once the save commits. A ref, not
  // state: nothing renders from it and it must survive re-renders between upload and save.
  // ponytail: an upload abandoned without saving still leaks one object — the row never
  // referenced it, so sweeping those belongs with the storage reconciliation pass.
  const superseded = useRef<string[]>([])

  const touch = () => {
    setDirty(true)
    setSaved(false)
    setError(null)
  }

  // Real published content when there is any, sample when there isn't — and the difference
  // is always stated on screen.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const rows = await fetchReaderArticles(kb.id)
      if (cancelled) return
      if (rows.length) {
        setCategories(groupCategories(rows))
        setIsSample(false)
        const first = await fetchReaderArticle(kb.id, rows[0].slug)
        if (!cancelled && first) setPreviewArticle(first.content)
      } else {
        setCategories(SAMPLE_CATEGORIES)
        setIsSample(true)
        setPreviewArticle(SAMPLE_ARTICLE)
      }
      if (!cancelled) setLoadingPreview(false)
    })()
    return () => {
      cancelled = true
    }
  }, [kb.id])

  // Malformed hex must NOT blank the preview — keep the last valid colour (build spec §1).
  function onHex(v: string) {
    setHexInput(v)
    touch()
    if (isValidHex(v)) setColor(normalizeHex(v))
  }

  function pickPreset(c: string) {
    setColor(c)
    setHexInput(c)
    touch()
  }

  async function onLogo(file: File) {
    setUploading('logo')
    touch()
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
    const lp = await uploadBranding(kb.id, 'logo', file, ext)
    if (!lp) {
      setError('Logo didn’t upload. Check your connection and try again.')
      setUploading(null)
      return
    }
    if (logoPath) superseded.current.push(logoPath)
    setLogoPath(lp)
    const fav = await deriveFavicon(file)
    if (fav) {
      const fp = await uploadBranding(kb.id, 'favicon', fav, 'png')
      if (fp) {
        if (faviconPath) superseded.current.push(faviconPath)
        setFaviconPath(fp)
      }
    }
    setUploading(null)
  }

  // Same pipeline as the logo: same bucket, same {kb_id}/… convention, and a PATH is stored,
  // never a URL — a URL would eventually expire or move.
  async function onHeaderImage(file: File) {
    setUploading('header')
    touch()
    const dim = await measure(file)
    if (!dim) {
      setError('That file couldn’t be read as an image. Try a JPG or PNG.')
      setUploading(null)
      return
    }
    if (dim.w < MIN_HEADER_WIDTH) {
      setError(
        `That image is ${dim.w}px wide. Header images need to be at least ${MIN_HEADER_WIDTH}px or they blur when stretched.`,
      )
      setUploading(null)
      return
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const hp = await uploadBranding(kb.id, 'header', file, ext)
    if (!hp) {
      setError('Header image didn’t upload. Check your connection and try again.')
      setUploading(null)
      return
    }
    if (headerImagePath) superseded.current.push(headerImagePath)
    setHeaderImagePath(hp)
    setUploading(null)
  }

  // Selecting Image opens the file dialog straight away — the style is inert without one,
  // and making them find a second control to complete the choice is the friction §1 says to
  // remove. The tile falls through to the ink preview until an image exists.
  function pickHeaderStyle(id: HeaderStyle) {
    setHeaderStyle(id)
    touch()
    if (id === 'image' && !headerImagePath) headerInputRef.current?.click()
  }

  async function save() {
    const url = linkUrl.trim() ? normalizeLinkUrl(linkUrl) : null
    if (linkUrl.trim() && !url) {
      setLinkError('That doesn’t look like a web address. Use something like https://yoursite.com')
      return
    }
    setLinkError(null)
    setSaving(true)
    setError(null)
    const patch = {
      name: name.trim() || kb.name,
      about: about.trim(),
      headline: headline.trim(),
      search_placeholder: placeholder.trim(),
      primary_color: normalizeHex(color),
      font_pairing: font,
      logo_path: logoPath,
      favicon_path: faviconPath,
      header_style: headerStyle,
      header_image_path: headerImagePath,
      // A label with no URL is not a link; a URL with no label has nothing to click.
      header_link_label: url && linkLabel.trim() ? linkLabel.trim() : null,
      header_link_url: url && linkLabel.trim() ? url : null,
    }
    // Select the row back: renaming can move the help-center address (a DB trigger keeps the
    // subdomain following the name until the KB is published), so patching local state with
    // what we sent would leave the UI showing the old address until a reload.
    const { data, error: err } = await supabase
      .from('knowledge_bases')
      .update(patch)
      .eq('id', kb.id)
      .select()
      .single()
    setSaving(false)
    if (err) {
      // Previously guarded by `if (!error)` and rendered nothing at all — a failed save was
      // indistinguishable from a successful one.
      setError('Couldn’t save your changes. They’re still here — try again.')
      return
    }
    setSaved(true)
    setDirty(false)
    if (url) setLinkUrl(url)
    onSaved((data as KB | null) ?? ({ ...kb, ...patch } as KB))
    // Upload new -> update the row -> delete old. Only this order survives a failure
    // halfway: the worst case is an orphaned object, never a KB pointing at a missing one.
    const live = new Set([patch.logo_path, patch.favicon_path, patch.header_image_path])
    await removeBranding(superseded.current.filter((p) => !live.has(p)))
    superseded.current = []
  }

  // The exact object the reader RPC would return — so the preview is the real thing.
  const previewKb: ReaderKb = {
    id: kb.id,
    name: name.trim() || kb.name,
    about,
    headline,
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
    header_style: headerStyle,
    header_image_path: headerImagePath,
    header_link_label: linkLabel.trim() || null,
    header_link_url: normalizeLinkUrl(linkUrl),
    offline: false,
  }

  // Tiles are lit from the SAME tokens the band uses, so the swatch cannot promise a colour
  // the reader won't get — including the mark's ink, which is --on-brand and never #fff.
  const tileVars = themeVars(
    isValidHex(color) ? normalizeHex(color) : DEFAULT_PRIMARY_COLOR,
    font,
  )

  return (
    <div className="th">
      <header className="th-bar">
        <button className="ed-back" onClick={onBack}>
          ← Help center
        </button>
        <div className="ed-spacer" />
        <a
          className="ed-back"
          href={helpCenterUrl(kb.subdomain ?? '')}
          target="_blank"
          rel="noreferrer"
        >
          View live site ↗
        </a>
      </header>

      <div className="th-split">
        <div className="th-ctrl">
          <div className="th-scroll">
            <h2>Customize your help center</h2>
            <p className="th-lede">
              Every change shows in the preview. Nothing goes live until you save.
            </p>

            {/* ---- Header ---- */}
            <section className="th-grp">
              <p className="th-gt">Header</p>
              <div className="th-fld">
                <label id="hdr-style-label">Style</label>
                <div className="th-tiles" style={tileVars} role="group" aria-labelledby="hdr-style-label">
                  {HEADER_STYLES.map((s) => {
                    // Image with nothing uploaded deliberately falls through to ink at
                    // render (headerStyleOf), so the tile shows ink rather than a band that
                    // does not exist.
                    const shown = s.id === 'image' && !headerImagePath ? 'ink' : s.id
                    return (
                      <button
                        key={s.id}
                        className={`th-tile ${shown}`}
                        aria-pressed={headerStyle === s.id}
                        onClick={() => pickHeaderStyle(s.id)}
                      >
                        <span className="th-tile-sw" aria-hidden>
                          <i />
                          <u />
                        </span>
                        <span className="th-tile-nm">{s.name}</span>
                      </button>
                    )
                  })}
                </div>
                <p className="th-hint">
                  All four are built from your brand colour, so none of them can clash.
                </p>
              </div>

              <div className="th-fld">
                <label>Header image</label>
                {headerImagePath ? (
                  <div className="th-hasfile">
                    <span>Image added.</span>
                    <button className="linklike" onClick={() => headerInputRef.current?.click()}>
                      Replace
                    </button>
                    <button
                      className="linklike"
                      onClick={() => {
                        if (headerImagePath) superseded.current.push(headerImagePath)
                        setHeaderImagePath(null)
                        touch()
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="th-drop">
                    <p>JPG or PNG, at least {MIN_HEADER_WIDTH}px wide.</p>
                    <button disabled={uploading === 'header'} onClick={() => headerInputRef.current?.click()}>
                      {uploading === 'header' ? 'Uploading…' : 'Choose an image'}
                    </button>
                  </div>
                )}
                <input
                  ref={headerInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(e) => e.target.files?.[0] && onHeaderImage(e.target.files[0])}
                />
                {headerStyle === 'image' && !headerImagePath && (
                  <p className="th-hint th-warn">Upload an image to use this style.</p>
                )}
                <p className="th-hint">
                  We darken it behind your text so the heading stays readable.
                </p>
              </div>
            </section>

            {/* ---- Brand ---- */}
            <section className="th-grp">
              <p className="th-gt">Brand</p>
              <div className="th-fld">
                <label>Logo</label>
                {logoPath ? (
                  <div className="th-hasfile">
                    <span>Logo added.</span>
                    <label className="linklike th-filelabel">
                      Replace
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        hidden
                        onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])}
                      />
                    </label>
                    <button
                      className="linklike"
                      onClick={() => {
                        setLogoPath(null)
                        setFaviconPath(null)
                        touch()
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="th-drop">
                    <p>Square works best. Your favicon is made from it.</p>
                    <label className="th-filelabel-btn">
                      {uploading === 'logo' ? 'Uploading…' : 'Upload a logo'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        hidden
                        onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])}
                      />
                    </label>
                  </div>
                )}
              </div>

              <div className="th-fld">
                <label>Colour</label>
                <div className="th-dots">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      style={{ background: c }}
                      aria-pressed={normalizeHex(color) === c}
                      aria-label={`Use ${c}`}
                      onClick={() => pickPreset(c)}
                    />
                  ))}
                </div>
                <div className="th-hexrow">
                  <input
                    type="color"
                    className="th-chip"
                    value={isValidHex(color) ? normalizeHex(color) : DEFAULT_PRIMARY_COLOR}
                    onChange={(e) => pickPreset(e.target.value)}
                    aria-label="Colour picker"
                  />
                  <input
                    type="text"
                    className={!isValidHex(hexInput) ? 'invalid' : ''}
                    value={hexInput}
                    onChange={(e) => onHex(e.target.value)}
                    placeholder="#1F6E6B"
                    spellCheck={false}
                    aria-label="Brand colour hex"
                  />
                </div>
                {!isValidHex(hexInput) && (
                  <p className="th-hint th-warn">
                    Not a valid hex colour — the preview keeps the last good one.
                  </p>
                )}
              </div>

              <div className="th-fld">
                <label>Typeface</label>
                <div className="th-fonts">
                  {Object.entries(FONT_PAIRINGS).map(([key, p]) => (
                    <button
                      key={key}
                      className={`th-font${font === key ? ' on' : ''}`}
                      onClick={() => {
                        setFont(key as FontPairing)
                        touch()
                      }}
                    >
                      <span style={{ fontFamily: p.heading, fontSize: 16, fontWeight: 600 }}>
                        {p.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* ---- Content ---- */}
            <section className="th-grp">
              <p className="th-gt">Content</p>
              <div className="th-fld">
                <label>Help center name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    touch()
                  }}
                />
                {/* Show the address as it IS, never a prediction of what it will become —
                    the DB resolves collisions and freezes it once published. */}
                <p className="th-hint">
                  {kb.custom_domain && kb.domain_status === 'live' ? (
                    <>
                      Your help center is at <code>{kb.custom_domain}</code>.
                    </>
                  ) : (
                    <>
                      Your address is{' '}
                      <code>
                        {kb.subdomain}.{READER_DOMAIN}
                      </code>
                      . It follows this name until your first article is published, then it
                      stays put so links keep working.
                    </>
                  )}
                </p>
              </div>
              <div className="th-fld">
                <label>Headline</label>
                <input
                  type="text"
                  value={headline}
                  placeholder="How can we help?"
                  onChange={(e) => {
                    setHeadline(e.target.value)
                    touch()
                  }}
                />
              </div>
              <div className="th-fld">
                <label>Description</label>
                <input
                  type="text"
                  value={about}
                  placeholder="A line about your product, shown under the headline."
                  onChange={(e) => {
                    setAbout(e.target.value)
                    touch()
                  }}
                />
              </div>
              <div className="th-fld">
                <label>Search box text</label>
                <input
                  type="text"
                  value={placeholder}
                  placeholder="Search for articles…"
                  onChange={(e) => {
                    setPlaceholder(e.target.value)
                    touch()
                  }}
                />
              </div>
            </section>

            {/* ---- Links ---- */}
            <section className="th-grp">
              <p className="th-gt">Links</p>
              <div className="th-fld">
                <label>
                  Header link <span className="th-opt">optional</span>
                </label>
                <div className="th-pair">
                  <input
                    type="text"
                    value={linkLabel}
                    placeholder="Back to Acme"
                    aria-label="Header link label"
                    onChange={(e) => {
                      setLinkLabel(e.target.value)
                      touch()
                    }}
                  />
                  <input
                    type="text"
                    value={linkUrl}
                    placeholder="https://acme.com"
                    aria-label="Header link address"
                    inputMode="url"
                    onChange={(e) => {
                      setLinkUrl(e.target.value)
                      setLinkError(null)
                      touch()
                    }}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (!v) return
                      const u = normalizeLinkUrl(v)
                      if (u) setLinkUrl(u)
                      else
                        setLinkError(
                          'That doesn’t look like a web address. Use something like https://yoursite.com',
                        )
                    }}
                  />
                </div>
                {linkError && <p className="th-hint th-warn">{linkError}</p>}
                <p className="th-hint">
                  Sits opposite your logo. This is how most readers get back to your product.
                  Your logo always goes to your help center home.
                </p>
              </div>
            </section>
          </div>

          {/* Sticky, so Save is reachable from anywhere in a long control column — and so a
              failure has somewhere fixed to appear. */}
          <div className="th-savebar">
            <button className="th-save" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <span className={`th-savemsg${error ? ' bad' : ''}`}>
              {error ?? (saved ? 'Saved' : dirty ? 'Unsaved changes' : '')}
            </span>
          </div>
        </div>

        <div className="th-pane">
          <div className="th-panebar">
            <span className="th-panelbl">Preview</span>
            <div className="ed-seg" role="group" aria-label="Preview page">
              <button
                aria-pressed={previewView === 'home'}
                onClick={() => setPreviewView('home')}
              >
                Home
              </button>
              <button
                aria-pressed={previewView === 'article'}
                onClick={() => setPreviewView('article')}
              >
                Article
              </button>
            </div>
            <div className="ed-spacer" />
            <div className="ed-seg" role="group" aria-label="Preview device">
              <button aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}>
                Desktop
              </button>
              <button aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')}>
                Mobile
              </button>
            </div>
          </div>

          <div className="th-panebody">
            <div className={`th-frame${device === 'mobile' ? ' mob' : ''}`}>
              {loadingPreview ? (
                <div className="th-pvloading">Loading your help center…</div>
              ) : (
                <>
                  {isSample && (
                    <div className="th-sample">
                      Showing sample articles — you haven’t published anything yet.
                    </div>
                  )}
                  {/* An IFRAME, not a narrow div: media queries and vw resolve against a
                      viewport, so a constrained container gets desktop CSS at mobile width —
                      the reader's category rail survived into a 360px box and crushed the
                      rows into a 30px column. The frame has its own viewport, so the same
                      stylesheet answers correctly at both sizes. */}
                  <PreviewFrame
                    width={device === 'mobile' ? MOBILE_W : DESKTOP_W}
                    title="Help center preview"
                  >
                    <ReaderChrome
                      kb={previewKb}
                      view={previewView}
                      categories={categories}
                      article={previewView === 'article' ? previewArticle : null}
                      activeSlug={null}
                      articleUpdatedAt={new Date().toISOString()}
                      articleCategory={categories[0]?.name ?? null}
                    />
                  </PreviewFrame>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
