-- Repoint the pre-0014 storage references from the owner-id prefix to {kb_id}/…
--
-- Migration 0014 re-keyed storage by KB and rewrote the CODE, but not the objects that
-- already existed. So the Memory KB's articles still pointed at
-- "43d8340b-…/{article_id}/step-N.webp", where the first segment is a USER id.
-- owns_kb_path() matches that segment against knowledge_bases.id, which a user id never
-- will — so writes failed on all 22 articles: replace-screenshot was broken, no signed URL
-- could be minted for their source videos (breaking the Tier-2 frame picker), and the
-- day-37 purge keyed on {kb_id}/ would never have reached any of it. They rendered only
-- because the frames bucket is public and public reads skip RLS entirely.
--
-- The objects were COPIED to their new paths and verified first (count, bytes, per-object
-- existence, a resolving signed URL for all 18 videos). The originals are still in place,
-- so until they are deleted in a later, separate step, rolling this back is just reverting
-- this migration.
--
-- The assertions below are the safety mechanism: every count is what phase 2 verified. If
-- the database disagrees by even one row, this raises and the entire rewrite rolls back
-- with the live site still pointing at objects that still exist.

do $$
declare
  v_old  text := '43d8340b-5e71-4395-9038-5c24979633a9/';
  v_new  text := '477eb260-e9e4-48d3-9eee-906c008a6a02/';
  v_n    int;
begin
  update public.steps
     set screenshot_url = v_new || substring(screenshot_url from length(v_old) + 1)
   where screenshot_url like v_old || '%';
  get diagnostics v_n = row_count;
  if v_n <> 77 then
    raise exception 'steps.screenshot_url: rewrote % rows, expected 77', v_n;
  end if;

  update public.articles
     set source_video_path = v_new || substring(source_video_path from length(v_old) + 1)
   where source_video_path like v_old || '%';
  get diagnostics v_n = row_count;
  if v_n <> 18 then
    raise exception 'articles.source_video_path: rewrote % rows, expected 18', v_n;
  end if;

  update public.knowledge_bases
     set logo_path = v_new || substring(logo_path from length(v_old) + 1)
   where logo_path like v_old || '%';
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'knowledge_bases.logo_path: rewrote % rows, expected 1', v_n;
  end if;

  update public.knowledge_bases
     set favicon_path = v_new || substring(favicon_path from length(v_old) + 1)
   where favicon_path like v_old || '%';
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'knowledge_bases.favicon_path: rewrote % rows, expected 1', v_n;
  end if;

  -- articles.published_content is the frozen snapshot the PUBLIC READER renders — it is
  -- not derived from the step rows above, it embeds its own copy of every screenshot_url
  -- (ReaderSite.tsx renders s.screenshot_url straight out of this snapshot). Rewriting the
  -- live rows and leaving the snapshots behind would look completely fine right up until
  -- the old objects are deleted, at which point every image on the live custom-domain help
  -- center 404s. A text-level swap inside the JSON is safe here: the old prefix is a UUID,
  -- so it cannot collide with article prose.
  update public.articles
     set published_content = replace(published_content::text, v_old, v_new)::jsonb
   where published_content::text like '%' || v_old || '%';
  -- One snapshot, not four: four articles have snapshots but three are hand-written and
  -- carry no images at all (every screenshot_url in them is null).
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'articles.published_content: rewrote % snapshots, expected 1', v_n;
  end if;

  -- Nothing anywhere may still name the old prefix.
  select count(*) into v_n from public.steps where screenshot_url like v_old || '%';
  if v_n <> 0 then raise exception '% steps still on the old prefix', v_n; end if;
  select count(*) into v_n from public.articles where source_video_path like v_old || '%';
  if v_n <> 0 then raise exception '% articles still on the old prefix', v_n; end if;
  select count(*) into v_n from public.articles
   where published_content::text like '%' || v_old || '%';
  if v_n <> 0 then raise exception '% snapshots still on the old prefix', v_n; end if;
end $$;
