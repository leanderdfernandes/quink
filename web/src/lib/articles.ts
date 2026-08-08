import { supabase } from './supabase'
import { STORAGE_BUCKET_FRAMES, STORAGE_BUCKET_VIDEOS } from './config'
import { uniqueArticleSlug } from './slug'
import type { StepLite } from './pendingEdits'
import type { Article, ArticleRow } from './types'

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

// THE published snapshot. One builder, both publish paths.
//
// There used to be two hand-rolled copies of this object — Editor.doPublish and
// publishArticle below (the row menu AND bulk publish) — sharing nothing. That duplication
// is the defect, not a symptom of one: whatever the reader renders comes from here, so a
// field added to one copy and missed in the other ships annotated from the editor and bare
// from the article list, on the same article, depending on which button was pressed.
//
// This is the shape of `Article` (CLAUDE.md §6) and nothing else. is_edited and
// timestamp_seconds are deliberately NOT in it: they are editing state, not published
// content, and the reader has no use for either. discardChanges carries them across
// separately rather than round-tripping them through here.
export function publishSnapshot(
  title: string,
  subtitle: string,
  steps: StepLite[],
): Article {
  return {
    title,
    subtitle,
    steps: steps.map((s) => ({
      step_number: s.step_number,
      heading: s.heading,
      body_text: s.body_text,
      screenshot_url: s.screenshot_url,
      annotations: s.annotations ?? [],
    })),
  }
}

// Publish from the article list (bulk, or the row menu). Same three writes the editor's
// doPublish makes — snapshot, frozen slug, visibility — and the same source-video
// collection afterwards. It deliberately does NOT touch folder_id: an article without one
// cannot be published at all (the category IS the folder), and the caller names the ones it
// skipped rather than filing them somewhere on the user's behalf.
export async function publishArticle(article: ArticleRow, steps: StepLite[]): Promise<void> {
  if (!article.folder_id) throw new Error('Needs a folder before it can go live')
  const slug =
    article.slug ||
    (await uniqueArticleSlug(article.kb_id, article.title || 'article', article.id))
  const snapshot = publishSnapshot(article.title, article.subtitle, steps)
  const { error } = await supabase
    .from('articles')
    .update({
      published_content: snapshot,
      published_at: new Date().toISOString(),
      visibility: 'listed',
      slug,
    })
    .eq('id', article.id)
  if (error) throw error
  // Keeps the upload screen's promise on the first publish; a no-op on every one after.
  if (article.source_video_path) {
    await collectSourceVideo(article.id, article.source_video_path)
  }
}

// Take an article off the help center. `visibility` is the only thing that moves —
// published_content and the slug stay, so republishing restores the same URL.
export async function unpublishArticle(id: string): Promise<void> {
  const { error } = await supabase.from('articles').update({ visibility: 'draft' }).eq('id', id)
  if (error) throw error
}

// Duplicate an article as a fresh draft.
//
// The frame objects are COPIED, not referenced. Two articles pointing at one object means
// deleting either one takes the other's screenshots with it — removeFrames() sweeps by
// {kb_id}/{article_id} prefix and cannot know the object is shared. A copy that fails
// leaves that step text-only, which the editor already handles; it never fails the whole
// duplicate.
export async function duplicateArticle(
  article: ArticleRow,
  steps: StepLite[],
): Promise<string> {
  const { data, error } = await supabase
    .from('articles')
    .insert({
      kb_id: article.kb_id,
      title: article.title ? `${article.title} (copy)` : '',
      subtitle: article.subtitle,
      status: 'ready',
      folder_id: article.folder_id,
    })
    .select()
    .single()
  if (error || !data) throw error ?? new Error('Could not create the copy')
  const copy = data as ArticleRow

  const shots = await Promise.all(
    steps.map(async (s) => {
      if (!s.screenshot_url) return null
      const to = `${article.kb_id}/${copy.id}/step-${s.step_number}-${crypto.randomUUID()}.webp`
      const { error: e } = await supabase.storage
        .from(STORAGE_BUCKET_FRAMES)
        .copy(s.screenshot_url, to)
      return e ? null : to
    }),
  )

  if (steps.length) {
    const { error: se } = await supabase.from('steps').insert(
      // EVERY step column that carries user intent. This list was four fields and silently
      // dropped is_edited and timestamp_seconds on every duplicate — the first meant a
      // pipeline re-run could overwrite a frame a human had chosen (CLAUDE.md §8), the
      // second blanked the frame picker's current-frame marker on the copy. Annotations
      // would have been the third. If you add a column to `steps`, it goes here too.
      steps.map((s, i) => ({
        article_id: copy.id,
        step_number: s.step_number,
        heading: s.heading,
        body_text: s.body_text,
        screenshot_url: shots[i],
        is_edited: s.is_edited ?? false,
        timestamp_seconds: s.timestamp_seconds ?? null,
        annotations: s.annotations ?? [],
      })),
    )
    if (se) throw se
  }
  return copy.id
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
