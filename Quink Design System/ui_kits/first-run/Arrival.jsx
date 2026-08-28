const { Wordmark, Micro, Button, IconButton, Icon, Card, Input, Notice, Menu, State } = window.QuinkDesignSystem_6ae0bd

// ============================================================================
// First run, screen 5: landing in the editor.
//
// Two kinds of question live here, and the difference matters:
//
//   1. CARRIED-OVER questions (OpenClarifications). The ones the run never got to ask —
//      over the cap, or skipped. They arrive as a card above the article, answerable in a
//      tap, and the answer lands as a diff on the step the question's evidence points at.
//      Same shape, same validated enum, just a later moment.
//
//   2. STEER. The question the USER asks. Every step has a field, and the field is
//      pre-filled after a run rather than blank: rerolling blindly is a slot machine,
//      editing the ask is steering. The result is shown as a diff with the instruction
//      quoted above it, so a result they don't recognise traces back to what they asked.
// ============================================================================

function OpenClarification({ c, onAnswer, onDismiss }) {
  return (
    <Card variant="panel" pad className="q-fade-in" style={{ marginBottom: 'var(--s-10)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--s-4)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <AiTag>One thing I couldn’t work out</AiTag>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 'var(--s-4) 0 var(--s-3)' }}>
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{c.evidence}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-4)' }}>· {c.at} · step {c.step}</span>
          </div>
          <h3 style={{ fontSize: 19, lineHeight: 1.35, fontWeight: 'var(--w-strong)', letterSpacing: '-.012em', marginBottom: 'var(--s-5)' }}>{c.question}</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
            {c.options.map((o) => (
              <Button key={o.id} size="sm" variant={o.id === c.def ? 'primary' : 'secondary'} onClick={onAnswer}>{o.label}</Button>
            ))}
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--ink-3)', marginTop: 'var(--s-5)' }}>Answering rewrites step {c.step} only. Nothing else moves.</p>
        </div>
        <IconButton icon="x" label="Dismiss" size="sm" onClick={onDismiss} />
      </div>
    </Card>
  )
}

// The question the user asks. Pre-filled, never a blind reroll.
function SteerField({ value, onChange, onSubmit }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--s-2)', marginTop: 'var(--s-4)' }}>
      <Input value={value} onChange={(e) => onChange(e.target.value)}
        placeholder="Tell me what to change about this step…"
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSubmit() } }}
        style={{ flex: 1 }} />
      <Button size="sm" variant="secondary" icon="sparkle" disabled={!value.trim()} onClick={onSubmit}>Rewrite</Button>
    </div>
  )
}

// The answer, shown as a diff with the ask quoted above it.
function SteerResult({ instruction, before, after, onKeep, onUndo }) {
  return (
    <Card variant="inset" pad className="q-fade-in" style={{ marginTop: 'var(--s-4)', padding: 18 }}>
      <p style={{ fontSize: 14, color: 'var(--ink-3)', fontStyle: 'italic', marginBottom: 'var(--s-4)' }}>“{instruction}”</p>
      <p style={{ fontSize: 15, color: 'var(--ink-4)', textDecoration: 'line-through', textDecorationColor: 'var(--critical)', marginBottom: 'var(--s-3)' }}>{before}</p>
      <p style={{ fontSize: 16, color: 'var(--ink)' }}>{after}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginTop: 'var(--s-5)' }}>
        <Button size="sm" onClick={onKeep}>Keep it</Button>
        <Button size="sm" variant="ghost" onClick={onUndo}>Undo</Button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Not quite? Edit the ask and run it again.</span>
      </div>
    </Card>
  )
}

function Arrival({ onRestart }) {
  const carried = FR_CLARIFICATIONS.find((c) => !c.asked)
  const [open, setOpen] = React.useState(true)
  const [steerFor, setSteerFor] = React.useState(3)
  const [instruction, setInstruction] = React.useState('Drop the SQL and just say to run the grant it shows you')
  const [result, setResult] = React.useState(false)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Bar
        left={<span style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--ink)' }}>
          <Wordmark height={19} />
          <span style={{ color: 'var(--ink-4)', fontSize: 15 }}>/</span>
          <span style={{ fontSize: 15, fontWeight: 'var(--w-strong)' }}>{FR_ARTICLE.title}</span>
          <State state="draft" label="Draft" />
        </span>}
        right={<>
          <ThemeToggle />
          <Button variant="ghost" icon="eye">Preview</Button>
          <Button variant="accent" icon="arrow-up-circle">Publish</Button>
        </>} />

      <div style={{ display: 'grid', gridTemplateColumns: '232px 1fr', gap: 'var(--s-12)', maxWidth: 1280, width: '100%', margin: '0 auto', padding: 'var(--s-10) var(--s-10) var(--s-24)', alignItems: 'start' }}>
        <nav style={{ position: 'sticky', top: 84, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Micro style={{ padding: '0 10px var(--s-3)' }}>Steps</Micro>
          {FR_STEPS.map((s, i) => (
            <button key={i} onClick={() => setSteerFor(i)}
              style={{ display: 'flex', gap: 10, alignItems: 'baseline', textAlign: 'left', width: '100%', padding: '9px 10px', borderRadius: 'var(--r-md)', background: i === steerFor ? 'var(--surface-1)' : 'transparent', boxShadow: i === steerFor ? 'var(--e1), var(--edge)' : 'none', border: 0, cursor: 'pointer', font: 'inherit' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-4)', flex: 'none' }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ fontSize: 14, color: i === steerFor ? 'var(--ink)' : 'var(--ink-2)', fontWeight: i === steerFor ? 'var(--w-strong)' : 'var(--w-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.h}</span>
            </button>
          ))}
        </nav>

        <main style={{ maxWidth: 720 }}>
          <Notice tone="brand" icon="check-circle" style={{ marginBottom: 'var(--s-8)' }}>
            Your guide is ready. Every step is editable now — reword a line, swap a frame, or ask for a rewrite.
          </Notice>

          {open && carried && (
            <OpenClarification c={carried} onAnswer={() => setOpen(false)} onDismiss={() => setOpen(false)} />
          )}

          <h1 style={{ fontSize: 'var(--t-d3)', marginBottom: 'var(--s-4)' }}>{FR_ARTICLE.title}</h1>
          <p className="q-lede" style={{ marginBottom: 'var(--s-12)' }}>{FR_ARTICLE.standfirst}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-10)' }}>
            {FR_STEPS.map((s, i) => {
              const on = i === steerFor
              return (
                <div key={i} style={{ display: 'flex', gap: 'var(--s-5)' }}>
                  <StepNum n={i + 1} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: 20, letterSpacing: '-.015em', marginBottom: 'var(--s-3)' }}>{s.h}</h3>
                    <p style={{ fontSize: 16, color: 'var(--ink-2)', maxWidth: 'var(--measure-prose)', marginBottom: 'var(--s-4)' }}>
                      {i === 3 && result ? 'Run the grant Northwind shows you — it is one line, and it gives us read access to nothing else.' : s.p}
                    </p>
                    <FrShot ratio={s.ratio} label={`frame at ${s.at}`} />
                    {on && !result && <SteerField value={instruction} onChange={setInstruction} onSubmit={() => setResult(true)} />}
                    {on && result && (
                      <SteerResult instruction={instruction}
                        before="Run the grant Northwind shows you: GRANT SELECT ON ALL TABLES IN SCHEMA public TO northwind;"
                        after="Run the grant Northwind shows you — it is one line, and it gives us read access to nothing else."
                        onKeep={() => setResult(false)} onUndo={() => setResult(false)} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <p style={{ fontSize: 13.5, color: 'var(--ink-3)', marginTop: 'var(--s-14)' }}>{FR_COPY.retention}</p>
          <Button variant="ghost" icon="undo" onClick={onRestart} style={{ marginTop: 'var(--s-6)' }}>Replay the first run</Button>
        </main>
      </div>
    </div>
  )
}

Object.assign(window, { Arrival, OpenClarification, SteerField, SteerResult })
