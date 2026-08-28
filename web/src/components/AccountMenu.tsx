import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { readTheme, setTheme, type Theme } from './ThemeToggle'

// The account menu, top-right, where the Sign out button used to be.
//
// Sign out was a standalone button sitting at the same weight as the things people use all
// day, which is backwards: it is the control you want once a week and never by accident.
// Behind an avatar it is one click further away and in the place every other product puts
// it. The dark-mode toggle comes with it for the same reason — a preference, not a tool.
//
// Built on the design system's Menu shape (.q-menu) rather than a bespoke popover: this is
// the third dropdown in the app and they should not each invent their own.

export default function AccountMenu({ onSignOut }: { onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const [theme, setThemeState] = useState<Theme>(readTheme)
  const wrap = useRef<HTMLDivElement>(null)

  // Click-away and Escape. Both, because a menu you can only close by clicking the trigger
  // again is a menu people leave open.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const dark = theme === 'dark'

  return (
    <div className="acct" ref={wrap}>
      <button
        className="acct-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="people" size={17} />
      </button>

      {open && (
        <div className="q-menu acct-menu" role="menu">
          {/* Applies on flip, like every switch item in the system — no Save, and no
              closing the menu to find out whether it took. */}
          <button
            className="q-menu-it"
            role="menuitemcheckbox"
            aria-checked={dark}
            onClick={() => {
              const next: Theme = dark ? 'light' : 'dark'
              setTheme(next)
              setThemeState(next)
            }}
          >
            <span className="q-menu-ic">
              <Icon name={dark ? 'sun' : 'moon'} size={17} />
            </span>
            <span style={{ flex: 1 }}>Dark mode</span>
            <span className={`q-sw${dark ? ' on' : ''}`} aria-hidden />
          </button>

          <div className="q-menu-sep" />

          <button
            className="q-menu-it"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
          >
            <span className="q-menu-ic">
              <Icon name="arrow" size={17} />
            </span>
            <span style={{ flex: 1 }}>Sign out</span>
          </button>
        </div>
      )}
    </div>
  )
}
