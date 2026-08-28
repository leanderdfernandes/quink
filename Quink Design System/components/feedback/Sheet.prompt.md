```jsx
<Sheet icon="globe" title="Publish to your help center"
  lede="It'll be live at docs.northwind.com/getting-started in a few seconds."
  actions={<><Button>Publish</Button><Button variant="ghost" onClick={close}>Not now</Button></>}
  onClose={close} />
```

Never a sheet to confirm deleting a row — those are inline two-step confirms. The primary action goes **first** in `actions`, left-aligned with the copy above it.
