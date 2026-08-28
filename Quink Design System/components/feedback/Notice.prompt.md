```jsx
<Notice>3 free guides from video, kept 30 days. Writing by hand is unlimited.</Notice>
<Notice tone="caution" bar action={<Button size="sm">Add a plan</Button>} onDismiss={hide}>
  5 days until your help center goes dark.
</Notice>
<Notice tone="critical" action={<Button size="sm" variant="secondary">Email us</Button>}>
  We couldn't read this recording. Nothing was charged.
</Notice>
```

Copy rules carried over from v1: **name the consequence, not the countdown**, and dismissal is session-only — a warning that stays dismissed has stopped working.
