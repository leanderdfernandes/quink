import React from 'react'
import { Icon } from '../core/Icon'

// v1's modal was centre-aligned with an icon tile above a title. v2 keeps the tile but goes
// LEFT-ALIGNED: centred body copy over five ragged lines is one of the things that read as
// amateurish, and a left rag with a real measure fixes it for free.
export function Sheet({ open = true, icon, done = false, title, lede, children, actions, onClose, width = 480 }) {
  React.useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape' && onClose) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="q-overlay" onClick={onClose}>
      <div className="q-sheet" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {icon && (
          <span className={'q-sheet-tile' + (done ? ' q-sheet-tile--done' : '')}>
            <Icon name={icon} size={22} />
          </span>
        )}
        {title && <h2>{title}</h2>}
        {lede && <p className="q-sheet-lede">{lede}</p>}
        {children}
        {actions && <div className="q-sheet-actions">{actions}</div>}
      </div>
    </div>
  )
}
