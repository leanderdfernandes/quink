import { supabase } from './supabase'
import type { KnowledgeBase, ProductContext } from './types'

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

// Every KB this account can open — owned AND shared. Note the deliberate absence of
// `.single()`: the old resolver threw the moment an account had a second KB.
//
// No `owner_id` filter, and no membership join either: the select policy is
// `can_edit_kb(id) or is_admin()`, so RLS already returns exactly the KBs this account may
// open. Filtering by owner here is what made a shared help center invisible.
//
// The `isAdmin` branch is not an optimisation. Quink staff can read EVERY KB in the
// database, so an unfiltered query would put thirty demo help centers and every customer's
// into their switcher. Staff get their own; a customer KB they need is reached by URL, with
// the viewing-as-admin banner on it.
//
// ponytail: "recent-first" is creation order — there is no per-KB last-opened timestamp,
// and one column of bookkeeping isn't worth it until someone has enough KBs to care.
export async function listKbs(userId: string, isAdmin = false): Promise<KnowledgeBase[]> {
  const q = supabase.from('knowledge_bases').select('*').order('created_at', { ascending: false })
  const { data } = await (isAdmin ? q.eq('owner_id', userId) : q)
  return (data as KnowledgeBase[]) ?? []
}

// Which KB to open when the URL doesn't say: the last one used, else the first one there
// is. Persisting this is what stops a refresh dumping someone into a picker.
export async function resolveDefaultKb(
  userId: string,
  isAdmin = false,
): Promise<KnowledgeBase | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('last_kb_id')
    .eq('id', userId)
    .maybeSingle()

  // A remembered KB can be one this account was REMOVED from — fetchKb returns null for it
  // (RLS), and falling through to the list is what turns that into "you're back in your own
  // help center" rather than an error screen on every sign-in.
  if (profile?.last_kb_id) {
    const remembered = await fetchKb(profile.last_kb_id)
    if (remembered) return remembered
  }
  return (await listKbs(userId, isAdmin))[0] ?? null
}

// `last_kb_id` is the only profiles column a client may write — the rest of the table is
// entitlements, and the UPDATE grant is scoped to this one column (migration 0015).
export async function setLastKb(userId: string, kbId: string): Promise<void> {
  await supabase.from('profiles').update({ last_kb_id: kbId }).eq('id', userId)
}

// Remember the product tier on the KB so the next run does not ask for it again
// (migration 0027). Returns the updated row, because the caller is holding the old one.
//
// Deliberately does NOT touch `about`, and DECIDED not to — this is not an oversight.
// `about` is reader-facing prose on the public help center; `product_description` is
// model-facing grounding the user wrote for a different purpose. Prefilling one from the
// other was considered and rejected: someone types a blunt internal description ("the
// janky admin panel nobody maintains") and finds it published on their help center home
// page, from a silent write they never saw. If reader copy is ever seeded from this, it
// has to be a visible, editable step the user confirms — never a side effect of uploading.
//
// Goes through set_product_context() (migration 0040), not a table update: UPDATE on the
// four columns is revoked from `authenticated`, so a direct write now silently matches
// zero columns. The RPC is where the 600-char cap and the who/when stamp live.
//
// Returns the projection the RPC gives back, merged over the caller's row — NOT the whole
// KB. The RPC deliberately answers with the seven fields it wrote and nothing else.
export async function saveProductContext(
  kb: KnowledgeBase,
  product: ProductContext,
): Promise<KnowledgeBase> {
  const { data, error } = await supabase.rpc('set_product_context', {
    p_kb_id: kb.id,
    p_name: product.product_name,
    p_description: product.description,
    p_audience: product.audience,
    p_tone: product.tone,
  })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as {
    product_name: string
    product_description: string
    audience: string
    tone: string
    updated_at: string
    updated_by: string | null
    updated_by_name: string | null
  } | null
  if (!row) return kb
  return {
    ...kb,
    product_name: row.product_name,
    product_description: row.product_description,
    audience: row.audience,
    tone: row.tone,
    product_context_updated_at: row.updated_at,
    product_context_updated_by: row.updated_by,
    product_context_updated_by_name: row.updated_by_name,
  }
}
