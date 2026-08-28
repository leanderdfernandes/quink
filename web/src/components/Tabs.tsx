import { useRef, type CSSProperties, type ReactNode } from 'react'

// A rail of exclusive VIEWS. Ported from the design system's components/core/Tabs.jsx —
// keep the two in step, and change the system's copy first.
//
// Not <Segmented>. That one is a mode switch for two or three options on ONE surface, and
// its sliding thumb is what says the options are a single control. Tabs address sections
// that each own a whole screen, so nothing slides: the active tab thickens a slice of the
// rule the rail already sits on.
//
// Roving tabindex and arrow keys, because a tab rail that only answers to the mouse is the
// most commonly broken accessible widget there is.

// The settings tabs, named once. This is also what the URL carries, so renaming a value
// breaks a link someone saved — add to it rather than rewording it.
export const SETTINGS_TABS = ['product', 'theming', 'domain', 'team'] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number]

export function isSettingsTab(v: string | undefined): v is SettingsTab {
  return !!v && (SETTINGS_TABS as readonly string[]).includes(v)
}

type Item<T extends string> = { value: T; label: string; count?: number }

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label = 'Sections',
  style,
}: {
  tabs: Item<T>[]
  value: T
  onChange: (value: T) => void
  label?: string
  style?: CSSProperties
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const idx = Math.max(
    0,
    tabs.findIndex((t) => t.value === value),
  )

  function go(next: number) {
    const i = (next + tabs.length) % tabs.length
    onChange(tabs[i].value)
    refs.current[i]?.focus()
  }

  return (
    <div
      className="q-tabs"
      role="tablist"
      aria-label={label}
      style={style}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          go(idx + 1)
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          go(idx - 1)
        } else if (e.key === 'Home') {
          e.preventDefault()
          go(0)
        } else if (e.key === 'End') {
          e.preventDefault()
          go(tabs.length - 1)
        }
      }}
    >
      {tabs.map((t, i) => (
        <button
          key={t.value}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="button"
          role="tab"
          id={`q-tab-${t.value}`}
          aria-selected={t.value === value}
          aria-controls={`q-panel-${t.value}`}
          // One tab in the rail is reachable by Tab; the arrows move between them.
          tabIndex={t.value === value ? 0 : -1}
          className="q-tab"
          onClick={() => onChange(t.value)}
        >
          {t.label}
          {t.count != null && <span className="q-tab-n">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

// Renders only the active panel. These are screens with their own fetches — People and
// Domain both hit the network on mount — so mounting all four to show one is four
// round-trips for three screens nobody is looking at.
export function TabPanel<T extends string>({
  tab,
  value,
  children,
}: {
  tab: T
  value: T
  children: ReactNode
}) {
  if (tab !== value) return null
  return (
    <div
      role="tabpanel"
      id={`q-panel-${tab}`}
      aria-labelledby={`q-tab-${tab}`}
      className="q-tabpanel"
    >
      {children}
    </div>
  )
}
