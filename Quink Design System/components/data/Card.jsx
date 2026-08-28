import React from 'react'

// No border. A card is a raised surface: --surface-1 plus --e1 (plus the inner --edge light,
// which is what defines the edge in dark mode). `inset` goes the other way for wells.
export function Card({ children, pad, variant, interactive, className = '', as: Tag = 'div', ...rest }) {
  const cls = ['q-card',
    pad === true && 'q-card--pad',
    pad === 'lg' && 'q-card--pad-lg',
    variant === 'inset' && 'q-card--inset',
    variant === 'panel' && 'q-panel',
    interactive && 'q-card--interactive',
    className].filter(Boolean).join(' ')
  return <Tag className={cls} {...rest}>{children}</Tag>
}
