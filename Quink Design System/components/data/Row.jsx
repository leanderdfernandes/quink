import React from 'react'
import { Icon } from '../core/Icon'

// One list row. Hairline rule between siblings (an ink mix, not a beige line), full-bleed
// hover fill, a chevron that fades in. Deliberately NO indent-on-hover: shifting text under
// the pointer was a novelty tic in v1.
export function Row({ title, desc, meta, state, thumb, actions, arrow = true, as, className = '', ...rest }) {
  const Tag = as || (rest.href ? 'a' : rest.onClick ? 'button' : 'div')
  return (
    <Tag className={'q-row ' + className} {...rest}>
      {thumb}
      <span className="q-row-main">
        <span className="q-row-title">{title}</span>
        {desc && <span className="q-row-desc">{desc}</span>}
      </span>
      {state}
      {meta}
      {actions && <span className="q-row-actions">{actions}</span>}
      {arrow && !actions && <span className="q-row-arw"><Icon name="chevron-right" size={16} /></span>}
    </Tag>
  )
}
