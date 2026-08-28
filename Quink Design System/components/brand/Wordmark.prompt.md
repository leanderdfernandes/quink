The Quink logotype — use it wherever the product identifies itself (top bars, marketing nav, reader footer "Made with Quink").

```jsx
<Wordmark height={22} />
<Wordmark height={26} tone="light" />   {/* on ink or brand fills */}
```

- `tone="current"` (default) inherits `color`, so it works inside a coloured container without a second rule.
- The bolt stays `#2F7D57` in every tone. That is intentional: in the wordmark the bolt is a *letter*, not a UI element.
- For the bolt alone (build-bar leading edge, favicon-scale marks) use `<Bolt>`, which *does* inherit currentColor.
- Never re-letterspace, outline, or recolour the letters to the brand teal.
