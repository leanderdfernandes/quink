// Per-KB theming — the reader's one real constraint: THE PRIMARY COLOUR IS THE ONLY THING
// STORED. Every brand shade is mixed from it at render, so a customer picking one hex moves
// the band, links, tints, step rules and hover fills together.
//
// The v1 logic is preserved verbatim in spirit (WCAG-measured on-colour, oklab mixes); what
// changed is that it now writes into the v2 token names, so the reader and the authoring app
// are literally the same chassis with a different --brand.
const DEEP = 'oklch(16% 0.008 60)'

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

// White or warm near-black, whichever actually reads on this fill. A hardcoded white is
// right for teal and wrong for amber, which is why this is measured rather than assumed.
function onColor(hex) {
  const l = luminance(hex)
  return contrast(l, 1) >= contrast(l, 0.02) ? 'oklch(99% 0.004 0)' : 'oklch(19% 0.008 60)'
}

function themeVars(c) {
  const lighter = (p) => `color-mix(in oklab, ${c} ${100 - p}%, white)`
  const darker = (p) => `color-mix(in oklab, ${c} ${100 - p}%, black)`
  return {
    '--brand': c,
    '--brand-50': lighter(93), '--brand-100': lighter(84), '--brand-200': lighter(66),
    '--brand-300': lighter(46), '--brand-400': lighter(26), '--brand-500': darker(8),
    '--brand-600': c, '--brand-700': darker(17), '--brand-800': darker(32), '--brand-900': darker(52),
    '--brand-tint': `color-mix(in oklab, ${c} 9%, var(--bg))`,
    '--brand-wash': `color-mix(in oklab, ${c} 4.5%, var(--bg))`,
    '--brand-press': `color-mix(in oklab, ${c} 86%, ${DEEP})`,
    '--brand-ring': `color-mix(in oklab, ${c} 34%, transparent)`,
    '--brand-mark': `color-mix(in oklab, ${c} 17%, var(--surface-1))`,
    '--brand-deep': `color-mix(in oklab, ${c} 26%, ${DEEP})`,
    '--on-brand': onColor(c),
    '--on-deep': 'oklch(97% 0.004 205)',
  }
}

const KB = {
  name: 'Northwind Help',
  glyph: 'N',
  color: '#1f6e6b',
  headline: 'How can we help?',
  sub: 'Guides for connecting Northwind to your warehouse, inviting your team, and keeping syncs healthy.',
  domain: 'docs.northwind.com',
}

const CATEGORIES = [
  {
    id: 'getting-started',
    name: 'Getting started',
    desc: 'From an empty account to a first finished sync.',
    articles: [
      { id: 'read-replica', title: 'Connect a Postgres read replica', desc: 'Point Northwind at a replica so syncs never touch production traffic.', steps: 8, updated: '12 Mar' },
      { id: 'first-sync', title: 'Run your first sync', desc: 'Pick tables, set a schedule and watch the first run finish.', steps: 6, updated: '9 Mar' },
      { id: 'invite-team', title: 'Invite your team', desc: 'Everyone on your plan is included — there are no per-seat fees.', steps: 4, updated: '2 Mar' },
    ],
  },
  {
    id: 'syncs',
    name: 'Syncs & schedules',
    desc: 'Changing what runs, and when.',
    articles: [
      { id: 'schedule', title: 'Change a sync schedule', desc: 'Hourly, daily, or a cron expression of your own.', steps: 5, updated: '11 Mar' },
      { id: 'backfill', title: 'Backfill a table', desc: 'Re-read history for one table without touching the others.', steps: 7, updated: '4 Mar' },
    ],
  },
  {
    id: 'troubleshooting',
    name: 'Troubleshooting',
    desc: 'What to check, in the order worth checking it.',
    articles: [
      { id: 'stuck-sync', title: 'A sync is stuck on "queued"', desc: 'Four things to rule out before you write in.', steps: 6, updated: '14 Mar' },
      { id: 'permissions', title: 'Fix a permissions error', desc: 'The grant Northwind needs, and how to confirm it landed.', steps: 4, updated: '7 Mar' },
    ],
  },
]

const ARTICLE = {
  id: 'read-replica',
  category: 'Getting started',
  categoryId: 'getting-started',
  title: 'Connect a Postgres read replica',
  standfirst: 'A replica keeps Northwind off your production traffic. This takes about five minutes and one grant.',
  meta: ['8 steps', 'Updated 12 Mar'],
  steps: [
    { h: 'Open Sources in the sidebar', p: 'From any screen, click <b>Sources</b>. If you have never added one, the list is empty and the button reads <b>Add your first source</b>.', shape: 'wide' },
    { h: 'Choose Postgres', p: 'Northwind connects to a replica the same way it connects to a primary — the difference is what you point it at, not which tile you pick.', shape: 'tall' },
    { h: 'Paste the replica host', p: 'Use the replica endpoint, not the primary. On managed Postgres this usually ends in <code>-ro</code> or <code>-replica</code>.', shape: 'wide' },
    { h: 'Create the read-only role', p: 'Run the grant Northwind shows you: <code>GRANT SELECT ON ALL TABLES IN SCHEMA public TO northwind;</code>', shape: 'wide' },
    { h: 'Allow our IP range', p: 'Copy the two addresses on this panel into your database firewall. Syncs fail with a timeout until they are allowed.', shape: 'tall' },
    { h: 'Test the connection', p: 'Click <b>Test</b>. A green result means Northwind can read the replica and can see the tables you granted.', shape: 'wide' },
    { h: 'Save the source', p: 'Saving does not start a sync. Pick tables and a schedule next — see <a href="#">Run your first sync</a>.', shape: 'wide' },
    { h: 'Check the first run', p: 'The run appears in <b>Activity</b> within a minute. A finished run shows the row count it read.', shape: 'wide' },
  ],
}

const ALL = CATEGORIES.flatMap((c) => c.articles.map((a) => ({ ...a, cat: c.name, catId: c.id })))

// No real product frames were supplied, so screenshot slots are honest placeholders rather
// than a drawn approximation of somebody's UI.
function Shot({ shape = 'wide', label = 'screenshot' }) {
  return (
    <div style={{
      aspectRatio: shape === 'tall' ? '3 / 4' : '16 / 10',
      background: 'var(--surface-2)', display: 'grid', placeItems: 'center',
    }}>
      <span className="q-micro" style={{ color: 'var(--ink-4)' }}>{label}</span>
    </div>
  )
}

Object.assign(window, { themeVars, KB, CATEGORIES, ARTICLE, ALL, Shot })
