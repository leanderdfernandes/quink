How Quink says what's going on with an article.

```jsx
<State state="live" />
<State state="edits" sub="2" />
<State state="building" />
```

- `building` and `draft` are different facts and must never collapse into one label: one means "still being written", the other "finished, waiting for you".
- On a list, show state on **only the rows that aren't the norm** — forty "Draft" labels is noise. In v2's library, published and edited rows carry a state and plain drafts don't.
- Never wrap it in a pill or add a dot. That's the whole point of the component.
