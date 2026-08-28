import React from 'react'

// Initials only — Quink stores no profile photos. Colour is derived from the name so the same
// person is always the same colour without storing one.
const HUES = [205, 158, 72, 300, 25, 250]
function hueFor(name = '') {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997
  return HUES[h % HUES.length]
}

export function AvatarStack({ people = [], max = 4, size = 28, style }) {
  const shown = people.slice(0, max)
  const rest = people.length - shown.length
  return (
    <span className="q-avs" style={style}>
      {shown.map((p, i) => {
        const name = typeof p === 'string' ? p : p.name
        return (
          <span key={i} className="q-av" title={name}
            style={{ background: `oklch(48% 0.09 ${hueFor(name)})`, width: size, height: size, fontSize: Math.round(size * 0.4) }}>
            {name.trim().charAt(0).toUpperCase()}
          </span>
        )
      })}
      {rest > 0 && <span className="q-av q-av--more" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>+{rest}</span>}
    </span>
  )
}
