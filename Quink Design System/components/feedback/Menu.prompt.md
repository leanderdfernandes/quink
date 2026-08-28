```jsx
<Menu style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 'var(--z-menu)' }} items={[
  { type: 'group', label: 'This article' },
  { label: 'Copy link', icon: 'link' },
  { label: 'View live page', icon: 'external' },
  { type: 'divider' },
  { label: 'Hide from search and browsing', sub: 'Stays live at its link.', icon: 'eye-off', switch: hidden, onToggle: setHidden },
  { type: 'divider' },
  { label: 'Unpublish', sub: 'Takes it off your help center. Keeps the content.', icon: 'eye-off', critical: true },
]} />
```

Destructive items sit last, after a divider, each with a `sub` saying exactly what survives.
