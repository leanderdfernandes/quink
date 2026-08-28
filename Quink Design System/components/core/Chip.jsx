import React from 'react'

// The only surviving pill, and it earns it: a chip is a CONTROL. Selected state is an ink
// fill (not brand) so a row of chips doesn't compete with the primary button beside it.
export function Chip({ children, count, on = false, className = '', ...rest }) {
  return (
    <button type="button" className={'q-chip' + (on ? ' on' : '') + (className ? ' ' + className : '')} aria-pressed={on} {...rest}>
      {children}
      {count != null && <span className="q-chip-n">{count}</span>}
    </button>
  )
}
