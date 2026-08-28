const { Wordmark, Micro, Button, IconButton, Icon, Card, Dropzone, Field, Input, Textarea, Select, Notice, Row, State, Progress, Thumb } = window.QuinkDesignSystem_6ae0bd

// ============================================================================
// The first ninety seconds. Two screens, one continuous surface.
//
// v2 changes three things here, and they are the whole difference:
//   · The serif headline. A 56px Newsreader line makes the upload screen read as the front
//     of a writing tool rather than a file picker.
//   · No dashed rectangle. The dropzone is an inset well with one lifted tile inside it.
//   · Generating is a real, determinate account of four named stages, with the recording
//     already visible. v1 showed a pulsing dot; v2 shows what is happening and to what.
// ============================================================================

function UploadScreen({ onBack, onBuild }) {
  const [file, setFile] = React.useState(null)
  const [over, setOver] = React.useState(false)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Bar sticky={false}
        left={<span style={{ color: 'var(--ink)' }}><Wordmark height={20} /></span>}
        right={<>
          <ThemeToggle />
          <Button variant="ghost" icon="arrow-left" onClick={onBack}>Help center</Button>
        </>} />

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
              onClick={() => setFile({ name: 'onboarding-flow.mp4', size: '38.2 MB', dur: '4:12' })}
              onDragOver={(e) => { e.preventDefault(); setOver(true) }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); setFile({ name: 'onboarding-flow.mp4', size: '38.2 MB', dur: '4:12' }) }}
            />
            <Notice style={{ marginTop: 'var(--s-4)' }}>{COPY.freeLimit}</Notice>
          </>
        ) : (
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
        )}

        {/* The context form is part of uploading, not a gate before it — same rule as v1,
            expressed with spacing instead of a shared border. */}
        <div style={{ marginTop: 'var(--s-12)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-3)', marginBottom: 'var(--s-5)' }}>
            <h2 style={{ fontSize: 'var(--t-d5)' }}>A little context</h2>
            <Micro as="span">Optional, but it makes the draft better</Micro>
          </div>

          <Card variant="inset" pad style={{ marginBottom: 'var(--s-5)', display: 'flex', alignItems: 'center', gap: 'var(--s-3)', padding: '14px 18px' }}>
            <span style={{ fontWeight: 'var(--w-strong)', color: 'var(--ink)' }}>Northwind</span>
            <span style={{ color: 'var(--ink-3)', fontSize: 15 }}>New users · Friendly</span>
            <span style={{ flex: 1 }} />
            <Button variant="ghost" size="sm">Change</Button>
          </Card>

          <Field label="What does this recording show?" optional
            hint="A specific answer gets a specific guide. Name the task, not the product.">
            <Input placeholder={COPY.recordingPlaceholder} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-5)', marginTop: 'var(--s-5)' }}>
            <Field label="Audience" optional><Select options={['New users', 'Existing customers', 'Internal team', 'Admins']} /></Field>
            <Field label="Tone" optional><Select options={['Friendly', 'Concise', 'Formal']} /></Field>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-4)', marginTop: 'var(--s-10)' }}>
            <Button size="lg" disabled={!file} onClick={onBuild}>{COPY.buildCta}</Button>
            {!file && <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>Add a recording and this opens.</span>}
          </div>
        </div>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Generating. The recording stays on screen, the four stages are named, and the progress
// rule is driven by the stage index — never by a timer pretending to be one.
// ---------------------------------------------------------------------------
function Generating({ onDone }) {
  const [stage, setStage] = React.useState(0)

  React.useEffect(() => {
    if (stage >= STAGES.length) { const t = setTimeout(onDone, 700); return () => clearTimeout(t) }
    const t = setTimeout(() => setStage((s) => s + 1), 1500)
    return () => clearTimeout(t)
  }, [stage])

  const done = stage >= STAGES.length

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Bar sticky={false} left={<span style={{ color: 'var(--ink)' }}><Wordmark height={20} /></span>} right={<ThemeToggle />} />
      <main style={{ width: '100%', maxWidth: 560, margin: '0 auto', padding: 'var(--s-24) var(--s-6)' }}>
        <Micro style={{ marginBottom: 'var(--s-4)' }}>onboarding-flow.mp4 · 4:12</Micro>
        <h1 style={{ fontSize: 'var(--t-d3)', marginBottom: 'var(--s-3)' }}>
          {done ? 'Your guide is ready.' : 'Writing your guide.'}
        </h1>
        <p className="q-lede" style={{ marginBottom: 'var(--s-10)', fontSize: 17 }}>
          {done ? COPY.buildDone : COPY.generatingReassure}
        </p>

        <Progress value={Math.min(stage, STAGES.length) / STAGES.length} style={{ marginBottom: 'var(--s-8)' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          {STAGES.map((s, i) => {
            const state = i < stage ? 'done' : i === stage ? 'now' : 'next'
            return (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', opacity: state === 'next' ? 0.45 : 1, transition: 'opacity var(--dur-4) var(--ease)' }}>
                <span style={{ display: 'grid', placeItems: 'center', width: 22, height: 22, flex: 'none', color: state === 'done' ? 'var(--accent-600)' : state === 'now' ? 'var(--brand)' : 'var(--ink-4)' }}>
                  <Icon name={state === 'done' ? 'check-circle' : state === 'now' ? 'sparkle' : 'dot-circle'} size={19} />
                </span>
                <span style={{ fontSize: 16, fontWeight: state === 'now' ? 'var(--w-strong)' : 'var(--w-body)', color: state === 'next' ? 'var(--ink-3)' : 'var(--ink)' }}>{s.label}</span>
              </div>
            )
          })}
        </div>

        <Notice tone="brand" icon="sparkle" style={{ marginTop: 'var(--s-10)' }}>{COPY.generatingTip}</Notice>
      </main>
    </div>
  )
}

Object.assign(window, { UploadScreen, Generating })
