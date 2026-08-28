import React from 'react'
import { BOLT_PATH } from './Wordmark'

// The mark on its own, inheriting currentColor — unlike the wordmark's bolt, which keeps
// its green because there it is a letter in a logo rather than a UI element.
export function Bolt({ height = 11, style, ...rest }) {
  return (
    <svg height={height} viewBox="224 15 57 137" fill="none" aria-hidden style={{ display: 'block', ...style }} {...rest}>
      <path fill="currentColor" d={BOLT_PATH} />
    </svg>
  )
}
