Appears on text selection inside the editor; disappears when the selection clears.

```jsx
<Toolbar rect={selRect} items={[
  { icon: 'bold', label: 'Bold', on: marks.bold, onClick: toggleBold },
  { icon: 'italic', label: 'Italic', on: marks.italic },
  { icon: 'link', label: 'Link' },
  { type: 'divider' },
  { icon: 'sparkle', label: 'Rewrite this' },
]} />
```

**Always** add `q-quiet-tools` to the editor canvas while it's open. That is what stops it colliding with the per-step hover controls — the exact complaint against v1. The toolbar owns `--z-toolbar`; nothing else may use it.
