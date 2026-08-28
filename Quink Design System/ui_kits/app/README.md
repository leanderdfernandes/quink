# UI kit — Quink authoring app

The product itself, rebuilt at **v2**. Recreated from `web/src/screens/`, `web/src/editor/`
and `web/src/components/`, then elevated per the v2 decisions in the root `readme.md`.

## Files

- `index.html` — the interactive kit. Opens on the **editor**, because that is the North Star
  surface. The whole flow is live: library → New article → upload → generating → editor.
  Light and dark, remembered across reloads.
- `data.jsx` — copy, stages, demo articles, and the `Shot` screenshot placeholder.
- `AppShell.jsx` — `Bar`, `Crumb`, `Rail`.
- `Upload.jsx` — `UploadScreen` and `Generating` (the first ninety seconds).
- `Library.jsx` — the article library.
- `Editor.jsx` — `Editor` and `StepCard`.

## What to look at

**Upload.** A 56px Newsreader headline, then an inset well with one lifted tile in it — the
dashed rectangle is gone. The free-tier disclosure sits under the dropzone *before* the file
is committed, which is a product rule carried over from v1, not a styling choice.

**Generating.** Four named stages with a determinate progress rule, replacing v1's pulsing
dot. The stage labels are the reassurance; a spinner would say less.

**Library.** Folders are `<Group>`s — a serif heading on the page plus one raised surface for
the rows, not a card inside a card. State appears **only** on rows that aren't the norm, so a
list of forty drafts shows forty titles rather than forty pills. Filter chips select with an
ink fill so they don't compete with the primary button.

**Editor.** The canvas is contenteditable and set in Newsreader — click a heading or a
paragraph and type. The step-number motif (a mono index under a 2px brand rule) is the one
thing carried over unchanged from v1, because it is genuinely good and it is in the live
product.

**The toolbar-collision fix.** Press *Simulate a text selection* at the bottom of the editor.
Three mechanisms fire together: the toolbar takes `--z-toolbar` (above every persistent
control), it flips below the selection when it is near the top edge, and `q-quiet-tools` on
the canvas fades every hover-revealed control out while it is open.

## Not rebuilt

The account wall, theming, people/invites and the admin shell exist in the source but are not
screens here. The component set covers them; say the word and they're quick to add.
