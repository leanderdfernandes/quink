import React from 'react'

// A rail of exclusive VIEWS, which is not the same control as <Segmented>.
//
// Segmented is a mode switch for two or three options on one surface — it animates a thumb,
// and the movement is the point. Tabs address four or more sections that each own a whole
// screen, so the movement would be the wrong signal: nothing slides, the page changes. The
// active tab is marked by an ink underline on the rule the rail already sits on, which is
// the one place v2 spends a hairline on a control.
//
// Roving tabindex and arrow keys, because a tab rail that only answers to the mouse is the
// most commonly broken accessible widget there is.
export function Tabs({ tabs = [], value, onChange, label = 'Sections', style }) {
  const items = tabs.map((t) => (typeof t === 'string' ? { value: t, label: t } : t))
  const refs = React.useRef([])
  const idx = Math.max(0, items.findIndex((t) => t.value === value))

  const go = (next) => {
    const i = (next + items.length) % items.length
    onChange && onChange(items[i].value)
    refs.current[i]?.focus()
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1) }
    else if (e.key === 'Home') { e.preventDefault(); go(0) }
    else if (e.key === 'End') { e.preventDefault(); go(items.length - 1) }
  }

  return (
    <div className="q-tabs" role="tablist" aria-label={label} style={style} onKeyDown={onKeyDown}>
      {items.map((t, i) => (
        <button
          key={t.value}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          role="tab"
          id={`q-tab-${t.value}`}
          aria-selected={t.value === value}
          aria-controls={`q-panel-${t.value}`}
          // One tab in the rail is reachable by Tab; the arrows move between them.
          tabIndex={t.value === value ? 0 : -1}
          className="q-tab"
          onClick={() => onChange && onChange(t.value)}
        >
          {t.label}
          {t.count != null && <span className="q-tab-n">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

// The panel half. Rendering only the active panel is deliberate: these are whole screens
// with their own fetches, and mounting four of them to show one is how a settings screen
// starts costing four round-trips.
export function TabPanel({ tab, value, children }) {
  if (tab !== value) return null
  return (
    <div role="tabpanel" id={`q-panel-${tab}`} aria-labelledby={`q-tab-${tab}`} className="q-tabpanel">
      {children}
    </div>
  )
}
