import React from 'react'

// Replaces v1's folder card. A group is a heading ON the page plus its rows on one raised
// surface — not a bordered box inside a bordered box. The heading is the serif.
export function Group({ name, count, actions, children, empty, quiet = false, style }) {
  return (
    <section className={'q-group' + (quiet ? ' q-group--quiet' : '')} style={style}>
      <header className="q-group-hd">
        <h3 className="q-group-name">{name}</h3>
        {count != null && <span className="q-group-n">{count}</span>}
        {actions && <span className="q-group-actions">{actions}</span>}
      </header>
      <div className="q-group-body">
        {children}
        {empty && <p className="q-group-empty">{empty}</p>}
      </div>
    </section>
  )
}
