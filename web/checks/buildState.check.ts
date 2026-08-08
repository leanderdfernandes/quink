// Runnable check: `node --experimental-strip-types checks/buildState.check.ts` from web/
//
// ONE ARTICLE STATE. A user could not tell an article still being written apart from one
// finished and waiting, because every surface answered "is a run in flight" for itself:
// the editor read `article.status`, the pill read nothing at all and said "Draft" either
// way, and the article list had its own badge switch. The fix is a single derived state
// that every affordance reads.
//
// The failure mode this file exists to catch is that state QUIETLY GROWING A FOURTH COPY —
// someone adds an affordance, writes `status === 'generating'` inline because it is right
// there, and the surfaces disagree again. That does not throw and does not show up in a
// build; it shows up as Publish being enabled during a run, which is where this started.
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { articleState, buildProgress } from '../src/lib/buildState.ts'

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
const editor = read('../src/editor/Editor.tsx')
const list = read('../src/screens/KnowledgeBase.tsx')
const bar = read('../src/editor/BuildBar.tsx')

// --- the state itself -----------------------------------------------------------------
// `status` is the PIPELINE lifecycle and outranks visibility: a generating article is
// building whatever its visibility says, or a re-generated published article would render
// fully editable while the pipeline was writing over it.
assert.equal(articleState({ status: 'generating', visibility: 'draft' }), 'building')
assert.equal(articleState({ status: 'generating', visibility: 'listed' }), 'building')
assert.equal(articleState({ status: 'ready', visibility: 'draft' }), 'ready')
assert.equal(articleState({ status: 'ready', visibility: 'listed' }), 'published')
assert.equal(articleState({ status: 'ready', visibility: 'unlisted' }), 'published')

// The first ~15 seconds of a run: Stage 1 has not written the article row, so a job id is
// the only evidence anything is happening.
assert.equal(articleState(null, true), 'building')
// And with no job either, there is nothing to wait for — never 'building', or the editor
// would lock itself over an article that is simply still loading.
assert.equal(articleState(null, false), 'ready')
assert.equal(articleState(null), 'ready')

// --- the progress numbers -------------------------------------------------------------
// The unit is a step that is DONE — text AND screenshot. Counting step ROWS instead would
// read 0 of ? for the whole of Stage 1 and then sit at 100% through the capture pass and
// Stage 2, because worker/pipeline.py inserts every row in one batch (_insert_steps).
const shot = (screenshot_url: string | null) => ({ screenshot_url })
assert.deepEqual(buildProgress([]), { done: 0, total: 0 })
assert.deepEqual(buildProgress([shot(null), shot(null)]), { done: 0, total: 2 })
assert.deepEqual(buildProgress([shot('a.webp'), shot(null), shot('c.webp')]), {
  done: 2,
  total: 3,
})
// Total 0 is what puts the bar in its indeterminate state. It must come from an EMPTY step
// list and nothing else — a denominator invented before Stage 1 has spoken is the
// timer-driven lie LEARNINGS #3 forbids.
assert.equal(buildProgress([]).total, 0)
assert.ok(buildProgress([shot(null)]).total > 0)

// --- one state, read everywhere --------------------------------------------------------
for (const [name, src] of [
  ['Editor.tsx', editor],
  ['KnowledgeBase.tsx', list],
] as const) {
  assert.match(
    src,
    /import \{[^}]*articleState[^}]*\} from '\.\.\/lib\/buildState'/,
    `${name} must derive article state from lib/buildState, not re-check status inline`,
  )
}

// The editor defines `building` exactly once, and every affordance reads that one value.
// Two definitions is the same disagreement in a smaller box.
assert.equal(
  (editor.match(/const building = /g) ?? []).length,
  1,
  'Editor must derive `building` in exactly one place',
)
// The pill is the one label that can tell the two states apart — it has to be given the
// state, or it goes back to saying "Draft" through the whole run.
assert.match(editor, /<ShareControls\s+building=\{building\}/)
// Publish is refused AND says why. A grey button with no sentence reads as broken.
assert.match(editor, /building && <span className="ed-lockwhy">\{COPY\.buildPublishHint\}/)

// --- the bar never travels backwards ---------------------------------------------------
// Both halves of the fraction can move: polls can land out of order, and a run that ends
// with a different step count than the blueprint promised grows the denominator under a
// numerator that did not. A high-water mark is what makes the bar monotone through both.
assert.match(bar, /Math\.max\(high\.current/, 'BuildBar must clamp progress to a high-water mark')
// Indeterminate means NO fill — a fill implies a denominator we do not have yet.
assert.match(bar, /\{frac !== null && <i className="bbar-fill"/)
// And no percentage text, and no denominator, until the total is real.
assert.match(bar, /total > 0 \? `\$\{done\} of \$\{total\} steps ready` : ''/)
assert.doesNotMatch(bar, /%`\}<\/span>|toFixed|Math\.round\([^)]*100\)\s*\+\s*'%'/)

// --- the list row carries the same state -----------------------------------------------
// Someone who leaves the tab must not open a half-written article expecting a finished one.
assert.match(list, /articleState\(a\) === 'building'/)
assert.match(list, /Open to watch/)
assert.match(list, /Building · \$\{build\.done\} of \$\{build\.total\}/)

console.log('buildState.check.ts — ok')
