import React from 'react'

export function Field({ label, hint, optional = false, htmlFor, children, style }) {
  return (
    <div className="q-field" style={style}>
      {label && <label className="q-label" htmlFor={htmlFor}>{label}{optional && <span> · optional</span>}</label>}
      {children}
      {hint && <p className="q-hint">{hint}</p>}
    </div>
  )
}
