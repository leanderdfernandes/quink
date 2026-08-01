// Runnable check: `node --experimental-strip-types checks/styles.check.ts` from web/
//
// TWO silent-failure classes in CSS, both of which have bitten this codebase.
//
// 1. AN UNDEFINED CUSTOM PROPERTY IS NOT A NO-OP. `background: var(--nope)` is invalid at
//    computed-value time, which resolves to `unset` — and the initial background-color is
//    TRANSPARENT. So a primary button with a white label simply disappears, with no console
//    warning and no visual clue anywhere except the one hover state nobody screenshots.
//    That is exactly what happened: ten variables were defined only at runtime by
//    reader/theme.ts on the reader's root, and every authoring-app rule using one was dead.
//
// 2. AN INTERACTIVE ELEMENT NEEDS ITS STATES TO STAY READABLE. A hover rule that changes
//    background without considering colour (or the reverse) is how white-on-white ships.
//    This asserts the cheap, mechanical half: no state rule may set a background to a
//    variable that does not exist, and no rule may set background to `transparent` or
//    `inherit` on an element whose colour is #fff.
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

// --- 1. every var() has a definition somewhere -----------------------------------------
const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
const used = new Set([...css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]))
const undef = [...used].filter((v) => !defined.has(v)).sort()
assert.deepStrictEqual(
  undef,
  [],
  `CSS variables used but never defined: ${undef.join(', ')}.\n` +
    `An invalid var() in a background makes it TRANSPARENT — the element does not fall back, it vanishes.\n` +
    `If these are runtime theme variables, give them an authoring-app default at :root.`,
)

// --- 2. no state rule paints a white label onto nothing ---------------------------------
// Blocks that set BOTH a white-ish colour and a transparent/inherit background are the
// signature of the bug; a deliberate ghost button sets a real background instead.
const blocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
const offenders: string[] = []
for (const [, selector, body] of blocks) {
  const white = /color:\s*(#fff|#ffffff|white)\b/i.test(body)
  const noBg = /background(-color)?:\s*(transparent|none|inherit)\s*;/i.test(body)
  if (white && noBg) offenders.push(selector.trim().slice(0, 80))
}
assert.deepStrictEqual(
  offenders,
  [],
  `these rules put a white label on a transparent background: ${offenders.join(' | ')}`,
)

// --- 3. the states that must exist on the shared button ---------------------------------
for (const state of [':hover', ':disabled']) {
  assert.ok(
    css.includes(`.btn${state}`),
    `.btn is missing a ${state} rule — every interactive element needs hover, focus-visible, active and disabled to stay readable`,
  )
}

console.log('styles self-check OK')
