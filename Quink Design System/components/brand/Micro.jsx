import React from 'react'

// v1's tracked-uppercase brand-coloured eyebrow is gone: next to a serif headline it read as
// a second, competing voice. v2's micro-label is mono, muted and small — metadata, not
// a herald. Used for rail captions, group counts, article meta.
export function Micro({ children, as: Tag = 'p', color, style, ...rest }) {
  return (
    <Tag className="q-micro" style={{ color, ...style }} {...rest}>{children}</Tag>
  )
}
