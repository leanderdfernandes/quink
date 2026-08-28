import React from 'react'
import { Icon } from './Icon'

// v2: no borders anywhere. A secondary button is a RAISED NEUTRAL SURFACE, a ghost button
// has no surface at rest. Hover deepens the fill and lifts the shadow one step; press
// settles 1.5%. Nothing recolours a border, because nothing has one.
export function Button({ children, variant = 'primary', size, icon, iconAfter, pill, full, as, className = '', ...rest }) {
  const Tag = as || (rest.href ? 'a' : 'button')
  const cls = ['q-btn',
    variant !== 'primary' && 'q-btn--' + variant,
    size && 'q-btn--' + size,
    pill && 'q-btn--pill',
    full && 'q-btn--full',
    className].filter(Boolean).join(' ')
  const iconSize = size === 'lg' ? 19 : size === 'sm' ? 15 : 17
  return (
    <Tag className={cls} {...rest}>
      {icon && <Icon name={icon} size={iconSize} />}
      {children}
      {iconAfter && <Icon name={iconAfter} size={iconSize} />}
    </Tag>
  )
}
