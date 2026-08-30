// The product-context round trip (migration 0048):
//
//     cd web && npx tsx checks/context.check.ts
//
// Two things here can break silently, and both would be discovered by a customer rather
// than by a test.
//
// 1. TONE IS STORED AS ITS LABEL, not as two integers. That is what lets worker/prompts.py
//    read it with no change at all — but it means the sliders have to parse the string back,
//    and a parse that quietly returns the wrong index moves a saved "Casual · Thorough" help
//    center back to Neutral · Balanced the next time anyone opens Settings and saves.
//
// 2. THE CAPS ARE MIRRORED IN THREE PLACES (lib/config.ts, the RPC, the migration header).
//    The RPC is where they are enforced; a drift means the client accepts a value the
//    database will refuse, which surfaces as "that did not save" with nothing to act on.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
// lib/tone.ts and nothing else: it is pure by design, so this imports and RUNS the real
// helpers. lib/config.ts cannot be imported here at all -- it reads import.meta.env and
// throws unless VITE_APP_ENV is set, which is deliberate (§10m) -- so AUDIENCE_MAX is read
// from its source below, the same way styles.check.ts reads CSS.
import { TONE_VOICE, TONE_DETAIL, TONE_DEFAULT, toneLabel, toneIndices } from '../src/lib/tone'

const configSrc = readFileSync(new URL('../src/lib/config.ts', import.meta.url), 'utf8')
const AUDIENCE_MAX = Number(
  /export const AUDIENCE_MAX = (\d+)/.exec(configSrc)?.[1] ?? NaN,
)
assert.ok(Number.isInteger(AUDIENCE_MAX), 'AUDIENCE_MAX is no longer declared in config.ts')

// --- 1. every combination survives a round trip ------------------------------------------
for (let v = 0; v < TONE_VOICE.length; v++) {
  for (let d = 0; d < TONE_DETAIL.length; d++) {
    const label = toneLabel(v, d)
    assert.deepEqual(toneIndices(label), [v, d], `round trip broke at ${label}`)
    assert.ok(label.length <= 40, `"${label}" exceeds the RPC's 40-char tone cap`)
  }
}

// --- 2. anything unrecognised lands on the default, never on index 0 ----------------------
// Index 0 is Formal · Brief, which is a real setting: a parse that fell back to it would
// silently REWRITE a help center's voice rather than leave it alone.
for (const junk of ['', '   ', 'Neutral', 'Nonsense · Rubbish', 'Neutral - Balanced', null,
  undefined, 'Casual·', '· Brief']) {
  const got = toneIndices(junk as string | null | undefined)
  assert.ok(
    got[0] >= 0 && got[0] < TONE_VOICE.length && got[1] >= 0 && got[1] < TONE_DETAIL.length,
    `toneIndices(${JSON.stringify(junk)}) went out of range: ${got}`,
  )
}
assert.deepEqual(toneIndices(''), TONE_DEFAULT, 'an unset tone must open on the default')
assert.deepEqual(toneIndices('Nonsense · Rubbish'), TONE_DEFAULT)
// A HALF-recognised value keeps the half it recognises. Falling back on both would throw
// away a real choice because the other slider's word was misspelt.
assert.deepEqual(toneIndices('Casual · Rubbish'), [3, TONE_DEFAULT[1]])
assert.deepEqual(toneIndices('Rubbish · Thorough'), [TONE_DEFAULT[0], 2])

// --- 3. the caps agree with the database, which is where they are enforced ---------------
const sql = readFileSync(
  new URL('../../supabase/migrations/0048_product_context_voice.sql', import.meta.url),
  'utf8',
)
assert.ok(
  sql.includes(`length(v_aud) > ${AUDIENCE_MAX}`),
  `AUDIENCE_MAX is ${AUDIENCE_MAX} but the RPC caps the audience somewhere else`,
)
assert.ok(sql.includes('length(v_tone) > 40'), 'the tone cap moved without this check')
// Neither may be folded into the shared pool: the meter sums description + notes only, so a
// budget that counted either would refuse writes the client said were fine.
const budgetLine = sql.split('\n').find((l) => l.includes('select length(v_desc)')) ?? ''
assert.ok(
  !budgetLine.includes('v_aud') && !budgetLine.includes('v_tone'),
  'audience/tone were folded into the shared budget',
)

console.log('context self-check OK')
