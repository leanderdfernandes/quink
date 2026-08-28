Every panel. Never a border, never a coloured left edge, never a gradient.

```jsx
<Card pad>…</Card>
<Card variant="inset" pad>A quieter region inside a card</Card>
<Card interactive pad>…</Card>
```

**Do not nest a Card inside a Card.** A quieter region inside one is `variant="inset"`; a list of things is `<Group>`. Nested bordered boxes were the main reason v1 felt cluttered.
