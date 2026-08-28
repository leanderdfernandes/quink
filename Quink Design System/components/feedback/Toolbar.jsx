import React from 'react'
import { Icon } from '../core/Icon'

// The floating selection toolbar — and the fix for a real v1 bug: it used to land underneath
// other controls. Two things prevent that here.
//
// 1. It sits at --z-toolbar, above every persistent control in the app.
// 2. `flip` places it BELOW the selection when there isn't room above, so it never has to
//    overlap the top bar in the first place. The caller passes the measured rect; the
//    component owns the decision.
//
// The third half of the fix isn't in this file: put .q-quiet-tools on the editor canvas while
// a toolbar is open, and every hover-revealed control fades out instead of fighting it.
const SAFE_TOP = 64

export function Toolbar({ items = [], rect, style }) {
  const flip = rect ? rect.top < SAFE_TOP + 52 : false
  const pos = rect
    ? { left: rect.left + rect.width / 2, top: flip ? rect.bottom + 10 : rect.top - 10, transform: flip ? 'translate(-50%, 0)' : 'translate(-50%, -100%)' }
    : {}
  return (
    <div className="q-toolbar" style={{ ...pos, ...style }} role="toolbar">
      {items.map((it, i) =>
        it.type === 'divider' ? (
          <span key={i} className="q-toolbar-sep" />
        ) : (
          <button key={i} className={it.on ? 'on' : undefined} onClick={it.onClick} aria-label={it.label} title={it.label} aria-pressed={it.on}>
            {it.icon ? <Icon name={it.icon} size={16} /> : it.label}
          </button>
        ),
      )}
    </div>
  )
}
