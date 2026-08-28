import React from 'react'

export function Switch({ checked = false, onChange, label, style, ...rest }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label}
      className={'q-sw' + (checked ? ' on' : '')}
      onClick={() => onChange && onChange(!checked)} style={style} {...rest} />
  )
}
