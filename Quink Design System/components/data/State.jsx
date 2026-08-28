import React from 'react'
import { Icon } from '../core/Icon'

// This component is the direct answer to "the dots and pills give it an AI-generated feel".
// State is now a GLYPH plus a weighted label, with no container: colour and icon carry the
// meaning, and nothing gets a coloured bubble it didn't earn.
const MAP = {
  live: { icon: 'check-circle', label: 'Published', cls: 'q-state--live' },
  draft: { icon: 'draft-circle', label: 'Draft', cls: '' },
  unlisted: { icon: 'eye-off', label: 'Unlisted', cls: '' },
  edits: { icon: 'arrow-up-circle', label: 'Unpublished edits', cls: 'q-state--edits' },
  building: { icon: 'sparkle', label: 'Writing your guide', cls: 'q-state--building' },
  failed: { icon: 'alert', label: "Couldn't finish", cls: 'q-state--failed' },
  saving: { icon: 'dot-circle', label: 'Saving', cls: '' },
}

export function State({ state = 'draft', label, sub, size = 15, style }) {
  const m = MAP[state] || MAP.draft
  return (
    <span className={'q-state ' + m.cls} style={style}>
      <Icon name={m.icon} size={size} />
      {label || m.label}
      {sub && <span className="q-state-sub">{sub}</span>}
    </span>
  )
}
