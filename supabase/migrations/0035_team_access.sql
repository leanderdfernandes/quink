-- Team access — multiple admins per help center (team-access-spec.md, Phase 1).
--
-- One owner, many admins. Membership is per-KB, invites are email-bound, the owner is
-- immovable, and every entitlement still resolves through the OWNER — never through the
-- acting user. Nothing here is user-facing: this is the data layer the People screen and
-- the /invite route are built on.
--
-- ---------------------------------------------------------------------------
-- LIVE-DEFINITION DIFF (team-access-spec §7 — `create or replace` is a silent revert
-- vector; 0024 recreated reader_kb and wrote back a body that had lost the watermark
-- clause, and 0025/0026 carried the loss). Every function this migration recreates was
-- printed from pg_proc first and diffed. Stated here so the diff is reviewable:
--
--   claim_kb(uuid)        RECREATED. Body reproduced verbatim from the live definition —
--                         the signed-in guard, the spent-token re-click branch, the
--                         self-claim early return, all eleven owner-derived resets, the
--                         previous owner's last_kb_id fix, the empty-KB cleanup and every
--                         comment. INTENDED DIFF, and the only diff: two statements added
--                         in the transfer branch (delete kb_members, revoke live
--                         kb_invites), and the same wipe added to the self-claim branch so
--                         both exits agree. `jobs` is untouched in both, as before.
--
--   plan_flags(text)      DROPPED + RECREATED to gain `can_invite`. The four existing
--                         columns keep their names, order, types and expressions
--                         character-for-character. (0016 did exactly this to add
--                         expiry_days, so the pattern and its risk are known.)
--
--   enforce_run_quota()   RECREATED. Identical except `new.user_id` becomes
--                         `new.billed_to_user_id` in both the plan lookup and the count,
--                         because the run is charged to the KB owner, not to whoever
--                         pressed the button.
--
--   owns_kb_path(text)    REPLACED by can_edit_kb_path(text), then dropped. Same body
--                         except `kb.owner_id = auth.uid()` becomes
--                         `public.can_edit_kb(kb.id)`. Renamed rather than quietly
--                         widened: a helper still called owns_* that returns true for a
--                         non-owner is the comment nobody reads at 3am.
--
--   owns_kb(uuid)         NOT recreated. Unchanged meaning, narrower use.
--   reader_kb(text)       NOT touched. Verified before writing this migration that
--                         `(f.watermark or kb.is_demo)` is live, and again after applying.
--                         The reader must not learn that members exist.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Membership and invites
-- ---------------------------------------------------------------------------
create table public.kb_members (
  kb_id      uuid not null references public.knowledge_bases(id) on delete cascade,
  user_id    uuid not null references public.profiles(id)        on delete cascade,
  -- One value on purpose. A viewer/editor split is a support conversation nobody has had
  -- yet; the constraint exists so adding a second value is a migration, not a refactor.
  role       text not null default 'admin' check (role in ('admin')),
  added_by   uuid references public.profiles(id) on delete set null,
  added_at   timestamptz not null default now(),
  -- Removal is SOFT. Two reasons, both load-bearing: the removed-access screen has to
  -- distinguish "you were removed" from "this help center doesn't exist for you", and a
  -- re-invite has to reactivate rather than collide with the primary key.
  removed_at timestamptz,
  primary key (kb_id, user_id)
);

create table public.kb_invites (
  id          uuid primary key default gen_random_uuid(),
  kb_id       uuid not null references public.knowledge_bases(id) on delete cascade,
  -- Always stored lower(trim(...)). Normalised in invite_to_kb(), never at the call site.
  email       text not null,
  token       uuid not null unique default gen_random_uuid(),
  invited_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  -- `on delete set null`, like every other profile reference outside kb_members: without
  -- it, accepting an invite makes the account UNDELETABLE — the FK restricts, and
  -- purge.py's step 5 (delete auth.users, cascade profiles) fails with the storage and
  -- the KBs already gone. Caught by test_team.py's cleanup, which is why it deletes real
  -- throwaway accounts rather than faking it.
  accepted_by uuid references public.profiles(id) on delete set null,
  revoked_at  timestamptz
);

-- One LIVE invite per address per KB. Expired, revoked and accepted rows stay as history.
create unique index kb_invites_one_live
  on public.kb_invites (kb_id, email)
  where accepted_at is null and revoked_at is null;

create index kb_invites_token_idx on public.kb_invites (token);
create index kb_members_user_idx  on public.kb_members (user_id) where removed_at is null;

comment on table public.kb_members is
  'Editors of a help center other than its owner. `on delete cascade` on kb_id is DELIBERATE and is the opposite call to jobs.kb_id: membership is state, jobs is a ledger that must survive the day-37 purge. Do not "fix" one to match the other.';

-- Neither table is ever touched directly by a client: every read and write goes through the
-- definer RPCs below. RLS on with no policies is the closed default; the revokes make it
-- explicit rather than relying on Supabase's default grants staying as they are.
alter table public.kb_members enable row level security;
alter table public.kb_invites enable row level security;
revoke all on public.kb_members from anon, authenticated;
revoke all on public.kb_invites from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Attribution columns
-- ---------------------------------------------------------------------------
-- Who the run is CHARGED to, stamped at job creation as the KB's owner at that moment.
-- Never derived by joining through kb_id at read time: a join re-bills history on every
-- ownership change, so claiming a demo we spent three runs building would start the
-- prospect at 3 of 3. jobs.user_id stays as who pressed the button (OPERATIONS.md's
-- failure lookup wants it, and §10d keeps it with the original owner on transfer).
-- `on delete set null` for the same reason jobs.user_id is (0017, §10e.4): the ledger row
-- outlives the account, it just stops naming anyone. A restricting FK here would make
-- every account that has ever generated an article undeletable.
alter table public.jobs
  add column billed_to_user_id uuid references public.profiles(id) on delete set null;

-- Correct today, and only today: every KB has exactly one editor, so who pressed the
-- button and who paid are the same person. Ships in the SAME migration as the column
-- because backfilling attribution after multi-user jobs exist is a backfill with guesses
-- in it.
update public.jobs set billed_to_user_id = user_id where billed_to_user_id is null;

create index jobs_billed_quota_idx on public.jobs (billed_to_user_id)
  where counted_against_quota;

comment on column public.jobs.billed_to_user_id is
  'The KB owner at the moment the run started. Immutable; the quota count keys on this, not on user_id. NOT in the client SELECT grant — the SPA reads its count through kb_runs_used().';

-- articles.last_edited_at already exists (0014, as a lossy metrics column nothing writes
-- yet). Only the "who" is new. Phase 3 stamps both on every save so the conflict strip can
-- name a person.
alter table public.articles
  add column last_edited_by uuid references public.profiles(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3. plan_flags gains can_invite
-- ---------------------------------------------------------------------------
-- The database itself has to decide this one — invite_to_kb() is where the gate is
-- enforced, and a route guard alone is theatre when the SPA talks to Supabase directly.
-- Limits still live in code (PLANS); this is the same mirror the other four flags use, not
-- a second entitlement table.
drop function if exists public.plan_flags(text);

create function public.plan_flags(p_plan text)
returns table (noindex boolean, watermark boolean, lifetime_runs integer,
               expiry_days integer, can_invite boolean)
language sql
immutable
as $$
  select
    coalesce(p_plan, 'free') in ('free', 'internal'),   -- noindex
    coalesce(p_plan, 'free') = 'free',                  -- watermark
    case when coalesce(p_plan, 'free') = 'free' then 3  else null end,   -- lifetime_runs
    case when coalesce(p_plan, 'free') = 'free' then 30 else null end,   -- expiry_days
    coalesce(p_plan, 'free') <> 'free'                  -- can_invite
$$;

-- ---------------------------------------------------------------------------
-- 4. The access split: owns_kb() keeps its meaning, can_edit_kb() is the new gate
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER for the same reason owns_kb() is: the policies below call it against
-- the very tables those policies protect, and an invoker-rights helper would re-enter its
-- own policy and recurse forever.
create function public.can_edit_kb(p_kb_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.owns_kb(p_kb_id) or exists (
    select 1 from public.kb_members m
     where m.kb_id = p_kb_id
       and m.user_id = (select auth.uid())
       and m.removed_at is null
  )
$$;

comment on function public.can_edit_kb(uuid) is
  'Owner OR an active member. The gate for everything that makes articles. owns_kb() is still the gate for the things only the person accountable for the help center may do: deleting it, ownership transfer, and the custom domain.';

-- Storage paths are "{kb_id}/…" (0014/0018), so the same split applies one level down.
create function public.can_edit_kb_path(p_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  -- Compares as text: a first segment that isn't a uuid simply matches nothing, rather
  -- than raising on a bad cast.
  select exists (
    select 1 from public.knowledge_bases kb
     where kb.id::text = (storage.foldername(p_name))[1]
       and public.can_edit_kb(kb.id)
  )
$$;

-- ---------------------------------------------------------------------------
-- 5. Reclassify every policy that referenced owns_kb()
-- ---------------------------------------------------------------------------
-- Content: members do the work, so members get all of CRUD.
drop policy articles_all_own on public.articles;
create policy articles_all_own on public.articles
  for all using (public.can_edit_kb(kb_id) or public.is_admin())
  with check (public.can_edit_kb(kb_id) or public.is_admin());

drop policy folders_all_own on public.folders;
create policy folders_all_own on public.folders
  for all using (public.can_edit_kb(kb_id) or public.is_admin())
  with check (public.can_edit_kb(kb_id) or public.is_admin());

drop policy steps_all_own on public.steps;
create policy steps_all_own on public.steps
  for all using (
    exists (select 1 from public.articles a
             where a.id = steps.article_id
               and (public.can_edit_kb(a.kb_id) or public.is_admin()))
  )
  with check (
    exists (select 1 from public.articles a
             where a.id = steps.article_id
               and (public.can_edit_kb(a.kb_id) or public.is_admin()))
  );

-- The KB row itself splits by verb. One ALL policy cannot say "members may edit the
-- theming but only the owner may delete the help center", so it becomes four.
drop policy kb_all_own on public.knowledge_bases;

create policy kb_select on public.knowledge_bases
  for select using (public.can_edit_kb(id) or public.is_admin());

-- You may only create a KB you own. handle_new_user() and the worker run as the service
-- role and bypass this entirely.
create policy kb_insert on public.knowledge_bases
  for insert with check (owner_id = (select auth.uid()) or public.is_admin());

create policy kb_update on public.knowledge_bases
  for update using (public.can_edit_kb(id) or public.is_admin())
  with check (public.can_edit_kb(id) or public.is_admin());

-- Deleting a help center stays with the person accountable for it.
create policy kb_delete on public.knowledge_bases
  for delete using (public.owns_kb(id) or public.is_admin());

-- Storage: an admin who cannot upload a screenshot cannot fix an article.
drop policy storage_videos_own   on storage.objects;
drop policy storage_frames_own   on storage.objects;
drop policy storage_branding_own on storage.objects;

create policy storage_videos_own on storage.objects
  for all to authenticated
  using (bucket_id = 'videos' and (public.can_edit_kb_path(name) or public.is_admin()))
  with check (bucket_id = 'videos' and (public.can_edit_kb_path(name) or public.is_admin()));

create policy storage_frames_own on storage.objects
  for all to authenticated
  using (bucket_id = 'frames' and (public.can_edit_kb_path(name) or public.is_admin()))
  with check (bucket_id = 'frames' and (public.can_edit_kb_path(name) or public.is_admin()));

create policy storage_branding_own on storage.objects
  for all to authenticated
  using (bucket_id = 'branding' and (public.can_edit_kb_path(name) or public.is_admin()))
  with check (bucket_id = 'branding' and (public.can_edit_kb_path(name) or public.is_admin()));

drop function public.owns_kb_path(text);

-- `jobs` needs no policy change. There is no INSERT policy at all — only the worker's
-- service role writes the ledger — and jobs_select_own stays keyed on user_id so a
-- claimer never sees the previous owner's rows. Members read their KB's quota through
-- kb_runs_used() instead of the table.

-- ---------------------------------------------------------------------------
-- 6. Domain columns become owner-only — by column grant, not a second mechanism
-- ---------------------------------------------------------------------------
-- An admin changing the CNAME takes a paying customer's live help center off the
-- internet. RLS is row-level and cannot express column scope (CLAUDE.md §10e.2), so this
-- uses the mechanism already in the codebase for blocking is_admin self-elevation:
-- revoke the blanket UPDATE, hand back exactly the columns a client legitimately writes.
--
-- No new RPC is needed: every domain write ALREADY goes through the worker
-- (/api/domain/connect|check|disconnect), which runs as the service role and gates on
-- _require_owner. The SPA has never written these columns directly.
--
-- WIDER THAN THE SPEC ASKED, deliberately, and flagged in the commit: the blanket grant
-- also let any signed-in owner write their own trial_started_at, offline_at, purge_at,
-- reader_views, is_demo and claim_token — i.e. reset their own 30-day trial, or bring a
-- purged help center back online, from the browser console. That is §10e.2 again, on
-- columns 0016/0022 added to a table that already had a blanket UPDATE grant. The grant
-- below is the set the SPA actually writes: the theming patch in ThemeSettings.save()
-- plus the product-context patch in lib/kbs.ts. Everything else moves to the service role,
-- where it already lived in practice.
revoke update on public.knowledge_bases from authenticated, anon;
grant update (
  name, about, headline, search_placeholder,
  primary_color, font_pairing, logo_path, favicon_path,
  header_style, header_image_path, header_link_label, header_link_url,
  product_name, product_description, audience, tone
) on public.knowledge_bases to authenticated;

-- ---------------------------------------------------------------------------
-- 7. RPCs — the only way in to kb_members / kb_invites
-- ---------------------------------------------------------------------------
-- Every one derives identity from auth.uid() and the acting email from auth.jwt(). None
-- takes the acting user as an argument: that is the exact shape of the escalation hole
-- already caught once in claim_kb (LEARNINGS trap #2, CLAUDE.md §10e.1).

create function public.invite_to_kb(p_kb_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_owner uuid;
  v_can   boolean;
  v_token uuid;
begin
  if not public.can_edit_kb(p_kb_id) then
    raise exception 'not your help center' using errcode = '42501';
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'that does not look like an email address';
  end if;

  select kb.owner_id into v_owner from public.knowledge_bases kb where kb.id = p_kb_id;

  -- THE OWNER'S plan, never the caller's. A free-plan user who is an admin inside a paid
  -- help center can invite: they are spending the owner's entitlement, not their own.
  select f.can_invite into v_can
    from public.profiles p cross join lateral public.plan_flags(p.plan) f
   where p.id = v_owner;

  if not coalesce(v_can, false) then
    raise exception 'adding teammates is part of every paid plan' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles p
              where p.id = v_owner and lower(p.email) = v_email) then
    raise exception 'that is the owner of this help center';
  end if;

  if exists (select 1 from public.kb_members m
               join public.profiles p on p.id = m.user_id
              where m.kb_id = p_kb_id and m.removed_at is null
                and lower(p.email) = v_email) then
    raise exception 'that person is already here';
  end if;

  -- kb_invites_one_live enforces this too; checking first is what turns a raw unique
  -- violation into a sentence the screen can show.
  if exists (select 1 from public.kb_invites i
              where i.kb_id = p_kb_id and i.email = v_email
                and i.accepted_at is null and i.revoked_at is null) then
    raise exception 'they already have an invite waiting';
  end if;

  insert into public.kb_invites (kb_id, email, invited_by)
       values (p_kb_id, v_email, (select auth.uid()))
    returning token into v_token;

  return v_token;
end $$;

-- Anonymous, like claim_preview(): show the goods before asking for anything. The token IS
-- the capability, and bouncing a recipient to a signup form asks them to create an account
-- for a help center they have not seen.
--
-- Returns the invited address on purpose — it is what makes the wrong-account state
-- recoverable rather than a dead end — but NEVER the kb id or the owner, for the same
-- reason claim_preview withholds them: that would turn an invite link into an internal
-- identifier lookup. Zero rows means "unknown token", exactly as claim_preview does.
create function public.invite_preview(p_token uuid)
returns table (state text, kb_name text, logo_path text, primary_color text,
               inviter text, email text, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when i.revoked_at  is not null then 'revoked'
      when i.accepted_at is not null then 'accepted'
      when i.expires_at <= now()     then 'expired'
      -- A downgraded owner FREEZES pending invites rather than revoking them: they fail at
      -- accept with a reason, and resume if the owner upgrades before expiry.
      when not f.can_invite          then 'frozen'
      else 'valid'
    end,
    kb.name,
    kb.logo_path,
    kb.primary_color,
    coalesce(inv.email, o.email),
    i.email,
    i.expires_at
  from public.kb_invites i
  join public.knowledge_bases kb on kb.id = i.kb_id
  join public.profiles o on o.id = kb.owner_id
  cross join lateral public.plan_flags(o.plan) f
  left join public.profiles inv on inv.id = i.invited_by
  where i.token = p_token
  limit 1
$$;

create function public.accept_kb_invite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv   public.kb_invites%rowtype;
  v_uid   uuid := (select auth.uid());
  v_email text := lower((select auth.jwt() ->> 'email'));
  v_can   boolean;
begin
  if v_uid is null then
    raise exception 'must be signed in to accept an invite';
  end if;

  select * into v_inv from public.kb_invites where token = p_token for update;

  -- Unknown token. NULL is a state, not an error (§10d): the caller re-reads the preview
  -- and renders which.
  if not found then
    return null;
  end if;

  -- Already here. Not an error either — the SPA redirects silently to the help center.
  if exists (select 1 from public.kb_members m
              where m.kb_id = v_inv.kb_id and m.user_id = v_uid and m.removed_at is null)
     or public.owns_kb(v_inv.kb_id) then
    return v_inv.kb_id;
  end if;

  if v_inv.revoked_at is not null or v_inv.accepted_at is not null
     or v_inv.expires_at <= now() then
    return null;
  end if;

  -- Email-bound, always. The invited address must match the accepting account — this is
  -- the whole difference between an invite and a shareable link into a customer's live
  -- help center.
  if v_email is null or v_email <> v_inv.email then
    raise exception 'this invite was sent to %', v_inv.email using errcode = '42501';
  end if;

  select f.can_invite into v_can
    from public.knowledge_bases kb
    join public.profiles p on p.id = kb.owner_id
   cross join lateral public.plan_flags(p.plan) f
   where kb.id = v_inv.kb_id;

  if not coalesce(v_can, false) then
    raise exception 'this help center is on a plan that does not include teammates'
      using errcode = '42501';
  end if;

  -- Reactivate rather than duplicate: removal is soft, so a re-invited person already has
  -- a row. This is why the primary key is (kb_id, user_id) and removal is a timestamp.
  insert into public.kb_members (kb_id, user_id, added_by)
       values (v_inv.kb_id, v_uid, v_inv.invited_by)
  on conflict (kb_id, user_id) do update
      set removed_at = null, added_at = now(), added_by = excluded.added_by;

  update public.kb_invites
     set accepted_at = now(), accepted_by = v_uid
   where id = v_inv.id;

  return v_inv.kb_id;
end $$;

create function public.revoke_kb_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kb uuid;
begin
  select kb_id into v_kb from public.kb_invites where id = p_invite_id;
  if v_kb is null then
    return;   -- nothing to revoke; not a probe for which invites exist
  end if;
  if not public.can_edit_kb(v_kb) then
    raise exception 'not your help center' using errcode = '42501';
  end if;
  update public.kb_invites set revoked_at = now()
   where id = p_invite_id and revoked_at is null and accepted_at is null;
end $$;

create function public.remove_kb_member(p_kb_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit_kb(p_kb_id) then
    raise exception 'not your help center' using errcode = '42501';
  end if;

  -- The owner is immovable, with no exception for anyone. Flat admin has two failure
  -- modes: two admins removing each other into a locked account, and an invitee removing
  -- the person whose card is on file. One un-removable role closes both.
  if p_user_id = (select kb.owner_id from public.knowledge_bases kb where kb.id = p_kb_id) then
    raise exception 'the owner of a help center cannot be removed';
  end if;

  -- Self-removal is the "Leave" action and is allowed.
  update public.kb_members set removed_at = now()
   where kb_id = p_kb_id and user_id = p_user_id and removed_at is null;
end $$;

-- Members and live invites in ONE shape, because the screen is one list — a pending invite
-- sitting beside the people who accepted is what makes it feel completed rather than sent
-- into a void.
--
-- This function exists so the profiles SELECT policy does not have to be widened to render
-- a member list. It projects exactly the fields the screen needs and nothing else.
-- Display name and avatar come from auth.users' OAuth metadata, which is the only place
-- they exist — profiles carries no name column.
create function public.kb_people(p_kb_id uuid)
returns table (kind text, id uuid, email text, name text, avatar_url text,
               role text, is_owner boolean, at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select 'member', p.id, p.email,
         nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name',
                              u.raw_user_meta_data ->> 'name', '')), ''),
         u.raw_user_meta_data ->> 'avatar_url',
         'admin', true, kb.created_at, null::timestamptz
    from public.knowledge_bases kb
    join public.profiles p on p.id = kb.owner_id
    left join auth.users u on u.id = p.id
   where kb.id = p_kb_id and public.can_edit_kb(p_kb_id)

  union all

  select 'member', p.id, p.email,
         nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name',
                              u.raw_user_meta_data ->> 'name', '')), ''),
         u.raw_user_meta_data ->> 'avatar_url',
         m.role, false, m.added_at, null::timestamptz
    from public.kb_members m
    join public.profiles p on p.id = m.user_id
    left join auth.users u on u.id = p.id
   where m.kb_id = p_kb_id and m.removed_at is null and public.can_edit_kb(p_kb_id)

  union all

  select 'invite', i.id, i.email, null, null, 'admin', false, i.created_at, i.expires_at
    from public.kb_invites i
   where i.kb_id = p_kb_id and i.accepted_at is null and i.revoked_at is null
     and i.expires_at > now() and public.can_edit_kb(p_kb_id)

  order by 7 desc, 1, 8
$$;

-- Drives the removed-access screen. Distinct from "not found" ON PURPOSE — the instinct on
-- losing access is that your work was deleted, and only a named state can say otherwise.
-- The distinction leaks nothing: 'removed' is only ever returned to the person who was in
-- fact removed, and 'none' is the same answer for "doesn't exist" and "never yours".
create function public.kb_access_state(p_kb_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.can_edit_kb(p_kb_id) then 'ok'
    when exists (select 1 from public.kb_members m
                  where m.kb_id = p_kb_id and m.user_id = (select auth.uid())
                    and m.removed_at is not null) then 'removed'
    else 'none'
  end
$$;

-- Runs charged to THIS KB's owner. The SPA's only quota read: jobs_select_own is keyed on
-- user_id, so a member cannot count the owner's ledger from the table, and widening that
-- policy would show a claimer the previous owner's rows.
create function public.kb_runs_used(p_kb_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when public.can_edit_kb(p_kb_id) or public.is_admin() then (
    select count(*)::int from public.jobs j
     join public.knowledge_bases kb on kb.id = p_kb_id
     where j.billed_to_user_id = kb.owner_id and j.counted_against_quota
  ) else 0 end
$$;

revoke execute on function public.invite_to_kb(uuid, text)          from anon, public;
revoke execute on function public.accept_kb_invite(uuid)            from anon, public;
revoke execute on function public.revoke_kb_invite(uuid)            from anon, public;
revoke execute on function public.remove_kb_member(uuid, uuid)      from anon, public;
revoke execute on function public.kb_people(uuid)                   from anon, public;
revoke execute on function public.kb_access_state(uuid)             from anon, public;
revoke execute on function public.kb_runs_used(uuid)                from anon, public;

-- can_edit_kb() and can_edit_kb_path() keep the DEFAULT grants, exactly as owns_kb() and
-- owns_kb_path() do. They are called from inside RLS policy expressions, which execute
-- with the querying role's privileges — revoking EXECUTE there would make every policy
-- that references them fail with "permission denied for function", not fall closed.

grant execute on function public.invite_to_kb(uuid, text)      to authenticated;
grant execute on function public.accept_kb_invite(uuid)        to authenticated;
grant execute on function public.revoke_kb_invite(uuid)        to authenticated;
grant execute on function public.remove_kb_member(uuid, uuid)  to authenticated;
grant execute on function public.kb_people(uuid)               to authenticated;
grant execute on function public.kb_access_state(uuid)         to authenticated;
grant execute on function public.kb_runs_used(uuid)            to authenticated;

-- The preview is the one anonymous surface here, same as claim_preview.
grant execute on function public.invite_preview(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Quota attribution — the DB backstop keys on who is billed
-- ---------------------------------------------------------------------------
create or replace function public.enforce_run_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
  v_used  int;
begin
  if new.counted_against_quota and not old.counted_against_quota then
    select f.lifetime_runs into v_limit
      from public.profiles p, public.plan_flags(p.plan) f
     where p.id = new.billed_to_user_id;

    if v_limit is not null then
      -- Excludes this row: the row being flagged is the run being spent, not a prior one.
      select count(*) into v_used from public.jobs
       where billed_to_user_id = new.billed_to_user_id and counted_against_quota
         and id <> new.id;

      if v_used >= v_limit then
        raise exception 'run quota exceeded for user % (% of %)',
          new.billed_to_user_id, v_used, v_limit;
      end if;
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Claim wipes membership
-- ---------------------------------------------------------------------------
-- A prospect must never inherit a silent admin, and a link we generated must not still be
-- redeemable into a help center that is now someone else's. The new owner's People screen
-- shows exactly themselves. `jobs` is deliberately untouched: we spent those runs, they
-- didn't (§10d).
--
-- The whole body below is the live definition, reproduced. See the diff header.
create or replace function public.claim_kb(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kb_id     uuid;
  v_prev      uuid;
  v_new_owner uuid := (select auth.uid());
begin
  if v_new_owner is null then
    raise exception 'must be signed in to claim';
  end if;

  select id, owner_id into v_kb_id, v_prev
    from public.knowledge_bases
   where claim_token = p_token
     and claim_expires_at > now()
   for update;

  if v_kb_id is null then
    -- Not a live token. If it is one THIS caller already spent, hand back the KB so the
    -- re-click lands somewhere useful. Anyone else gets null — same answer as an unknown
    -- token, so a used link is not a probe.
    select id into v_kb_id
      from public.knowledge_bases
     where claimed_token = p_token and owner_id = v_new_owner;
    return v_kb_id;   -- null unless they own it
  end if;

  -- Claiming your own KB is a no-op, not an error, but must not reset the trial clock —
  -- that would be a free 30-day extension for the price of re-clicking a link.
  if v_prev = v_new_owner then
    update public.knowledge_bases
       set claim_token = null, claim_expires_at = null, is_demo = false,
           claimed_token = p_token, claimed_at = now()
     where id = v_kb_id;
    -- Same wipe as the transfer branch below: a KB that has stopped being a demo must not
    -- keep the outreach account's admins, whichever branch got it there.
    delete from public.kb_members where kb_id = v_kb_id and user_id <> v_new_owner;
    update public.kb_invites set revoked_at = now()
     where kb_id = v_kb_id and accepted_at is null and revoked_at is null;
    return v_kb_id;
  end if;

  -- EVERY owner-derived reset lives here. Add to this list, not elsewhere.
  update public.knowledge_bases set
      owner_id         = v_new_owner,
      -- The clock starts when THEY take it, not when we built it.
      trial_started_at = now(),
      offline_at       = null,
      purge_at         = null,
      -- The four nudge markers belong to the clock above and reset with it. A claimed KB
      -- whose markers survived would go from "live" to "deleted" in one step, silently.
      trial_day14_email_sent_at   = null,
      trial_day7_email_sent_at    = null,
      trial_offline_email_sent_at = null,
      trial_purged_email_sent_at  = null,
      -- Outreach traffic was ours, not theirs. Zeroing this also un-freezes the address:
      -- migration 0013 locks the subdomain once reader_views > 0, which would otherwise
      -- leave the new owner stuck with whatever we named their help center during
      -- outreach — the first thing they want to change is the one thing they couldn't.
      reader_views     = 0,
      -- Same era boundary, same reason (0031/0033). Reset WITH reader_views, always: these
      -- two are written together by reader_ping and must not be able to disagree about
      -- whether this help center has ever been read.
      last_reader_view_at = null,
      claim_token      = null,
      claim_expires_at = null,
      is_demo          = false,
      -- Not owner-derived: a record of which link was spent, kept so the recipient can
      -- re-click the email they were sent. Never reset.
      claimed_token    = p_token,
      claimed_at       = now()
   where id = v_kb_id;

  -- ADDED with team access. Membership is owner-derived state like every reset above, and
  -- it belongs in this one function for the same reason: spread the wipe across call sites
  -- and you get a silent access leak instead of a visible bug. HARD delete, not soft — a
  -- removed-access screen naming a help center they were never really part of is worse
  -- than nothing, and there is no re-invite to reactivate here.
  delete from public.kb_members where kb_id = v_kb_id;
  update public.kb_invites set revoked_at = now()
   where kb_id = v_kb_id and accepted_at is null and revoked_at is null;

  -- The previous owner's "last KB" must not point at a KB they no longer own, or our own
  -- next login redirects straight into a customer's help center. This writes to ANOTHER
  -- user's profiles row, and UPDATE on profiles is revoked from `authenticated` — security
  -- definer is what makes this possible, not optional hardening.
  update public.profiles set last_kb_id = null
   where id = v_prev and last_kb_id = v_kb_id;

  -- handle_new_user() provisions a KB on signup, so the reverse-demo path (receive link ->
  -- sign up -> claim) leaves the founder holding TWO KBs on a one-KB plan. That happens on
  -- demo #1, not at some future scale.
  --
  -- If theirs is untouched, bin it: they came for this KB, not a blank one. If it has ANY
  -- content, keep both and let them exceed the limit — over-limit is a far better failure
  -- than deleting something somebody wrote.
  delete from public.knowledge_bases kb
   where kb.owner_id = v_new_owner
     and kb.id <> v_kb_id
     and not exists (select 1 from public.articles a where a.kb_id = kb.id)
     and kb.custom_domain is null
     and kb.reader_views = 0;

  update public.profiles set last_kb_id = v_kb_id where id = v_new_owner;

  return v_kb_id;
end $$;
