# UI kit — Quink marketing site

The landing page, rebuilt at **v2**. Recreated from `web/src/screens/Home.tsx` and the
`.home* / .hero* / .how*` blocks of `web/src/styles.css`.

## Files

- `index.html` — the interactive kit. "Log in" opens the log-in sheet; "Build my guide"
  navigates to the app kit. Light and dark.
- `MarketingHome.jsx` — `Nav`, `Hero`, `HowItWorks`, `Pricing`, `LegalFooter`, `LoginSheet`.

## What v2 changed

- **A 76px Newsreader hero**, left-aligned on a real measure. v1 centred a 62px grotesk line;
  the serif and the left rag are most of what separates this from a template.
- **Left-aligned, not centred.** Centred body copy over five ragged lines was a specific
  amateurish tell.
- **No eyebrow pill.** The label above the hero is the mono `<Micro>`.
- **A pricing section**, which v1 didn't have (its nav "Pricing" link pointed at `#how`). The
  content is the product's own pricing logic: writing by hand is free and unlimited,
  generation is the metered thing, and there are no per-seat fees. Flag it if you'd rather I
  drop it — it is the one place I added a section the source didn't have.

## Faithful

The legal footer carries exactly four links (terms, privacy, refunds, contact), which is what
the payment provider's activation review looks for — that requirement is documented in
`web/scripts/build-legal.mjs` and it survives the redesign.
