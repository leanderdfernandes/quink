-- Atomic increment for the free-article counter.
--
-- This is NOT quota enforcement (that's deferred — nothing blocks at 3 this slice). It
-- keeps `free_articles_used` a truthful number so the KB chrome's "2 of 3 free articles
-- left" counter has a real source.
--
-- Why a counter and not count(articles): the free tier is 3 LIFETIME articles
-- (CLAUDE.md §7, pricing-spec §2). Deriving the number from a live row count would hand
-- a free slot back every time a user deleted an article — "lifetime" would silently mean
-- "concurrent". A counter that only goes up is the whole point.
--
-- Called by the worker (service role) as it creates the article, so the increment happens
-- exactly where a generation is actually spent.

create or replace function public.increment_free_articles(p_kb_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.knowledge_bases
     set free_articles_used = free_articles_used + 1
   where id = p_kb_id
  returning free_articles_used;
$$;

revoke execute on function public.increment_free_articles(uuid) from anon, authenticated;
