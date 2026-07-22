-- Public reader-site data access (build spec §3).
--
-- Security posture — this is the "one bug class that ends the business" (build spec):
-- base-table RLS stays FULLY CLOSED to anon (no anon SELECT policy on knowledge_bases /
-- articles / steps). The reader reaches data ONLY through these SECURITY DEFINER functions,
-- which return a fixed, reader-safe projection: published KB theme fields, and articles
-- that are `listed` (in nav/search/sitemap) or `unlisted` (resolvable by direct slug only).
-- Drafts and other KBs' private columns (owner_id, free_articles_used, domain_error, …) are
-- never selectable by anon because there is no path to them. An RPC is a narrow door; an
-- anon SELECT policy is an open wall.

-- Resolve a host/slug to a KB's public theme. `custom_domain` only resolves once the domain
-- is verified live; the subdomain always resolves (it never goes down — build spec §4).
create or replace function public.reader_kb(p_key text)
returns table (
  id uuid, name text, primary_color text, font_pairing text,
  logo_path text, favicon_path text, subdomain text, custom_domain text,
  domain_status text, plan text
)
language sql stable security definer set search_path = public as $$
  select kb.id, kb.name, kb.primary_color, kb.font_pairing,
         kb.logo_path, kb.favicon_path, kb.subdomain, kb.custom_domain,
         kb.domain_status, kb.plan
    from public.knowledge_bases kb
   where kb.subdomain = p_key
      or (kb.custom_domain = p_key and kb.domain_status = 'live')
   limit 1
$$;

-- Listed articles for nav / prev-next / sitemap, in creation order. Unlisted excluded here
-- by design — that is what "unlisted" means. Titles come from the published snapshot.
create or replace function public.reader_articles(p_kb_id uuid)
returns table (id uuid, slug text, title text, subtitle text, published_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.slug,
         coalesce(nullif(a.published_content->>'title', ''), a.title)    as title,
         coalesce(a.published_content->>'subtitle', a.subtitle)         as subtitle,
         a.published_at
    from public.articles a
   where a.kb_id = p_kb_id and a.visibility = 'listed'
   order by a.created_at asc
$$;

-- One article by slug. Resolves for listed OR unlisted (direct-link access); draft → no row
-- (the reader renders 404). Returns the frozen snapshot the reader displays.
create or replace function public.reader_article(p_kb_id uuid, p_slug text)
returns table (id uuid, slug text, visibility text, published_at timestamptz, content jsonb)
language sql stable security definer set search_path = public as $$
  select a.id, a.slug, a.visibility, a.published_at, a.published_content
    from public.articles a
   where a.kb_id = p_kb_id
     and a.slug = p_slug
     and a.visibility in ('listed', 'unlisted')
     and a.published_content is not null
   limit 1
$$;

-- Full-text search over LISTED articles only (build spec §3: unlisted never appears in
-- search results). Returns a highlighted snippet.
create or replace function public.reader_search(p_kb_id uuid, p_query text)
returns table (id uuid, slug text, title text, snippet text, rank real)
language sql stable security definer set search_path = public as $$
  with q as (select websearch_to_tsquery('english', coalesce(p_query, '')) as tsq)
  select a.id, a.slug,
         coalesce(nullif(a.published_content->>'title', ''), a.title) as title,
         ts_headline('english',
           public.article_search_text(a.title, a.subtitle, a.published_content),
           q.tsq, 'MaxFragments=1,MaxWords=18,MinWords=5') as snippet,
         ts_rank(a.search_vector, q.tsq) as rank
    from public.articles a, q
   where a.kb_id = p_kb_id
     and a.visibility = 'listed'
     and q.tsq @@ a.search_vector
   order by rank desc
   limit 20
$$;

grant execute on function public.reader_kb(text)              to anon, authenticated;
grant execute on function public.reader_articles(uuid)        to anon, authenticated;
grant execute on function public.reader_article(uuid, text)   to anon, authenticated;
grant execute on function public.reader_search(uuid, text)    to anon, authenticated;
