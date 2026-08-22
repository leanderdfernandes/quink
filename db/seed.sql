-- db/seed.sql — fixtures for the STAGING project.
--
-- An empty staging database is a staging database nobody uses. This produces the five
-- fixtures that make the surfaces worth looking at reachable: a watermarked free help
-- center, a clean paid one, a demo with a live claim link, a free KB the next trial sweep
-- will take offline, and one completed + one failed job.
--
-- Run it in the staging SQL editor, or:
--   psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f db/seed.sql
--
-- IT IS RE-RUNNABLE. Every fixture has a fixed UUID and the script deletes its own rows
-- first, so running it twice leaves the same database as running it once. It touches
-- nothing whose id is not written below.
--
-- IT GOES THROUGH THE TRIGGERS. Users are created in auth.users so handle_new_user()
-- provisions the profile; KBs are inserted so kb_subdomain provisions the subdomain;
-- articles are inserted so articles_stamp_origin sets `source` and starts the trial
-- clock; a run is charged by UPDATEing counted_against_quota so jobs_enforce_quota runs.
-- A fixture that hand-sets a column a trigger owns is not a fixture of this system.
--
-- WHAT IT DOES NOT CREATE: Storage objects. Every step is text-only, with the editor's
-- "+ Add image" affordance where a screenshot would be. Seeding frames means uploading
-- real WebP files, which is a pipeline run, not a SQL script.
--
-- Sign in as any fixture account with the password `staging-only`.

-- ---------------------------------------------------------------------------
-- GUARD. staging_marker is created BY HAND, once, in the staging project, and is
-- deliberately not part of any migration — so it cannot travel to production with a
-- schema change. Its absence is the only thing standing between this file and a
-- production database, so it is checked before anything else runs.
--
--   create table public.staging_marker (note text);   -- staging project only
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.staging_marker') is null then
    raise exception 'REFUSING TO SEED: no public.staging_marker table, so this is not the staging project. If it really is, create the marker by hand first: create table public.staging_marker (note text);';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Clean out the previous run. Jobs first: their FKs are `on delete set null`, so deleting
-- the users would orphan the ledger rows rather than remove them (that FK shape is
-- deliberate — CLAUDE.md §10b — and here it just means we delete explicitly).
-- Deleting the auth user cascades to profiles -> knowledge_bases -> articles -> steps.
-- ---------------------------------------------------------------------------
delete from public.jobs where id in (
  '44444444-4444-4444-4444-000000000001',
  '44444444-4444-4444-4444-000000000002'
);
delete from auth.users where id in (
  '11111111-1111-4111-8111-000000000001',
  '11111111-1111-4111-8111-000000000002',
  '11111111-1111-4111-8111-000000000003',
  '11111111-1111-4111-8111-000000000004'
);

-- ---------------------------------------------------------------------------
-- Four owners. handle_new_user() creates each profile and an auto-provisioned KB; the
-- auto KB is dropped just below and replaced with a fixed-id one, because a fixture you
-- cannot paste into /app/:kbId is a fixture you go looking for every single time.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated',
       v.email, extensions.crypt('staging-only', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name', v.full_name),
       now(), now()
from (values
  ('11111111-1111-4111-8111-000000000001'::uuid, 'free-owner@example.com',     'Priya Rao'),
  ('11111111-1111-4111-8111-000000000002'::uuid, 'paid-owner@example.com',     'Sam Whittaker'),
  ('11111111-1111-4111-8111-000000000003'::uuid, 'internal@example.com',       'Quink Staff'),
  ('11111111-1111-4111-8111-000000000004'::uuid, 'expiring-owner@example.com', 'Dana Osei')
) as v(id, email, full_name);

-- Email/password sign-in needs the identity row. Without it the account exists and cannot
-- log in, which is the least useful shape a fixture can have.
insert into auth.identities (provider_id, user_id, identity_data, provider,
                             created_at, updated_at, email)
select u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), u.email
from auth.users u
where u.id in (
  '11111111-1111-4111-8111-000000000001',
  '11111111-1111-4111-8111-000000000002',
  '11111111-1111-4111-8111-000000000003',
  '11111111-1111-4111-8111-000000000004'
);

-- Plans, BEFORE any article exists: articles_stamp_origin reads the owner's plan to decide
-- whether to start a trial clock, so setting the plan afterwards would give the paid help
-- center a countdown it must never have.
update public.profiles set plan = 'founding', plan_since = now()
 where id = '11111111-1111-4111-8111-000000000002';
update public.profiles set plan = 'internal', plan_since = now(), is_admin = true
 where id = '11111111-1111-4111-8111-000000000003';

-- Drop the auto-provisioned KBs and insert fixed-id ones (kb_subdomain still fires).
delete from public.knowledge_bases where owner_id in (
  '11111111-1111-4111-8111-000000000001',
  '11111111-1111-4111-8111-000000000002',
  '11111111-1111-4111-8111-000000000003',
  '11111111-1111-4111-8111-000000000004'
);

insert into public.knowledge_bases (id, owner_id, name, about, headline, is_published,
                                    is_demo, claim_token, claim_expires_at)
values
  -- 1. Free plan -> kb_watermark() true -> the reader renders the watermark.
  ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-000000000001',
   'Northwind Help Center', 'Guides for getting started with Northwind.',
   'How can we help?', true, false, null, null),
  -- 2. founding -> watermark false -> the reader renders clean.
  ('22222222-2222-4222-8222-000000000002', '11111111-1111-4111-8111-000000000002',
   'Lantern Support', 'Everything you need to run Lantern.',
   'Search our guides', true, false, null, null),
  -- 3. A reverse demo on `internal`, with a live claim link. is_demo is what makes it
  --    render watermarked despite the internal plan, so claiming it changes nothing
  --    visually (§10d) — the fixture exists to prove that stays true.
  ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-000000000003',
   'Harbourside Demo', 'A help center built from your own recordings.',
   'How can we help?', true, true,
   '55555555-5555-4555-8555-000000000001', now() + interval '14 days'),
  -- 4. Free, and past expiry. trial_started_at is moved backwards below, AFTER the
  --    trigger stamps it — the same way supabase/test_trial.py drives the sweep.
  ('22222222-2222-4222-8222-000000000004', '11111111-1111-4111-8111-000000000004',
   'Meridian Docs', 'Support articles for Meridian.',
   'How can we help?', true, false, null, null);

-- ---------------------------------------------------------------------------
-- Articles. Two published per KB. `visibility` is the publish state, NEVER `status`
-- (§10f) — status is the pipeline lifecycle and its check constraint no longer accepts
-- 'published'. published_content mirrors the JSON contract exactly (§6).
-- ---------------------------------------------------------------------------
create temp table _seed_articles (
  id uuid, kb_id uuid, slug text, title text, subtitle text, generated boolean
) on commit drop;

insert into _seed_articles values
  ('33333333-3333-4333-8333-000000000001', '22222222-2222-4222-8222-000000000001',
   'connect-your-inbox', 'Connect your inbox',
   'Point Northwind at the mailbox your customers already write to.', true),
  ('33333333-3333-4333-8333-000000000002', '22222222-2222-4222-8222-000000000001',
   'invite-your-team', 'Invite your team',
   'Add the people who answer tickets with you.', false),
  ('33333333-3333-4333-8333-000000000003', '22222222-2222-4222-8222-000000000002',
   'set-up-billing', 'Set up billing',
   'Add a payment method and pick a plan.', false),
  ('33333333-3333-4333-8333-000000000004', '22222222-2222-4222-8222-000000000002',
   'export-your-data', 'Export your data',
   'Take a copy of everything, any time.', false),
  ('33333333-3333-4333-8333-000000000005', '22222222-2222-4222-8222-000000000003',
   'reset-a-password', 'Reset a password',
   'What to do when a guest cannot sign in.', true),
  ('33333333-3333-4333-8333-000000000006', '22222222-2222-4222-8222-000000000003',
   'refund-a-booking', 'Refund a booking',
   'Cancel a stay and return the deposit.', false),
  ('33333333-3333-4333-8333-000000000007', '22222222-2222-4222-8222-000000000004',
   'first-run-checklist', 'First-run checklist',
   'The five things to do on day one.', false),
  ('33333333-3333-4333-8333-000000000008', '22222222-2222-4222-8222-000000000004',
   'change-your-plan', 'Change your plan',
   'Move between tiers without losing anything.', false);

-- `source_video_path` is what articles_stamp_origin reads to set source='generated'. It is
-- nulled straight after, because publishing deletes the recording (§10f) — which is
-- exactly why `articles.source`, not the path, answers "was this generated?".
insert into public.articles (id, kb_id, title, subtitle, slug, status, visibility,
                             published_at, published_content, source_video_path)
select a.id, a.kb_id, a.title, a.subtitle, a.slug, 'ready', 'listed', now(),
       jsonb_build_object(
         'title', a.title,
         'subtitle', a.subtitle,
         'steps', jsonb_build_array(
           jsonb_build_object('step_number', 1, 'heading', 'Open Settings',
             'body_text', '<p>Click your avatar, then choose <b>Settings</b>.</p>',
             'screenshot_url', null),
           jsonb_build_object('step_number', 2, 'heading', 'Choose the option you need',
             'body_text', '<p>Pick the section that matches what you are changing.</p>',
             'screenshot_url', null),
           jsonb_build_object('step_number', 3, 'heading', 'Save',
             'body_text', '<p>Click <b>Save</b>. The change applies straight away.</p>',
             'screenshot_url', null))),
       case when a.generated
            then a.kb_id::text || '/' || a.id::text || '/source.mp4' end
from _seed_articles a;

update public.articles set source_video_path = null
 where id in (select id from _seed_articles where generated);

insert into public.steps (article_id, step_number, heading, body_text)
select a.id, s.n, s.heading, s.body
from _seed_articles a
cross join (values
  (1, 'Open Settings',              '<p>Click your avatar, then choose <b>Settings</b>.</p>'),
  (2, 'Choose the option you need', '<p>Pick the section that matches what you are changing.</p>'),
  (3, 'Save',                       '<p>Click <b>Save</b>. The change applies straight away.</p>')
) as s(n, heading, body);

-- Fixture 4: past expiry, still online — so the NEXT sweep tick is what takes it offline.
-- The transition is the thing worth watching, not the end state.
update public.knowledge_bases
   set trial_started_at = now() - interval '31 days',
       offline_at = null,
       purge_at = null,
       trial_day14_email_sent_at = null,
       trial_day7_email_sent_at = null,
       trial_offline_email_sent_at = null
 where id = '22222222-2222-4222-8222-000000000004';

-- ---------------------------------------------------------------------------
-- Jobs. One completed, one failed with a real code from worker/failures.py, so the
-- failure screen and the quota count both have something to read.
-- ---------------------------------------------------------------------------
insert into public.jobs (id, kb_id, article_id, user_id, billed_to_user_id, stage, status,
                         video_duration_seconds, est_cost_usd, started_at, finished_at,
                         video_path, video_purged_at, context)
values
  ('44444444-4444-4444-4444-000000000001',
   '22222222-2222-4222-8222-000000000001', '33333333-3333-4333-8333-000000000001',
   '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001',
   'writing', 'done', 214, 0.07, now() - interval '3 days',
   now() - interval '3 days' + interval '96 seconds',
   '22222222-2222-4222-8222-000000000001/33333333-3333-4333-8333-000000000001/source.mp4',
   now() - interval '3 days',
   '{"product_name":"Northwind","audience":"New users","tone":"Friendly"}'::jsonb),
  ('44444444-4444-4444-4444-000000000002',
   '22222222-2222-4222-8222-000000000001', null,
   '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001',
   'analyzing', 'error', 180, 0.06, now() - interval '1 day',
   now() - interval '1 day' + interval '41 seconds',
   '22222222-2222-4222-8222-000000000001/failed-run.mp4', null,
   '{"product_name":"Northwind","audience":"New users","tone":"Friendly"}'::jsonb);

update public.jobs set failure_code = 'model_unavailable',
                       failure_detail = 'seed fixture: Gemini 503 after 3 transport retries'
 where id = '44444444-4444-4444-4444-000000000002';

-- The charge goes through jobs_enforce_quota, which only fires on UPDATE. The failed run
-- never carries it — that is the rule, not an oversight (§10b).
update public.jobs set counted_against_quota = true
 where id = '44444444-4444-4444-4444-000000000001';

-- ---------------------------------------------------------------------------
select 'seeded' as result,
       (select count(*) from public.knowledge_bases
         where id::text like '22222222-2222-4222-8222-%') as knowledge_bases,
       (select count(*) from public.articles
         where id::text like '33333333-3333-4333-8333-%') as articles,
       (select count(*) from public.jobs
         where id::text like '44444444-4444-4444-4444-%') as jobs,
       (select subdomain from public.knowledge_bases
         where id = '22222222-2222-4222-8222-000000000003') as demo_subdomain,
       '/claim/55555555-5555-4555-8555-000000000001' as demo_claim_link;
