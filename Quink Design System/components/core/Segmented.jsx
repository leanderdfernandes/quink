import React from 'react'

// A sliding thumb, not a filled active segment. The movement is what tells you the options
// are one control — and it is the one place v2 spends a spring.
export function Segmented({ options = [], value, onChange, style }) {
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
  const refs = React.useRef([])
  const [thumb, setThumb] = React.useState({ left: 3, width: 0 })
  const idx = Math.max(0, opts.findIndex((o) => o.value === value))

  React.useEffect(() => {
    const el = refs.current[idx]
    if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth })
  }, [idx, options.length])

  return (
    <div className="q-seg" style={style} role="group">
      <span className="q-seg-thumb" style={{ transform: `translateX(${thumb.left - 3}px)`, width: thumb.width || undefined, opacity: thumb.width ? 1 : 0 }} />
      {opts.map((o, i) => (
        <button key={o.value} ref={(el) => (refs.current[i] = el)} type="button"
          aria-pressed={value === o.value} onClick={() => onChange && onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
