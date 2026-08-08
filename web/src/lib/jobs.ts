import { supabase } from './supabase'
import type { Job } from './types'

// Runs that are still going. Until now the SPA had no way to ask this: `jobId` is React
// state and nothing else, so closing the tab finished the work but lost every trace of it
// in the UI — the article sat on the "Generating" badge it had at page load and never moved.
//
// Columns are the 0020 allowlist (id, article_id, kb_id, stage, status are all granted).
// Asking for one that isn't would 401 the whole query, so keep this list honest.
export type InFlightJob = Pick<Job, 'id' | 'article_id' | 'kb_id' | 'stage' | 'status'>

// The most recent run that produced this article. Read on demand — the frame picker needs
// it to tell "the frames are still being pulled" apart from "pulling them failed", and
// those two states deserve opposite sentences. One extra round trip on opening a modal.
//
// `frames_ready_at`, NOT `status`, answers that. The dense frame pass runs past the finish
// line (pipeline.py), so `status` is already 'done' while the frames are still landing —
// reading it as "the pass finished" is what told users a perfectly healthy run had failed,
// for the three and a half minutes it took to write 114 objects. Migration 0030.
//
// `id` and `stage` are here for the OTHER caller: opening a still-generating article from
// the article list arrives with no job id in hand (App.tsx only passes one on the
// first-run landing), so without them the editor would show a build bar with no stage that
// never noticed the run finish — a spinner with no end, which is the worst state the
// product can be in (CLAUDE.md §10g).
export type ArticleJob = Pick<Job, 'id' | 'stage' | 'status' | 'degraded' | 'frames_ready_at'>

export async function fetchArticleJob(articleId: string): Promise<ArticleJob | null> {
  const { data } = await supabase
    .from('jobs')
    .select('id,stage,status,degraded,frames_ready_at')
    .eq('article_id', articleId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as ArticleJob | null) ?? null
}

export async function listInFlightJobs(userId: string): Promise<InFlightJob[]> {
  const { data } = await supabase
    .from('jobs')
    .select('id,article_id,kb_id,stage,status')
    .eq('user_id', userId)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })
  return (data as InFlightJob[]) ?? []
}
