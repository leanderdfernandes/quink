import { supabase } from '../lib/supabase'
import type { Article, ReaderArticleSummary, ReaderCategory, ReaderKb } from '../lib/types'

// Fallback name for listed articles that were published before the folder gate (folder_id
// null). New articles always have a folder — this only catches legacy rows.
const UNFILED_CATEGORY = 'Help articles'

// Group listed articles into category cards, preserving the RPC's order (folder position,
// then creation order) — the first time a folder is seen fixes its position in the list.
export function groupCategories(items: ReaderArticleSummary[]): ReaderCategory[] {
  const byKey = new Map<string, ReaderCategory>()
  const order: string[] = []
  for (const a of items) {
    const key = a.folder_id ?? '__unfiled__'
    let cat = byKey.get(key)
    if (!cat) {
      cat = { id: key, name: a.folder_name ?? UNFILED_CATEGORY, articles: [] }
      byKey.set(key, cat)
      order.push(key)
    }
    cat.articles.push(a)
  }
  return order.map((k) => byKey.get(k)!)
}

// Anon reader-site reads. Every one goes through a SECURITY DEFINER RPC (migration 0006),
// never a direct table select — base-table RLS is fully closed to anon, so drafts and other
// KBs' data are unreachable. This module is the only door.

// Resolve a host or dev slug to a KB's public theme. In prod pass the request host
// (subdomain or verified custom domain); in dev pass the KB subdomain (?kb= / /kb/{slug}).
export async function fetchReaderKb(key: string): Promise<ReaderKb | null> {
  const { data, error } = await supabase.rpc('reader_kb', { p_key: key })
  if (error || !data || data.length === 0) return null
  return data[0] as ReaderKb
}

export async function fetchReaderArticles(
  kbId: string,
): Promise<ReaderArticleSummary[]> {
  const { data, error } = await supabase.rpc('reader_articles', { p_kb_id: kbId })
  if (error || !data) return []
  return data as ReaderArticleSummary[]
}

export type ReaderArticle = {
  id: string
  slug: string
  visibility: 'listed' | 'unlisted'
  published_at: string
  content: Article
  folder_name: string | null
}

export async function fetchReaderArticle(
  kbId: string,
  slug: string,
): Promise<ReaderArticle | null> {
  const { data, error } = await supabase.rpc('reader_article', {
    p_kb_id: kbId,
    p_slug: slug,
  })
  if (error || !data || data.length === 0) return null
  return data[0] as ReaderArticle
}

export type SearchHit = {
  id: string
  slug: string
  title: string
  snippet: string
  rank: number
}

export async function searchReader(kbId: string, query: string): Promise<SearchHit[]> {
  if (!query.trim()) return []
  const { data, error } = await supabase.rpc('reader_search', {
    p_kb_id: kbId,
    p_query: query,
  })
  if (error || !data) return []
  return data as SearchHit[]
}

// Record that a reader session reached this help center (migration 0031). Fire-and-forget by
// construction: nothing awaits it, nothing renders from it, and a failure is swallowed —
// a counter must never be able to delay or break the page it is counting.
//
// The once-an-hour debounce is SERVER-side, in the RPC. Keeping it there is what makes the
// cap real: it holds no matter how the endpoint is called.
export function pingReader(kbId: string): void {
  // `.then(noop, noop)`, not `.catch`: the PostgREST builder is a thenable, not a Promise, so
  // it has no `.catch`. Both arms are empty on purpose — a returned `{ error }` (the RPC
  // refused) and a thrown network failure are equally none of the reader's business.
  supabase.rpc('reader_ping', { p_kb_id: kbId }).then(
    () => {},
    () => {},
  )
}

// The only write on the reader (migration 0025). Anonymous by construction: no id, no
// session, no fingerprint is sent or stored, because the widget's copy says so.
//
// kb_id is deliberately NOT a parameter — the function derives it from the article and
// refuses anything that isn't published on a live help center, so a caller cannot file
// feedback against a KB it names itself. Returns false when refused (unknown/draft article,
// or over the per-article flood limit); the caller acknowledges either way, because telling
// a flooder they were blocked only tells them where the limit is.
export async function submitFeedback(
  articleId: string,
  helpful: boolean,
  missingText?: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('submit_article_feedback', {
    p_article_id: articleId,
    p_helpful: helpful,
    p_missing_text: missingText?.trim() || null,
  })
  return !error && data === true
}

// A search that found nothing (migration 0037).
//
// Fire-and-forget by construction, exactly like pingReader: nothing awaits it, nothing
// renders from it, and both outcomes are swallowed. A reader typing into a search box must
// never be able to tell that this exists, let alone be slowed by it.
//
// It takes the HOST KEY, not a kb id — the RPC derives the KB server-side from the same
// predicate reader_kb resolves with, so a caller cannot file a miss against a help center it
// names itself, and gets `void` back whether the host was real, offline or invented.
//
// Normalising (lower, collapse, trim, cap) happens IN the function, not here. A client-side
// copy would be a second definition of what counts as the same query, and the two would
// disagree the first time either changed.
export function logSearchMiss(hostKey: string, query: string): void {
  supabase.rpc('log_reader_search_miss', { host_key: hostKey, q: query }).then(
    () => {},
    () => {},
  )
}
