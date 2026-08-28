import React from 'react'

// The step screenshot at rail scale. Landscape by default now (recordings are landscape);
// `tall` is the portrait/phone case. A missing frame is a state, not a gap.
export function Thumb({ src, index, tall = false, active = false, alt = '', style, ...rest }) {
  const cls = ['q-thumb', tall && 'q-thumb--tall', !src && 'q-thumb--empty', active && 'is-active'].filter(Boolean).join(' ')
  return (
    <span className={cls} style={style} {...rest}>
      {src ? <img src={src} alt={alt} /> : <span className="q-thumb-n">{index}</span>}
    </span>
  )
}
