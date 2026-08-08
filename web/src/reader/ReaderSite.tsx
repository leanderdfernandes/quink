import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import DOMPurify from 'dompurify'
import { useNavigate, useParams } from 'react-router-dom'
import AnnotatedImage from '../components/AnnotatedImage'
import { publicBrandingUrl, publicFrameUrl } from '../lib/storage'
import { DEFAULT_HEADER_STYLE, headerStyleOf, themeVars } from './theme'
import {
  fetchReaderArticle,
  fetchReaderArticles,
  fetchReaderKb,
  groupCategories,
  searchReader,
  submitFeedback,
  type SearchHit,
} from './readerData'
import type { Article, ReaderArticleSummary, ReaderCategory, ReaderKb } from '../lib/types'

// The public help center (build spec §3), rebuilt to reader-design-pass-v2.html.
//
// Three things carry the design. The BAND is one surface — masthead, headline and search
// together — so the customer's logo and name are the first thing on the page instead of
// chrome sitting above it; on an article it goes compact, keeping the brand present without
// repeating the hero. The LISTS are a sticky heading rail beside a capped row column, so a
// three-article category never stretches rows across 1600px. The ARTICLE is a two-column
// grid with a sticky filmstrip spine: in a step guide people navigate by what the screen
// looked like, not by heading wording, and Quink is the only help center whose articles are
// literally made of frames. The boldness is spent on the spine and nowhere else.
//
// ReaderChrome is PURE and shared: the live site renders it, AND the theming split-preview
// (ThemeSettings) renders the same component with in-memory data — they can't diverge.

const DEFAULT_HEADLINE = 'How can we help?'
const DEFAULT_PLACEHOLDER = 'Search for articles…'
const QUINK_URL = 'https://quink.online'

export type ReaderSearchHit = SearchHit & { catName: string }

type ChromeProps = {
  kb: ReaderKb
  view: 'home' | 'category' | 'article'
  categories: ReaderCategory[]
  category?: ReaderCategory | null
  article?: Article | null
  // The published article's row id, needed only to file feedback against it. Absent in the
  // theming split-preview, which renders the same component with in-memory data.
  articleId?: string | null
  activeSlug?: string | null
  articleUpdatedAt?: string | null
  articleCategory?: string | null
  articleCategoryId?: string | null
  related?: ReaderArticleSummary[]
  hrefFor?: (slug: string) => string
  categoryHref?: (id: string) => string
  homeHref?: string
  onNavigate?: (slug: string) => void
  onNavigateCategory?: (id: string) => void
  onHome?: () => void
  query?: string
  onQuery?: (q: string) => void
  searchResults?: ReaderSearchHit[]
}

function updatedLabel(iso?: string | null): string {
  if (!iso) return 'Recently updated'
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  const d = Math.floor(s / 86400)
  if (d < 1) return 'Updated today'
  if (d === 1) return 'Updated yesterday'
  if (d < 30) return `Updated ${d} days ago`
  return `Updated ${new Date(iso).toLocaleDateString()}`
}

function readTime(article: Article): string {
  const words = article.steps
    .map((s) => `${s.heading} ${s.body_text}`.replace(/<[^>]+>/g, ' '))
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length
  return `${Math.max(1, Math.round(words / 200))} min read`
}

const countLabel = (n: number) => `${n} ${n === 1 ? 'article' : 'articles'}`

/* --- aspect-aware figures -------------------------------------------------------------
   Portrait phone captures used to render inside a fixed box, which is where the dark
   letterbox bars came from. Now the frame takes the image's OWN aspect ratio, so there is
   no box left over to fill: portrait sits beside the prose, landscape stacks and breaks out
   wider than the text measure. Until an image reports its size we assume landscape, which
   is both the common case and the layout that reserves the most sensible space.

   TODO: persisting image width/height on the step at publish time would remove runtime
   detection entirely — the correct class would be known on first paint, and the portrait
   reflow below would disappear with it. */
type Ratio = 'portrait' | 'landscape' | 'square'

function ratioOf(w: number, h: number): Ratio {
  if (!w || !h) return 'landscape'
  const r = w / h
  return r < 0.8 ? 'portrait' : r > 1.2 ? 'landscape' : 'square'
}

/* --- search snippets ------------------------------------------------------------------
   reader_search returns ts_headline output. With no StartSel/StopSel set (migration 0006,
   re-declared in 0022) that means PLAIN TEXT wrapped in <b>…</b> around each match, over
   source text article_search_text() has already stripped tags from.

   It is still RPC output rendered on an anonymous page, so it never goes near
   dangerouslySetInnerHTML: we parse the <b> pairs ourselves and emit <mark> elements, strip
   anything else tag-shaped, and decode the handful of entities that survive the SQL-side
   tag strip (TipTap stores "&" as "&amp;", which would otherwise render literally). */
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  nbsp: ' ',
}

function plain(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m, e: string) => ENTITIES[e] ?? m)
}

export function snippetParts(snippet: string): { text: string; mark: boolean }[] {
  const parts: { text: string; mark: boolean }[] = []
  const re = /<b>([\s\S]*?)<\/b>/gi
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(snippet)) !== null) {
    if (m.index > last) parts.push({ text: snippet.slice(last, m.index), mark: false })
    parts.push({ text: m[1], mark: true })
    last = re.lastIndex
  }
  if (last < snippet.length) parts.push({ text: snippet.slice(last), mark: false })
  return parts.map((p) => ({ ...p, text: plain(p.text) })).filter((p) => p.text)
}

/* --- icons: three, all functional (search, and the two state glyphs) ------------------ */
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}
const SearchGlyph = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
)
const PageGlyph = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" {...stroke} aria-hidden>
    <path d="M5 4h14v16H5z" />
    <path d="M9 9h6M9 13h6" />
  </svg>
)
const PauseGlyph = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" {...stroke} aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.5M12 16.2v.1" />
  </svg>
)

/* --- the one row component: home sections, category listing, related ------------------ */
function ArticleRow({
  a,
  href,
  onGo,
}: {
  a: ReaderArticleSummary
  href?: string
  onGo?: () => void
}) {
  const inner = (
    <>
      <span className="rs-row-t">{a.title || 'Untitled'}</span>
      {a.subtitle && <span className="rs-row-d">{a.subtitle}</span>}
      <span className="rs-row-meta">{updatedLabel(a.published_at)}</span>
      <span className="rs-row-arw" aria-hidden>
        →
      </span>
    </>
  )
  return href ? (
    <a
      className="rs-row"
      href={href}
      onClick={(e) => {
        e.preventDefault()
        onGo?.()
      }}
    >
      {inner}
    </a>
  ) : (
    <span className="rs-row">{inner}</span>
  )
}

export function ReaderChrome({
  kb,
  view,
  categories,
  category,
  article,
  articleId,
  activeSlug,
  articleUpdatedAt,
  articleCategory,
  articleCategoryId,
  related,
  hrefFor,
  categoryHref,
  homeHref,
  onNavigate,
  onNavigateCategory,
  onHome,
  query,
  onQuery,
  searchResults,
}: ChromeProps) {
  const logo = publicBrandingUrl(kb.logo_path)
  const [feedback, setFeedback] = useState<null | 'down' | 'sent'>(null)
  const [missing, setMissing] = useState('')
  const [sending, setSending] = useState(false)
  const [activeStep, setActiveStep] = useState<number | null>(null)
  // step_number -> measured aspect class. Unknown = landscape (see ratioOf).
  const [ratios, setRatios] = useState<Record<number, Ratio>>({})
  const searchRef = useRef<HTMLDivElement>(null)
  const missingRef = useRef<HTMLInputElement>(null)
  const watermark = kb.watermark
  const initial = (kb.name.trim()[0] || 'Q').toUpperCase()
  const searching = !!query?.trim()

  // One answer per article per session. This is the honest-user half of the rate limit: the
  // server cap is per-ARTICLE and global, because nothing identifying is stored and so it
  // cannot tell two readers apart. Read purely here and written only on an explicit click —
  // consuming a flag in a mount effect is how StrictMode's throwaway first mount eats it
  // (CLAUDE.md §10d).
  const answeredKey = articleId ? `quink.fb.${articleId}` : null
  const answered = () => {
    try {
      return !!(answeredKey && sessionStorage.getItem(answeredKey))
    } catch {
      return false
    }
  }

  useEffect(() => {
    setFeedback(answered() ? 'sent' : null)
    setMissing('')
    setRatios({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlug, answeredKey])

  async function sendFeedback(helpful: boolean, note?: string) {
    if (sending) return
    setSending(true)
    // Fire and acknowledge. A refusal (unknown article, or over the flood cap) looks
    // identical to the reader on purpose — reporting the limit is telling them where it is.
    if (articleId) await submitFeedback(articleId, helpful, note)
    try {
      if (answeredKey) sessionStorage.setItem(answeredKey, '1')
    } catch {
      /* private mode: the server cap is still in force */
    }
    setSending(false)
    setFeedback('sent')
  }

  // Dismiss the search dropdown on an outside click.
  useEffect(() => {
    if (!searching) return
    function onDoc(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) onQuery?.('')
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [searching, onQuery])

  // Scroll-spy: the same observer and the same rootMargin as before. It now drives
  // aria-current on the spine entries instead of a text-only list.
  useEffect(() => {
    if (view !== 'article' || !article) return
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (vis[0]) setActiveStep(Number(vis[0].target.id.replace('step-', '')))
      },
      { rootMargin: '-12% 0px -70% 0px', threshold: 0 },
    )
    article.steps.forEach((s) => {
      const el = document.getElementById(`step-${s.step_number}`)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [view, article])

  const homeProps = homeHref
    ? {
        href: homeHref,
        onClick: (e: ReactMouseEvent) => {
          e.preventDefault()
          onHome?.()
        },
      }
    : {}

  const Linkish = ({
    to,
    onGo,
    className,
    children,
  }: {
    to?: string
    onGo?: () => void
    className: string
    children: ReactNode
  }) =>
    to ? (
      <a
        className={className}
        href={to}
        onClick={(e) => {
          e.preventDefault()
          onGo?.()
        }}
      >
        {children}
      </a>
    ) : (
      <span className={className}>{children}</span>
    )

  // The search field, rendered inline (not as a nested component) so the input keeps focus
  // across re-renders while typing. It sits ON the band and inherits the band's ink; the
  // results panel always drops onto paper, never onto the brand fill.
  const searchField = (big: boolean) => (
    <div className="rs-srch" ref={searchRef}>
      <span className="rs-srch-mag">
        <SearchGlyph size={big ? 17 : 15} />
      </span>
      <input
        value={query ?? ''}
        onChange={(e) => onQuery?.(e.target.value)}
        placeholder={kb.search_placeholder || DEFAULT_PLACEHOLDER}
        aria-label="Search the help center"
        type="search"
      />
      {searching && (
        <div className="rs-drop">
          {(searchResults?.length ?? 0) > 0 ? (
            <>
              <p className="rs-drop-cap">
                {countLabel(Math.min(searchResults!.length, 7))}
              </p>
              {searchResults!.slice(0, 7).map((r) => (
                <Linkish
                  key={r.id}
                  to={hrefFor?.(r.slug)}
                  onGo={() => onNavigate?.(r.slug)}
                  className="rs-drop-item"
                >
                  <span className="rs-drop-t">{r.title}</span>
                  {r.snippet && (
                    <span className="rs-drop-s">
                      {snippetParts(r.snippet).map((p, i) =>
                        p.mark ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>,
                      )}
                    </span>
                  )}
                  {r.catName && <span className="rs-drop-cat">{r.catName}</span>}
                </Linkish>
              ))}
            </>
          ) : (
            <div className="rs-drop-empty">No articles match “{query}”</div>
          )}
        </div>
      )}
    </div>
  )

  // Masthead. The logo and name ARE the identity, sized like it — 46px mark, 25px name,
  // inside the band rather than in a strip above it.
  const mast = (
    <a className="rs-mast" {...homeProps}>
      {logo ? (
        <img className="rs-mast-img" src={logo} alt="" />
      ) : (
        <span className="rs-mast-glyph" aria-hidden>
          {initial}
        </span>
      )}
      <span className="rs-mast-nm">{kb.name}</span>
    </a>
  )

  // The customer photo behind the band, under a brand scrim that carries the legibility.
  // Decorative and aria-hidden: the masthead already names the help center, so a reader on
  // a screen reader loses nothing. Rendered as its own layer rather than a background on
  // .rs-band so the scrim can sit between it and the content.
  //
  // A real <img>, not a CSS background-image: a URL interpolated into url("…") has to be
  // escaped against quote/paren breakout, and an element sidesteps that question entirely
  // while getting object-fit and decoding hints for free.
  const headerImage = publicBrandingUrl(kb.header_image_path)
  const bandPhoto =
    kb.header_style === 'image' && headerImage ? (
      <div className="rs-band-photo" aria-hidden>
        <img src={headerImage} alt="" decoding="async" />
      </div>
    ) : null

  // The optional outbound link, opposite the masthead (migration 0026). Customer-supplied
  // and rendered on a page we host, so: rel="noopener" always, and the scheme is already
  // constrained to http/https by a database check — this is not the only line of defence.
  // The LOGO always goes to help-center home and is deliberately not configurable; a logo
  // that leaves the help center is how a reader loses the thing they came for.
  const bandLink =
    kb.header_link_url && kb.header_link_label ? (
      <a
        className="rs-band-link"
        href={kb.header_link_url}
        target="_blank"
        rel="noopener"
      >
        {kb.header_link_label} <span aria-hidden>↗</span>
      </a>
    ) : null

  // Compact band: masthead and search on one line. Used on every view except home, so the
  // brand is present everywhere without repeating the hero.
  const compactBand = (
    <header className="rs-band is-compact">
      {bandPhoto}
      <div className="rs-band-in">
        {mast}
        {searchField(false)}
        {bandLink}
      </div>
    </header>
  )

  const footer = (
    <footer className="rs-ft">
      <div className="rs-ft-in">
        <span>
          © {new Date().getFullYear()} {kb.name}
        </span>
        {/* The watermark gate is unchanged — only the Quink line is gated, so a paid help
            center still gets a footer rule and its own copyright. */}
        {watermark && (
          <a href={QUINK_URL} target="_blank" rel="noopener">
            Made with <b>Quink</b>
          </a>
        )}
      </div>
    </footer>
  )

  const shellProps = {
    className: 'rs2',
    'data-header': headerStyleOf(kb.header_style, kb.header_image_path),
    style: themeVars(kb.primary_color, kb.font_pairing),
  }

  /* ---------------- ARTICLE ---------------- */
  if (view === 'article' && article) {
    const steps = article.steps
    const showSpine = steps.length > 1
    return (
      <div {...shellProps}>
        {compactBand}
        <div className="rs-art-wrap">
          <div className={`rs-art-grid${showSpine ? '' : ' no-spine'}`}>
            {showSpine && (
              <nav className="rs-spine" aria-label="Steps in this article">
                <p className="rs-spine-cap">Steps</p>
                <ol>
                  {steps.map((s) => {
                    const thumb = publicFrameUrl(s.screenshot_url)
                    const wide = ratios[s.step_number] !== 'portrait'
                    const on = activeStep === s.step_number
                    return (
                      <li key={s.step_number}>
                        <a
                          href={`#step-${s.step_number}`}
                          aria-current={on ? 'true' : undefined}
                        >
                          <span className="rs-spine-idx">{s.step_number}</span>
                          <span className={`rs-spine-thumb${wide ? ' wide' : ''}`}>
                            {thumb ? (
                              // Same URL the step figure uses, so this is a cache hit, not
                              // a second fetch or a second storage call.
                              <img src={thumb} alt="" decoding="async" />
                            ) : (
                              <span className="rs-spine-blank" aria-hidden>
                                {s.step_number}
                              </span>
                            )}
                          </span>
                          <span className="rs-spine-lbl">
                            {s.heading || `Step ${s.step_number}`}
                          </span>
                        </a>
                      </li>
                    )
                  })}
                </ol>
              </nav>
            )}

            <article className="rs-art">
              <nav className="rs-crumb" aria-label="Breadcrumb">
                <Linkish to={homeHref} onGo={() => onHome?.()} className="rs-crumb-link">
                  Help center
                </Linkish>
                {articleCategory && (
                  <>
                    <span className="rs-crumb-sl" aria-hidden>
                      /
                    </span>
                    <Linkish
                      to={articleCategoryId ? categoryHref?.(articleCategoryId) : undefined}
                      onGo={() => articleCategoryId && onNavigateCategory?.(articleCategoryId)}
                      className="rs-crumb-link"
                    >
                      {articleCategory}
                    </Linkish>
                  </>
                )}
              </nav>

              <h1 className="rs-art-title">{article.title || 'Untitled'}</h1>
              {article.subtitle && <p className="rs-standfirst">{article.subtitle}</p>}
              <div className="rs-art-meta">
                <span>
                  {steps.length} {steps.length === 1 ? 'step' : 'steps'}
                </span>
                <span>{readTime(article)}</span>
                <span>{updatedLabel(articleUpdatedAt)}</span>
              </div>
              <div className="rs-art-rule" />

              {steps.map((s) => {
                const shot = publicFrameUrl(s.screenshot_url)
                const ratio = ratios[s.step_number]
                // No image at all is a first-class case, not a degraded one: the prose runs
                // to the full measure and nothing is reserved for a picture that isn't
                // coming. Unknown-but-present defaults to the stacked landscape treatment.
                const shape = !shot
                  ? 'is-textonly'
                  : ratio === 'portrait'
                    ? 'is-portrait'
                    : 'is-landscape'
                return (
                  <section
                    className={`rs-step ${shape}`}
                    id={`step-${s.step_number}`}
                    key={s.step_number}
                  >
                    <div className="rs-step-hd">
                      <span className="rs-step-num" aria-hidden>
                        {String(s.step_number).padStart(2, '0')}
                      </span>
                      <h2 className="rs-step-heading">{s.heading || 'Untitled step'}</h2>
                    </div>
                    <div className="rs-stack">
                      <div
                        className="rs-prose"
                        // body_text is authored/model-generated HTML rendered on the PUBLIC
                        // reader — sanitize so a stored <script>/onerror can't run in a
                        // reader's browser. DOMPurify strips scripts and event handlers,
                        // keeps normal rich text.
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(s.body_text) }}
                      />
                      {shot && (
                        <figure className="rs-fig">
                          {/* The SAME box the editor draws in (components/AnnotatedImage).
                              It shrink-wraps the image and puts the overlay on exactly that
                              rectangle, so a shape drawn in the editor lands in the same
                              place here. The old frame carried its own aspect-ratio and only
                              corrected it on load, which meant the overlay was stretched
                              against a 16:9 box for every recording that was not 16:9 —
                              circles came out elliptical and arrows pointed off-target. */}
                          <div className={`rs-frame${ratio === 'portrait' ? ' phone' : ''}`}>
                            <AnnotatedImage
                              src={shot}
                              alt={`Step ${s.step_number}`}
                              annotations={s.annotations}
                              onNatural={(n) => {
                                const next = ratioOf(n.w, n.h)
                                setRatios((r) =>
                                  r[s.step_number] === next
                                    ? r
                                    : { ...r, [s.step_number]: next },
                                )
                              }}
                            />
                          </div>
                        </figure>
                      )}
                    </div>
                  </section>
                )
              })}

              {/* Was this helpful — writes to article_feedback through the anon RPC
                  (migration 0025). Nothing identifying is sent or stored, so the copy can
                  say it goes to the team without saying who sent it. */}
              <div className="rs-fb">
                {feedback === null ? (
                  <>
                    <p className="rs-fb-q">Did this answer your question?</p>
                    <p className="rs-fb-why">
                      Your answer goes to the {kb.name} team. It’s anonymous.
                    </p>
                    <div className="rs-fb-btns">
                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => sendFeedback(true)}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => {
                          setFeedback('down')
                          setTimeout(() => missingRef.current?.focus(), 0)
                        }}
                      >
                        No
                      </button>
                    </div>
                  </>
                ) : feedback === 'down' ? (
                  <>
                    <p className="rs-fb-q">What was missing?</p>
                    <p className="rs-fb-why">
                      This goes to the {kb.name} team so they can fill the gap.
                    </p>
                    <div className="rs-fb-miss">
                      <input
                        ref={missingRef}
                        value={missing}
                        onChange={(e) => setMissing(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') sendFeedback(false, missing)
                        }}
                        placeholder="What were you looking for?"
                        aria-label="What were you looking for?"
                      />
                      {/* Enabled with an empty box on purpose: a reader with nothing to add
                          can still register the "No", which is the more useful number. */}
                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => sendFeedback(false, missing)}
                      >
                        {sending ? 'Sending…' : 'Send'}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="rs-fb-done">
                    <b>Thanks.</b> That helps the {kb.name} team know what to fix.
                  </p>
                )}
              </div>

              {related && related.length > 0 && (
                <div className="rs-rel">
                  <h2 className="rs-rel-cap">
                    {articleCategory ? `Next in ${articleCategory}` : 'Related articles'}
                  </h2>
                  <div className="rs-rows">
                    {related.map((a) => (
                      <ArticleRow
                        key={a.id}
                        a={a}
                        href={hrefFor?.(a.slug)}
                        onGo={() => onNavigate?.(a.slug)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </article>
          </div>
        </div>
        {footer}
      </div>
    )
  }

  /* ---------------- CATEGORY ---------------- */
  if (view === 'category' && category) {
    return (
      <div {...shellProps}>
        {compactBand}
        <div className="rs-shell">
          <div className="rs-page-hd">
            <nav className="rs-crumb" aria-label="Breadcrumb">
              <Linkish to={homeHref} onGo={() => onHome?.()} className="rs-crumb-link">
                Help center
              </Linkish>
              <span className="rs-crumb-sl" aria-hidden>
                /
              </span>
              <span className="rs-crumb-cur">{category.name}</span>
            </nav>
            <h1>{category.name}</h1>
            <span className="rs-cat-n">{countLabel(category.articles.length)}</span>
          </div>
          <div className="rs-rows">
            {category.articles.map((a) => (
              <ArticleRow
                key={a.id}
                a={a}
                href={hrefFor?.(a.slug)}
                onGo={() => onNavigate?.(a.slug)}
              />
            ))}
          </div>
        </div>
        {footer}
      </div>
    )
  }

  /* ---------------- HOME ---------------- */
  return (
    <div {...shellProps}>
      <header className="rs-band">
        {bandPhoto}
        <div className="rs-band-in">
          <div className="rs-mast-row">
            {mast}
            {bandLink}
          </div>
          <h1>{kb.headline || DEFAULT_HEADLINE}</h1>
          {kb.about && <p className="rs-band-sub">{kb.about}</p>}
          {searchField(true)}
        </div>
      </header>
      <div className="rs-shell">
        {categories.length === 0 ? (
          <ReaderEmpty kbName={kb.name} />
        ) : (
          categories.map((c) => (
            <section className="rs-cat" key={c.id}>
              {/* Sticky heading rail: the category name stays with its rows on a long list,
                  and the rows stop stretching the full width of a wide screen. */}
              <div className="rs-cat-hd">
                <h2>
                  <Linkish
                    to={categoryHref?.(c.id)}
                    onGo={() => onNavigateCategory?.(c.id)}
                    className="rs-cat-link"
                  >
                    {c.name}
                  </Linkish>
                </h2>
                <span className="rs-cat-n">{countLabel(c.articles.length)}</span>
              </div>
              <div className="rs-rows">
                {c.articles.map((a) => (
                  <ArticleRow
                    key={a.id}
                    a={a}
                    href={hrefFor?.(a.slug)}
                    onGo={() => onNavigate?.(a.slug)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
      {footer}
    </div>
  )
}

/* --- states ---------------------------------------------------------------------------
   Three separate screens. None of them apologise, and none of them tell a reader that
   something is broken when it isn't. */

function ReaderSkeleton() {
  // Static, no shimmer — the motion budget is hover, the spine active state and the search
  // dropdown, and a loading state is not worth spending it on.
  return (
    <div className="rs2 rs-skel-page" data-header={DEFAULT_HEADER_STYLE}>
      <div className="rs-shell" aria-hidden>
        <span className="rs-sk" style={{ width: '38%', height: 13, marginBottom: 18 }} />
        <span className="rs-sk" style={{ width: '74%', height: 28, marginBottom: 11 }} />
        <span className="rs-sk" style={{ width: '52%', height: 28, marginBottom: 24 }} />
        <span className="rs-sk" style={{ width: '100%', height: 11, marginBottom: 9 }} />
        <span className="rs-sk" style={{ width: '93%', height: 11, marginBottom: 9 }} />
        <span className="rs-sk" style={{ width: '66%', height: 11 }} />
      </div>
      <span className="rs-sr">Loading</span>
    </div>
  )
}

function ReaderNotFound({ homeHref }: { homeHref?: string }) {
  return (
    <div className="rs2 rs-state-page" data-header={DEFAULT_HEADER_STYLE}>
      <div className="rs-state">
        <span className="rs-state-icon">
          <SearchGlyph size={19} />
        </span>
        <h1>We couldn’t find that page</h1>
        <p>
          It may have been renamed or unpublished. Search for it, or start from the help
          center home.
        </p>
        {homeHref && (
          <a className="rs-state-btn" href={homeHref}>
            Go to help center
          </a>
        )}
      </div>
    </div>
  )
}

// A lapsed trial is not a 404. Until migration 0025 an offline help center and a typo in
// the URL both returned zero rows and both said "doesn't exist" — telling the customer's
// OWN readers that their site was gone. It says who paused it and points at them, because
// the reader's next move is to contact the customer, not us.
function ReaderOffline({ kbName }: { kbName: string }) {
  return (
    <div className="rs2 rs-state-page" data-header={DEFAULT_HEADER_STYLE}>
      <div className="rs-state">
        <span className="rs-state-icon">
          <PauseGlyph />
        </span>
        <h1>This help center is temporarily unavailable</h1>
        <p>
          {kbName} has paused it. Get in touch with them directly and they’ll be able to
          help.
        </p>
      </div>
    </div>
  )
}

function ReaderEmpty({ kbName }: { kbName: string }) {
  return (
    <div className="rs-state">
      <span className="rs-state-icon">
        <PageGlyph />
      </span>
      <h2>Nothing published yet</h2>
      <p>The {kbName} team is still writing. Check back soon, or contact them directly.</p>
    </div>
  )
}

// --- Live site: routing + fetch + search + SEO head ------------------------------------

export default function ReaderSite({ hostKey }: { hostKey?: string } = {}) {
  const { kbSlug = '', articleSlug, folderId } = useParams()
  const navigate = useNavigate()
  // On a help-center host the KB comes from the host and URLs are clean (base = '');
  // on the app host it comes from the /kb/{slug} path (base = '/kb/{slug}').
  const kbKey = hostKey ?? kbSlug
  const base = hostKey != null ? '' : `/kb/${kbSlug}`
  const [kb, setKb] = useState<ReaderKb | null>(null)
  const [categories, setCategories] = useState<ReaderCategory[]>([])
  const [article, setArticle] = useState<Article | null>(null)
  const [articleMeta, setArticleMeta] = useState<{
    id: string | null
    updatedAt: string | null
    category: string | null
    categoryId: string | null
  }>({ id: null, updatedAt: null, category: null, categoryId: null })
  const [state, setState] = useState<'loading' | 'ready' | 'notfound'>('loading')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ReaderSearchHit[]>([])

  const view: 'home' | 'category' | 'article' = articleSlug
    ? 'article'
    : folderId
      ? 'category'
      : 'home'

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const found = await fetchReaderKb(kbKey)
      if (cancelled) return
      if (!found) {
        setState('notfound')
        return
      }
      setKb(found)
      // Offline resolves now (0025) but has no content: the other three reader RPCs still
      // gate on offline_at, so skip them entirely rather than fetching three empty lists.
      if (found.offline) {
        setState('ready')
        return
      }
      setCategories(groupCategories(await fetchReaderArticles(found.id)))
    })()
    return () => {
      cancelled = true
    }
  }, [kbKey])

  useEffect(() => {
    if (!kb || kb.offline) return
    let cancelled = false
    ;(async () => {
      if (!articleSlug) {
        setArticle(null)
        setArticleMeta({ id: null, updatedAt: null, category: null, categoryId: null })
        setState('ready')
        return
      }
      const found = await fetchReaderArticle(kb.id, articleSlug)
      if (cancelled) return
      if (!found) {
        setState('notfound')
        return
      }
      setArticle(found.content)
      const cat = categories.find((c) => c.name === found.folder_name)
      setArticleMeta({
        id: found.id,
        updatedAt: found.published_at,
        category: found.folder_name,
        categoryId: cat?.id ?? null,
      })
      setState('ready')
    })()
    return () => {
      cancelled = true
    }
  }, [kb, articleSlug, categories])

  useEffect(() => {
    if (!kb || !query.trim()) {
      setHits([])
      return
    }
    const slugToCat = new Map<string, string>()
    for (const c of categories) for (const a of c.articles) slugToCat.set(a.slug, c.name)
    let cancelled = false
    const t = setTimeout(async () => {
      const r = await searchReader(kb.id, query)
      if (!cancelled) setHits(r.map((h) => ({ ...h, catName: slugToCat.get(h.slug) ?? '' })))
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [kb, query, categories])

  // Clear the query when the route changes (navigating from a result).
  useEffect(() => {
    setQuery('')
  }, [articleSlug, folderId])

  // Once a custom domain is live it becomes the canonical home. The free subdomain never
  // goes down (build spec §4) — old links, bookmarks and anything already indexed keep
  // working — so we move readers over instead of breaking them, and tell crawlers which of
  // the two addresses is the real one. `hostKey != null` scopes this to real reader hosts:
  // the /kb/{slug} dev path must never bounce you to a live customer domain.
  useEffect(() => {
    if (!kb || hostKey == null) return
    const canonicalHost =
      kb.domain_status === 'live' && kb.custom_domain ? kb.custom_domain : window.location.host
    if (canonicalHost !== window.location.host) {
      window.location.replace(
        `https://${canonicalHost}${window.location.pathname}${window.location.search}`,
      )
      return
    }
    setCanonical(`https://${canonicalHost}${window.location.pathname}`)
  }, [kb, hostKey, articleSlug, folderId])

  useEffect(() => {
    if (!kb) return
    document.title = article?.title ? `${article.title} · ${kb.name}` : kb.name
    setMeta('robots', kb.noindex ? 'noindex' : 'index,follow')
    setMeta('description', article?.subtitle || kb.about || '')
    setFavicon(publicBrandingUrl(kb.favicon_path))
  }, [kb, article])

  if (state === 'loading') return <ReaderSkeleton />
  if (state === 'notfound' || !kb) return <ReaderNotFound homeHref={base || '/'} />
  // Resolved, but paused. Checked before any view branch so every URL on an offline help
  // center — home, category, article — lands on the same honest screen rather than a 404.
  if (kb.offline) return <ReaderOffline kbName={kb.name} />
  const articleId = articleMeta.id

  const category = view === 'category' ? categories.find((c) => c.id === folderId) ?? null : null
  const related =
    view === 'article' && articleMeta.categoryId
      ? (categories.find((c) => c.id === articleMeta.categoryId)?.articles ?? [])
          .filter((a) => a.slug !== articleSlug)
          .slice(0, 3)
      : []

  if (view === 'category' && !category && state === 'ready')
    return <ReaderNotFound homeHref={base || '/'} />

  return (
    <ReaderChrome
      kb={kb}
      view={view}
      categories={categories}
      category={category}
      article={article}
      articleId={articleId}
      activeSlug={articleSlug ?? null}
      articleUpdatedAt={articleMeta.updatedAt}
      articleCategory={articleMeta.category}
      articleCategoryId={articleMeta.categoryId}
      related={related}
      hrefFor={(slug) => `${base}/${slug}`}
      categoryHref={(id) => `${base}/category/${id}`}
      homeHref={base || '/'}
      onNavigate={(slug) => navigate(`${base}/${slug}`)}
      onNavigateCategory={(id) => navigate(`${base}/category/${id}`)}
      onHome={() => navigate(base || '/')}
      query={query}
      onQuery={setQuery}
      searchResults={hits}
    />
  )
}

function setMeta(name: string, content: string) {
  let el = document.querySelector(`meta[name="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('name', name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setCanonical(href: string) {
  let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.rel = 'canonical'
    document.head.appendChild(el)
  }
  el.href = href
}

// The reader is an SPA, so index.html's static icons are what the browser has already
// committed to by the time a KB resolves. Replace them at runtime.
//
// index.html ships TWO icon links — favicon.ico and favicon.svg — and the old version
// rewrote the href of the FIRST one it found. Browsers prefer the SVG, so the customer's
// derived PNG was set on a link nothing was reading and the Quink mark stayed in the tab.
// Every icon link goes, then ours goes in: partially replacing a set of alternates is the
// bug, not a smaller version of the fix.
const QUINK_ICONS: [rel: string, href: string, type?: string][] = [
  ['icon', '/favicon.ico'],
  ['icon', '/favicon.svg', 'image/svg+xml'],
]

function setFavicon(href: string | null) {
  document
    .querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')
    .forEach((el) => el.remove())
  // A KB with no logo falls back to ours rather than to whatever happened to be in the head
  // — the null branch has to RESTORE, not return early, or navigating within the SPA leaves
  // the previous KB's mark in the tab.
  const icons: [string, string, string?][] = href
    ? [
        ['icon', href, 'image/png'],
        // Derived at 64×64 (ThemeSettings): small for a home-screen icon, but a customer's
        // own mark scaled up beats ours at the right size.
        ['apple-touch-icon', href],
      ]
    : QUINK_ICONS
  for (const [rel, h, type] of icons) {
    const el = document.createElement('link')
    el.rel = rel
    el.href = h
    if (type) el.setAttribute('type', type)
    document.head.appendChild(el)
  }
}
