Four or more exclusive sections, each owning a whole screen.

```jsx
<Tabs tabs={[
  { value: 'product', label: 'Product & Context' },
  { value: 'theming', label: 'Theming' },
  { value: 'domain', label: 'Domain' },
  { value: 'team', label: 'Team', count: 3 },
]} value={tab} onChange={setTab} label="Settings sections" />

<TabPanel tab="product" value={tab}><ProductContext /></TabPanel>
```

Not `Segmented`. That one is a mode switch for two or three options on ONE surface, and its
sliding thumb is the signal that the options are one control. A tab rail changes the page,
so nothing slides — the active tab takes an ink underline on the rule the rail sits on.

`TabPanel` renders only the active panel. These are screens with their own fetches; mounting
all four to show one is four round-trips for no reason.

Arrow keys move between tabs and only the active tab is in the page's tab order, which is
what the pattern requires and what hand-rolled tab rails almost always miss.
