-- What a member is allowed to know about the help center they edit (OPEN-ITEMS D.2).
--
-- Phase 1 gave a member `kb_runs_used()` — usage with no limit beside it. So an admin saw
-- "3 recordings turned into a guide here" and could not tell that the next one would be
-- refused, and the editor and Theming previews, which read limits off the CALLER's plan,
-- fell back to `free` and rendered a watermark badge to someone editing a paying
-- customer's help center. That is the 0.1 regression's failure class on the same surface.
--
-- The split this keeps: LIMITS AND USAGE ARE OPERATIONAL, BILLING IS NOT. A member needs
-- to know the cap, whether the site is watermarked, and whether invites are on. They do
-- not get the tier name, and there is no price anywhere in here.
--
-- ---------------------------------------------------------------------------
-- LIVE-DEFINITION DIFF (§10j — `create or replace` is a silent revert vector; 0024
-- recreated reader_kb from an older body and dropped the watermark clause, and 0025/0026
-- carried the loss). Printed from pg_proc first and diffed:
--
--   reader_kb(text)   RECREATED. The body is reproduced verbatim — every offline CASE, the
--                     comment above the noindex line, the join, the WHERE, the LIMIT.
--                     EXACTLY ONE expression changes, and it changes to a function that
--                     computes the same thing:
--
--                       -      (f.watermark or kb.is_demo),
--                       +      public.kb_watermark(p.plan, kb.is_demo),
--
--                     The RESTORED comment above it stays, because the regression it
--                     records is still the reason the expression is what it is. Verified
--                     after applying by diffing prosrc against the pre-image: one line.
--
--   kb_runs_used(uuid) DROPPED, folded into kb_entitlements(). Two functions answering
--                     "how many runs" is two answers that can disagree; the SPA now makes
--                     one call and gets usage and the cap together, which is the only way
--                     it can render either honestly.
--
--   owns_kb, can_edit_kb, plan_flags, claim_kb, invite_to_kb, accept_kb_invite,
--   remove_kb_member, revoke_kb_invite  NOT recreated.
--   kb_people(uuid), invite_preview(uuid)  RECREATED — see §3, name resolution only.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The watermark predicate, in ONE place
-- ---------------------------------------------------------------------------
-- The rule is not "free plans are watermarked". It is "free plans are watermarked, AND a
-- demo is watermarked whatever plan it sits on" — so that claiming a reverse demo changes
-- nothing visually at the moment the prospect says yes (§10d). That second half has been
-- silently dropped from reader_kb once already.
--
-- The editor and Theming previews must agree with what the reader actually renders. Two
-- copies of this expression would drift, and the drift would be invisible: the preview
-- would look right to whoever wrote it and wrong to a customer.
create function public.kb_watermark(p_plan text, p_is_demo boolean)
returns boolean
language sql
immutable
as $$
  select (select f.watermark from public.plan_flags(p_plan) f) or coalesce(p_is_demo, false)
$$;

comment on function public.kb_watermark(text, boolean) is
  'The ONE watermark rule: the owner plan''s flag OR the KB being a demo. reader_kb() and kb_entitlements() both call this. Do not re-implement it in either.';

-- ---------------------------------------------------------------------------
-- 2. reader_kb — same body, one shared expression
-- ---------------------------------------------------------------------------
create or replace function public.reader_kb(p_key text)
returns table (
  id uuid, name text, about text, headline text, search_placeholder text,
  primary_color text, font_pairing text, logo_path text, favicon_path text,
  subdomain text, custom_domain text, domain_status text,
  noindex boolean, watermark boolean,
  header_style text, header_image_path text, header_link_label text, header_link_url text,
  offline boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select kb.id,
         kb.name,
         case when kb.offline_at is null then kb.about              else '' end,
         case when kb.offline_at is null then kb.headline           else '' end,
         case when kb.offline_at is null then kb.search_placeholder else '' end,
         case when kb.offline_at is null then kb.primary_color      else '#1f6e6b' end,
         case when kb.offline_at is null then kb.font_pairing       else 'modern' end,
         case when kb.offline_at is null then kb.logo_path          else null end,
         case when kb.offline_at is null then kb.favicon_path       else null end,
         case when kb.offline_at is null then kb.subdomain          else null end,
         case when kb.offline_at is null then kb.custom_domain      else null end,
         case when kb.offline_at is null then kb.domain_status      else 'none' end,
         -- An offline help center is never indexable, whatever the plan says.
         case when kb.offline_at is null then f.noindex             else true end,
         -- RESTORED (0023 -> lost in 0024). A demo renders watermarked whatever plan it
         -- sits on, so claiming it changes nothing visually. §10d. The expression moved
         -- into kb_watermark() in 0036 so the editor preview cannot disagree with this;
         -- it computes exactly what `(f.watermark or kb.is_demo)` computed here.
         public.kb_watermark(p.plan, kb.is_demo),
         case when kb.offline_at is null then kb.header_style       else 'solid' end,
         case when kb.offline_at is null then kb.header_image_path  else null end,
         case when kb.offline_at is null then kb.header_link_label  else null end,
         case when kb.offline_at is null then kb.header_link_url    else null end,
         kb.offline_at is not null as offline
    from public.knowledge_bases kb
    join public.profiles p on p.id = kb.owner_id
    cross join lateral public.plan_flags(p.plan) f
   where (kb.subdomain = p_key
      or (kb.custom_domain = p_key and kb.domain_status = 'live'))
   limit 1
$$;

grant execute on function public.reader_kb(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. One display name, three callers
-- ---------------------------------------------------------------------------
-- `profiles` has no name column. Google sign-ins put one in auth.users' OAuth metadata and
-- email sign-ins put nothing, so the fallback has to be the address — but never the WHOLE
-- address inside a sentence: "priya@acme.co invited you to help maintain Acme" reads like
-- a phishing mail, which is exactly the mail an invite competes with.
--
-- SECURITY INVOKER on purpose, and not an oversight. It reads auth.users, which
-- `authenticated` has no privilege on, so calling it directly gets permission denied. It
-- only resolves inside the SECURITY DEFINER functions below, which is the only place it is
-- allowed to. EXECUTE is revoked from clients as well — belt and braces on a function that
-- reads the auth schema.
create function public.person_name(p_user_id uuid, p_email text)
returns text
language sql
stable
as $$
  select coalesce(
    nullif(trim(coalesce(
      (select u.raw_user_meta_data ->> 'full_name' from auth.users u where u.id = p_user_id),
      (select u.raw_user_meta_data ->> 'name'      from auth.users u where u.id = p_user_id)
    )), ''),
    nullif(split_part(coalesce(p_email, ''), '@', 1), ''),
    p_email
  )
$$;

revoke execute on function public.person_name(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. kb_entitlements — what this account may know about this help center
-- ---------------------------------------------------------------------------
-- Gated on can_edit_kb(): a stranger with a valid session gets nothing at all, not a row
-- of nulls. Resolves the OWNER's plan, never the caller's — that asymmetry is the whole
-- point (team-access-spec L2), and it is why a free-plan admin inside a paid help center
-- gets the paid help center's limits.
--
-- `plan` is the one field withheld from a non-owner. Not because the limits do not imply
-- the tier — they do — but because the tier NAME is identity and billing, and every screen
-- that renders it is owner-only. Returning it to a member would put it one careless JSX
-- line away from being on screen.
create function public.kb_entitlements(p_kb_id uuid)
returns table (
  is_owner      boolean,
  plan          text,     -- OWNER ONLY. Null for a member.
  owner_name    text,
  lifetime_runs int,      -- null = uncapped
  runs_used     int,
  expiry_days   int,      -- null = no trial clock
  can_invite    boolean,
  watermark     boolean,
  noindex       boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    kb.owner_id = (select auth.uid()),
    case when kb.owner_id = (select auth.uid()) then p.plan else null end,
    public.person_name(p.id, p.email),
    f.lifetime_runs,
    -- Folded in from kb_runs_used(), which is dropped below. Counted off the append-only
    -- ledger by who is BILLED, never by who pressed the button, and never by joining
    -- through kb_id — a claimed demo's runs stay on the account that spent them.
    (select count(*)::int from public.jobs j
      where j.billed_to_user_id = kb.owner_id and j.counted_against_quota),
    f.expiry_days,
    f.can_invite,
    public.kb_watermark(p.plan, kb.is_demo),
    case when kb.offline_at is null then f.noindex else true end
  from public.knowledge_bases kb
  join public.profiles p on p.id = kb.owner_id
  cross join lateral public.plan_flags(p.plan) f
  where kb.id = p_kb_id
    and (public.can_edit_kb(p_kb_id) or public.is_admin())
$$;

drop function if exists public.kb_runs_used(uuid);

-- ---------------------------------------------------------------------------
-- 5. kb_people and invite_preview resolve names the same way
-- ---------------------------------------------------------------------------
-- Both returned raw addresses. Same shape, same columns, same gates — the only change in
-- each is that the name now comes from person_name() instead of being read straight off
-- auth.users (kb_people) or not resolved at all (invite_preview).
create or replace function public.kb_people(p_kb_id uuid)
returns table (kind text, id uuid, email text, name text, avatar_url text,
               role text, is_owner boolean, at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select 'member', p.id, p.email,
         public.person_name(p.id, p.email),
         u.raw_user_meta_data ->> 'avatar_url',
         'admin', true, kb.created_at, null::timestamptz
    from public.knowledge_bases kb
    join public.profiles p on p.id = kb.owner_id
    left join auth.users u on u.id = p.id
   where kb.id = p_kb_id and public.can_edit_kb(p_kb_id)

  union all

  select 'member', p.id, p.email,
         public.person_name(p.id, p.email),
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

  -- Owner first, then members, then pending invites — and `kind` DESC is what makes that
  -- last part true, because 'invite' sorts BEFORE 'member' ascending. 0035 had it ascending,
  -- so every pending invite rendered above the people who had actually accepted: the
  -- opposite of team-access-spec §9.1, and it made the list read as if the invites were the
  -- team. Caught by a test asserting the second row was a member.
  order by 7 desc, 1 desc, 8
$$;

-- Still anonymous, still four states, still WITHOUT the kb id or the owner id — handing
-- those to an anonymous caller turns an invite link into an internal-identifier lookup.
-- `inviter` becomes a name rather than an address.
create or replace function public.invite_preview(p_token uuid)
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
      when not f.can_invite          then 'frozen'
      else 'valid'
    end,
    kb.name,
    kb.logo_path,
    kb.primary_color,
    -- The person, not their address. Falls back to the inviting account's local part, and
    -- to the owner's when the inviter's profile is gone (invited_by is `on delete set null`).
    coalesce(public.person_name(inv.id, inv.email), public.person_name(o.id, o.email)),
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

revoke execute on function public.kb_entitlements(uuid) from public, anon;
grant  execute on function public.kb_entitlements(uuid) to authenticated;
grant  execute on function public.invite_preview(uuid) to anon, authenticated;
grant  execute on function public.kb_people(uuid) to authenticated;
