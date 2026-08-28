import React from 'react'
import { Icon } from '../core/Icon'

// Filled, not outlined. At rest it is an inset well (--surface-2); on focus it lifts to
// --surface-1 with an inset ring. That inversion — sinking at rest, rising on focus — is
// what makes v2's fields feel physical instead of drawn.
export function Input({ search = false, className = '', style, ...rest }) {
  if (search) {
    return (
      <div className="q-search" style={style}>
        <Icon name="search" size={17} />
        <input type="search" className={'q-input ' + className} {...rest} />
      </div>
    )
  }
  return <input type="text" className={'q-input ' + className} style={style} {...rest} />
}
