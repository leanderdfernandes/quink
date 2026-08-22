// Runnable check: `node --experimental-strip-types checks/pendingEdits.check.ts` from web/
//
// The editor's status pill and the article list's badge now call one function, so the only
// thing left that can break is the arithmetic. It lives outside src/, so neither the bundle
// nor the app's typecheck ever sees it.
import assert from 'node:assert'
import { pendingEditCount, type StepLite } from '../src/lib/pendingEdits.ts'
import type { Article } from '../src/lib/types.ts'

const step = (n: number, extra: Partial<StepLite> = {}): StepLite => ({
  step_number: n,
  heading: `Step ${n}`,
  body_text: `<p>Body ${n}</p>`,
  screenshot_url: `shot-${n}.webp`,
  ...extra,
})

const published: Article = {
  title: 'Invite your team',
  subtitle: 'Add teammates.',
  steps: [step(1), step(2), step(3)],
}
const same = [step(1), step(2), step(3)]

// Never published: nothing to be ahead of. The editor falls back to `dirty` here.
assert.strictEqual(pendingEditCount(null, 'x', 'y', same), 0)

// Identical draft.
assert.strictEqual(pendingEditCount(published, published.title, published.subtitle, same), 0)

// Title and subtitle each count once.
assert.strictEqual(pendingEditCount(published, 'Invite people', published.subtitle, same), 1)
assert.strictEqual(pendingEditCount(published, 'Invite people', 'Different.', same), 2)

// One changed body, one swapped screenshot.
assert.strictEqual(
  pendingEditCount(published, published.title, published.subtitle, [
    step(1, { body_text: '<p>New</p>' }),
    step(2),
    step(3),
  ]),
  1,
)
assert.strictEqual(
  pendingEditCount(published, published.title, published.subtitle, [
    step(1),
    step(2, { screenshot_url: 'other.webp' }),
    step(3),
  ]),
  1,
)

// An added step is one edit; a deleted step is one edit. A deletion is the case a naive
// "compare each draft step" loop misses entirely — the draft has nothing to iterate over.
assert.strictEqual(
  pendingEditCount(published, published.title, published.subtitle, [...same, step(4)]),
  1,
)
assert.strictEqual(
  pendingEditCount(published, published.title, published.subtitle, [step(1), step(2)]),
  1,
)
assert.strictEqual(pendingEditCount(published, published.title, published.subtitle, []), 3)

// Reordering renumbers, so both moved steps differ from the published snapshot.
assert.strictEqual(
  pendingEditCount(published, published.title, published.subtitle, [
    { ...step(2), step_number: 1 },
    { ...step(1), step_number: 2 },
    step(3),
  ]),
  2,
)

// An empty published subtitle is '' on the row, and null in an older snapshot. Both mean
// "nothing", and neither may register as an edit on its own.
assert.strictEqual(
  pendingEditCount(
    { ...published, subtitle: null as unknown as string },
    published.title,
    '',
    same,
  ),
  0,
)

// --- FAQs (migration 0037) ------------------------------------------------------------
// Absent, null and [] all mean "no questions" and none of the three may register on its own.
// The first case is every article published before 0037: a frozen snapshot with no key.
assert.strictEqual(pendingEditCount(published, published.title, published.subtitle, same), 0)
assert.strictEqual(
  pendingEditCount(
    { ...published, faqs: null as unknown as undefined },
    published.title,
    published.subtitle,
    same,
  ),
  0,
)
assert.strictEqual(
  pendingEditCount({ ...published, faqs: [] }, published.title, published.subtitle, same, []),
  0,
)

const faq = { id: 'f_1234abcd', q: 'Can I undo it?', a: '<p>Yes.</p>' }
const withFaq: Article = { ...published, faqs: [faq] }

// A FAQ added, reworded, reordered or deleted is ONE edit — the count means "how far ahead
// is the draft", and the tail is one section of the page.
assert.strictEqual(pendingEditCount(published, published.title, published.subtitle, same, [faq]), 1)
assert.strictEqual(pendingEditCount(withFaq, published.title, published.subtitle, same, []), 1)
assert.strictEqual(pendingEditCount(withFaq, published.title, published.subtitle, same, [faq]), 0)
assert.strictEqual(
  pendingEditCount(withFaq, published.title, published.subtitle, same, [
    { ...faq, a: '<p>Yes, Ctrl+Z.</p>' },
  ]),
  1,
)
// Order is the reader's order, so a swap is a real edit.
const faq2 = { id: 'f_5678efgh', q: 'Where do I start?', a: '<p>Step one.</p>' }
assert.strictEqual(
  pendingEditCount({ ...published, faqs: [faq, faq2] }, published.title, published.subtitle, same, [
    faq2,
    faq,
  ]),
  1,
)

// --- article links --------------------------------------------------------------------
// THE regression this guards. Publish rewrites an article link's href to the target's
// CURRENT slug, so a draft that links anywhere would otherwise differ from its own published
// copy forever: the badge would show a count nothing could clear and "Publish changes" would
// never go away. data-article-id is what is compared; the href is derived from it.
const draftLink = '<p>See <a href="/old-slug" data-article-id="u-1">this</a>.</p>'
const pubLink = '<p>See <a href="/new-slug" data-article-id="u-1">this</a>.</p>'
assert.strictEqual(
  pendingEditCount(
    { ...published, faqs: [{ ...faq, a: pubLink }] },
    published.title,
    published.subtitle,
    same,
    [{ ...faq, a: draftLink }],
  ),
  0,
)
// Same rule inside a step body.
assert.strictEqual(
  pendingEditCount(
    { ...published, steps: [step(1, { body_text: pubLink }), step(2), step(3)] },
    published.title,
    published.subtitle,
    [step(1, { body_text: draftLink }), step(2), step(3)],
  ),
  0,
)
// But a target that was DELETED is unwrapped at publish, and that IS a difference a reader
// sees — the anchor is gone and only its text is left.
assert.strictEqual(
  pendingEditCount(
    { ...published, faqs: [{ ...faq, a: '<p>See this.</p>' }] },
    published.title,
    published.subtitle,
    same,
    [{ ...faq, a: draftLink }],
  ),
  1,
)
// A PLAIN url link carries no data-article-id, is never rewritten, and must still compare
// literally — its href is content, not a derived value.
assert.strictEqual(
  pendingEditCount(
    { ...published, faqs: [{ ...faq, a: '<p><a href="https://a.example">x</a></p>' }] },
    published.title,
    published.subtitle,
    same,
    [{ ...faq, a: '<p><a href="https://b.example">x</a></p>' }],
  ),
  1,
)

// --- pipeline prose vs TipTap markup ---------------------------------------------------
// THE "4 unpublished changes" bug. The worker used to store the model's plain sentence, and
// TipTap reports <p>...</p> the moment the editor mounts. Compared literally, the article
// list said an untouched article had four pending edits while the editor said it was clean —
// and opening the article rewrote the rows, so the number changed because you looked at it.
assert.strictEqual(
  pendingEditCount(
    { ...published, steps: [step(1, { body_text: '<p>Body 1</p>' }), step(2), step(3)] },
    published.title,
    published.subtitle,
    [step(1, { body_text: 'Body 1' }), step(2), step(3)],
  ),
  0,
)
// Prose is ESCAPED on the way in, because it is text becoming markup — so a body containing
// an ampersand still compares equal to the editor's copy of it.
assert.strictEqual(
  pendingEditCount(
    { ...published, steps: [step(1, { body_text: '<p>Tools &amp; setup</p>' }), step(2), step(3)] },
    published.title,
    published.subtitle,
    [step(1, { body_text: 'Tools & setup' }), step(2), step(3)],
  ),
  0,
)
// A real rewrite is still a real edit — the normalisation must not swallow one.
assert.strictEqual(
  pendingEditCount(
    { ...published, steps: [step(1, { body_text: '<p>Body 1</p>' }), step(2), step(3)] },
    published.title,
    published.subtitle,
    [step(1, { body_text: 'Body one, reworded' }), step(2), step(3)],
  ),
  1,
)
// Empty and blank are the same nothing, whichever side they are on.
assert.strictEqual(
  pendingEditCount(
    { ...published, steps: [step(1, { body_text: '' }), step(2), step(3)] },
    published.title,
    published.subtitle,
    [step(1, { body_text: '   ' }), step(2), step(3)],
  ),
  0,
)

console.log('pendingEditCount self-check OK')
