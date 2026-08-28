import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { publicBrandingUrl, removeBranding, uploadBranding } from '../lib/storage'
import type { Entitlements } from '../lib/plans'
import {
  DEFAULT_PRIMARY_COLOR,
  FONT_PAIRINGS,
  READER_DOMAIN,
  helpCenterUrl,
} from '../lib/config'
import { extractLogoColors, pickableColors } from '../lib/palette'
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
  // The OWNER's limits and flags for this KB (kb_entitlements). Replaces the plan id
  // the preview used to derive watermark/noindex from — which was only correct for
  // the owner.
  ent: Entitlements | null
  onBack: () => void
  onSaved: (kb: KB) => void
}

const HEADER_STYLES: { id: HeaderStyle; name: string }[] = [
  { id: 'solid', name: 'Solid' },
  { id: 'ink', name: 'Ink' },
  { id: 'image', name: 'Image' },
]

// Logical viewport widths the preview renders AT — not the size it is displayed at. The
// frame is scaled to fit the pane, so "Desktop" shows the desktop layout even in a narrow
// pane instead of quietly collapsing to the tablet breakpoint.
const DESKTOP_W = 1280
const MOBILE_W = 390

// The band is ~1600px at its widest, so this is the working width. Nothing is REFUSED for
// being smaller — a rejection at the point of choosing is the worst moment to be told no,
// and a slightly soft band beats no band. Anything larger is scaled down and re-encoded
// here, which is also what keeps a 6MB phone photo off the reader's first paint.
const HEADER_MAX_WIDTH = 1600

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
    { step_number: 1, heading: 'Open your library', body_text: '<p>Select <b>Library</b> in the sidebar. Everything your team has saved lives here.</p>', screenshot_url: null, annotations: [] },
    { step_number: 2, heading: 'Make a collection', body_text: '<p>Choose <b>New collection</b>, give it a name, and press <b>Create</b>.</p>', screenshot_url: null, annotations: [] },
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

// Take whatever they picked and make it usable: scale to the working width, re-encode to
// WebP. Deliberately NOT cropped to a fixed aspect here — the band renders at two different
// heights (hero and compact) and crops with object-fit: cover, so a crop baked in at upload
// would only fight it and could not be right for both.
async function normalizeHeader(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = rej
      i.src = url
    })
    if (!img.naturalWidth || !img.naturalHeight) return null
    const w = Math.min(img.naturalWidth, HEADER_MAX_WIDTH)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = Math.round((img.naturalHeight * w) / img.naturalWidth)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise((res) => canvas.toBlob((b) => res(b), 'image/webp', 0.85))
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
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

export default function ThemeSettings({ kb, ent, onBack, onSaved }: Props) {
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
  // Upload failures belong AT the control that failed, not in the save bar 600px below it,
  // where a rejected file read as a save status and was missed entirely.
  const [logoError, setLogoError] = useState<string | null>(null)
  const [headerError, setHeaderError] = useState<string | null>(null)
  // Colours pulled out of the uploaded logo. Empty means "nothing usable came back", and
  // the row is hidden outright — an empty "From your logo" row is a promise not kept.
  const [logoColors, setLogoColors] = useState<string[]>([])

  const [previewView, setPreviewView] = useState<'home' | 'article'>('home')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [categories, setCategories] = useState<ReaderCategory[]>([])
  const [previewArticle, setPreviewArticle] = useState<Article | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(true)
  const [isSample, setIsSample] = useState(true)

  const headerInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
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

  // Pull colours out of whatever logo is currently set. Runs for a logo that was already
  // saved as well as one uploaded a second ago; onLogo also runs it against the local File
  // so the row appears immediately instead of waiting on a CDN read that may be blocked.
  useEffect(() => {
    const url = publicBrandingUrl(logoPath)
    if (!url) {
      setLogoColors([])
      return
    }
    let cancelled = false
    extractLogoColors(url).then((c) => {
      if (!cancelled && c.length) setLogoColors(c)
    })
    return () => {
      cancelled = true
    }
  }, [logoPath])

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
    setLogoError(null)
    touch()
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
    const { path: lp, error: upErr } = await uploadBranding(kb.id, 'logo', file, ext)
    if (!lp) {
      setLogoError(`${file.name} didn’t upload. ${upErr ?? 'Try again.'}`)
      setUploading(null)
      return
    }
    if (logoPath) superseded.current.push(logoPath)
    setLogoPath(lp)
    // Read the colours off the local file: a blob URL is same-origin, so this can't be
    // blocked the way a read back off the CDN can.
    const blobUrl = URL.createObjectURL(file)
    extractLogoColors(blobUrl)
      .then((c) => c.length && setLogoColors(c))
      .finally(() => URL.revokeObjectURL(blobUrl))
    const fav = await deriveFavicon(file)
    if (fav) {
      const { path: fp } = await uploadBranding(kb.id, 'favicon', fav, 'png')
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
    setHeaderError(null)
    touch()
    const blob = await normalizeHeader(file)
    if (!blob) {
      setHeaderError(`${file.name} couldn’t be read as an image. Try a JPG or PNG.`)
      setUploading(null)
      return
    }
    const { path: hp, error: upErr } = await uploadBranding(kb.id, 'header', blob, 'webp')
    if (!hp) {
      setHeaderError(`${file.name} didn’t upload. ${upErr ?? 'Try again.'}`)
      setUploading(null)
      return
    }
    if (headerImagePath) superseded.current.push(headerImagePath)
    setHeaderImagePath(hp)
    setUploading(null)
  }

  // A file input keeps the last chosen file as its value, so picking the SAME file again
  // fires no change event at all. After a rejection that is the likeliest next action —
  // shrink nothing, re-pick, and watch the screen do nothing.
  function pickFile(e: React.ChangeEvent<HTMLInputElement>, run: (f: File) => void) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) run(f)
  }

  // Style and image are two decisions, and this used to run them together: selecting the
  // Image tile opened a file dialog on the spot. That gave the header image TWO upload
  // points — the tile, and the Header image field below it — for one asset and one column,
  // and a user who uploaded from the tile then found a filled-in field they had never
  // visited had no way to tell which control owned the picture.
  //
  // The tile now only picks the style. The field below it is the single upload point, and it
  // is the one that stays because it is where the result is reported.
  function pickHeaderStyle(id: HeaderStyle) {
    setHeaderStyle(id)
    touch()
  }

  // Drag-and-drop onto the same target as the button. Only the first file, and only an
  // image — a dropped PDF should say so at the control rather than fail after the upload.
  const [headerOver, setHeaderOver] = useState(false)
  function onHeaderDrop(e: React.DragEvent) {
    e.preventDefault()
    setHeaderOver(false)
    const f = e.dataTransfer.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) {
      setHeaderError(`${f.name} isn’t an image. Try a JPG or PNG.`)
      return
    }
    void onHeaderImage(f)
  }
  const headerDrag = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      setHeaderOver(true)
    },
    onDragLeave: () => setHeaderOver(false),
    onDrop: onHeaderDrop,
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
    // Both from kb_entitlements(), which computes them exactly as the reader does. A
    // member has no plan to derive them from, and guessing `free` put a watermark on the
    // preview of a paying customer's help center.
    noindex: !!ent?.noindex,
    watermark: !!ent?.watermark,
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

  // Generated from oklch(46% 0.15 h), not pasted hex — the equal lightness across the row
  // is the property that matters and a hand-written list can't hold it. Empty on a browser
  // with no oklch() support, where the hex field is still the way through.
  const pickable = pickableColors()

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
                  Each one is built from your brand colour, so none of them can clash.
                </p>
              </div>

              {/* The logo sits immediately ABOVE Colour, because the colour row's first
                  option is pulled out of it — "From your logo" offering swatches while the
                  upload button was a section further down read as an empty promise. */}
              <div className="th-fld">
                <label>Logo</label>
                {logoError ? (
                  <div className="th-drop bad">
                    <p className="th-droperr">
                      <AlertIcon />
                      {logoError}
                    </p>
                    <button
                      disabled={uploading === 'logo'}
                      onClick={() => logoInputRef.current?.click()}
                    >
                      Choose another file
                    </button>
                  </div>
                ) : logoPath ? (
                  // Someone uploading a logo is making a VISUAL decision, and "Logo added."
                  // is the one thing that cannot help them make it. The thumbnail is sized
                  // and cropped the way the reader's masthead will render it, on the band's
                  // own background, so what they are approving is what will ship.
                  <div className="th-hasfile">
                    <span className="th-logo-prev">
                      <img src={publicBrandingUrl(logoPath) ?? ''} alt="Your logo" />
                    </span>
                    <span className="th-logo-meta">
                      <b>Your logo</b>
                      <small>Shown at this size in your help center header</small>
                    </span>
                    <button className="linklike" onClick={() => logoInputRef.current?.click()}>
                      Replace
                    </button>
                    <button
                      className="linklike"
                      onClick={() => {
                        setLogoPath(null)
                        setFaviconPath(null)
                        setLogoColors([])
                        touch()
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="th-drop">
                    <p>Square works best. Your favicon is made from it.</p>
                    <button
                      disabled={uploading === 'logo'}
                      onClick={() => logoInputRef.current?.click()}
                    >
                      {uploading === 'logo' ? 'Uploading…' : 'Upload a logo'}
                    </button>
                  </div>
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  hidden
                  onChange={(e) => pickFile(e, onLogo)}
                />
              </div>

              {/* Colour sits under the tiles and the logo: it is what makes the tiles mean
                  anything. Two rows — what you already use, then a set to pick from. */}
              <div className="th-fld">
                <label id="colour-label">Colour</label>
                {logoColors.length > 0 && (
                  <>
                    <p className="th-swlabel">From your logo</p>
                    <div className="th-dots" role="group" aria-label="Colours from your logo">
                      {logoColors.map((c) => (
                        <button
                          key={c}
                          style={{ background: c }}
                          aria-pressed={normalizeHex(color) === c}
                          aria-label={`Use ${c}`}
                          onClick={() => pickPreset(c)}
                        />
                      ))}
                    </div>
                  </>
                )}
                {pickable.length > 0 && (
                  <>
                    {logoColors.length > 0 && <p className="th-swlabel">Or pick one</p>}
                    <div className="th-dots" role="group" aria-labelledby="colour-label">
                      {pickable.map((c) => (
                        <button
                          key={c}
                          style={{ background: c }}
                          aria-pressed={normalizeHex(color) === c}
                          aria-label={`Use ${c}`}
                          onClick={() => pickPreset(c)}
                        />
                      ))}
                    </div>
                  </>
                )}
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
                <label>Header image</label>
                {headerError ? (
                  <div className="th-drop bad">
                    <p className="th-droperr">
                      <AlertIcon />
                      {headerError}
                    </p>
                    <button
                      disabled={uploading === 'header'}
                      onClick={() => headerInputRef.current?.click()}
                    >
                      Choose another image
                    </button>
                  </div>
                ) : headerImagePath ? (
                  <div className={`th-hasfile${headerOver ? ' over' : ''}`} {...headerDrag}>
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
                  // The only place a header image is uploaded. Click or drop, same target.
                  <div className={`th-drop${headerOver ? ' over' : ''}`} {...headerDrag}>
                    <p>
                      Drop an image here, or choose one. {HEADER_MAX_WIDTH}×
                      {Math.round(HEADER_MAX_WIDTH / 4)} or wider works best — JPG or PNG.
                    </p>
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
                  onChange={(e) => pickFile(e, onHeaderImage)}
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

// The only icon on this screen. It marks a rejected file, so it earns its place — a
// decorative icon beside every label would not.
const AlertIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    aria-hidden
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.4v.1" />
  </svg>
)
