-- Entitlements + the run ledger (mvp-dev-plan §2/§3/§4).
--
-- Three structural moves, all cheap today and expensive once customers exist:
--
--   1. `plan` moves from knowledge_bases to profiles. Entitlements are OWNER-level. A
--      KB-scoped plan breaks the ownership-claim flow (a claimed demo KB would carry the
--      demo's plan to the claimer), breaks `internal` demo KBs, and makes run caps
--      ambiguous at Growth's 5 KBs.
--   2. Quota counts JOBS, not articles, and the ledger is append-only. The FK swap below
--      is the whole anti-farming mechanism.
--   3. Storage objects are re-keyed by KB, not by owner — see the storage section.

-- ---------------------------------------------------------------------------
-- articles — measurement columns + origin
-- ---------------------------------------------------------------------------
-- generated_snapshot / first_edited_at / last_edited_at are LOSSY: not captured at
-- generation time means gone forever for every early user. They are here now, ahead of the
-- metrics work, for that reason alone.
alter table public.articles
  add column generated_snapshot jsonb,
  add column first_edited_at    timestamptz,
  add column last_edited_at     timestamptz,
  -- 'generated' | 'manual'. Free tier treats them differently in the UI (runs are capped,
  -- typing is not) even though both are just articles. One column, no second table.
  add column source text not null default 'manual';

update public.articles set source = 'generated' where source_video_path is not null;

comment on column public.articles.generated_snapshot is
  'The article exactly as the pipeline produced it, written once and never updated. The only passive measure of how far a published article drifts from what we generated.';

-- ---------------------------------------------------------------------------
-- profiles — owner-level entitlements
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column plan       text not null default 'free',
  -- Human context for Lee: "founding #3, ₹999 locked, invoiced 2026-08-01". Never rendered.
  add column plan_note  text,
  add column plan_since timestamptz,
  -- Governs access to the admin surface, NOT entitlements. Different concern; do not merge
  -- it into `plan`.
  add column is_admin   boolean not null default false,
  add column last_kb_id uuid;

alter table public.profiles add constraint plan_valid
  check (plan in ('free', 'founding', 'starter', 'growth', 'internal'));

-- No-op on empty tables; two lines either way.
update public.profiles p set plan = kb.plan
  from public.knowledge_bases kb where kb.owner_id = p.id;

alter table public.knowledge_bases drop column plan;

-- The old free-tier counter and its RPC. Superseded by the jobs ledger: a counter counted
-- ARTICLES (so deleting one handed a slot back through the article-delete path) and
-- incremented after Stage 1 rather than on success (so a run that died at ffmpeg still
-- burned a slot). Both bugs disappear with count(*) over an append-only table.
alter table public.knowledge_bases drop column free_articles_used;
drop function if exists public.increment_free_articles(uuid);

-- ---------------------------------------------------------------------------
-- knowledge_bases — trial lifecycle columns (the sweep is a later slice)
-- ---------------------------------------------------------------------------
alter table public.knowledge_bases
  -- Set ONCE, by trigger, on the first article created in this KB. Not signup (punishes
  -- someone who returns on day 28), not last activity (destroys the deadline). A trial
  -- clock that can be reset is not a clock — nothing recalculates this.
  add column trial_started_at timestamptz,
  add column offline_at       timestamptz,   -- soft delete: hidden + reader 404
  add column purge_at         timestamptz;   -- hard delete

-- ---------------------------------------------------------------------------
-- jobs — the run ledger
-- ---------------------------------------------------------------------------
-- THE most important line in this migration. article_id was `on delete cascade`, so
-- deleting an article deleted its ledger row and handed the run back: the free tier was
-- defeated by delete-and-regenerate in about four minutes. The ledger must outlive the
-- thing it records.
alter table public.jobs drop constraint jobs_article_id_fkey;
alter table public.jobs add constraint jobs_article_id_fkey
  foreign key (article_id) references public.articles(id) on delete set null;

alter table public.jobs
  -- Quota is owner-level, and a job outlives its KB's ownership. Denormalized from
  -- knowledge_bases.owner_id so the quota query is a single-table count with an index.
  add column user_id uuid references public.profiles(id),
  add column failure_code           text,
  add column failure_detail         text,   -- internal only, never rendered to a user
  add column video_duration_seconds int,
  -- Written as soon as the duration is known, NOT at the end. The circuit breaker sums
  -- this across today, so an in-flight run has to be visible to it — otherwise a burst of
  -- concurrent jobs all read a stale total and sail past the cap together.
  add column est_cost_usd           numeric(10,4),
  -- Set on SUCCESS ONLY. A failed generation never burns a run — not generosity, it is the
  -- single largest driver of support volume.
  add column counted_against_quota  boolean not null default false,
  -- Paid run caps are soft: an over-cap run proceeds and is flagged here. Lee is the
  -- overage system at this volume.
  add column over_cap               boolean not null default false,
  add column finished_at            timestamptz;

update public.jobs j set user_id = kb.owner_id
  from public.knowledge_bases kb where kb.id = j.kb_id;

alter table public.jobs alter column user_id set not null;

create index jobs_quota_idx   on public.jobs (user_id) where counted_against_quota;
create index jobs_created_idx on public.jobs (created_at desc);

-- ---------------------------------------------------------------------------
-- plan_flags — the ONE place SQL mirrors the worker's PLANS
-- ---------------------------------------------------------------------------
-- MIRRORS `PLANS` in worker/config.py and web/src/lib/plans.ts. Limits live in code; this
-- exists only because two things must decide inside the database: the anon reader's
-- rendering flags, and the quota backstop trigger. Same precedent as RESERVED_SUBDOMAINS
-- (migration 0013) — if the lists drift, that's a bug.
create function public.plan_flags(p_plan text)
returns table (noindex boolean, watermark boolean, lifetime_runs int)
language sql immutable as $$
  select
    coalesce(p_plan, 'free') in ('free', 'internal'),   -- noindex
    coalesce(p_plan, 'free') = 'free',                  -- watermark
    case when coalesce(p_plan, 'free') = 'free' then 3 else null end
$$;

-- ---------------------------------------------------------------------------
-- Quota backstop — the cap holds in the DB, not just in the API
-- ---------------------------------------------------------------------------
-- The worker checks quota before the Gemini call; this catches anything that reaches the
-- ledger by another path. Belt and braces, by design.
create function public.enforce_run_quota()
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
     where p.id = new.user_id;

    if v_limit is not null then
      -- Excludes this row: the row being flagged is the run being spent, not a prior one.
      select count(*) into v_used from public.jobs
       where user_id = new.user_id and counted_against_quota and id <> new.id;

      if v_used >= v_limit then
        raise exception 'run quota exceeded for user % (% of %)', new.user_id, v_used, v_limit;
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger jobs_enforce_quota before update on public.jobs
  for each row execute function public.enforce_run_quota();

-- ---------------------------------------------------------------------------
-- articles — stamp origin + start the trial clock, in ONE place
-- ---------------------------------------------------------------------------
-- There are two article-creation call sites (the worker's pipeline and the SPA's
-- "write from scratch") and a third is coming. A trigger is the only version a future
-- caller cannot forget.
create function public.stamp_article_origin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.source := case when new.source_video_path is not null then 'generated' else 'manual' end;

  -- `and trial_started_at is null` is what makes this once-and-only-once.
  update public.knowledge_bases
     set trial_started_at = now()
   where id = new.kb_id and trial_started_at is null;

  return new;
end $$;

create trigger articles_stamp_origin before insert on public.articles
  for each row execute function public.stamp_article_origin();

-- ---------------------------------------------------------------------------
-- plans — prices, editable without a deploy
-- ---------------------------------------------------------------------------
-- Limits are behaviour and live in code. Prices are a business input and live here, where
-- Lee edits them in the Supabase table editor.
--
-- Trap worth knowing (pricing-spec §11): the DISPLAY price is not the CHARGED price until
-- checkout ships. `payment_link` sits in the same row so the two are edited together.
create table public.plans (
  id            text primary key,
  display_name  text not null,
  price_monthly numeric(10,2),
  price_annual  numeric(10,2),
  currency      text not null default 'INR',
  payment_link  text,
  -- founding + internal are invisible to the pricing page. is_public=false is also the RLS
  -- boundary: those rows are not readable by the SPA at all.
  is_public     boolean not null default true,
  sort_order    int
);

insert into public.plans
  (id, display_name, price_monthly, price_annual, currency, is_public, sort_order) values
  ('free',     'Free',        0,    null,  'INR', true,  0),
  ('founding', 'Founding',    999,  null,  'INR', false, 1),
  ('starter',  'Starter',     1499, 14990, 'INR', true,  2),
  ('growth',   'Growth',      3999, 39990, 'INR', true,  3),
  ('internal', 'Internal',    null, null,  'INR', false, 99);

alter table public.plans enable row level security;

-- Public plans are public information — including their payment link, which is a checkout
-- URL meant to be handed out. Non-public rows have no read path at all.
create policy plans_read_public on public.plans
  for select using (is_public);

-- ---------------------------------------------------------------------------
-- reader_kb — stop projecting `plan` to anon
-- ---------------------------------------------------------------------------
-- The reader needs two RENDERING flags, not billing state. Projecting the tier name told
-- every anon visitor what their host pays us, and coupled the public site to tier names.
-- Return type changes → drop + recreate (same as 0008/0010/0011).
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
   where kb.subdomain = p_key
      or (kb.custom_domain = p_key and kb.domain_status = 'live')
   limit 1
$$;

grant execute on function public.reader_kb(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage — re-key every object by KB, not by owner
-- ---------------------------------------------------------------------------
-- Paths were "{owner_id}/…", which breaks in two places we have already committed to:
--   * the ownership-claim flow reassigns a KB to a new owner — every object would keep the
--     OLD owner's prefix, so the new owner cannot read their own screenshots;
--   * the day-37 purge has to delete one KB's objects, and an owner prefix cannot express
--     that when an owner has several KBs.
-- Both are the expensive kind of retrofit later. With no real data it is free today.
create function public.owns_kb_path(p_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  -- Compares as text: a first segment that isn't a uuid simply matches nothing, rather
  -- than raising on a bad cast.
  select exists (
    select 1 from public.knowledge_bases kb
     where kb.id::text = (storage.foldername(p_name))[1]
       and kb.owner_id = (select auth.uid())
  )
$$;

drop policy if exists storage_videos_own   on storage.objects;
drop policy if exists storage_frames_own   on storage.objects;
drop policy if exists storage_branding_own on storage.objects;

create policy storage_videos_own on storage.objects
  for all to authenticated
  using (bucket_id = 'videos' and public.owns_kb_path(name))
  with check (bucket_id = 'videos' and public.owns_kb_path(name));

create policy storage_frames_own on storage.objects
  for all to authenticated
  using (bucket_id = 'frames' and public.owns_kb_path(name))
  with check (bucket_id = 'frames' and public.owns_kb_path(name));

create policy storage_branding_own on storage.objects
  for all to authenticated
  using (bucket_id = 'branding' and public.owns_kb_path(name))
  with check (bucket_id = 'branding' and public.owns_kb_path(name));
