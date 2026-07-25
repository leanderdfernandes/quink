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

// Delete the source recording and forget it, in that order.
//
// The order is load-bearing: null the column first and a failed delete strands the object
// in Storage with nothing in the database naming it — unfindable by the publish path and
// by the failed-job sweep alike. Delete first and the worst case is a row still pointing
// at a video that is already gone, which the next publish simply retries.
//
// One-way. Unpublishing does not bring the recording back — that is the point of the
// promise on the upload screen, not a gap in it.
export async function collectSourceVideo(
  articleId: string,
  videoPath: string,
): Promise<void> {
  const { error } = await supabase.storage.from(STORAGE_BUCKET_VIDEOS).remove([videoPath])
  if (error) return
  await supabase.from('articles').update({ source_video_path: null }).eq('id', articleId)
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
