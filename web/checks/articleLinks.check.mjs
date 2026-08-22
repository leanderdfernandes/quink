// Runnable check: `node checks/articleLinks.check.mjs` from web/
//
// Cross-article links are resolved at PUBLISH, and the only case that really matters is the
// one nobody tests by hand: the target got deleted. A dead anchor on a customer's help
// center tells their reader the site is broken, so the rule is unwrap-and-keep-the-text, and
// this is the thing that fails if that rule ever regresses.
//
// It lives outside src/ and shells out to a tiny DOM so the app bundle and its typecheck
// never see it. Node has no DOMParser, so one is faked here — the module only uses
// querySelectorAll, get/setAttribute, replaceWith and body.innerHTML, and this covers those
// well enough to exercise the branches. It is a check, not a browser.
import assert from 'node:assert'

// --- the smallest DOM that answers the four calls the module makes --------------------
// Anchors are found by scanning the source for <a ...data-article-id...>...</a>, which is
// what TipTap emits and is the only shape that reaches this code path.
const RE = /<a\b([^>]*\bdata-article-id="([^"]*)"[^>]*)>([\s\S]*?)<\/a>/gi

globalThis.DOMParser = class {
  parseFromString(html) {
    let out = html
    return {
      body: {
        get innerHTML() {
          return out
        },
      },
      querySelectorAll() {
        const found = []
        for (const m of html.matchAll(RE)) {
          const [whole, attrs, id, inner] = m
          found.push({
            getAttribute: (n) =>
              n === 'data-article-id'
                ? id
                : (attrs.match(new RegExp(`\\b${n}="([^"]*)"`)) ?? [])[1] ?? null,
            setAttribute(n, v) {
              const next = whole.replace(
                new RegExp(`\\s${n}="[^"]*"`),
                ` ${n}="${v}"`,
              )
              out = out.replace(whole, next)
            },
            replaceWith() {
              out = out.replace(whole, inner)
            },
            childNodes: [],
          })
        }
        return found
      },
    }
  }
}

const { resolveArticleLinks, brokenArticleIds, newFaqId } = await import(
  '../src/lib/articleLinks.ts'
)

const live = (id) => (id === 'keep' ? '/current-slug' : null)

// A resolving target gets its href rewritten to where it lives NOW. That is what makes
// renaming a slug and republishing heal every inbound link.
assert.strictEqual(
  resolveArticleLinks('<p>See <a href="/stale" data-article-id="keep">this</a>.</p>', live),
  '<p>See <a href="/current-slug" data-article-id="keep">this</a>.</p>',
)

// THE case. Deleted, drafted, or in another KB — all of them resolve to null, and all of
// them must come out as plain text with the sentence intact. Never a dead anchor.
assert.strictEqual(
  resolveArticleLinks('<p>See <a href="/gone" data-article-id="gone">this</a>.</p>', live),
  '<p>See this.</p>',
)

// A plain pasted URL carries no data-article-id and is never touched.
const plainLink = '<p><a href="https://example.com">docs</a></p>'
assert.strictEqual(resolveArticleLinks(plainLink, live), plainLink)

// Nothing to do: returned byte-identical, without a parse. Re-serialising unchanged HTML
// would let the parser normalise it, and pendingEditCount compares these strings.
assert.strictEqual(resolveArticleLinks('<p>No links.</p>', live), '<p>No links.</p>')
assert.strictEqual(resolveArticleLinks('', live), '')

// Only the broken ones are reported, and each id once however often it is linked.
const mixed =
  '<p><a href="/a" data-article-id="keep">a</a> <a href="/b" data-article-id="gone">b</a>' +
  ' <a href="/c" data-article-id="gone">c</a></p>'
assert.deepStrictEqual([...brokenArticleIds(mixed, live)], ['gone'])
assert.deepStrictEqual([...brokenArticleIds(plainLink, live)], [])

// A FAQ id is an anchor target: valid as an HTML id, and never derived from the question
// text — rewording a question must not break a link someone shared.
assert.match(newFaqId(), /^f_[0-9a-f]{8}$/)
assert.notStrictEqual(newFaqId(), newFaqId())

console.log('articleLinks self-check OK')
