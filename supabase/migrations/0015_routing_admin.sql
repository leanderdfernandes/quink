-- Admin access + the privilege-escalation fix (mvp-dev-plan §9).
--
-- Two shared helpers replace ownership logic that was written inline in every policy.
-- Inline copies are how a policy quietly drifts from its siblings; one helper is auditable
-- in a single place and revocable in a single line.
--
-- Both are SECURITY DEFINER on purpose, and not for convenience: the policies below call
-- them, and the tables they read are the same tables those policies protect. An invoker
-- rights helper would re-enter its own policy and recurse forever. Owned by postgres, so
-- they read past RLS and terminate.

-- ---------------------------------------------------------------------------
-- FIRST: close the self-elevation hole
-- ---------------------------------------------------------------------------
-- `profiles_update_own` (migration 0001) is `for update using (id = auth.uid())` with no
-- WITH CHECK and no column restriction. That was harmless while profiles held only an
-- email — and became a privilege escalation the moment 0014 put `plan` and `is_admin` on
-- it. Any signed-in client could run:
--
--     supabase.from('profiles').update({ is_admin: true, plan: 'internal' }).eq('id', me)
--
-- ...and grant itself unlimited runs, no watermark, and — after this migration — write
-- access to every customer's KB. Every other policy here would be decorative.
--
-- RLS is row-level and cannot express "this row, but not these columns". Column privileges
-- can, so that is the right tool: revoke the blanket UPDATE and hand back exactly the one
-- column the client legitimately writes.
revoke update on public.profiles from authenticated, anon;
grant  update (last_kb_id) on public.profiles to authenticated;

-- NOTE for the admin surface: this also means the admin plan dropdown CANNOT write
-- `profiles.plan` from the client, by design — changing someone's plan is a money
-- operation. It needs a SECURITY DEFINER rpc that checks is_admin(), or the service role.
-- Do not "fix" that by widening this grant.

-- ---------------------------------------------------------------------------
-- The two helpers
-- ---------------------------------------------------------------------------
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false)
$$;

comment on function public.is_admin() is
  'Admin-surface access. Granted ONLY by the service role writing profiles.is_admin — clients cannot set it (see the column grant above). Revoking admin everywhere is one UPDATE.';

create function public.owns_kb(p_kb_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.knowledge_bases kb
     where kb.id = p_kb_id and kb.owner_id = (select auth.uid())
  )
$$;

-- ---------------------------------------------------------------------------
-- Widen the KB-scoped policies to owner-or-admin
-- ---------------------------------------------------------------------------
-- Admins get WRITE, not just read: open-as-owner exists to fix a customer's article, and a
-- read-only version of it cannot do the one job it has. The safety control for that is the
-- persistent viewing-as-admin banner in the SPA, not a narrower policy.
drop policy if exists kb_all_own       on public.knowledge_bases;
drop policy if exists articles_all_own on public.articles;
drop policy if exists steps_all_own    on public.steps;
drop policy if exists folders_all_own  on public.folders;
drop policy if exists jobs_select_own  on public.jobs;

create policy kb_all_own on public.knowledge_bases
  for all using (owner_id = (select auth.uid()) or public.is_admin())
  with check (owner_id = (select auth.uid()) or public.is_admin());

create policy articles_all_own on public.articles
  for all using (public.owns_kb(kb_id) or public.is_admin())
  with check (public.owns_kb(kb_id) or public.is_admin());

create policy steps_all_own on public.steps
  for all using (
    exists (select 1 from public.articles a
             where a.id = steps.article_id
               and (public.owns_kb(a.kb_id) or public.is_admin()))
  )
  with check (
    exists (select 1 from public.articles a
             where a.id = steps.article_id
               and (public.owns_kb(a.kb_id) or public.is_admin()))
  );

create policy folders_all_own on public.folders
  for all using (public.owns_kb(kb_id) or public.is_admin())
  with check (public.owns_kb(kb_id) or public.is_admin());

-- Jobs stay read-only to the client (only the worker's service role writes them). Keyed on
-- user_id now that 0014 denormalized it — same answer as the KB join, one less hop.
create policy jobs_select_own on public.jobs
  for select using (user_id = (select auth.uid()) or public.is_admin());

-- Profiles: an admin must read other profiles to resolve a KB owner's plan while viewing
-- as admin. SELECT only — the column grant above still governs writes.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = (select auth.uid()) or public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage — admins can replace a screenshot, not just look at one
-- ---------------------------------------------------------------------------
drop policy if exists storage_videos_own   on storage.objects;
drop policy if exists storage_frames_own   on storage.objects;
drop policy if exists storage_branding_own on storage.objects;

create policy storage_videos_own on storage.objects
  for all to authenticated
  using (bucket_id = 'videos' and (public.owns_kb_path(name) or public.is_admin()))
  with check (bucket_id = 'videos' and (public.owns_kb_path(name) or public.is_admin()));

create policy storage_frames_own on storage.objects
  for all to authenticated
  using (bucket_id = 'frames' and (public.owns_kb_path(name) or public.is_admin()))
  with check (bucket_id = 'frames' and (public.owns_kb_path(name) or public.is_admin()));

create policy storage_branding_own on storage.objects
  for all to authenticated
  using (bucket_id = 'branding' and (public.owns_kb_path(name) or public.is_admin()))
  with check (bucket_id = 'branding' and (public.owns_kb_path(name) or public.is_admin()));

-- ---------------------------------------------------------------------------
-- Retire the dead `published` status
-- ---------------------------------------------------------------------------
-- `status` is the PIPELINE lifecycle (generating -> ready). Publish state moved to
-- `visibility` in migration 0005 and the reader has gated on it ever since, so a row
-- sitting at status='published' means nothing to any current code path — it just reads as
-- authoritative to whoever finds it next.
update public.articles set status = 'ready' where status = 'published';

alter table public.articles drop constraint articles_status_check;
alter table public.articles add  constraint articles_status_check
  check (status in ('generating', 'ready'));
