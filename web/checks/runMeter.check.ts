// The rail run meter's three shapes:
//
//     cd web && npx tsx checks/runMeter.check.ts
//
// It touches no network. The two env vars are only there because plans.ts sits beside the
// supabase client, which refuses to load unconfigured.
//
// THE LAST TWO ASSERTIONS ARE THE POINT. Nothing in runMeter() may compare a plan NAME —
// the shape has to fall out of PLANS, or the tier table has a second copy that drifts the
// first time a tier is added. So: a hypothetical plan with a monthly cap must render the
// monthly shape without runMeter knowing anything about it, and no plan id may appear as a
// literal in the source.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
// Dynamic, because ESM evaluates static imports before any statement here runs and
// plans.ts sits beside the supabase client, which refuses to load unconfigured.
process.env.VITE_SUPABASE_URL ??= 'http://check.invalid'
process.env.VITE_SUPABASE_ANON_KEY ??= 'check'
const { runMeter } = await import('../src/lib/plans')
type Entitlements = import('../src/lib/plans').Entitlements

const ent = (over: Partial<Entitlements>): Entitlements => ({
  is_owner: true, plan: 'free', owner_name: 'A', lifetime_runs: 3, runs_used: 0,
  expiry_days: 30, can_invite: false, watermark: true, noindex: true, ...over,
})

// free — lifetime cap, counted off the LIFETIME total, short copy
const free = runMeter(ent({ plan: 'free', runs_used: 2, cycle_runs_used: 1 }))
assert.equal(free.count, '2 of 3 free runs')
assert.equal(free.cap, 3)
assert.equal(free.used, 2)
assert.ok(!free.copy.includes('already happened'))
assert.ok(free.copy.includes('unlimited'))

// starter — monthly cap, counted off the CYCLE, full copy
const starter = runMeter(ent({ plan: 'starter', lifetime_runs: null, runs_used: 180, cycle_runs_used: 13 }))
assert.equal(starter.count, '13 of 20')
assert.equal(starter.cap, 20)
assert.equal(starter.used, 13)
assert.ok(starter.copy.includes('the run already happened'))

// internal — no cap at all: a number, not a budget
const internal = runMeter(ent({ plan: 'internal', lifetime_runs: null, runs_used: 99, cycle_runs_used: 43 }))
assert.equal(internal.cap, null)
assert.equal(internal.count, '43 this cycle')
assert.equal(internal.copy, '')

// An SPA deployed ahead of migration 0039 gets no cycle column. Stale, never NaN.
const old = runMeter(ent({ plan: 'growth', lifetime_runs: null, runs_used: 7 }))
assert.equal(old.count, '7 of 80')

// The shape is read off PLANS, not off the plan's name.
const src = readFileSync(new URL('../src/lib/plans.ts', import.meta.url), 'utf8')
const body = src.slice(src.indexOf('export function runMeter'))
for (const id of ['free', 'founding', 'starter', 'growth', 'internal'])
  assert.ok(!new RegExp(`['"\`]${id}['"\`]`).test(body), `runMeter names the plan '${id}'`)

console.log('runMeter: ok')
