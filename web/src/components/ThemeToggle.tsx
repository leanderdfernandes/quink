import { useEffect, useState } from 'react'
import Icon from './Icon'

const KEY = 'quink-theme'
export type Theme = 'light' | 'dark'

// Exported so AccountMenu drives the same preference. Two components each keeping their
// own copy of "is it dark" is how one of them ends up showing the wrong icon.
export function readTheme(): Theme {
  return (
    read() ??
    (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  )
}

export function setTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* private mode */
  }
}

function read(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    // Private mode. Not an error — the OS preference is a fine answer.
    return null
  }
}

// Applied once at startup, BEFORE React paints, so a dark-mode user never sees a white
// flash — and applied to the reader too, which has no toggle of its own.
//
// The token layer switches on data-theme alone (ds/tokens/colors.css), deliberately: one
// mechanism, so no component ever has to ask which theme it is in. That makes resolving the
// OS preference this function's job rather than the stylesheet's. With nothing stored we
// follow the OS and keep following it — a viewer who flips their system theme mid-read
// should not have to reload the help center they are in the middle of.
export function applyStoredTheme() {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
  const apply = () =>
    document.documentElement.setAttribute(
      'data-theme',
      read() ?? (mq?.matches ? 'dark' : 'light'),
    )
  apply()
  mq?.addEventListener('change', apply)
}

// v2 ships light and dark, both fully tokenised. The toggle writes data-theme on <html> and
// remembers the choice; with no stored choice it follows the OS.
export default function ThemeToggle({ className = '' }: { className?: string } = {}) {
  const [theme, setTheme] = useState<Theme>(
    () =>
      read() ??
      (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      /* private mode */
    }
  }, [theme])

  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      className={`q-ib ${className}`.trim()}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => setTheme(next)}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
    </button>
  )
}
