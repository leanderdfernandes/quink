The action control. Labels are sentence case and name the outcome.

```jsx
<Button size="lg">Build my guide</Button>
<Button variant="secondary" icon="folder-plus">New folder</Button>
<Button variant="ghost" icon="arrow-left">Help center</Button>
<Button variant="accent" icon="check">Publish changes</Button>
```

- One `primary` per view. `ghost` is the workhorse — toolbars, menus, anything beside a primary.
- `accent` (green) is reserved for completion. Using it as a second primary destroys the signal.
- A disabled button still needs a sentence saying when it opens; that copy rule survived from v1.
