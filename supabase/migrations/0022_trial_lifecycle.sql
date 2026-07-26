-- Trial lifecycle: the countdown, the soft delete, and the way back.
--
-- Free tier includes UNLIMITED manual articles, so a user can hand-build a forty-article
-- help center and lose it on day 30. pricing-spec §2 names under-disclosure here as the
-- specific dark-pattern risk — the same complaint we level at competitors. The deletion is
-- only defensible because it is over-disclosed and soft. Every warning is load-bearing.
--
-- Four structural decisions live in this file:
--
--   1. Offline is a READER-SIDE GATE, not a mutation of article state.
--   2. Marker columns reset with their cycle (the corrected §10d rule).
--   3. The run ledger must survive a purge.
--   4. Plan changes are a money operation and go through one definer function.

-- ---------------------------------------------------------------------------
-- 1. The nudge markers
-- ---------------------------------------------------------------------------
-- One per message, so "did we warn them?" is a column read and not a log search. Claimed
-- by mailer.send_once() before the send (migration 0021), which is what makes a worker
-- restart mid-sweep harmless.
alter table public.knowledge_bases
  add column if not exists trial_day14_email_sent_at   timestamptz,
  add column if not exists trial_day7_email_sent_at    timestamptz,
  add column if not exists trial_offline_email_sent_at timestamptz,
  add column if not exists trial_purged_email_sent_at  timestamptz;

comment on column public.knowledge_bases.trial_day14_email_sent_at is
  'Trial nudge marker. UNLIKE domain_live_email_sent_at, this DOES reset in claim_kb(): a marker resets when the cycle it belongs to resets, and claiming restarts trial_started_at. Miss that and a new owner is deleted without ever being warned.';

-- ---------------------------------------------------------------------------
-- 2. The run ledger must outlive the KB it was spent in
-- ---------------------------------------------------------------------------
-- The day-37 purge is the FIRST code path in the product that deletes a knowledge_bases
-- row, which is what makes this urgent now rather than theoretical.
--
-- jobs.kb_id has been `on delete cascade` since 0001. Deleting a KB therefore deletes its
-- ledger rows, and the quota query — count(*) over jobs where counted_against_quota — goes
-- back to zero for that owner. A purge would hand back every free run the account ever
-- spent, which is exactly the thing 0014 called "THE most important line in this migration"
-- when it made article deletion stop doing it.
--
-- Same fix, same reasoning as 0017 did for user_id: `set null`, not cascade. A run was
-- spent. The KB it produced is gone, but the run still happened, and the ledger should stop
-- NAMING the KB rather than forget the run.
alter table public.jobs alter column kb_id drop not null;

alter table public.jobs drop constraint jobs_kb_id_fkey;
alter table public.jobs add  constraint jobs_kb_id_fkey
  foreign key (kb_id) references public.knowledge_bases(id) on delete set null;

-- The quota query keys on user_id and never on kb_id, so nothing else changes. jobs_kb_id_idx
-- stays useful for the per-KB lookups the worker does while a run is live.

-- ---------------------------------------------------------------------------
-- 3. Reader gate — offline hides the site, it does NOT touch articles
-- ---------------------------------------------------------------------------
-- The earlier plan (mvp-dev-plan §5) was to flip every article to visibility='draft' when a
-- KB goes offline. That is wrong in a way that only shows up on restore: 'listed' and
-- 'unlisted' are different states, and flattening both to 'draft' destroys the distinction,
-- so coming back would have to GUESS which articles were link-only. Offline/restore is now
-- one column write, perfectly reversible, and article rows are never touched for a
-- lifecycle reason.
--
-- Gated in all four reader RPCs, not just the resolver. reader_kb is the only one that
-- takes a hostname — the other three take a kb_id, and a kb_id is not a secret (it is in
-- the owner's URL bar and travels in claim links). Gating only the resolver would leave an
-- offline help center's content readable by anyone who had ever seen its id.
drop function if exists public.reader_kb(text);

create function public.reader_kb(p_key text)
returns table (
  id uuid, name text, about text, headline text, search_placeholder text,
  primary_color text, font_pairing text,
  logo_path text, favicon_path text, subdomain text, custom_domain text,
  domain_status text, noindex boolean, watermark boolean
)
language sql stable security definer set search_path = public as $$
  select kb.id, kb.name, kb.about, kb.headline, kb.search_placeholder,
         kb.primary_color, kb.font_pairing,
         kb.logo_path, kb.favicon_path, kb.subdomain, kb.custom_domain,
         kb.domain_status, f.noindex, f.watermark
    from public.knowledge_bases kb
    join public.profiles p on p.id = kb.owner_id
    cross join lateral public.plan_flags(p.plan) f
   where (kb.subdomain = p_key
      or (kb.custom_domain = p_key and kb.domain_status = 'live'))
     and kb.offline_at is null
   limit 1
$$;

drop function if exists public.reader_articles(uuid);
create function public.reader_articles(p_kb_id uuid)
returns table (
  id uuid, slug text, title text, subtitle text, published_at timestamptz,
  folder_id uuid, folder_name text, folder_position integer
)
language sql stable security definer set search_path = public as $$
  select a.id, a.slug,
         coalesce(nullif(a.published_content->>'title', ''), a.title) as title,
         coalesce(a.published_content->>'subtitle', a.subtitle)       as subtitle,
         a.published_at,
         f.id, f.name, f.position
    from public.articles a
    join public.knowledge_bases kb on kb.id = a.kb_id and kb.offline_at is null
    left join public.folders f on f.id = a.folder_id
   where a.kb_id = p_kb_id and a.visibility = 'listed'
   order by f.position asc nulls last, a.created_at asc
$$;

drop function if exists public.reader_article(uuid, text);
create function public.reader_article(p_kb_id uuid, p_slug text)
returns table (
  id uuid, slug text, visibility text, published_at timestamptz,
  content jsonb, folder_name text
)
language sql stable security definer set search_path = public as $$
  select a.id, a.slug, a.visibility, a.published_at, a.published_content, f.name
    from public.articles a
    join public.knowledge_bases kb on kb.id = a.kb_id and kb.offline_at is null
    left join public.folders f on f.id = a.folder_id
   where a.kb_id = p_kb_id
     and a.slug = p_slug
     and a.visibility in ('listed', 'unlisted')
     and a.published_content is not null
   limit 1
$$;

create or replace function public.reader_search(p_kb_id uuid, p_query text)
returns table (id uuid, slug text, title text, snippet text, rank real)
language sql stable security definer set search_path = public as $$
  with q as (select websearch_to_tsquery('english', coalesce(p_query, '')) as tsq)
  select a.id, a.slug,
         coalesce(nullif(a.published_content->>'title', ''), a.title) as title,
         ts_headline('english',
           public.article_search_text(a.title, a.subtitle, a.published_content),
           q.tsq, 'MaxFragments=1,MaxWords=18,MinWords=5') as snippet,
         ts_rank(a.search_vector, q.tsq) as rank
    from public.articles a
    join public.knowledge_bases kb on kb.id = a.kb_id and kb.offline_at is null
    cross join q
   where a.kb_id = p_kb_id
     and a.visibility = 'listed'
     and q.tsq @@ a.search_vector
   order by rank desc
   limit 20
$$;

grant execute on function public.reader_kb(text)            to anon, authenticated;
grant execute on function public.reader_articles(uuid)      to anon, authenticated;
grant execute on function public.reader_article(uuid, text) to anon, authenticated;
grant execute on function public.reader_search(uuid, text)  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Plan changes — one definer function, actor derived from auth.uid()
-- ---------------------------------------------------------------------------
-- 0015 revoked UPDATE on profiles and granted back only (last_kb_id), specifically so a
-- client could not write its own `plan`. That left no path at all to change a plan, which
-- was correct then and is a blocker now: the restore path IS a plan change.
--
-- On §10e.1 ("a definer function derives identity from auth.uid(), never from an
-- argument"): p_target here is the SUBJECT of the operation, not the ACTOR. The actor is
-- is_admin(), which reads auth.uid() and cannot be supplied by the caller. That is the
-- distinction the invariant is about — a p_user_id parameter is a bug when it stands in for
-- proof of who is calling, which this one never does. Without the admin check this would be
-- exactly the escalation §10e.1 describes, so the check is the whole function.
create or replace function public.admin_set_plan(p_target uuid, p_plan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expiry int;
begin
  if not public.is_admin() then
    raise exception 'not permitted';
  end if;

  if p_plan not in ('free', 'founding', 'starter', 'growth', 'internal') then
    raise exception 'unknown plan %', p_plan;
  end if;

  update public.profiles
     set plan = p_plan, plan_since = now()
   where id = p_target;

  select f.expiry_days into v_expiry from public.plan_flags(p_plan) f;

  -- The lifecycle state is derived from the plan, so it is rewritten here rather than left
  -- for the sweep to reinterpret. Both directions matter:
  --
  --   TO PAID  — trial_started_at goes null. No clock, no countdown, and offline_at
  --              clearing is what brings the reader back on the very next request.
  --   TO FREE  — the clock RESTARTS from now(). Without this, downgrading a customer who
  --              has been with us two months hands them a two-month-old trial_started_at,
  --              and the next sweep tick takes their help center offline immediately. A
  --              downgrade must never be a deletion.
  --
  -- Either way all four markers clear: a marker is meaningless without its cycle, and
  -- leaving them set would silence every warning on the new clock.
  update public.knowledge_bases
     set trial_started_at            = case when v_expiry is null then null else now() end,
         offline_at                  = null,
         purge_at                    = null,
         trial_day14_email_sent_at   = null,
         trial_day7_email_sent_at    = null,
         trial_offline_email_sent_at = null,
         trial_purged_email_sent_at  = null
   where owner_id = p_target;
end $$;

revoke execute on function public.admin_set_plan(uuid, text) from anon, authenticated;
grant  execute on function public.admin_set_plan(uuid, text) to authenticated;

comment on function public.admin_set_plan(uuid, text) is
  'The only path that writes profiles.plan. Gated on is_admin() (auth.uid()), never on a caller-supplied actor. Also resets the trial cycle: to paid clears the clock, to free RESTARTS it so a downgrade is never an instant deletion.';

-- ---------------------------------------------------------------------------
-- 5. claim_kb — the corrected marker rule (supersedes the coarse §10d wording)
-- ---------------------------------------------------------------------------
-- 0021 established that claim_kb() resets owner-derived state but not delivery records, and
-- that domain_live_email_sent_at therefore does not reset. That rule is too coarse and
-- would cause a silent bug here.
--
-- The correct rule:
--
--     A marker resets when the CYCLE IT BELONGS TO resets.
--
-- domain_live_email_sent_at does not reset because a domain goes live once, historically —
-- there is no cycle to restart. The trial markers DO reset, because claim_kb() restarts
-- trial_started_at three lines above them, and a marker outliving its cycle means a new
-- owner's help center is deleted with every warning already marked as delivered.
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

-- ---------------------------------------------------------------------------
-- 6. Sweep index
-- ---------------------------------------------------------------------------
-- The sweep asks "free-plan KBs whose clock has started", every tick, forever. Partial on
-- trial_started_at so paid and not-yet-started KBs are not even in the index.
create index if not exists kb_trial_idx
  on public.knowledge_bases (trial_started_at)
  where trial_started_at is not null;
