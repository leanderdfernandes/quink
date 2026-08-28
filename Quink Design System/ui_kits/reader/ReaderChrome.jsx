const { Wordmark, Micro, ThemeToggle, Button, IconButton, Icon, Card, Input, Row, Group, Thumb } = window.QuinkDesignSystem_6ae0bd

// ============================================================================
// The published help center. Same chassis as the authoring app — same surface ladder, same
// elevation, same type — with --brand swapped for the customer's colour. That shared
// chassis is the "both should feel connected" answer: a reader page and an editor page are
// recognisably the same product, and only the accent tells you whose site you're on.
//
// The masthead band is ONE surface containing mark, search and headline — never a white
// strip above a hero. v1's four band treatments collapse to two here (solid and deep),
// because the tinted variants went grey for desaturated customer colours.
// ============================================================================

function Band({ compact = false, q, setQ, results, onOpen, onHome }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="q-on-brand" style={{ position: 'relative', background: 'var(--brand)', color: 'var(--on-brand)' }}>
      <div style={{ maxWidth: 'var(--shell)', margin: '0 auto', padding: compact ? 'var(--s-5) var(--gutter)' : 'var(--s-6) var(--gutter) var(--s-16)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-5)' }}>
          <button onClick={onHome} style={{ display: 'flex', alignItems: 'center', gap: 13, color: 'inherit' }}>
            <span style={{
              display: 'grid', placeItems: 'center', width: compact ? 34 : 42, height: compact ? 34 : 42,
              borderRadius: 'var(--r-md)', background: 'var(--surface-1)', color: 'var(--brand)',
              fontFamily: 'var(--font-display)', fontSize: compact ? 18 : 22, fontWeight: 500,
              boxShadow: 'var(--e2)', flex: 'none',
            }}>{KB.glyph}</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: compact ? 20 : 24, fontWeight: 500, letterSpacing: 'var(--tr-display)' }}>{KB.name}</span>
          </button>
          <span style={{ flex: 1 }} />
          {compact && (
            <BandSearch q={q} setQ={setQ} results={results} onOpen={onOpen} open={open} setOpen={setOpen} width={320} />
          )}
          <ThemeToggle />
        </div>

        {!compact && (
          <>
            <h1 style={{ color: 'inherit', fontSize: 'var(--t-d2)', maxWidth: 'var(--measure-hero)', marginTop: 'var(--s-12)', letterSpacing: 'var(--tr-display-lg)' }}>
              {KB.headline}
            </h1>
            <p style={{ marginTop: 'var(--s-4)', fontSize: 18, lineHeight: 1.5, maxWidth: '46ch', color: 'color-mix(in oklab, var(--on-brand) 88%, transparent)' }}>
              {KB.sub}
            </p>
            <div style={{ marginTop: 'var(--s-8)', maxWidth: 540 }}>
              <BandSearch q={q} setQ={setQ} results={results} onOpen={onOpen} open={open} setOpen={setOpen} big />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// The search field sits ON the brand fill, so it can't use the app's field tokens — it
// derives its own from --on-brand, which is itself WCAG-picked. That is the one place the
// reader needs colour logic the app doesn't.
function BandSearch({ q, setQ, results, onOpen, open, setOpen, big = false, width }) {
  return (
    <div style={{ position: 'relative', width: width || '100%', flex: width ? 'none' : undefined }}>
      <span style={{ position: 'absolute', left: big ? 18 : 14, top: '50%', transform: 'translateY(-50%)', color: 'color-mix(in oklab, var(--on-brand) 68%, transparent)', pointerEvents: 'none', display: 'flex' }}>
        <Icon name="search" size={big ? 19 : 16} />
      </span>
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder="Search the help center"
        className="q-band-field"
        style={{
          width: '100%', height: big ? 52 : 38, paddingLeft: big ? 50 : 40, paddingRight: 18,
          borderRadius: 'var(--r-pill)', border: 'none',
          background: 'color-mix(in oklab, var(--on-brand) 12%, transparent)',
          color: 'var(--on-brand)', fontSize: big ? 16 : 14.5,
          outline: 'none', transition: 'background var(--dur-2) var(--ease), box-shadow var(--dur-2) var(--ease)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'color-mix(in oklab, var(--on-brand) 18%, transparent)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'color-mix(in oklab, var(--on-brand) 12%, transparent)')} />
      {open && q && (
        <div className="q-menu" style={{ position: 'absolute', top: 'calc(100% + 10px)', left: 0, right: 0, zIndex: 'var(--z-menu)', color: 'var(--ink)', minWidth: 0 }}>
          {results.length === 0 ? (
            <p style={{ padding: '14px 12px', fontSize: 14, color: 'var(--ink-3)' }}>
              Nothing matches “{q}”.<br />
              <span style={{ color: 'var(--ink-4)', fontSize: 13 }}>Try a word from the task you're trying to finish.</span>
            </p>
          ) : (
            <>
              <p className="q-menu-cap">{results.length} {results.length === 1 ? 'result' : 'results'}</p>
              {results.slice(0, 5).map((r) => (
                <button key={r.id} className="q-menu-it" onMouseDown={() => onOpen(r)}>
                  <span style={{ flex: 1 }}>
                    {r.title}
                    <small>{r.cat} · {r.steps} steps</small>
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Footer() {
  return (
    <footer style={{ marginTop: 'var(--s-24)', background: 'var(--surface-1)', boxShadow: 'var(--e1), var(--edge)' }}>
      <div style={{ maxWidth: 'var(--shell)', margin: '0 auto', padding: 'var(--s-7) var(--gutter)', display: 'flex', alignItems: 'center', gap: 'var(--s-6)', flexWrap: 'wrap' }}>
        <Micro as="span">{KB.domain}</Micro>
        <span style={{ flex: 1 }} />
        <a href="#" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--ink-3)' }}>
          Made with <span style={{ color: 'var(--ink-2)' }}><Wordmark height={15} /></span>
        </a>
      </div>
    </footer>
  )
}

Object.assign(window, { Band, BandSearch, Footer })
