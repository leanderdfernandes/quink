import { supabase } from './supabase'
import type { Folder } from './types'

// Folder CRUD for the article library (build spec §7). Thin wrappers over Supabase —
// RLS (migration 0009) scopes every row to the owner, so there's no ownership check to
// repeat here. Both the CONTENT library and the PUBLISH category-picker read folders.

export async function listFolders(kbId: string): Promise<Folder[]> {
  const { data } = await supabase
    .from('folders')
    .select('*')
    .eq('kb_id', kbId)
    .order('position')
  return (data as Folder[]) ?? []
}

export async function createFolder(kbId: string, existing: Folder[]): Promise<Folder | null> {
  // Append at the end. Positions are only ever compared within a KB, so max+1 is enough —
  // no global sequence to keep.
  const position = existing.reduce((m, f) => Math.max(m, f.position), -1) + 1
  const { data } = await supabase
    .from('folders')
    .insert({ kb_id: kbId, name: 'New folder', position })
    .select()
    .single()
  return (data as Folder) ?? null
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await supabase.from('folders').update({ name: name.trim() || 'Untitled' }).eq('id', id)
}

// Delete the folder only. Its articles fall to Unfiled via the FK's ON DELETE SET NULL
// (migration 0009) — they are never deleted, which is what the confirm copy promises.
export async function deleteFolder(id: string): Promise<void> {
  await supabase.from('folders').delete().eq('id', id)
}

// Move an article between folders. null = Unfiled.
export async function moveArticle(articleId: string, folderId: string | null): Promise<void> {
  await supabase.from('articles').update({ folder_id: folderId }).eq('id', articleId)
}
