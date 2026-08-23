-- 0039 — the run meter needs a CYCLE count, not only a lifetime one
--
-- Live-definition diff (§10m). Printed from pg_proc before writing this file:
--   kb_entitlements(uuid)  live body == 0036's body, byte for byte. No drift to preserve.
--   CHANGE: one column appended, `cycle_runs_used`. Everything else is carried forward
--           unchanged, including the billed_to_user_id count and the owner-only `plan`.
--   NOT recreated: owns_kb, can_edit_kb, kb_watermark, plan_flags, person_name, kb_people.
--
-- Why this exists
-- ---------------
-- `runs_used` is the LIFETIME count off the append-only ledger, which is the right number
-- for the free tier's lifetime wall and the wrong one for a monthly tier: a starter
-- customer in month nine would read "180 of 20". The rail meter renders three shapes
-- (lifetime / monthly / uncapped) and the middle one had no number to render.
--
-- Counted the same way and from the same place as `runs_used` — one function still answers
-- "how many runs", it just answers it for two windows. A second RPC would be two answers
-- that can disagree (§10b), and the SPA cannot count this itself: `jobs_select_own` is
-- keyed on `user_id` and `billed_to_user_id` is not in the 0020 column grant, so a
-- browser-side count would silently miss every run a MEMBER started.
--
-- "Cycle" is the calendar month
-- ----------------------------
-- There is no subscription record to anchor a real billing period to — payments have not
-- shipped (§7). date_trunc('month') is the honest placeholder and the only one available.
-- When Lemon Squeezy lands, this expression becomes the subscription's current period and
-- nothing else in this function changes. It is deliberately ONE expression, here, so that
-- swap is one line rather than a hunt.

create or replace function public.kb_entitlements(p_kb_id uuid)
returns table (
  is_owner        boolean,
  plan            text,     -- OWNER ONLY. Null for a member.
  owner_name      text,
  lifetime_runs   int,      -- null = uncapped
  runs_used       int,      -- lifetime, off the append-only ledger
  cycle_runs_used int,      -- this billing period. See the note above on what "period" is.
  expiry_days     int,      -- null = no trial clock
  can_invite      boolean,
  watermark       boolean,
  noindex         boolean
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
    -- through kb_id — a claimed demo's runs stay on the account that spent them.
    (select count(*)::int from public.jobs j
      where j.billed_to_user_id = kb.owner_id and j.counted_against_quota),
    (select count(*)::int from public.jobs j
      where j.billed_to_user_id = kb.owner_id and j.counted_against_quota
        and j.created_at >= date_trunc('month', now())),
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

comment on function public.kb_entitlements(uuid) is
  'What this account may know about this help center. Resolves the OWNER''s plan, never the caller''s. `plan` is withheld from a member: limits and usage are operational, billing is not. Two run counts, one ledger — lifetime for the free wall, cycle for the monthly meter.';

-- Same shape as jobs_billed_quota_idx (0035), narrowed by the window the meter reads.
create index if not exists jobs_billed_cycle_idx
  on public.jobs (billed_to_user_id, created_at)
  where counted_against_quota;
