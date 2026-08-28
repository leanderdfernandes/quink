import React from 'react'

// Determinate wherever the real stage data allows it. v2 has no spinner and no pulsing dot:
// a 3px rule that actually tracks the four pipeline stages tells the truth, and the truth is
// the reassurance.
export function Progress({ value, indeterminate = false, style }) {
  return (
    <div className={'q-progress' + (indeterminate ? ' q-progress--indeterminate' : '')} style={style}
      role="progressbar" aria-valuenow={indeterminate ? undefined : Math.round(value * 100)}>
      <div className="q-progress-fill" style={{ width: indeterminate ? undefined : (value * 100).toFixed(1) + '%' }} />
    </div>
  )
}
