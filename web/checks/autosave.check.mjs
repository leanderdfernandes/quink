// Runnable check: `node checks/autosave.check.mjs` from web/
//
// THE PENDING QUEUE MUST NOT EVICT ITSELF. lib/useAutosave held ONE pending job, so a
// second schedule() inside the 700ms window silently replaced the first — edit one step,
// click into another within the window, and the first step's write never happened. React
// state kept the new text and the database kept the old one, with nothing to say so.
//
// Publishing then froze the disagreement: the snapshot is built from the editor's state
// while the article list compares the DATABASE rows against it, so the article reported
// "2 unpublished edits" that no edit could clear. Observed live 2026-08-30 on Hive Help.
//
// The hook itself needs React, so this exercises the queue's own logic (the same Map, the
// same sequential drain) and then asserts the source still has the shape that logic needs.
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../src/lib/useAutosave.ts', import.meta.url), 'utf8')
const editor = readFileSync(new URL('../src/editor/Editor.tsx', import.meta.url), 'utf8')

// --- the queue -------------------------------------------------------------------------
// A standalone model of what the hook does between schedule() and flush(): keyed set,
// insertion-ordered drain, each job removed before it runs.
function queue() {
  const pending = new Map()
  return {
    schedule: (key, save) => pending.set(key, save),
    flush: async () => {
      for (const [key, job] of [...pending]) {
        pending.delete(key)
        await job()
      }
    },
    size: () => pending.size,
  }
}

// Two targets inside one window: BOTH land. This is the whole bug.
{
  const q = queue()
  const ran = []
  q.schedule('step:a:body_text', async () => ran.push('a'))
  q.schedule('step:b:body_text', async () => ran.push('b'))
  await q.flush()
  assert.deepEqual(ran, ['a', 'b'], 'two steps edited in one window must both be written')
}

// Same target and same columns: coalesced to the LATEST. That is the debounce working, and
// it must survive the fix — otherwise every keystroke becomes a write.
{
  const q = queue()
  const ran = []
  q.schedule('step:a:body_text', async () => ran.push('old'))
  q.schedule('step:a:body_text', async () => ran.push('new'))
  await q.flush()
  assert.deepEqual(ran, ['new'], 'a field edited twice coalesces to one write')
}

// Same target, DIFFERENT columns: two writes. A body edit and a frame pick on one step are
// both real and neither may replace the other.
{
  const q = queue()
  const ran = []
  q.schedule('step:a:body_text', async () => ran.push('body'))
  q.schedule('step:a:is_edited,screenshot_url', async () => ran.push('frame'))
  await q.flush()
  assert.deepEqual(ran, ['body', 'frame'])
}

// Drained, not left behind — a second flush must not replay a completed write.
{
  const q = queue()
  let n = 0
  q.schedule('k', async () => {
    n += 1
  })
  await q.flush()
  await q.flush()
  assert.equal(n, 1)
  assert.equal(q.size(), 0)
}

// --- and the source still has that shape -------------------------------------------------
assert.match(src, /pending = useRef<Map<string, \(\) => Promise<void>>>/, 'pending must be a keyed Map, not one job')
assert.match(src, /schedule = useCallback\(\s*\(key: string,/, 'schedule must take a key')
// Sequential: every write claims articles.updated_at (CLAUDE.md §10k), so two in flight at
// once makes the second lose a race with the user's own previous keystroke.
assert.match(src, /for \(const \[key, job\] of \[\.\.\.pending\.current\]\)/, 'flush must drain sequentially')
assert.doesNotMatch(src, /Promise\.all/, 'writes must not run concurrently — they claim the same row')

// The key has to be derived from the PATCH, or two columns on one target collide again.
assert.match(editor, /const patchKey = \(target: string, patch: object\)/)
assert.match(editor, /guarded\(patchKey\('article', patch\), null, patch\)/)
assert.match(editor, /guarded\(patchKey\(`step:\$\{id\}`, patch\)/)
// Every debounced write still goes through the one guarded() — that is where the stale-write
// claim lives, and a schedule() that bypasses it bypasses the conflict guard too.
assert.equal(
  (editor.match(/\bschedule\(/g) ?? []).length,
  1,
  'Editor must schedule writes only through guarded()',
)

console.log('autosave.check.mjs — ok')
