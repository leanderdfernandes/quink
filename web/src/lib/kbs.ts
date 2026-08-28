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

// The product tier as the UI wants it, from a column that can legitimately be `{}` — the
// default a KB carries until its first save. Every read site goes through this rather than
// trusting the shape, because `product_context` is jsonb and nothing in the type system
// stops the database handing back a row that predates a key.
export const EMPTY_PRODUCT_CONTEXT: ProductContext = { name: '', description: '', notes: [] }

export function productContextOf(kb: {
  product_context?: ProductContext | null
}): ProductContext {
  const c = kb.product_context
  if (!c || typeof c !== 'object') return EMPTY_PRODUCT_CONTEXT
  return {
    name: c.name ?? '',
    description: c.description ?? '',
    notes: Array.isArray(c.notes) ? c.notes : [],
    updated_at: c.updated_at ?? null,
    updated_by: c.updated_by ?? null,
  }
}

// Remember the product tier on the KB so the next run does not ask for it again
// (migrations 0027, folded by 0044). Returns the updated row, because the caller is
// holding the old one.
//
// Deliberately does NOT touch `about`, and DECIDED not to — this is not an oversight.
// `about` is reader-facing prose on the public help center; the product description is
// model-facing grounding the user wrote for a different purpose. Prefilling one from the
// other was considered and rejected: someone types a blunt internal description ("the
// janky admin panel nobody maintains") and finds it published on their help center home
// page, from a silent write they never saw. If reader copy is ever seeded from this, it
// has to be a visible, editable step the user confirms — never a side effect of uploading.
//
// Goes through set_product_context() (0044), not a table update: `product_context` is not
// in the UPDATE grant, so a direct write silently matches zero columns. The RPC is where
// CONTEXT_CHAR_BUDGET, the note normalisation and the who/when stamp live.
export async function saveProductContext(
  kb: KnowledgeBase,
  product: ProductContext,
): Promise<KnowledgeBase> {
  const { data, error } = await supabase.rpc('set_product_context', {
    p_kb_id: kb.id,
    p_name: product.name,
    p_description: product.description,
    // Only the three fields the column stores. The RPC mints ids and stamps the audit
    // fields itself, so sending them back would be sending it its own output.
    p_notes: product.notes.map((n) => ({ id: n.id, title: n.title, body: n.body })),
  })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as {
    product_context: ProductContext
    updated_by_name: string | null
  } | null
  if (!row) return kb
  return {
    ...kb,
    product_context: row.product_context,
    product_context_updated_by_name: row.updated_by_name,
  }
}
