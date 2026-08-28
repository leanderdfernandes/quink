const { Wordmark, Micro, ThemeToggle, Button, Icon, Card, Sheet, Field, Input, Notice, State } = window.QuinkDesignSystem_6ae0bd

// The landing page, at v2. The hero is a 76px Newsreader line — the single change that most
// separates this from a template. No dashed boxes, no bordered cards, no eyebrow pill.

const STEPS = [
  { n: 'Record', title: 'Record your screen', body: 'Do the workflow you already know cold — .mp4 or .mov, no narration required.' },
  { n: 'Edit', title: 'Get an editable article', body: 'Headings, steps and a screenshot per action, drafted for you. Fix a frame, reword a line.' },
  { n: 'Publish', title: 'Publish to your domain', body: 'It goes live on your own hosted, searchable help center — the one your customers actually read.' },
]

function Nav({ onLogin }) {
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 'var(--z-bar)', background: 'color-mix(in oklab, var(--bg) 88%, transparent)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-6)', maxWidth: 'var(--shell)', margin: '0 auto', padding: 'var(--s-5) var(--gutter)' }}>
        <span style={{ color: 'var(--ink)' }}><Wordmark height={22} /></span>
        <span style={{ flex: 1 }} />
        <nav style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
          <Button variant="ghost" href="#how">How it works</Button>
          <Button variant="ghost" href="#pricing">Pricing</Button>
          <ThemeToggle />
          <Button variant="secondary" onClick={onLogin}>Log in</Button>
        </nav>
      </div>
    </header>
  )
}

function Hero({ onStart }) {
  return (
    <section style={{ maxWidth: 'var(--shell)', margin: '0 auto', padding: 'var(--s-24) var(--gutter) var(--s-20)' }}>
      <Micro style={{ marginBottom: 'var(--s-6)' }}>For the support &amp; ops teams who write the docs</Micro>
      <h1 style={{ fontSize: 'var(--t-d1)', maxWidth: 'var(--measure-hero)', letterSpacing: 'var(--tr-display-lg)', lineHeight: 'var(--lh-display)', marginBottom: 'var(--s-7)' }}>
        The week of article-writing you never have to do.
      </h1>
      <p className="q-lede" style={{ marginBottom: 'var(--s-10)' }}>
        Record your screen once. Quink turns it into a polished, step-by-step help article —
        published straight to your own branded help center at <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88em', color: 'var(--ink)' }}>docs.yourcompany.com</span>.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-5)', flexWrap: 'wrap' }}>
        <Button size="lg" onClick={onStart}>Build my guide</Button>
        <State state="live" label="Free to try" sub="3 guides from video · no card" />
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section id="how" style={{ maxWidth: 'var(--shell)', margin: '0 auto', padding: '0 var(--gutter) var(--s-24)' }}>
      <div style={{ height: 1, background: 'var(--rule)', marginBottom: 'var(--s-14)' }} />
      <h2 style={{ fontSize: 'var(--t-d3)', maxWidth: '20ch', marginBottom: 'var(--s-12)' }}>
        Three steps. About ninety seconds.
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--s-6)' }}>
        {STEPS.map((s, i) => (
          <Card key={s.title} pad="lg">
            <Micro style={{ marginBottom: 'var(--s-8)' }}>{String(i + 1).padStart(2, '0')} · {s.n}</Micro>
            <h3 style={{ fontSize: 'var(--t-d5)', marginBottom: 'var(--s-3)' }}>{s.title}</h3>
            <p style={{ fontSize: 15, color: 'var(--ink-3)', lineHeight: 1.6 }}>{s.body}</p>
          </Card>
        ))}
      </div>
    </section>
  )
}

function Pricing() {
  return (
    <section id="pricing" style={{ maxWidth: 'var(--shell)', margin: '0 auto', padding: '0 var(--gutter) var(--s-24)' }}>
      <Card variant="panel" pad="lg" style={{ display: 'flex', gap: 'var(--s-12)', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <h2 style={{ fontSize: 'var(--t-d4)', marginBottom: 'var(--s-3)' }}>Writing by hand is always free.</h2>
          <p style={{ fontSize: 16, color: 'var(--ink-2)', maxWidth: '52ch' }}>
            Generation is the only thing that costs us anything, so it's the only thing we meter.
            Your whole team is included on every plan — there are no per-seat fees.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <Button size="lg">Build my guide</Button>
          <Notice>3 free guides from video, kept 30 days.</Notice>
        </div>
      </Card>
    </section>
  )
}

function LegalFooter() {
  const links = ['Terms', 'Privacy', 'Refunds', 'Contact']
  return (
    <footer style={{ background: 'var(--surface-1)', boxShadow: 'var(--e1), var(--edge)' }}>
      <div style={{ maxWidth: 'var(--shell)', margin: '0 auto', padding: 'var(--s-7) var(--gutter)', display: 'flex', alignItems: 'center', gap: 'var(--s-6)', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--ink-3)' }}><Wordmark height={18} /></span>
        <span style={{ flex: 1 }} />
        <nav style={{ display: 'flex', gap: 'var(--s-6)' }}>
          {links.map((l) => <a key={l} href="#" style={{ fontSize: 14, color: 'var(--ink-3)' }}>{l}</a>)}
        </nav>
      </div>
    </footer>
  )
}

function LoginSheet({ onClose }) {
  return (
    <Sheet icon="lock" title="Log in to Quink" lede="We'll email you a link — there's no password to remember."
      onClose={onClose}
      actions={<><Button>Send me a link</Button><Button variant="ghost" onClick={onClose}>Cancel</Button></>}>
      <div style={{ marginTop: 'var(--s-6)' }}>
        <Field label="Work email"><Input type="email" placeholder="you@company.com" /></Field>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-4)', margin: 'var(--s-5) 0', color: 'var(--ink-4)', fontSize: 13 }}>
          <span style={{ flex: 1, height: 1, background: 'var(--rule)' }} />or<span style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
        </div>
        <Button variant="secondary" full icon="globe">Continue with Google</Button>
      </div>
    </Sheet>
  )
}

function MarketingHome() {
  const [login, setLogin] = React.useState(false)
  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav onLogin={() => setLogin(true)} />
      <Hero onStart={() => { window.location.href = '../app/index.html' }} />
      <HowItWorks />
      <Pricing />
      <LegalFooter />
      {login && <LoginSheet onClose={() => setLogin(false)} />}
    </div>
  )
}

Object.assign(window, { MarketingHome, Nav, Hero, HowItWorks, Pricing, LegalFooter, LoginSheet })
