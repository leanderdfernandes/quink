import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

// Who else has this article open. One Supabase Realtime presence channel per article,
// `kb:{kbId}:article:{articleId}`.
//
// PREVENTING COLLISIONS, NOT SIMULATING GOOGLE DOCS. There are no remote cursors, no
// selection highlights and no typing indicators here on purpose: those are a different
// product with a different data model behind it, and none of them are what stops two people
// overwriting each other. The stale-write guard does that. This is the warning that means
// nobody has to be caught by the guard in the first place.
//
// A ghost that never clears is worse than no presence at all — it teaches people to ignore
// the signal, which is the one thing it cannot survive. So the channel is removed on
// unmount, on navigating to another article, and by the server when the socket drops.
//
// KEYED PER CONNECTION, and de-duplicated by user when rendering. Keying the channel on
// the user id is the obvious thing and it produces the exact ghost this hook must not have:
// with two tabs under one key, the second leave never empties the key, so everyone else
// keeps seeing someone who closed the tab five minutes ago. Verified against the live
// project — two tabs, both untracked, and the key stayed at one meta forever. One key per
// connection leaves cleanly every time; the de-duplication below is what keeps your own
// second tab from appearing as a second person.
//
// The channel is public — anyone signed in who knows a kb id and an article id could join
// it and see who is editing. What travels is a display name and an avatar url, never
// article content, and both ids are already in the URL of everyone who legitimately has
// access. Making it private needs Realtime authorization policies; noted in OPEN-ITEMS
// rather than half-built here.

export type Peer = {
  user_id: string
  display_name: string
  avatar_url: string | null
}

export function usePresence(
  kbId: string,
  articleId: string | null,
  me: Peer | null,
): Peer[] {
  const [peers, setPeers] = useState<Peer[]>([])
  // The identity is a new object on every render; the effect must key on its VALUES or it
  // resubscribes in a loop, and a channel that tears down and rebuilds every render is a
  // presence list that flickers empty.
  const meKey = me ? `${me.user_id}|${me.display_name}|${me.avatar_url ?? ''}` : null

  useEffect(() => {
    if (!articleId || !me) {
      setPeers([])
      return
    }
    // Unique per mount. `crypto.randomUUID` is in every browser this app supports and
    // needs no dependency.
    const connectionKey = `${me.user_id}#${crypto.randomUUID()}`
    const channel = supabase.channel(`kb:${kbId}:article:${articleId}`, {
      config: { presence: { key: connectionKey } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<Peer>()
        // Group by the tracked user_id, not by the channel key: one person with three tabs
        // is one face. Their own connections are dropped first — seeing yourself listed as
        // a collaborator is alarming for no reason.
        const byUser = new Map<string, Peer>()
        for (const entries of Object.values(state)) {
          const p = entries[0]
          if (!p?.user_id || p.user_id === me.user_id) continue
          byUser.set(p.user_id, {
            user_id: p.user_id,
            display_name: p.display_name,
            avatar_url: p.avatar_url ?? null,
          })
        }
        setPeers([...byUser.values()])
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void channel.track(me)
      })

    return () => {
      // untrack THEN remove: removing alone leaves the server holding the last state for
      // as long as it takes the socket to notice, which is exactly the ghost this hook
      // must not produce.
      void channel.untrack()
      void supabase.removeChannel(channel)
      setPeers([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kbId, articleId, meKey])

  return useMemo(() => peers, [peers])
}
