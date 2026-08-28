// Demo content for the app kit. Copy follows the v1 rules that survived: second person,
// sentence case, concrete numbers, consequence named.
const COPY = {
  freeLimit: '3 free guides from video, kept 30 days. Writing by hand is unlimited.',
  buildCta: 'Build my guide',
  recordingPlaceholder: 'e.g. Connecting a Postgres read replica and running the first sync',
  generatingReassure: "Hang tight — you can't lose this.",
  generatingTip: "You'll be able to swap any screenshot and edit every step before publishing.",
  buildDone: 'Your guide is ready. Every step is editable now, and you can publish.',
}

const STAGES = [
  { key: 'analyzing', label: 'Analyzing your recording' },
  { key: 'detecting', label: 'Detecting each action' },
  { key: 'capturing', label: 'Capturing screenshots' },
  { key: 'writing', label: 'Writing your guide' },
]

const KB = { name: 'Northwind Help', domain: 'docs.northwind.com', runs: 44 }

const FOLDERS = [
  {
    name: 'Getting started',
    articles: [
      { title: 'Connect a Postgres read replica', desc: 'Point Northwind at a replica so syncs never touch production traffic.', steps: 8, when: '12 Mar', state: 'live' },
      { title: 'Run your first sync', desc: 'Pick tables, set a schedule and watch the first run finish.', steps: 6, when: '9 Mar', state: 'edits', sub: '2' },
      { title: 'Invite your team', desc: 'Add teammates and set what they can do.', steps: 4, when: '2 Mar', state: 'live' },
      { title: 'A work in progress', desc: 'Still a draft.', steps: 3, when: '26d ago', state: 'draft' },
    ],
  },
  {
    name: 'Syncs & schedules',
    articles: [
      { title: 'Change a sync schedule', desc: 'Hourly, daily, or a cron expression of your own.', steps: 5, when: '11 Mar', state: 'live' },
      { title: 'Backfill a table', desc: 'Re-read history for one table without touching the others.', steps: 7, when: '4 Mar', state: 'draft' },
    ],
  },
]

const UNFILED = [
  { title: 'How to create a playlist', desc: 'Follow these steps to start building your own collection.', steps: 5, when: '26d ago', state: 'draft' },
  { title: 'Fix a permissions error', desc: 'The grant Northwind needs, and how to confirm it landed.', steps: 4, when: '21h ago', state: 'draft' },
]

const ARTICLE = {
  title: 'Connect a Postgres read replica',
  standfirst: 'A replica keeps Northwind off your production traffic. This takes about five minutes and one grant.',
  steps: [
    { h: 'Open Sources in the sidebar', p: 'From any screen, click Sources. If you have never added one, the list is empty and the button reads Add your first source.' },
    { h: 'Choose Postgres', p: 'Northwind connects to a replica the same way it connects to a primary — the difference is what you point it at, not which tile you pick.' },
    { h: 'Paste the replica host', p: 'Use the replica endpoint, not the primary. On managed Postgres this usually ends in -ro or -replica.' },
    { h: 'Create the read-only role', p: 'Run the grant Northwind shows you: GRANT SELECT ON ALL TABLES IN SCHEMA public TO northwind;' },
    { h: 'Allow our IP range', p: 'Copy the two addresses on this panel into your database firewall. Syncs fail with a timeout until they are allowed.' },
    { h: 'Test the connection', p: 'Click Test. A green result means Northwind can read the replica and see the tables you granted.' },
    { h: 'Save the source', p: 'Saving does not start a sync. Pick tables and a schedule next.' },
    { h: 'Untitled step', p: '' },
  ],
}

// No real product frames were supplied, so every screenshot slot renders an honest
// placeholder rather than a drawn approximation of a UI.
function Shot({ ratio = '16 / 10', label = 'screenshot', style }) {
  return (
    <div style={{ aspectRatio: ratio, background: 'var(--surface-2)', borderRadius: 'var(--r-md)', display: 'grid', placeItems: 'center', ...style }}>
      <span className="q-micro" style={{ color: 'var(--ink-4)' }}>{label}</span>
    </div>
  )
}

Object.assign(window, { COPY, STAGES, KB, FOLDERS, UNFILED, ARTICLE, Shot })
