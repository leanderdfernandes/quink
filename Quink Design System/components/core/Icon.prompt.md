Every icon in Quink. Lucide paths at stroke 1.75, always `currentColor`.

```jsx
<Icon name="search" />
<Icon name="chevron" rotate={-90} size={15} />
```

The five **state glyphs** — `check-circle`, `dot-circle`, `arrow-up-circle`, `draft-circle`, `alert` — exist specifically to carry article state, which v2 says with a glyph instead of a coloured dot. Use `<State>` rather than composing them by hand.

No emoji, no icon font, no filled icons except the `dots` overflow glyph.
