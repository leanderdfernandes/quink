import { supabase } from './supabase'

// Mirrors the SQL slugify() in migration 0005 so a slug generated client-side matches what
// the DB would produce. Lowercase, non-alphanumerics → single dash, trimmed.
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// First free "{base}", "{base}-2", … within a KB (slug is unique per kb_id, migration 0005).
// excludeId lets an article keep its own slug on re-check.
export async function uniqueArticleSlug(
  kbId: string,
  base: string,
  excludeId: string,
): Promise<string> {
  const root = slugify(base) || 'article'
  const { data } = await supabase
    .from('articles')
    .select('id, slug')
    .eq('kb_id', kbId)
    .not('slug', 'is', null)
  const taken = new Set(
    (data ?? [])
      .filter((r: { id: string; slug: string | null }) => r.id !== excludeId)
      .map((r: { slug: string | null }) => r.slug),
  )
  if (!taken.has(root)) return root
  for (let n = 2; ; n++) {
    const cand = `${root}-${n}`
    if (!taken.has(cand)) return cand
  }
}
