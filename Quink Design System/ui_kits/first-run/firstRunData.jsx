// First-run kit data. Every user-facing sentence here is either copied verbatim from
// web/src/lib/config.ts (COPY.wall*) and web/src/lib/clarifications.ts (EVIDENCE /
// QUESTION / FALLBACK templates), or written to those templates with this recording's
// slot values filled in. Nothing here is invented voice.

const FR_COPY = {
  freeLimit: '3 free guides from video, kept 30 days. Writing by hand is unlimited.',
  buildCta: 'Build my guide',
  recordingPlaceholder: 'e.g. Connecting a Postgres read replica and running the first sync',
  wallHeading: 'Create a free account to build your guide.',
  wallNoCard: 'Free accounts include 3 video guides, no card needed.',
  wallFilePill: '✓ your recording is ready',
  wallFootnote: 'Keeps the free tier free for everyone.',
  retention: 'We keep your recording for 30 days so you can check the guide against it, then we delete it.',
}

const FR_FILE = { name: 'replica-setup.mov', size: '38.2 MB', dur: '4:12' }

const FR_STAGES = [
  { key: 'analyzing', label: 'Analyzing your recording' },
  { key: 'detecting', label: 'Detecting each action' },
  { key: 'capturing', label: 'Capturing screenshots' },
  { key: 'writing', label: 'Writing your guide' },
]

// The eight actions the pipeline detected. `at` is the timestamp in the recording — it is
// what the step spine shows before any prose exists, and what makes the wait legible.
const FR_STEPS = [
  { at: '0:03', h: 'Open Sources in the sidebar', p: 'From any screen, click Sources. If you have never added one, the list is empty and the button reads Add your first source.', ratio: '16 / 10' },
  { at: '0:21', h: 'Choose Postgres', p: 'Northwind connects to a replica the same way it connects to a primary — the difference is what you point it at, not which tile you pick.', ratio: '16 / 10' },
  { at: '0:42', h: 'Paste the replica host', p: 'Use the replica endpoint, not the primary. On managed Postgres this usually ends in -ro or -replica.', ratio: '16 / 9' },
  { at: '1:16', h: 'Create the read-only role', p: 'Run the grant Northwind shows you: GRANT SELECT ON ALL TABLES IN SCHEMA public TO northwind;', ratio: '16 / 9' },
  { at: '1:54', h: 'Allow our IP range', p: 'Copy the two addresses on this panel into your database firewall. Syncs fail with a timeout until they are allowed.', ratio: '16 / 10' },
  { at: '2:18', h: 'Test the connection', p: 'Click Test connection. A green result means Northwind can read the replica and see the tables you granted.', ratio: '16 / 10' },
  { at: '2:47', h: 'Save the source', p: 'Saving does not start a sync. Pick tables and a schedule next.', ratio: '16 / 10' },
  { at: '3:05', h: 'Pick tables and a schedule', p: 'Choose the tables you want and how often they refresh. Hourly is the default.', ratio: '16 / 9' },
]

const FR_ARTICLE = {
  title: 'Connect a Postgres read replica',
  standfirst: 'A replica keeps Northwind off your production traffic. This takes about five minutes and one grant.',
}

// The four clarification types the enum allows, each with this recording's slots.
// `asked` = raised during the run (the pause). The rest are carried into the editor as
// open clarifications — the questions the run never got to.
const FR_CLARIFICATIONS = [
  {
    type: 'variable_value', asked: true, at: '0:42', step: 3,
    evidence: 'Typed into “Host”',
    question: 'Should readers type “northwind-ro.eu-west-1.rds.amazonaws.com” too, or their own?',
    options: [{ id: 'own', label: 'Their own value' }, { id: 'exact', label: 'This exact value' }],
    def: 'own',
    fallback: 'I’ll treat it as their own value.',
  },
  {
    type: 'missing_prerequisite', asked: true, at: '0:03', step: 1,
    evidence: 'The recording starts part-way in',
    question: 'Readers won’t start where you did — the replica was already provisioned. Mention it?',
    options: [{ id: 'add', label: 'Add it as a prerequisite' }, { id: 'omit', label: 'Leave it out' }],
    def: 'add',
    fallback: 'I’ll leave it out.',
  },
  {
    type: 'element_name', asked: true, at: '2:18', step: 6,
    evidence: 'A control I couldn’t read: the blue button, top right',
    question: 'What is the blue button, top right called?',
    options: [{ id: 'test', label: 'Test connection' }, { id: 'save', label: 'Save source' }],
    def: 'test', freeText: true,
    fallback: 'I’ll describe it by what it does.',
  },
  {
    type: 'flow_split', asked: false, at: '3:05', step: 8,
    evidence: 'The recording changes tack here',
    question: 'This looks like two things: connecting the replica, then scheduling the first sync. One guide, or two?',
    options: [{ id: 'one', label: 'Keep it as one guide' }, { id: 'two', label: 'Split into two' }],
    def: 'one',
    fallback: 'I’ll keep it as one guide.',
  },
]

// No real product frames were supplied, so every screenshot slot is an honest placeholder.
function FrShot({ ratio = '16 / 10', label, style }) {
  return (
    <div style={{ aspectRatio: ratio, background: 'var(--surface-2)', borderRadius: 'var(--r-md)', display: 'grid', placeItems: 'center', ...style }}>
      <span className="q-micro" style={{ color: 'var(--ink-4)' }}>{label}</span>
    </div>
  )
}

// The step-number motif: a 26px column, 2px brand top rule, mono tabular index. The one
// v1 shape kept unchanged, because it is what makes an author recognise their own article
// on the published site.
function StepNum({ n, dim }) {
  return (
    <div style={{ width: 26, flex: 'none', paddingTop: 2, opacity: dim ? 0.4 : 1, transition: 'opacity var(--dur-4) var(--ease)' }}>
      <div style={{ height: 2, background: 'var(--brand)', borderRadius: 1 }} />
      <span style={{ display: 'block', marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--ink-3)' }}>{String(n).padStart(2, '0')}</span>
    </div>
  )
}

// Skeleton prose. One slow sweep on arrival, never a loop.
function Bones({ lines = 3 }) {
  const w = ['92%', '78%', '54%', '84%']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{ height: i === 0 ? 13 : 10, width: w[i % 4], borderRadius: 999, background: 'var(--surface-3)' }} />
      ))}
    </div>
  )
}

Object.assign(window, { FR_COPY, FR_FILE, FR_STAGES, FR_STEPS, FR_ARTICLE, FR_CLARIFICATIONS, FrShot, StepNum, Bones })
