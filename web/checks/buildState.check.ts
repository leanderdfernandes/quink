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
// Indeterminate means NO fill — a fill implies a denominator we do not have yet. The fill
// and the bolt that rides its leading edge are both inside that one guard.
assert.match(bar, /\{frac !== null && \([\s\S]{0,80}<i className="bbar-fill"/)
// And no denominator until the total is real: the "N of M" branch is reachable only when
// there IS an M. Everything before Stage 1 falls through to the measured upload percentage
// or to nothing at all.
assert.match(bar, /total > 0\s*\?\s*`\$\{done\} of \$\{total\} steps ready`/)
assert.doesNotMatch(bar, /%`\}<\/span>|toFixed|Math\.round\([^)]*100\)\s*\+\s*'%'/)

// --- the list row carries the same state -----------------------------------------------
// Someone who leaves the tab must not open a half-written article expecting a finished one.
assert.match(list, /articleState\(a\) === 'building'/)
assert.match(list, /Open to watch/)
assert.match(list, /Building · \$\{build\.done\} of \$\{build\.total\}/)

// --- the pause has to be REACHABLE ------------------------------------------------------
// A run can hold the write stage waiting for an answer (migration 0042). The question is
// rendered in the editor, so every OTHER surface has to be able to send the user there —
// and the one that could not was the article list, which fetched `awaiting_input` through
// listInFlightJobs and then dropped it on the floor. A user who was not in the editor at
// the moment the question landed never saw it, and the run sat until the six-hour sweep.
const dock = read('../src/components/QueueDock.tsx')
assert.match(list, /awaiting_input/, 'the article list must read awaiting_input')
assert.match(list, /Waiting for your answer/, 'a paused run must say so on its row')
assert.match(dock, /item\.state === 'awaiting'/, 'the dock must offer a way back to the question')

// --- and no surface may NAME a phase it cannot observe -----------------------------------
// `stage ?? 'analyzing'` in the editor and a bare `default:` in the dock both meant a run
// nobody could read still lit "Watching your recording" — confidently, and forever. That is
// the same lie LEARNINGS #3 forbids, just sourced from a missing row instead of a timer.
assert.doesNotMatch(editor, /gen\.job\?\.stage \?\? '/, 'the editor must not default the stage to a phase')
assert.doesNotMatch(bar, /stage = '/, 'BuildBar must not default `stage` to a phase name')
assert.match(bar, /stage\s*$|stage\s*\n?\s*\? PHASES\.findIndex/m, 'BuildBar must derive `at` only from a real stage')
// The dock names each stage explicitly; its fallback is the neutral word, not a phase label.
assert.match(dock, /case 'analyzing':\s*\n\s*case 'detecting':/, 'the dock must name the watch stages explicitly')
assert.doesNotMatch(
  dock,
  /default:\s*\n\s*return 'Watching your recording'/,
  'the dock must not fall back to a phase label for an unknown stage',
)

console.log('buildState.check.ts — ok')
