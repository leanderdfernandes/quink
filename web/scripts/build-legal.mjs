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
// HOW THESE SURVIVE THE SPA FALLBACK. vercel.json rewrites `/(.*)` to /index.html, and
// these pages are untouched by it because Vercel applies rewrites only AFTER the filesystem
// check — `cleanUrls` resolves /privacy to public/privacy.html first. They need no
// exclusion in that rewrite and must not be given one: an exclusion list was added here
// once to "protect" them and instead stopped the rewrite matching anything, 404ing every
// deep link in production while these four were never at risk. `scripts/smoke-routes.sh`
// asserts both halves against a real deployment.

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
<link rel="canonical" href="https://quink.online/${esc(route)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:ital,wght@0,300..800;1,400..600&display=swap" rel="stylesheet">
<style>
:root{
  --paper:#FCFBF9; --surface:#F6F4F0; --ink:#211F1B; --secondary:#4A463F;
  --muted:#6E6960; --border:#E3DED5; --brand:#1F6E6B; --brand-700:#175551;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0; background:var(--paper); color:var(--ink);
  font-family:'Hanken Grotesk',system-ui,-apple-system,Segoe UI,sans-serif;
  font-size:17px; line-height:1.65; font-weight:400;
  -webkit-font-smoothing:antialiased;
}
.wrap{max-width:44rem;margin:0 auto;padding:0 24px}
header.top{border-bottom:1px solid var(--border);background:var(--surface)}
header.top .wrap{display:flex;align-items:center;gap:14px;height:60px}
.mark{font-size:19px;font-weight:700;letter-spacing:-0.02em;color:var(--ink);text-decoration:none}
.back{margin-left:auto;font-size:14px;color:var(--muted);text-decoration:none}
.back:hover{color:var(--brand-700)}
main{padding:56px 0 72px}
h1{font-size:2.15rem;line-height:1.15;letter-spacing:-0.025em;font-weight:700;margin:0 0 8px}
h2{font-size:1.2rem;line-height:1.3;letter-spacing:-0.012em;font-weight:650;margin:2.6em 0 0.7em;
   padding-top:1.5em;border-top:1px solid var(--border)}
h1+p em,h1+p strong{color:var(--muted)}
p,li{color:var(--secondary)}
p{margin:0 0 1.15em}
strong{color:var(--ink);font-weight:650}
a{color:var(--brand-700);text-decoration:underline;text-underline-offset:2px;
  text-decoration-thickness:1px;text-decoration-color:#9DBEBC}
a:hover{text-decoration-color:var(--brand-700)}
ul{padding-left:1.15em;margin:0 0 1.15em}
li{margin-bottom:0.5em}
li::marker{color:var(--muted)}
hr{border:0;height:0;margin:0}
/* Tables carry the retention and subprocessor facts — the two things a reviewer reads
   closest — so they get real structure rather than zebra stripes. */
.tw{overflow-x:auto;margin:0 0 1.5em}
table{border-collapse:collapse;width:100%;font-size:15.5px}
th{text-align:left;font-weight:650;color:var(--ink);padding:9px 14px 9px 0;
   border-bottom:1.5px solid var(--ink);white-space:nowrap}
td{padding:11px 14px 11px 0;border-bottom:1px solid var(--border);
   color:var(--secondary);vertical-align:top}
tr td:first-child{color:var(--ink);font-weight:500}
footer.legal{border-top:1px solid var(--border);background:var(--surface);padding:26px 0 40px}
footer.legal nav{display:flex;flex-wrap:wrap;gap:20px;margin-bottom:14px}
footer.legal a{font-size:14.5px;color:var(--secondary);text-decoration:none}
footer.legal a:hover{color:var(--brand-700);text-decoration:underline}
footer.legal p{font-size:13.5px;color:var(--muted);margin:0}
@media (max-width:600px){
  body{font-size:16px}
  main{padding:36px 0 48px}
  h1{font-size:1.75rem}
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
