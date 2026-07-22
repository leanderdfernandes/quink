import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { publicBrandingUrl, publicFrameUrl } from '../lib/storage'
import Wordmark from '../components/Wordmark'
import { themeVars } from './theme'
import {
  fetchReaderArticle,
  fetchReaderArticles,
  fetchReaderKb,
  groupCategories,
  searchReader,
  type SearchHit,
} from './readerData'
import type { Article, ReaderArticleSummary, ReaderCategory, ReaderKb } from '../lib/types'

// The public help center (build spec §3). Modeled on a top-tier support site (Intercom-style):
// the search band is present on EVERY page (always prominent), category cards lead INTO a
// category, and the article page pairs the content with a scroll-synced on-this-page rail.
//
// ReaderChrome is PURE and shared: the live site renders it, AND the theming split-preview
// (ThemeSettings) renders the same component with in-memory data — they can't diverge.

const DEFAULT_HEADLINE = 'How can we help?'
const DEFAULT_PLACEHOLDER = 'Search for articles…'

export type ReaderSearchHit = SearchHit & { catName: string }

type ChromeProps = {
  kb: ReaderKb
  view: 'home' | 'category' | 'article'
  categories: ReaderCategory[]
  category?: ReaderCategory | null
  article?: Article | null
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

const FolderGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
  </svg>
)
const SearchGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
)
const ChevronGlyph = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6" />
  </svg>
)

function BrandFoot() {
  return (
    <footer className="rs2-foot">
      <span className="rs2-foot-by">Powered by</span>
      <Wordmark height={16} />
    </footer>
  )
}

export function ReaderChrome({
  kb,
  view,
  categories,
  category,
  article,
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
  const [feedback, setFeedback] = useState<null | 'up' | 'down'>(null)
  const [activeStep, setActiveStep] = useState<number | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const isFree = kb.plan === 'free'
  const initial = (kb.name.trim()[0] || 'Q').toUpperCase()
  const searching = !!query?.trim()

  useEffect(() => setFeedback(null), [activeSlug])

  // Dismiss the search dropdown on an outside click.
  useEffect(() => {
    if (!searching) return
    function onDoc(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) onQuery?.('')
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [searching, onQuery])

  // Scroll-spy: highlight the on-this-page item for the step currently in view.
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

  const Brand = () => (
    <a className="rs2-brand" {...homeProps}>
      {logo ? (
        <img className="rs2-logo-img" src={logo} alt="" />
      ) : (
        <span className="rs2-logo" style={{ background: 'var(--brand)' }}>
          {initial}
        </span>
      )}
      <span className="rs2-name">{kb.name}</span>
    </a>
  )

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

  const ArticleRow = ({ a }: { a: ReaderArticleSummary }) => (
    <Linkish to={hrefFor?.(a.slug)} onGo={() => onNavigate?.(a.slug)} className="rs2-arow">
      <div className="rs2-arow-main">
        <div className="rs2-arow-title">{a.title || 'Untitled'}</div>
        {a.subtitle && <div className="rs2-arow-sub">{a.subtitle}</div>}
      </div>
      <span className="rs2-arow-chev">
        <ChevronGlyph />
      </span>
    </Linkish>
  )

  // The search band — present on every page. Inline JSX (not a nested component) so the
  // input keeps focus across re-renders while typing.
  const band = (
    <div className={`rs2-band${view === 'home' ? ' is-home' : ''}`}>
      <header className="rs2-bandnav">
        <Brand />
      </header>
      <div className="rs2-bandinner">
        {view === 'home' && (
          <>
            <h1 className="rs2-hero-title">{kb.headline || DEFAULT_HEADLINE}</h1>
            {kb.about && <p className="rs2-hero-tag">{kb.about}</p>}
          </>
        )}
        <div className="rs2-searchwrap" ref={searchRef}>
          <div className="rs2-hero-search">
            <SearchGlyph />
            <input
              value={query ?? ''}
              onChange={(e) => onQuery?.(e.target.value)}
              placeholder={kb.search_placeholder || DEFAULT_PLACEHOLDER}
              aria-label="Search the help center"
            />
          </div>
          {searching && (
            <div className="rs2-search-dd">
              {(searchResults?.length ?? 0) > 0 ? (
                searchResults!.slice(0, 7).map((r) => (
                  <Linkish
                    key={r.id}
                    to={hrefFor?.(r.slug)}
                    onGo={() => onNavigate?.(r.slug)}
                    className="rs2-dd-item"
                  >
                    <span className="rs2-dd-title">{r.title}</span>
                    {r.catName && <span className="rs2-dd-cat">{r.catName}</span>}
                  </Linkish>
                ))
              ) : (
                <div className="rs2-dd-empty">No articles match “{query}”</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="rs2" style={themeVars(kb.primary_color, kb.font_pairing)}>
      {band}

      {view === 'article' && article ? (
        // ---------------- ARTICLE ----------------
        <>
          <div className="rs2-shell">
            <article className="rs2-article">
              <nav className="rs2-crumb" aria-label="Breadcrumb">
                <Linkish to={homeHref} onGo={() => onHome?.()} className="rs2-crumb-link">
                  Help Center
                </Linkish>
                {articleCategory && (
                  <>
                    <span className="rs2-crumb-sep">›</span>
                    <Linkish
                      to={articleCategoryId ? categoryHref?.(articleCategoryId) : undefined}
                      onGo={() => articleCategoryId && onNavigateCategory?.(articleCategoryId)}
                      className="rs2-crumb-link"
                    >
                      {articleCategory}
                    </Linkish>
                  </>
                )}
              </nav>

              <h1 className="rs2-art-title">{article.title || 'Untitled'}</h1>
              <div className="rs2-art-meta">
                <span>{updatedLabel(articleUpdatedAt)}</span>
                <span className="rs2-dot" />
                <span>{article.steps.length} steps</span>
                <span className="rs2-dot" />
                <span>{readTime(article)}</span>
              </div>
              {article.subtitle && <p className="rs2-art-intro">{article.subtitle}</p>}

              {article.steps.map((s) => {
                const shot = publicFrameUrl(s.screenshot_url)
                return (
                  <section className="rs2-step" id={`step-${s.step_number}`} key={s.step_number}>
                    <div className="rs2-step-head">
                      <span className="rs2-step-num">{s.step_number}</span>
                      <h2 className="rs2-step-heading">{s.heading || 'Untitled step'}</h2>
                    </div>
                    <div className="rs2-step-body" dangerouslySetInnerHTML={{ __html: s.body_text }} />
                    {shot && (
                      <div className="rs2-shot-wrap">
                        <img className="rs2-shot" src={shot} alt={`Step ${s.step_number}`} />
                      </div>
                    )}
                  </section>
                )
              })}

              <div className="rs2-feedback">
                {feedback === null ? (
                  <>
                    <div className="rs2-fb-q">Was this article helpful?</div>
                    <div className="rs2-fb-actions">
                      <button className="rs2-fb-btn" onClick={() => setFeedback('up')}>
                        <ThumbIcon /> Yes
                      </button>
                      <button className="rs2-fb-btn" onClick={() => setFeedback('down')}>
                        <ThumbIcon down /> No
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="rs2-fb-thanks">
                    <span className="rs2-fb-check">
                      <CheckIcon />
                    </span>
                    Thanks for your feedback!
                  </div>
                )}
              </div>

              {related && related.length > 0 && (
                <div className="rs2-related">
                  <h2 className="rs2-related-title">Related articles</h2>
                  <div className="rs2-related-list">
                    {related.map((a) => (
                      <ArticleRow key={a.id} a={a} />
                    ))}
                  </div>
                </div>
              )}
            </article>

            {article.steps.length > 1 && (
              <aside className="rs2-toc" aria-label="On this page">
                <div className="rs2-toc-label">On this page</div>
                <nav>
                  {article.steps.map((s) => (
                    <a
                      className={`rs2-toc-item${activeStep === s.step_number ? ' on' : ''}`}
                      href={`#step-${s.step_number}`}
                      key={s.step_number}
                    >
                      {s.heading || `Step ${s.step_number}`}
                    </a>
                  ))}
                </nav>
              </aside>
            )}
          </div>
          {isFree && <BrandFoot />}
        </>
      ) : view === 'category' && category ? (
        // ---------------- CATEGORY ----------------
        <>
          <div className="rs2-page">
            <nav className="rs2-crumb" aria-label="Breadcrumb">
              <Linkish to={homeHref} onGo={() => onHome?.()} className="rs2-crumb-link">
                Help Center
              </Linkish>
              <span className="rs2-crumb-sep">›</span>
              <span className="rs2-crumb-cur">{category.name}</span>
            </nav>
            <div className="rs2-cat-hero">
              <span className="rs2-cat-hero-icon">
                <FolderGlyph />
              </span>
              <div>
                <h1 className="rs2-cat-hero-title">{category.name}</h1>
                <div className="rs2-cat-hero-count">{countLabel(category.articles.length)}</div>
              </div>
            </div>
            <div className="rs2-arow-list">
              {category.articles.map((a) => (
                <ArticleRow key={a.id} a={a} />
              ))}
            </div>
          </div>
          {isFree && <BrandFoot />}
        </>
      ) : (
        // ---------------- HOME ----------------
        <>
          <main className="rs2-home">
            {categories.length === 0 ? (
              <p className="rs2-empty">No published articles yet.</p>
            ) : (
              <div className="rs2-cat-grid">
                {categories.map((c) => (
                  <Linkish
                    key={c.id}
                    to={categoryHref?.(c.id)}
                    onGo={() => onNavigateCategory?.(c.id)}
                    className="rs2-cat"
                  >
                    <span className="rs2-cat-icon">
                      <FolderGlyph />
                    </span>
                    <div className="rs2-cat-name">{c.name}</div>
                    <div className="rs2-cat-count">{countLabel(c.articles.length)}</div>
                  </Linkish>
                ))}
              </div>
            )}
          </main>
          {isFree && <BrandFoot />}
        </>
      )}
    </div>
  )
}

function ThumbIcon({ down = false }: { down?: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={down ? { transform: 'rotate(180deg)' } : undefined}>
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

// --- Live site: routing + fetch + search + SEO head ------------------------------------

export default function ReaderSite() {
  const { kbSlug = '', articleSlug, folderId } = useParams()
  const navigate = useNavigate()
  const [kb, setKb] = useState<ReaderKb | null>(null)
  const [categories, setCategories] = useState<ReaderCategory[]>([])
  const [article, setArticle] = useState<Article | null>(null)
  const [articleMeta, setArticleMeta] = useState<{
    updatedAt: string | null
    category: string | null
    categoryId: string | null
  }>({ updatedAt: null, category: null, categoryId: null })
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
      const found = await fetchReaderKb(kbSlug)
      if (cancelled) return
      if (!found) {
        setState('notfound')
        return
      }
      setKb(found)
      setCategories(groupCategories(await fetchReaderArticles(found.id)))
    })()
    return () => {
      cancelled = true
    }
  }, [kbSlug])

  useEffect(() => {
    if (!kb) return
    let cancelled = false
    ;(async () => {
      if (!articleSlug) {
        setArticle(null)
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

  useEffect(() => {
    if (!kb) return
    document.title = article?.title ? `${article.title} · ${kb.name}` : kb.name
    setMeta('robots', kb.plan === 'free' ? 'noindex' : 'index,follow')
    setMeta('description', article?.subtitle || kb.about || '')
    setFavicon(publicBrandingUrl(kb.favicon_path))
  }, [kb, article])

  if (state === 'loading') return <div className="page" />
  if (state === 'notfound' || !kb) return <ReaderNotFound />

  const category = view === 'category' ? categories.find((c) => c.id === folderId) ?? null : null
  const related =
    view === 'article' && articleMeta.categoryId
      ? (categories.find((c) => c.id === articleMeta.categoryId)?.articles ?? [])
          .filter((a) => a.slug !== articleSlug)
          .slice(0, 3)
      : []

  if (view === 'category' && !category && state === 'ready') return <ReaderNotFound />

  return (
    <ReaderChrome
      kb={kb}
      view={view}
      categories={categories}
      category={category}
      article={article}
      activeSlug={articleSlug ?? null}
      articleUpdatedAt={articleMeta.updatedAt}
      articleCategory={articleMeta.category}
      articleCategoryId={articleMeta.categoryId}
      related={related}
      hrefFor={(slug) => `/kb/${kbSlug}/${slug}`}
      categoryHref={(id) => `/kb/${kbSlug}/category/${id}`}
      homeHref={`/kb/${kbSlug}`}
      onNavigate={(slug) => navigate(`/kb/${kbSlug}/${slug}`)}
      onNavigateCategory={(id) => navigate(`/kb/${kbSlug}/category/${id}`)}
      onHome={() => navigate(`/kb/${kbSlug}`)}
      query={query}
      onQuery={setQuery}
      searchResults={hits}
    />
  )
}

function ReaderNotFound() {
  return (
    <div className="page" style={{ justifyContent: 'center' }}>
      <div className="card wall">
        <h2>Not found</h2>
        <p className="cap" style={{ marginTop: 8 }}>
          This help center or article doesn’t exist, or isn’t published.
        </p>
      </div>
    </div>
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

function setFavicon(href: string | null) {
  if (!href) return
  let el = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!el) {
    el = document.createElement('link')
    el.rel = 'icon'
    document.head.appendChild(el)
  }
  el.href = href
}
