import React from 'react'
import { Icon } from '../core/Icon'

// The dashed rectangle is gone — it was the most dated shape in v1. The affordance is now an
// inset well with a LIFTED icon tile inside it: the tile is the only thing on the screen
// casting a shadow, so the eye goes there. Drag-over tints the well and draws a 1.5px inset
// ring, which is the one moment a "border" is justified because it means "release here".
export function Dropzone({ state = 'idle', title = 'Drop your recordings here', sub, children, onClick, style }) {
  if (state === 'loaded') {
    return <div className="q-dz q-dz--loaded" style={style}>{children}</div>
  }
  return (
    <div className={'q-dz' + (state === 'over' ? ' over' : '')} onClick={onClick} style={style} role="button" tabIndex={0}>
      <span className="q-dz-tile"><Icon name="film" size={24} /></span>
      <span className="q-dz-title">{title}</span>
      {sub && <span className="q-dz-sub">{sub}</span>}
    </div>
  )
}
