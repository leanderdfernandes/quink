-- Publish = snapshot (draft → published version).
--
-- Publishing freezes the current article into `published_content`. Edits after that are a
-- private draft; readers keep seeing the snapshot until the author re-publishes. The
-- reader route renders `published_content`, never the live draft rows.
--
-- "Unpublished changes" is derived, not stored: any step/article updated_at later than
-- published_at (or published_at IS NULL) means the draft is ahead of the published version.

alter table public.articles
  add column published_content jsonb,
  add column published_at timestamptz;

comment on column public.articles.published_content is
  'Frozen snapshot rendered by the reader: { title, subtitle, steps: [...] }. Null until first publish. Live editing changes the step rows, not this — re-publishing overwrites it.';
