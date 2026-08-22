import type { Faq, Step } from './types'

// Cross-article links, resolved at PUBLISH (migration 0037, part 2).
//
// An author picking "an article in this help center" writes an anchor carrying both a
// convenience href and the thing that is actually true:
//
//     <a href="/whatever-the-slug-was" data-article-id="{uuid}">text</a>
//
// The href at draft time is a guess that goes stale — slugs change, targets get deleted.
// `data-article-id` is the truth, and publish is where the truth becomes a URL.
//
// This runs over FAQ answers AND step body_text. One function, because there is one kind of
// link and a second copy of this logic would drift.

export type HrefResolver = (articleId: string) => string | null

// A FAQ row's id — minted once, at row creation, and never changed afterwards.
//
// It lives in this module because it is an ANCHOR, not a database key: the reader renders
// `id="q-{it}"` and links arrive at `#q-{it}`. That is also why it is not the question text
// slugified — rewording a question would silently break every link anyone had shared.
// `f_` prefix so it is a valid HTML id whatever the random part starts with.
export const newFaqId = (): string => `f_${crypto.randomUUID().slice(0, 8)}`

// Everything is a browser path — publish happens client-side from the editor and from the
// article list, never in the worker — so DOMParser is the parser, not a regex. Anchors nest
// inside lists and marks; a regex that survives that is a parser with worse edges.
const parse = (html: string): Document =>
  new DOMParser().parseFromString(html, 'text/html')

/**
 * Rewrite every article link in `html` to where its target lives NOW.
 *
 *   target resolves  -> href becomes its current slug path
 *   target does not  -> the anchor is UNWRAPPED, its text kept
 *
 * Unwrapping is the whole point. A deleted, drafted or foreign target must never ship as a
 * dead anchor: a reader who clicks a link into a not-found card has been told the help
 * center is broken. Degrading to plain prose says nothing at all, which is correct — the
 * sentence still reads.
 *
 * The consequence worth knowing: renaming a slug and republishing heals every inbound link
 * automatically, and deleting a target degrades its referrers on their next publish.
 *
 * `data-article-id` is deliberately KEPT in the output. The build spec said to strip it;
 * stripping it makes the published copy structurally un-comparable to the draft it came
 * from, so `pendingEditCount` would see every article containing a link as permanently
 * dirty — a "Publish changes" affordance that never goes away, on every linked article.
 * Keeping it costs nothing and exposes nothing: `reader_article` already returns article ids
 * to anon callers and the feedback widget posts one back.
 */
export function resolveArticleLinks(html: string, href: HrefResolver): string {
  if (!html || !html.includes('data-article-id')) return html
  const doc = parse(html)
  for (const a of Array.from(doc.querySelectorAll('a[data-article-id]'))) {
    const to = href(a.getAttribute('data-article-id') ?? '')
    if (to) {
      a.setAttribute('href', to)
    } else {
      // Unwrap: the anchor's children take its place, in order.
      a.replaceWith(...Array.from(a.childNodes))
    }
  }
  return doc.body.innerHTML
}

// Article ids linked from `html` whose target no longer resolves. Drives the editor's
// "Target removed" treatment — which marks the link and leaves it alone. The draft is NOT
// auto-unwrapped: the author should see what broke and decide, and publish will degrade it
// safely either way.
export function brokenArticleIds(html: string, href: HrefResolver): Set<string> {
  const out = new Set<string>()
  if (!html || !html.includes('data-article-id')) return out
  for (const a of Array.from(parse(html).querySelectorAll('a[data-article-id]'))) {
    const id = a.getAttribute('data-article-id')
    if (id && !href(id)) out.add(id)
  }
  return out
}

// Publish-time convenience: run the resolver over a whole steps/faqs pair.
export const resolveSteps = <T extends Pick<Step, 'body_text'>>(
  steps: T[],
  href: HrefResolver,
): T[] => steps.map((s) => ({ ...s, body_text: resolveArticleLinks(s.body_text, href) }))

export const resolveFaqs = (faqs: Faq[], href: HrefResolver): Faq[] =>
  faqs.map((f) => ({ ...f, a: resolveArticleLinks(f.a, href) }))
