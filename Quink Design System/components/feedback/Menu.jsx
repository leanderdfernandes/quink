import React from 'react'
import { Icon } from '../core/Icon'
import { Switch } from '../core/Switch'

// Grouped dropdown. Items carry a consequence line; switch items apply on flip. Positioning
// is the caller's job — pass style, and use --z-menu so it lands above bars but below the
// floating selection toolbar.
export function Menu({ items = [], width, style }) {
  return (
    <div className="q-menu" style={{ width, ...style }} role="menu">
      {items.map((it, i) => {
        if (it.type === 'group') return <p key={i} className="q-menu-cap">{it.label}</p>
        if (it.type === 'divider') return <div key={i} className="q-menu-sep" />
        return (
          <button key={i} role="menuitem" disabled={it.disabled} onClick={it.onClick}
            className={'q-menu-it' + (it.critical ? ' q-menu-it--critical' : '')}>
            {it.icon && <span className="q-menu-ic"><Icon name={it.icon} size={17} /></span>}
            <span style={{ flex: 1 }}>
              {it.label}
              {it.sub && <small>{it.sub}</small>}
            </span>
            {it.switch != null && <Switch checked={it.switch} onChange={it.onToggle} label={String(it.label)} />}
          </button>
        )
      })}
    </div>
  )
}
