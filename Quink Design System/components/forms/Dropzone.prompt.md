Where a recording enters the product — and the first thing a new user sees, so it carries the serif headline.

```jsx
<Dropzone sub="MP4 or MOV · up to 100 MB and 6 minutes each" onClick={pick} />
<Dropzone state="loaded"><Row … /></Dropzone>
```

The free-tier limits go in `sub`, **before** the file is committed. That disclosure is a product rule inherited from v1 and it must not move behind the upload.
