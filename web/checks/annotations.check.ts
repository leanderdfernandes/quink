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

// 3 + 4. Undo (applySnapshot) and discard-to-published (discardChanges).
//
// Neither writes step rows itself any more. Migration 0038 moved the whole-document rebuild
// behind ONE atomic, guarded call — two admins pressing Ctrl+Z used to interleave their
// delete and insert and duplicate every step in the article — so the payload this rule cares
// about now lives in `replaceSteps` in lib/articles.ts, and these two are checked by the
// fact that they route through it. Following the subject through the refactor rather than
// counting inserts in one file: a check that fails at the wrong thing teaches people to
// ignore it.
for (const fn of ['async function applySnapshot', 'async function discardChanges']) {
  const body = editor.slice(editor.indexOf(fn), editor.indexOf(fn) + 3000)
  assert.ok(
    body.includes('replaceSteps('),
    `${fn} must rebuild steps through replaceSteps() — a hand-rolled delete + insert from the browser is not atomic and is not guarded, which is how every step in an article gets duplicated`,
  )
  assert.ok(
    !body.includes("from('steps').delete()") && !body.includes("from('steps')\n        .insert"),
    `${fn} still writes the steps table directly — that is the unguarded path 0038 replaced`,
  )
}

// The rebuild payload itself, wherever it lives. This is the list an undo restores TO.
const replace = articles.slice(
  articles.indexOf('export async function replaceSteps'),
  articles.indexOf('export async function deleteArticle'),
)
for (const col of ['annotations', 'is_edited', 'timestamp_seconds', 'screenshot_url', 'heading', 'body_text', 'step_number']) {
  assert.ok(
    replace.includes(col),
    `replaceSteps drops '${col}' — one undo or one discard wipes it from every step in the article`,
  )
}

// 4b. NOTHING in the editor rebuilds a step row from another one any more. duplicateStep
// went with merge and split (PRD "Context & AI Editing" §6.5), and the only local insert
// left is insertStep, which writes a BLANK row — it has no annotations to lose. The count
// is asserted at zero rather than deleted, so that re-adding any row-copying gesture fails
// here instead of quietly shipping without the column.
const inserts = payloadsIn(editor, 'article_id: articleId,').filter(
  (b) => b.includes('screenshot_url: s.screenshot_url') || b.includes('screenshot_url: src.screenshot_url'),
)
assert.strictEqual(
  inserts.length,
  0,
  `found ${inserts.length} in-editor row rebuild(s) — duplicateStep is gone, so a new one was added and is unchecked`,
)
for (const [n, body] of inserts.entries()) {
  assert.ok(
    body.includes('annotations'),
    `step-rebuilding insert #${n + 1} in Editor.tsx drops 'annotations' — duplicating a step would lose every shape on it`,
  )
}

// 5. duplicateArticle rebuilds rows into a NEW article.
const dup = articles.slice(articles.indexOf('article_id: copy.id,'))
for (const col of ['annotations', 'is_edited', 'timestamp_seconds']) {
  assert.ok(dup.includes(col), `duplicateArticle drops '${col}' — the copy silently loses it`)
}

// The published snapshot. The reader renders from published_content, never from the live
// rows, so a column missing HERE shows the author shapes the live site does not have.
//
// This used to read both publish paths and look for the column near each one's snapshot
// object, because they hand-rolled one each. They now share ONE builder — which is the
// stronger arrangement, and it made this check fail on correct code: both call sites are a
// single `publishSnapshot(...)` line with the column names nowhere near them. A check that
// does not follow its subject through a refactor fails loudly at the wrong thing and
// teaches people to ignore it.
//
// So the assertion is now in two halves, which together say the same thing the old one
// meant: the builder carries the columns, and neither path has quietly grown its own
// snapshot again.
// The window is the FUNCTION, not a byte count. It was `+ 700`, and migration 0037's `faqs`
// argument and its comment pushed `annotations` past that — the check failed on correct code
// for the second time, which is the same lesson the paragraph above records. Ending at the
// next top-level `export` follows the subject however the body grows.
const builderStart = articles.indexOf('export function publishSnapshot')
const builderEnd = articles.indexOf('\nexport ', builderStart + 1)
const builder = articles.slice(builderStart, builderEnd === -1 ? undefined : builderEnd)
for (const col of [
  'annotations',
  'screenshot_url',
  'heading',
  'body_text',
  'step_number',
  // The article tail (0037). Frozen into published_content like everything else here: the
  // reader renders the snapshot, never `articles.faqs`, so a builder that drops this ships
  // an article whose questions exist only in the editor.
  'faqs',
]) {
  assert.ok(
    builder.includes(col),
    `publishSnapshot omits '${col}' — the reader renders this snapshot, so the live site would lose it`,
  )
}
for (const [name, src] of [
  ['Editor.doPublish', editor],
  ['articles.publishArticle', articles],
] as const) {
  assert.match(
    src,
    /const snapshot = publishSnapshot\(/,
    `${name} must build published_content through publishSnapshot, not its own object — two builders is how one publish path silently loses a column`,
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
