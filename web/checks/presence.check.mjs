// Presence, against the real project, with no browser:
//
//     cd web && node checks/presence.check.mjs
//
// Two Realtime clients on the same channel lib/usePresence.ts uses, mirroring its shape —
// one key per CONNECTION, de-duplicated by user_id.
//
// THE LAST ASSERTION IS THE POINT. Keying the channel on the user id is the obvious thing
// and it leaves a permanent ghost: with two tabs under one key, the second untrack never
// empties the key, so everyone else keeps seeing someone who left. This test failed
// exactly that way before the key changed, and a ghost that never clears teaches people to
// ignore presence altogether — which is worse than not having it.
//
// The waits are generous on purpose: this is a real round trip to a real server, and a
// flaky test of a real-time feature is a test nobody trusts.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const SUPA_URL = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY
const [kbId, articleId] = ['kb-test', 'article-test']
const NAME = `kb:${kbId}:article:${articleId}`

// Mirrors lib/usePresence.ts exactly: one key per CONNECTION, de-duplicated by user_id.
function join(me) {
  const c = createClient(SUPA_URL, KEY)
  const ch = c.channel(NAME, { config: { presence: { key: `${me.user_id}#${crypto.randomUUID()}` } } })
  const seen = { others: [] }
  ch.on('presence', { event: 'sync' }, () => {
    const byUser = new Map()
    for (const entries of Object.values(ch.presenceState())) {
      const p = entries[0]
      if (!p?.user_id || p.user_id === me.user_id) continue
      byUser.set(p.user_id, p.display_name)
    }
    seen.others = [...byUser.values()]
  }).subscribe(s => { if (s === 'SUBSCRIBED') ch.track(me) })
  return { c, ch, seen }
}
const wait = ms => new Promise(r => setTimeout(r, ms))
let fails = 0
const chk = (l, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}   got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  if (!ok) fails++
}

const a = join({ user_id: 'user-a', display_name: 'Priya Lal', avatar_url: null })
const b = join({ user_id: 'user-b', display_name: 'Meera Das', avatar_url: null })
await wait(4000)
chk('A sees B', a.seen.others, ['Meera Das'])
chk('B sees A', b.seen.others, ['Priya Lal'])
chk('neither sees themselves', [a.seen.others.includes('Priya Lal'), b.seen.others.includes('Meera Das')], [false, false])

// A second tab of the SAME person is not a second person.
const a2 = join({ user_id: 'user-a', display_name: 'Priya Lal', avatar_url: null })
await wait(4000)
chk('a second tab of A adds nobody for B', b.seen.others, ['Priya Lal'])

// Leaving clears — the ghost this must never produce.
await a2.ch.untrack(); await a2.c.removeChannel(a2.ch)
await wait(4000)
chk('one of two tabs closing leaves A present', b.seen.others, ['Priya Lal'])
await a.ch.untrack()
await wait(4000)
console.log('   after untrack only:', JSON.stringify(b.seen.others))
await a.c.removeChannel(a.ch)
await wait(4000)
chk('B sees nobody once A closes both tabs', b.seen.others, [])

await b.ch.untrack(); await b.c.removeChannel(b.ch)
console.log(fails ? `\n${fails} FAILED` : '\npresence OK')
process.exit(fails ? 1 : 0)
