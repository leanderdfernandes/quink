Drop it in a top bar. Nothing else is needed — the token layer handles both themes.

```jsx
<ThemeToggle />
```

Every colour in the system is defined for both themes, so a component never checks the theme itself. If you find yourself branching on theme in a component, a token is missing.
