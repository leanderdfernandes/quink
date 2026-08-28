import React from 'react'
import { Icon } from '../core/Icon'

// v2 ships light + dark. The toggle writes data-theme on <html> and remembers the choice;
// with no stored choice it follows the OS.
export function ThemeToggle({ target, storageKey = 'quink-theme' }) {
  const root = () => target || document.documentElement
  const [theme, setTheme] = React.useState(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved === 'light' || saved === 'dark') return saved
    } catch (e) { /* private mode */ }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  React.useEffect(() => {
    root().setAttribute('data-theme', theme)
    try { localStorage.setItem(storageKey, theme) } catch (e) { /* private mode */ }
  }, [theme])

  return (
    <button className="q-ib" aria-label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
    </button>
  )
}
