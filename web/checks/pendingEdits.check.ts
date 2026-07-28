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

console.log('pendingEditCount self-check OK')
