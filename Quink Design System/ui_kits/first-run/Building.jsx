const { Wordmark, Micro, Button, IconButton, Icon, Card, Input, Textarea, Notice, Progress, Chip } = window.QuinkDesignSystem_6ae0bd

// ============================================================================
// First run, screen 4: the article building up — and the questions.
//
// The whole design argument of this screen is in one sentence from the source:
// "Screenshots keep landing behind this panel; only the WRITE stage is waiting."
//
// So the layout is two columns and neither is a spinner. On the right the article is
// visibly assembling — eight step slots appear as soon as actions are detected, each one
// filling with its screenshot as it is captured, prose still bones. On the left, one
// question at a time. The user can see that answering is not holding up the machine; it is
// holding up the one stage that needs them, and the stage row says exactly that.
//
// THREE RULES CARRIED FROM ClarifyPanel.tsx:
//   1. Nothing blocks. The write button is present the whole time — "Skip the rest and
//      write it" while questions are open, "Write my guide" once they are done.
//   2. One question at a time, evidence first. A list of three is a form; one card with the
//      reason above it is a conversation.
//   3. Every word is a template with holes. The model supplies a type and slot values and
//      nothing else — a recording that could author its own question is a phishing vector.
// ============================================================================

function AiTag({ children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px 3px 8px', whiteSpace: 'nowrap', borderRadius: 999, background: 'var(--brand-tint)', color: 'var(--brand)', fontSize: 12.5, fontWeight: 'var(--w-strong)', letterSpacing: '.01em' }}>
      <Icon name="sparkle" size={13} />{children}
    </span>
  )
}

function StageRow({ stage, paused }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-7)', flexWrap: 'wrap' }}>
      {FR_STAGES.map((s, i) => {
        const st = i < stage ? 'done' : i === stage ? 'now' : 'next'
        const waiting = st === 'now' && paused
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 9, opacity: st === 'next' ? 0.42 : 1, transition: 'opacity var(--dur-4) var(--ease)' }}>
            <span style={{ display: 'flex', color: st === 'done' ? 'var(--accent-600)' : waiting ? 'var(--caution-ink)' : st === 'now' ? 'var(--brand)' : 'var(--ink-4)' }}>
              <Icon name={st === 'done' ? 'check-circle' : waiting ? 'clock' : st === 'now' ? 'sparkle' : 'dot-circle'} size={17} />
            </span>
            <span style={{ fontSize: 14.5, fontWeight: st === 'now' ? 'var(--w-strong)' : 'var(--w-body)', color: st === 'next' ? 'var(--ink-3)' : 'var(--ink)' }}>
              {waiting ? 'Waiting on your answers' : s.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// One question. Evidence first, default as the primary, fallback said out loud.
// ---------------------------------------------------------------------------
function QuestionCard({ c, index, total, onAnswer }) {
  const [typed, setTyped] = React.useState('')
  return (
    <div className="q-fade-in">
      <Micro style={{ marginBottom: 'var(--s-3)' }}>{index + 1} of {total}</Micro>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--s-3)' }}>
        <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{c.evidence}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-4)' }}>· {c.at}</span>
      </div>
      <h3 style={{ fontSize: 19, lineHeight: 1.35, fontWeight: 'var(--w-strong)', letterSpacing: '-.012em', marginBottom: 'var(--s-5)' }}>{c.question}</h3>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
        {c.options.map((o) => (
          // The default is the primary. Not because it is more correct, but because it is
          // what happens if they walk away — the screen should agree with the machine.
          <Button key={o.id} size="sm" variant={o.id === c.def ? 'primary' : 'secondary'} onClick={() => onAnswer(o.label)}>{o.label}</Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => onAnswer(null)}>Not sure</Button>
      </div>

      {c.freeText && (
        <div style={{ display: 'flex', gap: 'var(--s-2)', marginTop: 'var(--s-4)' }}>
          <Input placeholder="Or your own word…" value={typed} maxLength={64}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && typed.trim()) { e.preventDefault(); onAnswer(typed.trim()) } }}
            style={{ flex: 1 }} />
          <Button size="sm" variant="secondary" disabled={!typed.trim()} onClick={() => onAnswer(typed.trim())}>Use</Button>
        </div>
      )}

      {/* The fallback is IN the card, not in a tooltip. "Nothing blocks" is only true if
          the person can see what happens when they do nothing. */}
      <p style={{ fontSize: 13.5, color: 'var(--ink-3)', marginTop: 'var(--s-5)' }}>
        Not sure? {c.fallback} You can change it later.
      </p>
    </div>
  )
}

function Answered({ items, onChange }) {
  if (!items.length) return null
  return (
    <div style={{ marginBottom: 'var(--s-6)' }}>
      <Micro style={{ marginBottom: 'var(--s-3)' }}>Answered</Micro>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        {items.map(({ c, i, value }) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
            <span style={{ display: 'flex', color: 'var(--accent-600)', paddingTop: 1, flex: 'none' }}><Icon name="check-circle" size={15} /></span>
            <p style={{ flex: 1, fontSize: 14.5, color: value === null ? 'var(--ink-3)' : 'var(--ink-2)' }}>{value === null ? c.fallback : value}</p>
            <button onClick={() => onChange(i)} style={{ font: 'inherit', fontSize: 13.5, fontWeight: 'var(--w-strong)', color: 'var(--brand)', background: 'none', border: 0, cursor: 'pointer', padding: 0, flex: 'none' }}>Change</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The article, assembling. Step slots appear as actions are detected; each fills with its
// captured frame; prose lands last, one step at a time, because that is the real order.
// ---------------------------------------------------------------------------
function Assembling({ shots, written, writing }) {
  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 'var(--s-10)' }}>
        {written > 0 ? (
          <div className="q-fade-in">
            <h1 style={{ fontSize: 'var(--t-d3)', marginBottom: 'var(--s-4)' }}>{FR_ARTICLE.title}</h1>
            <p className="q-lede">{FR_ARTICLE.standfirst}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ height: 30, width: '62%', borderRadius: 8, background: 'var(--surface-3)' }} />
            <div style={{ height: 13, width: '86%', borderRadius: 999, background: 'var(--surface-2)' }} />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-10)' }}>
        {FR_STEPS.map((s, i) => {
          const captured = i < shots
          const prose = i < written
          return (
            <div key={i} className={captured ? 'q-fade-in' : undefined} style={{ display: 'flex', gap: 'var(--s-5)', opacity: captured ? 1 : 0.45, transition: 'opacity var(--dur-5) var(--ease)' }}>
              <StepNum n={i + 1} dim={!captured} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 'var(--s-3)' }}>
                  {prose
                    ? <h3 style={{ fontSize: 20, letterSpacing: '-.015em' }}>{s.h}</h3>
                    : <div style={{ height: 14, width: 210, borderRadius: 999, background: 'var(--surface-3)' }} />}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-4)', flex: 'none' }}>{s.at}</span>
                </div>
                {prose
                  ? <p style={{ fontSize: 16, color: 'var(--ink-2)', maxWidth: 'var(--measure-prose)', marginBottom: 'var(--s-4)' }}>{s.p}</p>
                  : <div style={{ marginBottom: 'var(--s-4)' }}><Bones lines={2} /></div>}
                <FrShot ratio={s.ratio} label={captured ? `frame at ${s.at}` : 'capturing…'} />
              </div>
            </div>
          )
        })}
      </div>

      {writing && <Micro style={{ marginTop: 'var(--s-8)' }}>Writing step {Math.min(written + 1, FR_STEPS.length)} of {FR_STEPS.length}</Micro>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Screen 4, assembled.
// ---------------------------------------------------------------------------
function Building({ onDone }) {
  const asked = FR_CLARIFICATIONS.filter((c) => c.asked)
  const [shots, setShots] = React.useState(0)
  const [answers, setAnswers] = React.useState({})
  const [note, setNote] = React.useState('')
  const [noteOpen, setNoteOpen] = React.useState(false)
  const [writing, setWriting] = React.useState(false)
  const [written, setWritten] = React.useState(0)

  React.useEffect(() => {
    if (shots >= FR_STEPS.length) return
    const t = setTimeout(() => setShots((s) => s + 1), shots === 0 ? 450 : 620)
    return () => clearTimeout(t)
  }, [shots])

  React.useEffect(() => {
    if (!writing) return
    if (written >= FR_STEPS.length) { const t = setTimeout(onDone, 900); return () => clearTimeout(t) }
    const t = setTimeout(() => setWritten((w) => w + 1), 380)
    return () => clearTimeout(t)
  }, [writing, written])

  const next = asked.findIndex((_, i) => !(i in answers))
  const current = next === -1 ? null : asked[next]
  const answeredList = asked.map((c, i) => ({ c, i, value: answers[i] })).filter(({ i }) => i in answers)
  const stage = writing ? 3 : shots >= FR_STEPS.length ? 3 : 2

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Bar
        left={<span style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--ink)' }}>
          <Wordmark height={19} />
          <span style={{ color: 'var(--ink-4)', fontSize: 15 }}>/</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-3)' }}>{FR_FILE.name} · {FR_FILE.dur}</span>
        </span>}
        right={<ThemeToggle />} />

      <div style={{ position: 'sticky', top: 60, zIndex: 'var(--z-sticky)', background: 'var(--bg)', padding: 'var(--s-5) var(--s-10) var(--s-5)' }}>
        <Progress value={writing ? (3 + written / FR_STEPS.length) / 4 : (2 + shots / FR_STEPS.length) / 4} style={{ marginBottom: 'var(--s-5)' }} />
        <StageRow stage={stage} paused={!writing} />
      </div>

      <main style={{ flex: 1, display: 'grid', gridTemplateColumns: '380px 1fr', gap: 'var(--s-14)', alignItems: 'start', padding: '0 var(--s-10) var(--s-24)', maxWidth: 1360, width: '100%', margin: '0 auto' }}>
        <div style={{ position: 'sticky', top: 190 }}>
          <Card variant="panel" pad>
            {writing ? (
              <>
                <AiTag>Writing your guide</AiTag>
                <p style={{ fontSize: 16, color: 'var(--ink-2)', marginTop: 'var(--s-4)' }}>
                  Thanks — that is everything I needed. Every step is editable the moment it lands, and you can change any answer later.
                </p>
              </>
            ) : (
              <>
                <AiTag>I read your recording</AiTag>
                <p style={{ fontSize: 16, color: 'var(--ink-2)', margin: 'var(--s-4) 0 var(--s-6)' }}>
                  Got <strong style={{ color: 'var(--ink)', fontWeight: 'var(--w-strong)' }}>{FR_STEPS.length} steps</strong>.{' '}
                  {asked.length === 1 ? 'One thing I couldn’t work out on my own.' : `${asked.length} things I couldn’t work out on my own.`}
                </p>

                <Answered items={answeredList} onChange={(i) => setAnswers((p) => { const n = { ...p }; delete n[i]; return n })} />

                {current
                  ? <QuestionCard key={next} c={current} index={next} total={asked.length}
                      onAnswer={(v) => setAnswers((p) => ({ ...p, [next]: v }))} />
                  : <p style={{ fontSize: 16, color: 'var(--ink-2)' }}>That’s everything I needed.</p>}

                <div style={{ height: 1, background: 'var(--rule)', margin: 'var(--s-7) 0 var(--s-5)' }} />

                <button onClick={() => setNoteOpen((o) => !o)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, font: 'inherit', fontSize: 14.5, fontWeight: 'var(--w-medium)', color: 'var(--ink-2)', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
                  <Icon name="chevron" size={15} rotate={noteOpen ? 0 : -90} />Anything else about this recording?
                </button>
                {noteOpen && (
                  <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={600}
                    placeholder="Brand new feature — nobody has seen this screen before."
                    style={{ marginTop: 'var(--s-4)' }} />
                )}

                {/* Present the whole time. Never disabled, never hidden behind the last
                    question: the pause has to be leaveable at any moment or it is a gate. */}
                <Button full size="lg" variant={current ? 'secondary' : 'primary'} onClick={() => setWriting(true)} style={{ marginTop: 'var(--s-6)' }}>
                  {current ? 'Skip the rest and write it' : 'Write my guide'}
                </Button>

                {shots < FR_STEPS.length && (
                  <p style={{ fontSize: 13.5, color: 'var(--ink-3)', marginTop: 'var(--s-4)', textAlign: 'center' }}>
                    Screenshots are still capturing — {shots} of {FR_STEPS.length}. Take your time.
                  </p>
                )}
              </>
            )}
          </Card>
        </div>

        <Assembling shots={shots} written={written} writing={writing} />
      </main>
    </div>
  )
}

Object.assign(window, { Building, AiTag, Assembling, QuestionCard })
