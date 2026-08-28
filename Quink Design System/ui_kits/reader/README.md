# UI kit — Quink reader (the published help center)

The customer-facing side: what Quink publishes to `docs.<customer>.com`. Recreated from
`web/src/reader/ReaderSite.tsx`, `web/src/reader/theme.ts` and the `.rs2` block of
`web/src/styles.css`, then rebuilt at **v2**.

## Files

- `index.html` — the interactive kit. Search the band, open a result, browse a category,
  scroll an article (the spine tracks), answer the feedback question. Light and dark.
- `readerData.jsx` — `themeVars()` (the per-customer colour expansion), plus demo content.
- `ReaderChrome.jsx` — `Band`, `BandSearch`, `Footer`.
- `ReaderScreens.jsx` — `ReaderHome`, `ReaderCategory`, `ReaderArticle`, `Crumbs`.

## The one real constraint, preserved

**The primary colour is the only thing stored.** `themeVars(hex)` expands one customer hex
into the whole brand ramp with `color-mix(in oklab, …)`, and picks `--on-brand` by measuring
WCAG contrast rather than assuming white. A hardcoded white is right for teal and wrong for
amber — that logic is ported from `theme.ts` and is why the band can't go illegible.

## What v2 changed here

- **One chassis with the app.** The reader used to carry its own warmer neutral scale scoped
  to `.rs2`. Now it uses the same surface ladder, elevation and type as the authoring app,
  and only `--brand` differs. That is what makes the two feel like one product.
- **Two band treatments, not four.** `tint` and `image` are gone: a tint mixed toward paper
  goes grey for desaturated customer colours, which was the failure v1's own comments
  described. The band is a flat brand fill — it cannot fail.
- **No sticky category rail.** v1 put a 216px sticky heading beside every category list. v2
  drops it: larger type and more space solve the scanning problem, and the list gets the
  width back.
- **Serif article titles.** The v1 source explicitly rejected a serif because it "read as a
  font change rather than a voice". With Newsreader used system-wide — editor canvas, library
  headings, reader — it is the voice, so the objection no longer applies.

## Deliberately not built

`ARTICLE` is one demo guide; the other seven titles reuse its steps, since only one article's
content was available to me. No real screenshots were supplied, so every figure is an honest
placeholder rather than a drawn approximation of a product UI.
