const { Wordmark, Micro, ThemeToggle, Button, IconButton, Icon, AvatarStack } = window.QuinkDesignSystem_6ae0bd

// The app chassis. One bar, one rail, one content column — and a lot more air than v1.
// The bar is a raised surface at --z-bar; it has no bottom border, which is the whole
// difference between v2 and v1 at the top of every screen.

function Bar({ left, right, sticky = true }) {
  return (
    <header style={{
      position: sticky ? 'sticky' : 'static', top: 0, zIndex: 'var(--z-bar)',
      display: 'flex', alignItems: 'center', gap: 'var(--s-3)',
      height: 60, padding: '0 var(--s-6)',
      background: 'var(--surface-1)', boxShadow: 'var(--e1), var(--edge)',
    }}>
      {left}
      <span style={{ flex: 1 }} />
      {right}
    </header>
  )
}

function Crumb({ items = [] }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <span style={{ color: 'var(--ink)', flex: 'none' }}><Wordmark height={19} /></span>
      {items.map((it, i) => (
        <React.Fragment key={i}>
          <span style={{ color: 'var(--ink-4)', fontSize: 15 }}>/</span>
          <span style={{ fontSize: 15, fontWeight: 'var(--w-strong)', color: i === items.length - 1 ? 'var(--ink)' : 'var(--ink-3)', whiteSpace: 'nowrap' }}>{it}</span>
        </React.Fragment>
      ))}
    </span>
  )
}

const RAIL_GROUPS = [
  { cap: 'Content', items: [{ icon: 'book', label: 'Articles', n: 45, key: 'library' }] },
  { cap: 'Your help center', items: [
    { icon: 'box', label: 'Product details' },
    { icon: 'palette', label: 'Theming' },
    { icon: 'external', label: 'View live site' },
    { icon: 'globe', label: 'Domain' },
    { icon: 'people', label: 'People' },
  ] },
]

function Rail({ current = 'library', onNav, runs }) {
  return (
    <nav style={{ width: 'var(--rail)', flex: 'none', padding: 'var(--s-6) var(--s-3)', display: 'flex', flexDirection: 'column', gap: 'var(--s-6)' }}>
      {RAIL_GROUPS.map((g) => (
        <div key={g.cap}>
          <Micro style={{ padding: '0 12px 8px' }}>{g.cap}</Micro>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {g.items.map((it) => {
              const on = it.key === current
              return (
                <button key={it.label} onClick={() => it.key && onNav && onNav(it.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
                    height: 38, padding: '0 12px', borderRadius: 'var(--r-md)',
                    fontSize: 15, fontWeight: on ? 'var(--w-strong)' : 'var(--w-medium)',
                    color: on ? 'var(--ink)' : 'var(--ink-2)',
                    background: on ? 'var(--surface-1)' : 'transparent',
                    boxShadow: on ? 'var(--e1), var(--edge)' : 'none',
                    transition: 'background var(--dur-2) var(--ease), color var(--dur-1) var(--ease)',
                  }}
                  onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'var(--hover)' }}
                  onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent' }}>
                  <span style={{ color: on ? 'var(--brand)' : 'var(--ink-3)', display: 'flex' }}><Icon name={it.icon} size={17} /></span>
                  <span style={{ flex: 1 }}>{it.label}</span>
                  {it.n != null && <span className="q-micro" style={{ color: 'var(--ink-4)' }}>{it.n}</span>}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 'auto', padding: '0 12px' }}>
        <div style={{ height: 1, background: 'var(--rule)', margin: '0 -12px var(--s-4)' }} />
        <Micro>AI runs</Micro>
        <p style={{ marginTop: 6, fontSize: 15, color: 'var(--ink-2)' }}>
          <span style={{ fontWeight: 'var(--w-strong)', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{runs}</span> this cycle
        </p>
      </div>
    </nav>
  )
}

Object.assign(window, { Bar, Crumb, Rail, ThemeToggle })
