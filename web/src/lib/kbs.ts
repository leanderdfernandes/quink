import { supabase } from './supabase'
import type { KnowledgeBase } from './types'

// Authoring resolves a KB from the PATH; the reader resolves one from the HOSTNAME
// (lib/config.ts readerKeyFromHost). Those two never share a resolver — a single
// "get current KB" helper that sometimes reads the host and sometimes the path is
// how a customer eventually gets served someone else's help center.

// One KB by id. Returns null when it doesn't exist OR isn't ours — RLS answers both with
// zero rows, and the caller must render the same thing for both so a URL probe can't tell
// "no access" from "no such KB".
export async function fetchKb(kbId: string): Promise<KnowledgeBase | null> {
  const { data } = await supabase.from('knowledge_bases').select('*').eq('id', kbId).maybeSingle()
  return (data as KnowledgeBase) ?? null
}

// Every KB this account can open. Note the deliberate absence of `.single()`: the old
// resolver threw the moment an account had a second KB.
// ponytail: "recent-first" is creation order — there is no per-KB last-opened timestamp,
// and one column of bookkeeping isn't worth it until someone has enough KBs to care.
export async function listKbs(userId: string): Promise<KnowledgeBase[]> {
  const { data } = await supabase
    .from('knowledge_bases')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
  return (data as KnowledgeBase[]) ?? []
}

// Which KB to open when the URL doesn't say: the last one used, else the first one there
// is. Persisting this is what stops a refresh dumping someone into a picker.
export async function resolveDefaultKb(userId: string): Promise<KnowledgeBase | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('last_kb_id')
    .eq('id', userId)
    .maybeSingle()

  if (profile?.last_kb_id) {
    const remembered = await fetchKb(profile.last_kb_id)
    if (remembered) return remembered
  }
  return (await listKbs(userId))[0] ?? null
}

// `last_kb_id` is the only profiles column a client may write — the rest of the table is
// entitlements, and the UPDATE grant is scoped to this one column (migration 0015).
export async function setLastKb(userId: string, kbId: string): Promise<void> {
  await supabase.from('profiles').update({ last_kb_id: kbId }).eq('id', userId)
}
