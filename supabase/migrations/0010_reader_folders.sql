-- Surface folders (= categories) to the anon reader (build spec §3/§7).
--
-- The redesigned help-center home groups published articles into category cards, and the
-- article page shows a "Help Center / {category}" breadcrumb — both need the folder a
-- published article is filed in. Base-table RLS stays closed to anon; we only widen the
-- existing SECURITY DEFINER projections (migration 0006) to include the folder's name +
-- ordering. Folders carry no private data, so this leaks nothing.
--
-- Return-type changes, so each function is dropped and recreated (same as migration 0008).

-- Listed articles for the home, now carrying their folder for grouping. Ordered by folder
-- position (unfiled last), then creation order within a folder.
drop function if exists public.reader_articles(uuid);
create function public.reader_articles(p_kb_id uuid)
returns table (
  id uuid, slug text, title text, subtitle text, published_at timestamptz,
  folder_id uuid, folder_name text, folder_position integer
)
language sql stable security definer set search_path = public as $$
  select a.id, a.slug,
         coalesce(nullif(a.published_content->>'title', ''), a.title)    as title,
         coalesce(a.published_content->>'subtitle', a.subtitle)         as subtitle,
         a.published_at,
         f.id, f.name, f.position
    from public.articles a
    left join public.folders f on f.id = a.folder_id
   where a.kb_id = p_kb_id and a.visibility = 'listed'
   order by f.position asc nulls last, a.created_at asc
$$;

-- One article by slug, now with its folder name for the breadcrumb. Access rule unchanged
-- (listed OR unlisted; draft → no row).
drop function if exists public.reader_article(uuid, text);
create function public.reader_article(p_kb_id uuid, p_slug text)
returns table (
  id uuid, slug text, visibility text, published_at timestamptz,
  content jsonb, folder_name text
)
language sql stable security definer set search_path = public as $$
  select a.id, a.slug, a.visibility, a.published_at, a.published_content, f.name
    from public.articles a
    left join public.folders f on f.id = a.folder_id
   where a.kb_id = p_kb_id
     and a.slug = p_slug
     and a.visibility in ('listed', 'unlisted')
     and a.published_content is not null
   limit 1
$$;

grant execute on function public.reader_articles(uuid)      to anon, authenticated;
grant execute on function public.reader_article(uuid, text) to anon, authenticated;
