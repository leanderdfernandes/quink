Groups rows under a serif heading.

```jsx
<Group name="Getting started" count="4 articles" actions={<IconButton icon="pencil" label="Rename" />}>
  <Row … /><Row … />
</Group>
<Group name="Unfiled" count="41 articles" quiet empty="Nothing filed here yet." />
```

`quiet` replaces v1's dashed border for secondary groups — a sunken surface says "less important" without drawing a dotted rectangle.
