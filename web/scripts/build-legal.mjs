// Render /legal/*.md to real static HTML in public/, at build time.
//
// WHY STATIC AND NOT A REACT ROUTE. Two external reviewers gate the business on these URLs:
// Google's OAuth verification needs the privacy policy before the consent screen stops
// warning users, and Razorpay's activation review needs all four before we can take money.
// Both fetch the URL directly. A React route at /privacy serves an empty <div id="root">
// to anything that does not execute JavaScript — the same constraint already blocking
// reader-site indexing (UI-STATE-INVENTORY §D).
//
// The property we actually want is broader than "a crawler can read it": these pages keep
// working when the worker is down, when the SPA bundle fails to parse, when Supabase is
// unreachable, and behind any session gate the app grows later. A promise to a stranger
// should not depend on our JavaScript booting.
//
// WHY GENERATED RATHER THAN HAND-WRITTEN HTML. /legal/*.md is what a human reviews and
// edits; the HTML is a build artifact. Committing both means two copies of a legal promise
// that can disagree, which is the exact class of failure LEGAL-IMPLEMENTATION §7 was written
// about. The markdown is the source of truth and this file is the only way it reaches the
// web. Generated pages are gitignored so a stale one cannot be served.
//
// Runs from `npm run build`, BEFORE vite — vite copies public/ into dist/ as-is, so the
// files have to exist by then.
//
// HOW THESE SURVIVE THE SPA FALLBACK, AND WHAT `cleanUrls` DOES TO IT. vercel.json rewrites
// `/(.*)` to `/` — not to `/index.html`, which is the trap. `cleanUrls: true` exists for
// these four pages (it is what serves public/privacy.html at /privacy), and it makes EVERY
// .html path a 308 to its extensionless form, `/index.html` included. A rewrite pointing at
// /index.html therefore resolves to nothing, and Vercel answers NOT_FOUND — which is exactly
// what happened for six days: every deep link 404'd in production the moment cleanUrls
// landed alongside these pages.
//
// These four need no exclusion in that rewrite and must not be given one. Rewrites are
// applied only AFTER the filesystem check, so /privacy is served as a real file before the
// rewrite is consulted. An exclusion list was added here once anyway, and hid the real cause
// for the whole six days. `scripts/smoke-routes.sh` asserts both halves — deep links reach
// the app, these four stay static — against a real deployment.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'

const HERE = dirname(fileURLToPath(import.meta.url))
const LEGAL = join(HERE, '..', '..', 'legal')
const OUT = join(HERE, '..', 'public')

// route -> source file. The routes are fixed by LEGAL-IMPLEMENTATION §2 and by whatever has
// already been handed to Google and Razorpay; they are not free to change.
const PAGES = [
  { route: 'privacy', file: 'privacy-policy.md', title: 'Privacy Policy' },
  { route: 'terms', file: 'terms-and-conditions.md', title: 'Terms & Conditions' },
  { route: 'refunds', file: 'refunds-and-cancellation.md', title: 'Refunds & Cancellation' },
  { route: 'contact', file: 'contact.md', title: 'Contact' },
]

// LEGAL-IMPLEMENTATION §1 lists five placeholders that must be filled before publishing, and
// §6 requires zero hits when grepping for them. A published privacy policy reading
// "operated by [PROPRIETOR LEGAL NAME]" fails the Razorpay review and tells a customer we
// are not a real business — so the BUILD fails instead. This is the check that makes the
// checklist item impossible to forget rather than merely written down.
const PLACEHOLDER = /\[(PROPRIETOR LEGAL NAME|BUSINESS ADDRESS|UDYAM NUMBER|EFFECTIVE DATE)\]/g

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Typographic, not templated. design-system.html is the source of truth: Hanken Grotesk,
// warm neutrals, the teal-blue accent, a real measure. No card, no shadow, no rounded
// everything — this is a document, and it should look like the same company as the app.
//
// The font is self-hosted-by-Google like the app's, but with a `system-ui` fallback that is
// listed FIRST in weight terms: if fonts.googleapis.com is blocked or slow, the page still
// renders immediately in a sane stack. A legal page must never be blank while a font loads.
const shell = (title, route, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Quink</title>
<meta name="description" content="${esc(title)} for Quink — a hosted help center that fills itself from screen recordings.">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="canonical" href="https://quink.online/${esc(route)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,300..500&family=Hanken+Grotesk:ital,wght@0,300..800;1,400..600&display=swap" rel="stylesheet">
<style>
/* The design system's tokens, inlined. These four pages must render with no build step and
   no network beyond the font, so the values are literal rather than imported — but they are
   the SAME values as src/ds/tokens/. If those change, change these in the same commit. */
:root{
  color-scheme:light dark;
  --bg:oklch(98.4% 0.0035 65); --surface-1:oklch(100% 0 0); --surface-2:oklch(97% 0.004 65);
  --ink:oklch(19% 0.008 60); --ink-2:oklch(43% 0.007 60); --ink-3:oklch(58% 0.006 60);
  --brand:oklch(44% 0.088 205); --brand-700:oklch(37% 0.078 205);
  --rule:color-mix(in oklab, var(--ink) 8%, transparent);
  --rule-strong:color-mix(in oklab, var(--ink) 14%, transparent);
  --font-display:'Newsreader','Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif;
  --font:'Hanken Grotesk',system-ui,-apple-system,Segoe UI,sans-serif;
  --e1:0 1px 1.5px -0.5px hsl(60 8% 12% / 7%), 0 2.5px 5px -1.5px hsl(60 8% 12% / 5%);
}
@media (prefers-color-scheme:dark){
  :root{
    --bg:oklch(16.5% 0.006 62); --surface-1:oklch(20.5% 0.007 62); --surface-2:oklch(24% 0.0075 62);
    --ink:oklch(96.5% 0.004 70); --ink-2:oklch(78% 0.006 70); --ink-3:oklch(62% 0.007 70);
    --brand:oklch(72% 0.098 205); --brand-700:oklch(80% 0.078 205);
    --rule:color-mix(in oklab, oklch(100% 0 0) 9%, transparent);
    --rule-strong:color-mix(in oklab, oklch(100% 0 0) 16%, transparent);
    --e1:0 1px 2px -1px hsl(62 12% 4% / 40%);
  }
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0; background:var(--bg); color:var(--ink-2);
  font-family:var(--font);
  font-size:17px; line-height:1.72; font-weight:400; letter-spacing:-0.008em;
  -webkit-font-smoothing:antialiased; text-wrap:pretty;
}
.wrap{max-width:44rem;margin:0 auto;padding:0 24px}
/* No borders: the bar and the footer separate by surface and elevation, like every other
   bar in the product. */
header.top{background:var(--surface-1);box-shadow:var(--e1);position:relative}
header.top .wrap{display:flex;align-items:center;gap:14px;height:64px}
.mark{font-size:20px;font-weight:700;letter-spacing:-0.02em;color:var(--ink);text-decoration:none}
.back{margin-left:auto;font-size:14px;color:var(--ink-3);text-decoration:none}
.back:hover{color:var(--brand-700)}
main{padding:64px 0 80px}
/* Serif above 22px, grotesk at or below — and the serif runs light. */
h1{font-family:var(--font-display);font-size:clamp(33px,5vw,42px);line-height:1.06;
   letter-spacing:-0.03em;font-weight:420;color:var(--ink);margin:0 0 10px;text-wrap:balance}
h2{font-family:var(--font-display);font-size:26px;line-height:1.18;letter-spacing:-0.021em;
   font-weight:420;color:var(--ink);margin:2.6em 0 0.7em;
   padding-top:1.5em;border-top:1px solid var(--rule)}
h1+p em,h1+p strong{color:var(--ink-3)}
p,li{color:var(--ink-2)}
p{margin:0 0 1.15em}
strong{color:var(--ink);font-weight:560}
a{color:var(--brand);text-decoration:underline;text-underline-offset:3px;
  text-decoration-thickness:1px;text-decoration-color:color-mix(in oklab,var(--brand) 40%,transparent)}
a:hover{text-decoration-color:var(--brand-700);color:var(--brand-700)}
ul{padding-left:1.15em;margin:0 0 1.15em}
li{margin-bottom:0.5em}
li::marker{color:var(--ink-3)}
hr{border:0;height:0;margin:0}
/* Tables carry the retention and subprocessor facts — the two things a reviewer reads
   closest — so they get real structure rather than zebra stripes. */
.tw{overflow-x:auto;margin:0 0 1.5em}
table{border-collapse:collapse;width:100%;font-size:15px}
th{text-align:left;font-weight:560;color:var(--ink);padding:9px 14px 9px 0;
   border-bottom:1.5px solid var(--rule-strong);white-space:nowrap}
td{padding:11px 14px 11px 0;border-bottom:1px solid var(--rule);
   color:var(--ink-2);vertical-align:top}
tr td:first-child{color:var(--ink);font-weight:480}
footer.legal{background:var(--surface-1);box-shadow:var(--e1);padding:30px 0 44px;position:relative}
footer.legal nav{display:flex;flex-wrap:wrap;gap:20px;margin-bottom:14px}
footer.legal a{font-size:15px;color:var(--ink-2);text-decoration:none}
footer.legal a:hover{color:var(--brand-700);text-decoration:underline}
footer.legal p{font-size:13px;color:var(--ink-3);margin:0}
@media (max-width:600px){
  body{font-size:16px}
  main{padding:40px 0 52px}
}
</style>
</head>
<body>
<header class="top"><div class="wrap">
  <a class="mark" href="/">Quink</a>
  <a class="back" href="/">Back to Quink &rarr;</a>
</div></header>
<main><div class="wrap">
${body}
</div></main>
<footer class="legal"><div class="wrap">
  <nav>
    <a href="/privacy">Privacy</a><a href="/terms">Terms</a>
    <a href="/refunds">Refunds &amp; Cancellation</a><a href="/contact">Contact</a>
  </nav>
  <p>&copy; ${new Date().getFullYear()} Quink. Made in India.</p>
</div></footer>
</body>
</html>
`

mkdirSync(OUT, { recursive: true })

// Read and CHECK everything before writing anything. Writing first and failing after would
// leave placeholder HTML sitting in public/, where a bare `vite build` would happily ship it
// — a fail-closed gate that leaves the bad artifact on disk is not fail-closed.
const sources = PAGES.map((p) => ({ ...p, md: readFileSync(join(LEGAL, p.file), 'utf8') }))

const unresolved = []
for (const { file, md } of sources) {
  const found = md.match(PLACEHOLDER)
  if (found) unresolved.push(`${file}: ${[...new Set(found)].join(', ')}`)
}

if (!unresolved.length) {
  for (const { route, file, title, md } of sources) {
    // Wrap tables so a narrow phone scrolls the table rather than the page. marked emits
    // bare <table>; this is the one structural change made to its output.
    const html = marked
      .parse(md, { mangle: false, headerIds: false })
      .replace(/<table>/g, '<div class="tw"><table>')
      .replace(/<\/table>/g, '</table></div>')

    writeFileSync(join(OUT, `${route}.html`), shell(title, route, html))
    console.log(`  legal: /${route}  <- legal/${file}`)
  }
}

if (unresolved.length) {
  console.error(
    '\nBUILD FAILED — unfilled placeholders in the legal documents:\n' +
      unresolved.map((u) => `  ${u}`).join('\n') +
      '\n\nThese four pages are read by Google OAuth verification and by Razorpay activation.' +
      '\nPublishing "operated by [PROPRIETOR LEGAL NAME]" fails the review and tells a' +
      '\ncustomer we are not a real business. Fill them in /legal/*.md — see' +
      '\nlegal/LEGAL-IMPLEMENTATION.md §1 for what each one is.\n',
  )
  process.exit(1)
}
