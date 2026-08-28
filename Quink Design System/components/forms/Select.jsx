import React from 'react'
import { Icon } from '../core/Icon'

export function Select({ options = [], className = '', style, ...rest }) {
  return (
    <span style={{ position: 'relative', display: 'block', ...style }}>
      <select className={'q-select ' + className} {...rest}>
        {options.map((o) => {
          const value = typeof o === 'string' ? o : o.value
          const label = typeof o === 'string' ? o : o.label
          return <option key={value} value={value}>{label}</option>
        })}
      </select>
      <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', pointerEvents: 'none' }}>
        <Icon name="chevron" size={15} />
      </span>
    </span>
  )
}
