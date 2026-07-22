-- Storage for the public reader site.
--
-- Decision (flagged against CLAUDE.md §8, confirmed with the owner): the reader is public
-- and anon, and screenshots ARE the published content the customer chose to show the world.
-- So the `frames` bucket becomes public — reads via getPublicUrl, CDN-cached, no signing.
-- Draft frames are technically fetchable, but only via unguessable UUID paths and the DB
-- never exposes a draft's paths to anon (reader RPCs return published snapshots only).
update storage.buckets set public = true where id = 'frames';

-- Branding bucket: logos + derived favicons. Public (they render on the reader). Owner
-- writes only, keyed by "<user_id>/..." like the other buckets.
insert into storage.buckets (id, name, public) values ('branding', 'branding', true)
on conflict (id) do update set public = true;

create policy storage_branding_own on storage.objects
  for all to authenticated
  using (bucket_id = 'branding' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'branding' and (storage.foldername(name))[1] = (select auth.uid())::text);
