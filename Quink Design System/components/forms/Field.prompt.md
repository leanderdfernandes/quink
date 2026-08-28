Wraps every control. Stacked fields space themselves (20px), so don't add margins.

```jsx
<Field label="Product name" hint="The name your customers use."><Input defaultValue="Northwind" /></Field>
<Field label="Audience" optional><Select options={['New users','Admins']} /></Field>
```

Mark **optional**, never required — in Quink's context form exactly one field is required, so flagging the other three is the shorter sentence.
