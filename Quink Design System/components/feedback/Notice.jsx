import React from 'react'
import { Icon } from '../core/Icon'

// Replaces v1's amber banner. Same job, but it is a TINTED SURFACE with an icon rather than
// a bordered strip: the border-bottom-plus-amber-fill combination was the most 2000s shape in
// the old system. `bar` is the full-width variant for app-level warnings.
const ICONS = { neutral: 'clock', caution: 'clock', brand: 'sparkle', critical: 'alert' }

export function Notice({ children, tone = 'neutral', icon, action, onDismiss, bar = false, style }) {
  return (
    <div className={'q-notice' + (tone !== 'neutral' ? ' q-notice--' + tone : '') + (bar ? ' q-notice--bar' : '')} style={style}>
      <Icon name={icon || ICONS[tone]} size={17} />
      <span className="q-notice-text">{children}</span>
      {action}
      {onDismiss && (
        <button className="q-ib q-ib--sm" onClick={onDismiss} aria-label="Dismiss" style={{ color: 'inherit', marginRight: -6 }}>
          <Icon name="x" size={15} />
        </button>
      )}
    </div>
  )
}
