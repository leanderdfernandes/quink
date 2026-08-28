const { Wordmark, Micro, Button, IconButton, Icon, Card, Dropzone, Field, Input, Notice, Row, State, Chip } = window.QuinkDesignSystem_6ae0bd

// ============================================================================
// First run, screens 1–3: drop → wall → check your email.
//
// The one structural thing this kit exists to show: THE WALL FIRES AFTER UPLOAD AND BEFORE
// GENERATION (ux-spec §2, LOCKED). The expensive pipeline never runs for an unverified
// session. That costs conversion only while signup stays feather-light, so the wall is one
// tap, no card, no password, and it never stops reminding you your recording is already
// loaded and waiting on the other side.
//
// A first-run upload screen is NOT the returning-author one: there is no help center yet,
// so there is no KB context card and no folder picker. What replaces them is disclosure —
// the free-tier limit and the retention promise, both said before the file is committed.
// ============================================================================

function FrUpload({ onBuild }) {
  const [file, setFile] = React.useState(null)
  const [over, setOver] = React.useState(false)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Bar sticky={false}
        left={<span style={{ color: 'var(--ink)' }}><Wordmark height={20} /></span>}
        right={<><ThemeToggle /><Button variant="ghost">Sign in</Button></>} />

      <main style={{ width: '100%', maxWidth: 'var(--shell-form)', margin: '0 auto', padding: 'var(--s-16) var(--s-6) var(--s-24)' }}>
        <h1 style={{ fontSize: 'var(--t-d2)', maxWidth: 'var(--measure-hero)', marginBottom: 'var(--s-5)' }}>
          Turn a recording into a guide.
        </h1>
        <p className="q-lede" style={{ marginBottom: 'var(--s-12)' }}>
          Drop in a screen recording and get an editable, publishable article in about ninety
          seconds — no writing, no screenshots to take.
        </p>

        {!file ? (
          <>
            <Dropzone
              state={over ? 'over' : 'idle'}
              sub="MP4 or MOV · up to 100 MB and 6 minutes each"
              onClick={() => setFile(FR_FILE)}
              onDragOver={(e) => { e.preventDefault(); setOver(true) }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); setFile(FR_FILE) }}
            />
            <Notice style={{ marginTop: 'var(--s-4)' }}>{FR_COPY.freeLimit}</Notice>
          </>
        ) : (
          <>
            <Dropzone state="loaded">
              <Row
                thumb={<span style={{ display: 'grid', placeItems: 'center', width: 44, height: 30, borderRadius: 'var(--r-xs)', background: 'var(--surface-1)', color: 'var(--brand)', boxShadow: 'var(--e1), var(--edge)', flex: 'none' }}><Icon name="film" size={15} /></span>}
                title={file.name}
                desc={`${file.dur} · ${file.size}`}
                state={<State state="live" label="Ready" />}
                arrow={false}
                actions={<IconButton icon="x" label="Remove" size="sm" onClick={() => setFile(null)} />}
              />
            </Dropzone>
            {/* Over-disclose, early: retention is stated before the file is committed,
                because finding out afterwards is the dark pattern the spec forbids. */}
            <Notice icon="clock" style={{ marginTop: 'var(--s-4)' }}>{FR_COPY.retention}</Notice>
          </>
        )}

        <div style={{ marginTop: 'var(--s-12)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-3)', marginBottom: 'var(--s-5)' }}>
            <h2 style={{ fontSize: 'var(--t-d5)' }}>A little context</h2>
            <Micro as="span">Optional, but it makes the draft better</Micro>
          </div>
          <Field label="What does this recording show?" optional
            hint="A specific answer gets a specific guide. Name the task, not the product.">
            <Input placeholder={FR_COPY.recordingPlaceholder} />
          </Field>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-4)', marginTop: 'var(--s-10)' }}>
            <Button size="lg" disabled={!file} onClick={onBuild}>{FR_COPY.buildCta}</Button>
            <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>
              {file ? 'One tap to sign in, then it starts building.' : 'Add a recording and this opens.'}
            </span>
          </div>
        </div>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The wall. An OPEN padlock — unlocking, not blocking — and the file pill, because the
// only anxiety on this screen is "did my recording survive this".
// ---------------------------------------------------------------------------
const GoogleG = () => (
  <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden style={{ flex: 'none' }}>
    <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.1z" />
    <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.4 46 24 46z" />
    <path fill="#FBBC05" d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.5C3 17.1 2.1 20.4 2.1 24s.9 6.9 2.4 9.9l7.3-5.7z" />
    <path fill="#EA4335" d="M24 10.4c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 3.9 29.9 2 24 2 15.4 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9.4 12.2-9.4z" />
  </svg>
)

function WallShell({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <Bar sticky={false} left={<span style={{ color: 'var(--ink)' }}><Wordmark height={20} /></span>} right={<ThemeToggle />} />
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 'var(--s-12) var(--s-6)' }}>
        <div className="q-fade-in" style={{ width: '100%', maxWidth: 420 }}>{children}</div>
      </div>
    </div>
  )
}

function AccountWall({ onSent, onGoogle }) {
  const [email, setEmail] = React.useState('')
  return (
    <WallShell>
      <Card pad="lg">
        <span style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: 'var(--r-md)', background: 'var(--brand-tint)', color: 'var(--brand)', marginBottom: 'var(--s-5)' }}>
          <Icon name="lock" size={19} />
        </span>
        <h2 style={{ fontSize: 'var(--t-d4)', marginBottom: 'var(--s-2)' }}>{FR_COPY.wallHeading}</h2>
        <p style={{ fontSize: 16, color: 'var(--ink-2)', marginBottom: 'var(--s-6)' }}>{FR_COPY.wallNoCard}</p>

        {/* The file pill. Their recording is loaded and waiting — say it, don't imply it. */}
        <Chip style={{ marginBottom: 'var(--s-7)' }}>
          {FR_COPY.wallFilePill}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-3)', marginLeft: 8 }}>{FR_FILE.size}</span>
        </Chip>

        <Button variant="secondary" size="lg" full onClick={onGoogle} style={{ marginBottom: 'var(--s-5)' }}>
          <GoogleG />Continue with Google
        </Button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-4)', margin: '0 0 var(--s-5)' }}>
          <span style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
          <span className="q-micro">or</span>
          <span style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); if (email.trim()) onSent(email.trim()) }}>
          <Input placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ marginBottom: 'var(--s-3)' }} />
          <Button variant="ghost" size="lg" full type="submit" disabled={!email.trim()}>Email me a link</Button>
        </form>

        <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 'var(--s-6)' }}>{FR_COPY.wallFootnote}</p>
      </Card>
    </WallShell>
  )
}

function CheckEmail({ email, onOpen }) {
  return (
    <WallShell>
      <Card pad="lg">
        <span style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: 'var(--r-md)', background: 'var(--accent-50)', color: 'var(--accent-700)', marginBottom: 'var(--s-5)' }}>
          <Icon name="link" size={19} />
        </span>
        <h2 style={{ fontSize: 'var(--t-d4)', marginBottom: 'var(--s-2)' }}>Check your email</h2>
        <p style={{ fontSize: 16, color: 'var(--ink-2)' }}>
          We sent a sign-in link to <strong style={{ color: 'var(--ink)', fontWeight: 'var(--w-strong)' }}>{email}</strong>. Open it and your guide starts building.
        </p>
        <Notice icon="film" style={{ marginTop: 'var(--s-6)' }}>
          {FR_FILE.name} is held on this device until you land back here. Nothing has been uploaded yet.
        </Notice>
        <Button size="lg" full onClick={onOpen} style={{ marginTop: 'var(--s-6)' }}>Open the link</Button>
      </Card>
    </WallShell>
  )
}

Object.assign(window, { FrUpload, AccountWall, CheckEmail })
