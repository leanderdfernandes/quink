-- The source recording is kept on a RETENTION POLICY, not deleted on publish
-- (PRD "Context & AI Editing" §8). The SPA has to be able to state that policy, so
-- kb_entitlements() gains the window.
--
-- WHY THE SPA NEEDS IT AT ALL. The upload screen tells the user how long we will keep the
-- recording they are about to hand us. That sentence has to be true on the tier the upload
-- actually lands on, and entitlements resolve through the KB's OWNER (§10j) — a member
-- uploading into a paid help center is spending the owner's plan, not their own. Reading
-- the caller's plan is the `lanesFor` gap OPEN-ITEMS D.2 already records; this is the same
-- mistake one promise higher, where being wrong means mis-stating a retention period.
--
-- kb_entitlements deliberately does NOT return the plan NAME to a member (§10l: limits and
-- usage are operational, billing is not). A retention window is a LIMIT — how long we keep
-- their file — so it is returned to everyone who may edit, exactly like lifetime_runs.
--
-- ---------------------------------------------------------------------------
-- LIVE-DEFINITION DIFF (§10m). Both bodies below were printed from pg_proc immediately
-- before this migration was written and are reproduced UNCHANGED except where stated.
--
-- public.plan_flags(text)
--   Live returns: (noindex, watermark, lifetime_runs, expiry_days, can_invite)
--   CHANGE: ONE column APPENDED — video_retention_days. Every existing expression is
--   byte-identical to the live body. Appending a return column cannot be done with
--   `create or replace` (0039 learned this the hard way: "cannot change return type of
--   existing function"), so it is a DROP and a CREATE. Both are transactional, so no
--   caller ever sees the function missing.
--
-- public.kb_entitlements(uuid)
--   Live returns: (is_owner, plan, owner_name, lifetime_runs, runs_used, cycle_runs_used,
--                  expiry_days, can_invite, watermark, noindex)   [0039]
--   CHANGE: ONE column APPENDED — video_retention_days, read off f. Every existing
--   expression, including the two run-count subselects, the kb_watermark() call and the
--   offline_at noindex override, is byte-identical to the live body. The watermark clause
--   in particular is reproduced verbatim; §10l and OPEN-ITEMS D.4 exist because it was
--   silently dropped across 0024-0026 by exactly this kind of recreate.
-- ---------------------------------------------------------------------------

drop function if exists public.plan_flags(text);

create function public.plan_flags(p_plan text)
returns table (
  noindex              boolean,
  watermark            boolean,
  lifetime_runs        integer,
  expiry_days          integer,
  can_invite           boolean,
  video_retention_days integer
)
language sql
immutable
as $$
  select
    coalesce(p_plan, 'free') in ('free', 'internal'),   -- noindex
    coalesce(p_plan, 'free') = 'free',                  -- watermark
    case when coalesce(p_plan, 'free') = 'free' then 3  else null end,   -- lifetime_runs
    case when coalesce(p_plan, 'free') = 'free' then 30 else null end,   -- expiry_days
    coalesce(p_plan, 'free') <> 'free',                 -- can_invite
    -- NEW. Mirrors PLANS[plan]["video_retention_days"] in worker/config.py, which is the
    -- enforcement point (retention.sweep_source_videos). null = for the life of the
    -- article, which is what a paid plan buys. The free number is provisional — PRD §11.4
    -- leaves it open, and it matches FAILED_VIDEO_RETENTION_DAYS so a free recording lives
    -- as long whether the run succeeded or failed.
    case when coalesce(p_plan, 'free') = 'free' then 7  else null end
$$;

drop function if exists public.kb_entitlements(uuid);

create function public.kb_entitlements(p_kb_id uuid)
returns table (
  is_owner             boolean,
  plan                 text,
  owner_name           text,
  lifetime_runs        integer,
  runs_used            integer,
  cycle_runs_used      integer,
  expiry_days          integer,
  can_invite           boolean,
  watermark            boolean,
  noindex              boolean,
  video_retention_days integer
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
    -- Folded in from kb_runs_used(), which 0036 dropped. Counted off the append-only
    -- ledger by who is BILLED, never by who pressed the button, and never by joining
    -- through kb_id - a claimed demo's runs stay on the account that spent them.
    (select count(*)::int from public.jobs j
      where j.billed_to_user_id = kb.owner_id and j.counted_against_quota),
    (select count(*)::int from public.jobs j
      where j.billed_to_user_id = kb.owner_id and j.counted_against_quota
        and j.created_at >= date_trunc('month', now())),
    f.expiry_days,
    f.can_invite,
    public.kb_watermark(p.plan, kb.is_demo),
    case when kb.offline_at is null then f.noindex else true end,
    f.video_retention_days
  from public.knowledge_bases kb
  join public.profiles p on p.id = kb.owner_id
  cross join lateral public.plan_flags(p.plan) f
  where kb.id = p_kb_id
    and (public.can_edit_kb(p_kb_id) or public.is_admin())
$$;

comment on function public.kb_entitlements(uuid) is
  'What this account may know about this help center: limits, usage and rendering flags, resolved through the OWNER. The tier NAME goes to the owner alone; limits and usage go to anyone who may edit.';

-- Grants restored to EXACTLY what was live before the drop, read out of the catalogue
-- first rather than assumed. A recreate that quietly widens or narrows execute is the same
-- class of silent revert §10m is about, one level below the function body.
--
--   plan_flags       anon YES, authenticated YES  (it is a pure plan->limits mapping with
--                    nothing per-customer in it, and reader_kb reaches it anonymously)
--   kb_entitlements  anon NO,  authenticated YES
revoke all on function public.plan_flags(text) from public;
grant execute on function public.plan_flags(text) to anon, authenticated, service_role;

revoke all on function public.kb_entitlements(uuid) from public, anon;
grant execute on function public.kb_entitlements(uuid) to authenticated, service_role;
