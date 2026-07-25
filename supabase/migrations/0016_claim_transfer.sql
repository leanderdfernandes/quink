-- KB ownership transfer — the reverse-demo handover (mvp-dev-plan §9).
--
-- We build a help center for a company we don't work for, then hand it over with a link.
-- That link is the acquisition funnel, so it has to be right the first time, in front of a
-- stranger, with no second attempt.
--
-- The design rule that matters more than any column below: EVERY piece of owner-derived
-- state resets in claim_kb() and nowhere else. A future owner-derived column has exactly
-- one function it must be added to. Miss it there and you get a visible bug; spread the
-- resets across three call sites and you get a silent entitlement leak instead.

-- ---------------------------------------------------------------------------
-- claim state on the KB
-- ---------------------------------------------------------------------------
alter table public.knowledge_bases
  add column claim_token      uuid unique,
  add column claim_expires_at timestamptz,
  -- Marks a KB we built for outreach rather than one a customer made. Cleared on claim:
  -- once it's theirs it is not a demo any more.
  add column is_demo          boolean not null default false;

-- ---------------------------------------------------------------------------
-- plan_flags gains expiry_days
-- ---------------------------------------------------------------------------
-- Needed by the trial-clock fix below. Return type changes, so drop and recreate; the
-- reader_kb body references it by name and is unaffected.
drop function if exists public.plan_flags(text);

create function public.plan_flags(p_plan text)
returns table (noindex boolean, watermark boolean, lifetime_runs int, expiry_days int)
language sql immutable as $$
  select
    coalesce(p_plan, 'free') in ('free', 'internal'),   -- noindex
    coalesce(p_plan, 'free') = 'free',                  -- watermark
    case when coalesce(p_plan, 'free') = 'free' then 3  else null end,   -- lifetime_runs
    case when coalesce(p_plan, 'free') = 'free' then 30 else null end    -- expiry_days
$$;

-- ---------------------------------------------------------------------------
-- Trial clock: only start one for plans that actually expire
-- ---------------------------------------------------------------------------
-- The 0014 trigger stamped trial_started_at on the first article REGARDLESS of plan. So
-- every demo KB we build on the `internal` account starts a 30-day clock the day we build
-- it — and the day-30 sweep would take a KB offline days after a founder claimed it,
-- because of work we did before they had ever heard of us.
--
-- claim_kb() resets the clock at handover, which is the guarantee. This is the other half:
-- without it the clock is simply WRONG in the meantime, and the admin KBs tab would show
-- "8 days left" against a demo nobody has been offered yet.
create or replace function public.stamp_article_origin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expiry int;
begin
  new.source := case when new.source_video_path is not null then 'generated' else 'manual' end;

  select f.expiry_days into v_expiry
    from public.knowledge_bases kb
    join public.profiles p on p.id = kb.owner_id
    cross join lateral public.plan_flags(p.plan) f
   where kb.id = new.kb_id;

  -- `and trial_started_at is null` is what makes this once-and-only-once.
  if v_expiry is not null then
    update public.knowledge_bases
       set trial_started_at = now()
     where id = new.kb_id and trial_started_at is null;
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Issue a claim link
-- ---------------------------------------------------------------------------
-- Admin-or-owner. This is also the ONLY admin path to moving a KB: there is deliberately
-- no force-transfer. One code path means one place entitlement resets can be forgotten,
-- and the recipient's consent is implicit in them clicking the link.
create function public.issue_claim_token(p_kb_id uuid, p_days int default 14)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
begin
  if not (public.owns_kb(p_kb_id) or public.is_admin()) then
    raise exception 'not allowed';
  end if;

  update public.knowledge_bases
     set claim_token = v_token,
         claim_expires_at = now() + make_interval(days => p_days),
         is_demo = true
   where id = p_kb_id;

  return v_token;
end $$;

revoke execute on function public.issue_claim_token(uuid, int) from anon;
grant  execute on function public.issue_claim_token(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- The transfer
-- ---------------------------------------------------------------------------
-- NOTE on the signature: the new owner is auth.uid(), NOT a parameter. A SECURITY DEFINER
-- function that takes the destination account as a client-supplied argument lets anyone
-- holding a token move a KB into an account they don't control — either to grief a
-- stranger or to launder ownership. The token is the capability; the claimer is whoever is
-- logged in when they use it.
create function public.claim_kb(p_token uuid)
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
    return null;   -- unknown or expired token; the caller renders one state for both
  end if;

  -- Claiming your own KB is a no-op, not an error, but must not reset the trial clock —
  -- that would be a free 30-day extension for the price of re-clicking a link.
  if v_prev = v_new_owner then
    update public.knowledge_bases
       set claim_token = null, claim_expires_at = null, is_demo = false
     where id = v_kb_id;
    return v_kb_id;
  end if;

  -- EVERY owner-derived reset lives here. Add to this list, not elsewhere.
  update public.knowledge_bases set
      owner_id         = v_new_owner,
      -- The clock starts when THEY take it, not when we built it.
      trial_started_at = now(),
      offline_at       = null,
      purge_at         = null,
      -- Outreach traffic was ours, not theirs. Zeroing this also un-freezes the address:
      -- migration 0013 locks the subdomain once reader_views > 0, which would otherwise
      -- leave the new owner stuck with whatever we named their help center during
      -- outreach — the first thing they want to change is the one thing they couldn't.
      reader_views     = 0,
      claim_token      = null,
      claim_expires_at = null,
      is_demo          = false
   where id = v_kb_id;

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

revoke execute on function public.claim_kb(uuid) from anon;
grant  execute on function public.claim_kb(uuid) to authenticated;

comment on function public.claim_kb(uuid) is
  'The ONLY ownership transfer path. Every owner-derived reset belongs in this function — adding one elsewhere is how an entitlement silently survives a handover.';
