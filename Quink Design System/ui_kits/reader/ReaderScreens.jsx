const { Micro, Button, IconButton, Icon, Card, Row, Group, Thumb, Notice, State } = window.QuinkDesignSystem_6ae0bd

// ---------------------------------------------------------------------------
// Home: the band, then categories as groups of rows. v1 used a 216px sticky heading rail
// beside each category; v2 drops it — the sticky column was solving a scanning problem that
// larger type and more space solve better, and it cost half the width on every list.
// ---------------------------------------------------------------------------
function ReaderHome({ onOpen, onCategory }) {
  return (
    <main style={{ maxWidth: 'var(--shell)', margin: '0 auto', padding: 'var(--s-16) var(--gutter) 0' }}>
      {CATEGORIES.map((c) => (
        <Group key={c.id} name={c.name} count={`${c.articles.length} articles`}
          actions={<Button variant="ghost" size="sm" iconAfter="chevron-right" onClick={() => onCategory(c)}>See all</Button>}
          style={{ marginBottom: 'var(--s-12)' }}>
          {c.articles.map((a) => (
            <Row key={a.id} onClick={() => onOpen(a)} title={a.title} desc={a.desc}
              meta={<Micro as="span" style={{ flex: 'none' }}>{a.steps} steps</Micro>} />
          ))}
        </Group>
      ))}
    </main>
  )
}

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------
function ReaderCategory({ category, onOpen, onHome }) {
  return (
    <main style={{ maxWidth: 'var(--shell)', margin: '0 auto', padding: 'var(--s-12) var(--gutter) 0' }}>
      <Crumbs items={[{ label: KB.name, onClick: onHome }, { label: category.name }]} />
      <h1 style={{ fontSize: 'var(--t-d3)', marginTop: 'var(--s-5)' }}>{category.name}</h1>
      <p className="q-lede" style={{ marginTop: 'var(--s-3)', marginBottom: 'var(--s-10)' }}>{category.desc}</p>
      <Card style={{ padding: 6, maxWidth: 860 }}>
        {category.articles.map((a) => (
          <Row key={a.id} onClick={() => onOpen(a)} title={a.title} desc={a.desc}
            meta={<Micro as="span" style={{ flex: 'none' }}>{a.steps} steps · {a.updated}</Micro>} />
        ))}
      </Card>
    </main>
  )
}

function Crumbs({ items }) {
  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
      {items.map((it, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ color: 'var(--ink-4)' }}><Icon name="chevron-right" size={14} /></span>}
          {it.onClick ? (
            <button onClick={it.onClick} style={{ fontSize: 13.5, color: 'var(--ink-3)' }}>{it.label}</button>
          ) : (
            <span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{it.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Article. The step spine, the serif title, the 68ch measure — and the step number motif
// carried over from the editor, so an author recognises their own article on the live site.
// ---------------------------------------------------------------------------
function ReaderArticle({ article, onHome, onCategory }) {
  const [active, setActive] = React.useState(1)
  const [vote, setVote] = React.useState(null)

  React.useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (vis) setActive(Number(vis.target.dataset.step))
      },
      { rootMargin: '-15% 0px -70% 0px' },
    )
    document.querySelectorAll('[data-step]').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [article.id])

  return (
    <main style={{ maxWidth: 'var(--shell)', margin: '0 auto', padding: 'var(--s-12) var(--gutter) 0' }}>
      <Crumbs items={[{ label: KB.name, onClick: onHome }, { label: article.category, onClick: onCategory }, { label: article.title }]} />

      <div style={{ display: 'grid', gridTemplateColumns: 'var(--rail-spine) minmax(0, 1fr)', gap: 'var(--s-16)', marginTop: 'var(--s-8)' }} className="rd-grid">
        {/* Spine */}
        <nav style={{ position: 'sticky', top: 'var(--s-6)', alignSelf: 'start', maxHeight: 'calc(100vh - 48px)', overflow: 'auto' }} className="rd-spine">
          <Micro style={{ marginBottom: 'var(--s-4)' }}>On this page</Micro>
          <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {article.steps.map((s, i) => {
              const n = i + 1
              const on = active === n
              return (
                <li key={n}>
                  <a href={'#s' + n}
                    style={{
                      display: 'flex', gap: 10, alignItems: 'center', padding: '6px 8px',
                      borderRadius: 'var(--r-sm)', textDecoration: 'none',
                      background: on ? 'var(--brand-tint)' : 'transparent',
                      transition: 'background var(--dur-2) var(--ease)',
                    }}>
                    <span className="q-micro" style={{ width: 12, textAlign: 'right', color: on ? 'var(--brand)' : 'var(--ink-4)', flex: 'none' }}>{n}</span>
                    <span style={{ fontSize: 13, lineHeight: 1.35, color: on ? 'var(--ink)' : 'var(--ink-3)', fontWeight: on ? 'var(--w-strong)' : 'var(--w-body)' }}>{s.h}</span>
                  </a>
                </li>
              )
            })}
          </ol>
        </nav>

        {/* Article */}
        <article style={{ minWidth: 0, paddingBottom: 'var(--s-16)' }}>
          <h1 style={{ fontSize: 'var(--t-d2)', maxWidth: 'var(--measure-title)', letterSpacing: 'var(--tr-display-lg)' }}>{article.title}</h1>
          <p className="q-lede" style={{ marginTop: 'var(--s-5)', fontSize: 20 }}>{article.standfirst}</p>
          <div style={{ display: 'flex', gap: 'var(--s-5)', marginTop: 'var(--s-6)' }}>
            {article.meta.map((m) => <Micro key={m} as="span">{m}</Micro>)}
          </div>
          <div style={{ height: 1, background: 'var(--rule)', marginTop: 'var(--s-8)' }} />

          {article.steps.map((s, i) => {
            const n = i + 1
            const tall = s.shape === 'tall'
            return (
              <section key={n} id={'s' + n} data-step={n} style={{ paddingTop: 'var(--s-12)', scrollMarginTop: 'var(--s-6)' }}>
                <div style={{ display: 'flex', gap: 'var(--s-5)', alignItems: 'flex-start' }}>
                  <div style={{ flex: 'none', width: 26, paddingTop: 7, borderTop: '2px solid var(--brand)' }}>
                    <span className="q-micro" style={{ color: 'var(--brand)', fontWeight: 'var(--w-strong)' }}>{String(n).padStart(2, '0')}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 style={{ fontSize: 'var(--t-d5)', marginBottom: 'var(--s-3)' }}>{s.h}</h2>
                    <div style={tall ? { display: 'flex', gap: 'var(--s-8)', alignItems: 'flex-start' } : undefined} className={tall ? 'rd-stack' : undefined}>
                      <p className="q-prose" style={tall ? { flex: 1, minWidth: 0, maxWidth: '46ch' } : undefined}
                        dangerouslySetInnerHTML={{ __html: s.p }} />
                      <figure style={{
                        flex: 'none', marginTop: tall ? 0 : 'var(--s-6)',
                        width: tall ? 268 : '100%', maxWidth: tall ? 268 : 780,
                        borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: 'var(--e2), var(--edge)',
                      }}>
                        <Shot shape={s.shape} label={`step ${n}`} />
                      </figure>
                    </div>
                  </div>
                </div>
              </section>
            )
          })}

          {/* Feedback. One question, two buttons, and a real follow-up — the answer to "what
              was missing?" is the only thing here worth a text field. */}
          <Card pad style={{ marginTop: 'var(--s-16)', maxWidth: 'var(--measure-prose)' }}>
            {vote === null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-5)', flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: 'var(--t-d6)', flex: 1 }}>Did this get you there?</h3>
                <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
                  <Button variant="secondary" size="sm" onClick={() => setVote('yes')}>Yes</Button>
                  <Button variant="secondary" size="sm" onClick={() => setVote('no')}>Not quite</Button>
                </div>
              </div>
            )}
            {vote === 'yes' && <p style={{ fontSize: 15, color: 'var(--ink-2)' }}>Good — thanks for saying so.</p>}
            {vote === 'no' && (
              <>
                <h3 style={{ fontSize: 'var(--t-d6)', marginBottom: 'var(--s-3)' }}>What was missing?</h3>
                <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
                  <input className="q-input" placeholder="The step where I got stuck…" style={{ flex: 1 }} />
                  <Button onClick={() => setVote('yes')}>Send</Button>
                </div>
              </>
            )}
          </Card>

          <div style={{ marginTop: 'var(--s-14)', maxWidth: 860 }}>
            <Micro style={{ marginBottom: 'var(--s-3)' }}>Next in {article.category}</Micro>
            <Card style={{ padding: 6 }}>
              {CATEGORIES.find((c) => c.id === article.categoryId).articles
                .filter((a) => a.id !== article.id)
                .map((a) => <Row key={a.id} href="#" title={a.title} desc={a.desc} meta={<Micro as="span" style={{ flex: 'none' }}>{a.steps} steps</Micro>} />)}
            </Card>
          </div>
        </article>
      </div>
    </main>
  )
}

Object.assign(window, { ReaderHome, ReaderCategory, ReaderArticle, Crumbs })
