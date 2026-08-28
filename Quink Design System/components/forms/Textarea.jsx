import React from 'react'

export function Textarea({ className = '', ...rest }) {
  return <textarea className={'q-textarea ' + className} {...rest} />
}
