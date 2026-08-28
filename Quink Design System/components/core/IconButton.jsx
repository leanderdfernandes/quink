import React from 'react'
import { Icon } from './Icon'

// Ghost by default — a square of hover fill, no border, no resting surface. `raised` is for
// icon buttons that float on content (undo/redo in the editor bar, screenshot swap).
export function IconButton({ icon, label, size, tone, raised, iconSize, className = '', ...rest }) {
  const cls = ['q-ib', size === 'sm' && 'q-ib--sm', raised && 'q-ib--raised',
    tone === 'critical' && 'q-ib--critical', className].filter(Boolean).join(' ')
  return (
    <button className={cls} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={iconSize || (size === 'sm' ? 15 : 17)} />
    </button>
  )
}
