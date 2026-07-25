import { supabase } from './supabase'
import { STORAGE_BUCKET_FRAMES, STORAGE_BUCKET_VIDEOS } from './config'
import type { ArticleRow } from './types'

// Delete an article. The DB row is the source of truth (its steps cascade via FK); Storage
// cleanup is best-effort afterwards — it closes the orphaned-frames gap the README noted,
// but a failed cleanup must not fail the delete the user asked for.
//
// The run this article came from is NOT returned. Its ledger row in `jobs` survives the
// delete (the FK is `on delete set null`, migration 0014), and quota is count(*) over that
// ledger — so delete-and-regenerate cannot mint free runs.

async function removeFrames(kbId: string, articleId: string): Promise<void> {
  // Frames are keyed {kb_id}/{articleId}/... with a dense/ subfolder (worker pipeline.py
  // + storage.ts). list() isn't recursive, so sweep both levels.
  const base = `${kbId}/${articleId}`
  for (const prefix of [base, `${base}/dense`]) {
    const { data } = await supabase.storage.from(STORAGE_BUCKET_FRAMES).list(prefix, {
      limit: 1000,
    })
    const files = (data ?? []).filter((o) => o.name).map((o) => `${prefix}/${o.name}`)
    if (files.length) await supabase.storage.from(STORAGE_BUCKET_FRAMES).remove(files)
  }
}

export async function deleteArticle(article: ArticleRow): Promise<void> {
  const { error } = await supabase.from('articles').delete().eq('id', article.id)
  if (error) throw error

  // The article row carries its own kb_id, so callers no longer have to hand us an owner.
  await removeFrames(article.kb_id, article.id).catch(() => {})
  if (article.source_video_path) {
    await supabase.storage
      .from(STORAGE_BUCKET_VIDEOS)
      .remove([article.source_video_path])
      .catch(() => {})
  }
}
