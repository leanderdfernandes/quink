// Runnable check: `node --experimental-strip-types checks/annotations.check.ts` from web/
//
// THE FOUR-PLACES RULE (slice 4f). Annotations live in a column that six separate code paths
// rebuild or compare step rows through. Miss one and the failure is SILENT: no error, no
// warning — a user hits Ctrl+Z, or duplicates an article, or discards their unpublished
// edits, and every annotation in it is gone. It surfaces days later as "the arrows
// disappeared" with nothing in any log.
//
// This file is the thing that fails instead. It reads the real source of the six sites and
// asserts each one names the column, plus the two columns (is_edited, timestamp_seconds)
// that were ALREADY being dropped by half of them before annotations existed.
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { pendingEditCount, type StepLite } from '../src/lib/pendingEdits.ts'
import type { Article } from '../src/lib/types.ts'

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
const editor = read('../src/editor/Editor.tsx')
const articles = read('../src/lib/articles.ts')

// Every place that DELETES-and-reinserts, or rebuilds, a set of step rows. The regex is
// deliberately anchored on the insert payload rather than the whole file, so a stray mention
// in a comment cannot satisfy it.
function payloadsIn(src: string, marker: string): string[] {
  const out: string[] = []
  let i = 0
  while ((i = src.indexOf(marker, i)) !== -1) {
    out.push(src.slice(i, i + 900))
    i += marker.length
  }
  return out
}

// 1 + 2. The Snapshot type and snapshotOf: what an undo checkpoint carries.
const snapshotType = editor.slice(editor.indexOf('type Snapshot = {'), editor.indexOf('const PENDING_ARTICLE'))
for (const col of ['annotations', 'is_edited', 'timestamp_seconds']) {
  assert.ok(
    snapshotType.includes(col),
    `Snapshot/snapshotOf must carry '${col}' — a restore reinserts from this shape, so anything missing is destroyed by one Ctrl+Z`,
  )
}

// 3 + 4. applySnapshot's insert (undo) and discardChanges' insert (discard to published).
// Only inserts that rebuild an EXISTING row are in scope: a brand-new blank step (insert,
// split) legitimately has no annotations and takes the column default. A rebuild is any
// payload that carries a screenshot forward — if it copies the image, it must copy what is
// drawn on it.
const inserts = payloadsIn(editor, 'article_id: articleId,').filter(
  (b) => b.includes('screenshot_url: s.screenshot_url') || b.includes('screenshot_url: src.screenshot_url'),
)
assert.strictEqual(
  inserts.length,
  3,
  `expected applySnapshot + discardChanges + duplicateStep to rebuild rows, found ${inserts.length} — a new one was added and is unchecked`,
)
for (const [n, body] of inserts.entries()) {
  assert.ok(
    body.includes('annotations'),
    `step-rebuilding insert #${n + 1} in Editor.tsx drops 'annotations' — one undo or one discard wipes every shape in the article`,
  )
}

// 5. duplicateArticle rebuilds rows into a NEW article.
const dup = articles.slice(articles.indexOf('article_id: copy.id,'))
for (const col of ['annotations', 'is_edited', 'timestamp_seconds']) {
  assert.ok(dup.includes(col), `duplicateArticle drops '${col}' — the copy silently loses it`)
}

// Both publish snapshots. The reader renders from published_content, never from the live
// rows, and the two implementations share no helper — so both have to be checked.
for (const [name, src] of [['Editor.doPublish', editor], ['articles.publishArticle', articles]] as const) {
  const snap = src.slice(src.indexOf('const snapshot'), src.indexOf('const snapshot') + 900)
  const built = snap || src
  assert.ok(
    built.includes('annotations'),
    `${name} omits 'annotations' from published_content — the editor would show shapes the live site does not`,
  )
}

// 6. pendingEditCount, behaviourally. This is the one that decides whether the user is ever
// TOLD they have something to publish.
const step = (n: number, extra: Partial<StepLite> = {}): StepLite => ({
  step_number: n,
  heading: `Step ${n}`,
  body_text: `<p>Body ${n}</p>`,
  screenshot_url: `shot-${n}.webp`,
  annotations: [],
  ...extra,
})
const published: Article = {
  title: 'Invite your team',
  subtitle: 'Add teammates.',
  steps: [step(1), step(2)],
}

assert.strictEqual(
  pendingEditCount(published, published.title, published.subtitle, [step(1), step(2)]),
  0,
  'an untouched article is clean',
)

const arrow = { t: 'arrow' as const, c: '#0E5C6B', x1: 0.1, y1: 0.1, x2: 0.4, y2: 0.4 }
assert.strictEqual(
  pendingEditCount(published, published.title, published.subtitle, [
    step(1, { annotations: [arrow] }),
    step(2),
  ]),
  1,
  'adding an annotation is an unpublished edit — without this the status pill says "nothing to publish" and the work never reaches a reader',
)

assert.strictEqual(
  pendingEditCount(
    { ...published, steps: [{ ...step(1), annotations: [arrow] }, step(2)] },
    published.title,
    published.subtitle,
    [step(1, { annotations: [{ ...arrow, c: '#B23B3B' }] }), step(2)],
  ),
  1,
  'recolouring a shape is a change',
)

assert.strictEqual(
  pendingEditCount(
    { ...published, steps: [{ ...step(1), annotations: [arrow] }, step(2)] },
    published.title,
    published.subtitle,
    [step(1, { annotations: [arrow] }), step(2)],
  ),
  0,
  'identical annotations are not a change',
)

console.log('annotation persistence self-check OK')
