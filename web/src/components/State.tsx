import type { CSSProperties } from 'react'
import Icon from './Icon'

// Article state, said the v2 way: an icon glyph plus a weighted label, with NO container.
//
// v1 put a coloured dot inside a bordered pill on every row. At list scale that became forty
// bubbles competing with forty titles, which is precisely what read as generated rather than
// designed. Colour and glyph carry the meaning here; nothing gets a bubble it didn't earn.
//
// The other half of the rule lives at the call site: show a state only on rows that are NOT
// the norm. In the library, published and edited rows carry one; plain drafts don't.
const MAP = {
  live: { icon: 'check-circle', label: 'Published', cls: 'q-state--live' },
  draft: { icon: 'draft-circle', label: 'Draft', cls: '' },
  unlisted: { icon: 'eye-off', label: 'Unlisted', cls: '' },
  edits: { icon: 'arrow-up-circle', label: 'Unpublished edits', cls: 'q-state--edits' },
  building: { icon: 'sparkle', label: 'Writing your guide', cls: 'q-state--building' },
  // The run is holding the write stage for an answer. Same clock and same caution ink as
  // the build bar's held phase, so the two surfaces say the pause the same way. It reuses
  // --edits' class rather than forking the vendored ds/components.css for an ink that is
  // already defined there; if it ever needs its own colour, add the token upstream in
  // `Quink Design System/` and re-copy (CLAUDE.md §12).
  waiting: { icon: 'clock', label: 'Waiting for your answer', cls: 'q-state--edits' },
  failed: { icon: 'alert', label: 'Couldn’t finish', cls: 'q-state--failed' },
  saving: { icon: 'dot-circle', label: 'Saving', cls: '' },
} as const

export type StateKind = keyof typeof MAP

export default function State({
  state = 'draft',
  label,
  sub,
  size = 15,
  className = '',
  style,
  role,
}: {
  state?: StateKind
  label?: string
  sub?: string | null
  size?: number
  className?: string
  style?: CSSProperties
  role?: string
}) {
  const m = MAP[state] ?? MAP.draft
  return (
    <span className={`q-state ${m.cls} ${className}`.trim()} style={style} role={role}>
      <Icon name={m.icon} size={size} />
      {label ?? m.label}
      {sub && <span className="q-state-sub">{sub}</span>}
    </span>
  )
}
