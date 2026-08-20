mvp-dev-plan.md — MVP hardening for first paying customers

Execution plan for Phase 1 of checklist.md. Covers entitlements, the run ledger, the free-tier lifecycle, failure handling, internal alerting, the admin surface, KB routing, and help.quink.online. Companion to pricing-spec.md (v3), ux-spec-v2.md, CLAUDE.md.

Scope rule: this document closes the cost floor and gives Lee the ability to see and sell. Nothing here is a customer-facing feature except the failure screens, the free-tier countdown, and the upgrade block. If a task grows past that, it belongs to Phase 3.

0. Verified against the code

All nine pre-build checks are resolved. Six confirmed, three changed the plan.

#	Finding	Effect on this plan
V1	Custom domain works end-to-end (Vercel attach + servable() against verified/config state, DB-backed backoff loop, migration 0012)	✅ §12 smoke test is a config check, not a build — needs VERCEL_TOKEN / VERCEL_PROJECT_ID on Render or it stubs
V2	jobs is DB-backed (migration 0001) but has no user_id, and article_id is on delete cascade	§3 SQL corrected — cascade → set null is the whole anti-farming mechanism
V3	Authoring app has no routes at all — an 11-phase useState machine under <Route path="*">. KB resolved by .eq('owner_id',…).single(), which throws on a second KB	§9 rewritten — bigger than expected, and it's a hard blocker for the reverse demo
V4	knowledge_bases.subdomain exists (unique, trigger-provisioned) but is mutable	Authoring routes on kb.id, not slug
V5	knowledge_bases.free_articles_used exists — per-KB, counts articles, display-only, and increments after Stage 1	Retire it in step 3. It's a live bug: a job dying at ffmpeg already burnt a run
V6	Image is conditional; step numbering is not, and 3 more places assume numbers (meta, TOC, scroll-spy)	Deferral holds — layout:'prose' is 4 conditionals in one file
V7	plan already exists on knowledge_bases, load-bearing in 4 places incl. a public RPC	Resolved in §2 — moving to profiles, reasoning below
V8	profiles ✅; table is knowledge_bases, not kbs. Publish state is visibility, not status	All SQL renamed; expiry flips visibility
V9	No cron anywhere — but domain.run_loop() is a live asyncio task in the worker lifespan	§5 sweep rides that loop. No new infra
1. Locked decisions
Free tier = 3 lifetime AI video runs + unlimited manual articles + 30-day expiry. Supersedes "3 lifetime articles" everywhere. Free now uses the same runs-vs-manual mechanic as every paid tier (pricing-spec.md §3).
Quota counts jobs, not articles. Append-only ledger. Deleting an article never returns a run.
Expiry is soft. Day 30 offline + hidden, day 37 hard delete, with an escalating countdown from day 30.
founding is its own plan value, not "starter with a note." Countable, cappable at 10, immune to a future price migration.
Prices live in a plans table in Supabase, editable without a deploy. Limits stay in code. One price per plan for everyone — no per-customer price column.
Custom domains are IN for the founding batch. Delivery is on *.quink.online first; custom domain is a follow-up conversation, not a day-one requirement.
No transactional email in Phase 1. Telegram for internal alerts; Supabase Auth SMTP for auth mail only; customer-facing mail sent by hand from Lee's inbox.
plan moves to profiles and knowledge_bases.plan is dropped. Single owner-level source of truth. See §2 for why this overrides the KB-scoped alternative.
Authoring routes live under /app/:kbId/…, keyed on kb.id. /kb/ is already the reader's preview namespace, and subdomain is mutable so it can't key a URL. See §9.
Prose-only articles are deferred, with consequences for help.quink.online. See §10.
Metrics are a separate exercise, with two lossy exceptions that ride along now. §12.
2. Entitlements — plan drives everything

Do not store limits per user. Store a plan string; derive every limit from config.

sql
alter table profiles
  add column plan        text        not null default 'free',
  add column plan_since  timestamptz,
  add column plan_note   text,
  add column is_admin    boolean     not null default false,
  add column last_kb_id  uuid;

alter table profiles
  add constraint plan_valid
  check (plan in ('free','founding','starter','growth','internal'));

-- migrate the existing KB-scoped column (1:1 today — every user has exactly one KB)
update profiles p
   set plan = kb.plan
  from knowledge_bases kb
 where kb.owner_id = p.id;

alter table knowledge_bases drop column plan;

plan_note carries human context — "founding #3, ₹999 locked, invoiced 2026-08-01". For Lee, never rendered to the user.

is_admin governs access to the admin surface, not entitlements. Different concern — do not merge it into plan.

Why plan is owner-level, not KB-level

plan currently lives on knowledge_bases with four consumers, one of them a public RPC. Keeping it there is the smaller change and was the reasonable recommendation. It is still the wrong one, for three reasons that only bite later — when they are expensive.

The claim link would transfer entitlements. A demo KB on Lee's internal account carries plan='internal' — unlimited runs, no watermark, no expiry, custom domain. If plan rides on the KB, claiming that KB hands a stranger all of it, permanently. The transfer code would need to remember to reset it, which is exactly the thing that gets forgotten. With owner-level plan this is structurally impossible: the KB carries no entitlement, and the new owner's plan applies the moment they claim it — including the watermark and the 30-day clock, correctly, with no code.
30 demo KBs each need the right plan stamped at creation. Miss one and it defaults to free, starts a trial clock, and the day-30 sweep deletes a live reverse demo. Owner-level, all 30 inherit internal and there is nothing to miss.
Run caps are an account-level cost control. 20/month on a Growth account with 5 KBs is 20, not 100. A per-KB plan makes the cap ambiguous exactly where it protects money, and PLANS[plan].kbs already assumes the limit is owner-scoped.

The public RPC doesn't actually need plan. It needs noindex and watermark — rendering flags, not billing state. Change reader_kb to project those two booleans, derived at query time from the owner's plan, and the reader stops knowing tier names altogether. That is also a small anon-facing information leak closed for free.

The migration is one update while every user has exactly one KB. The same migration with real customers on multiple KBs is a data-integrity problem with no clean answer. Do it now.

Fold worker/config.py:57's PAID_P… block into PLANS as custom_domain: True. Do not ship two entitlement tables.

The PLANS config block — limits only

Named constant, never scattered literals (CLAUDE.md). Same shape in the worker and the SPA; if they drift, that's a bug. Prices are NOT here — see §8.

python
PLANS = {
  "free":     {"lifetime_runs": 3,    "monthly_runs": None, "kbs": 1,
               "manual_articles": None, "expiry_days": 30,
               "custom_domain": False, "watermark": True,  "noindex": True},
  "founding": {"lifetime_runs": None, "monthly_runs": 20,   "kbs": 1,
               "manual_articles": None, "expiry_days": None,
               "custom_domain": True,  "watermark": False, "noindex": False},
  "starter":  {"lifetime_runs": None, "monthly_runs": 20,   "kbs": 1,
               "manual_articles": None, "expiry_days": None,
               "custom_domain": True,  "watermark": False, "noindex": False},
  "growth":   {"lifetime_runs": None, "monthly_runs": 80,   "kbs": 5,
               "manual_articles": None, "expiry_days": None,
               "custom_domain": True,  "watermark": False, "noindex": False},
  "internal": {"lifetime_runs": None, "monthly_runs": None, "kbs": 999,
               "manual_articles": None, "expiry_days": None,
               "custom_domain": True,  "watermark": False, "noindex": True},
}

None means unlimited throughout. manual_articles is None on every tier — it is listed explicitly rather than omitted so nobody later "adds the missing cap."

Why internal matters: it is how help.quink.online and 30 reverse-demo KBs work without a single admin-bypass branch in the generation path. Lee's account is just a plan tier. noindex: True is deliberate — demo KBs must never compete with the target's own pages (checklist.md Appendix A etiquette).

starter and founding are identical today. Correct and temporary — they diverge the moment Starter's price or quota moves and founding stays locked. That divergence is the entire reason the value exists.

3. The run ledger — extend jobs, don't add a second table

jobs already exists for polling. Extending it means one table answers free-run count, monthly run meter, cost tracking, failure rate, and alert triggers.

The table exists (migration 0001) with id, kb_id, article_id, stage, status, error, created_at, updated_at. Three corrections to the schema as it stands:

sql
-- 1. article_id is currently ON DELETE CASCADE — the single most important line here
alter table jobs drop constraint jobs_article_id_fkey;
alter table jobs add  constraint jobs_article_id_fkey
  foreign key (article_id) references articles(id) on delete set null;

-- 2. there is no user_id; denormalise it rather than joining through kb_id on every check
alter table jobs add column user_id uuid references profiles(id);
update jobs j set user_id = kb.owner_id
  from knowledge_bases kb where kb.id = j.kb_id;

-- 3. the ledger columns
alter table jobs
  add column failure_code           text,
  add column failure_detail         text,          -- internal only, never rendered
  add column video_duration_seconds int,
  add column est_cost_usd           numeric(10,4),
  add column counted_against_quota  boolean not null default false,
  add column finished_at            timestamptz;

create index jobs_quota_idx   on jobs (user_id) where counted_against_quota;
create index jobs_created_idx on jobs (created_at desc);

On (1): cascade means deleting an article deletes its ledger row, which returns the run. That is the entire anti-farming mechanism inverted — free tier is currently defeated by delete-and-regenerate in about four minutes. It is a constraint swap on a small table today and a migration with live data later. Step 0.

On (2): user_id is denormalised deliberately. Quota is checked on every generate; routing through kb_id → knowledge_bases.owner_id puts a join in the hot path for a value that never changes after insert. It also keeps the ledger correct through a KB ownership transfer — the runs stay attributed to whoever actually spent them.

Two rules
counted_against_quota is set on success only. A failed generation never burns a run. Not generosity — it is the single largest driver of support volume, and Lee is the support team.
The ledger is append-only. Quota is count(*), never a decrementing counter. No drift, no repair scripts, full history for free.
sql
-- the only quota query in the codebase
select count(*) from jobs
where user_id = $1 and counted_against_quota;
Snapshot + edit tracking (irreversible — do first)
sql
alter table articles
  add column generated_snapshot jsonb,        -- written once at generation, never updated
  add column first_edited_at    timestamptz,
  add column last_edited_at     timestamptz,
  add column source             text not null default 'manual';  -- 'generated' | 'manual'

generated_snapshot is the only passive measure of A3 (generated-vs-published edit distance). The edit timestamps answer B4 at day 30/60. If these aren't captured now they are lost forever for every early user — which is why they are step 0, not part of the metrics exercise.

source exists because free tier now treats generated and manual articles differently in the UI ("3 guides from video · unlimited written by hand") even though both are just articles. One column, no separate table.

Backfill in the same migration: update articles set source = 'generated' where source_video_path is not null. generated_snapshot is unrecoverable for articles that already exist — accept the gap for those rows rather than trying to reconstruct it.

Retire free_articles_used

knowledge_bases.free_articles_used (migration 0003, incremented from pipeline.py:208, rendered at KnowledgeBase.tsx:222) counts articles, per-KB. The ledger counts runs, per-user. Two counters that disagree is precisely what an append-only ledger exists to avoid — drop the column and repoint the UI in step 3, don't leave both.

It also increments right after Stage 1 rather than on success, so a job that dies at ffmpeg has already burnt the user's run. That is a live bug today, not a hypothetical, and "count on success only" is its fix.

4. Enforcement — one point, one backstop

All enforcement lives in the worker at POST /api/generate, before the Gemini call. That is the only path that costs money. The SPA reads counters for display only.

POST /api/generate
  1. resolve user → plan → PLANS[plan]
  2. global circuit breaker:
       sum(est_cost_usd) today across ALL users >= DAILY_SPEND_CAP_USD
         → 503 spend_cap        (applies to `internal` too — see note)
  3. free tier (lifetime_runs not None):
       count(jobs where user_id and counted_against_quota) >= limit
         → 402 quota_exceeded   HARD wall. No job row, no cost incurred.
  4. paid tier (monthly_runs not None):
       runs this billing period >= limit
         → allow, flag the job, fire a Telegram alert     SOFT
  5. create job → run pipeline → on success: counted_against_quota = true

Manual article creation is never gated by any of this. It costs nothing to host, and blocking it would punish the one thing we give away deliberately.

Backstop: a Postgres trigger on jobs update that re-checks the free-tier count when counted_against_quota flips true. Belt and braces — checklist.md requires the cap be enforced server-side/in DB, not UI.

Hard for free, soft for paid

pricing-spec.md §3 is explicit that monthly run caps must not be hard walls: usage is front-loaded, and blocking a paying customer mid-fill in week one is the exact failure that spec warns about.

Free = hard wall. No relationship yet, pure cost protection. Ceiling is ~11 cents.
Paid = soft. Over-cap runs proceed and alert Lee. At 10 customers, Lee is the overage system. ~5 lines instead of billing logic.
The circuit breaker applies to internal

Deliberate. A bug in the reverse-demo loop running against Lee's own unlimited account is exactly how a runaway spend happens. Global, plan-independent, config value (DAILY_SPEND_CAP_USD, start at $5 — ~250 articles/day at 2¢, far above legitimate use).

5. The free-tier lifecycle (new)

Free users can now build a large help center by hand and then lose it. That makes the countdown a requirement, not a courtesy — pricing-spec.md §2 flags under-disclosure here as the specific dark-pattern risk.

Schema
sql
alter table knowledge_bases
  add column trial_started_at  timestamptz,   -- set on FIRST article created, then never again
  add column offline_at        timestamptz,   -- soft delete: hidden + reader 404
  add column purge_at          timestamptz;   -- hard delete

The clock starts at first article created — not signup (punishes someone who returns on day 28) and not last activity (kindest, but destroys the deadline pricing-spec.md §2 calls the conversion lever). Flagged as pricing-spec.md §9.5 — override before building the cron if you disagree.

Stamp it in a trigger, not in application code

There are two article-creation paths — pipeline.py:187 (generated) and App.tsx:183 (manual) — and both would need to set source and trial_started_at. A future third path would silently skip them.

sql
create function stamp_article_origin() returns trigger as $$
begin
  new.source := case when new.source_video_path is not null
                     then 'generated' else 'manual' end;

  update knowledge_bases
     set trial_started_at = now()
   where id = new.kb_id and trial_started_at is null;

  return new;
end $$ language plpgsql;

create trigger articles_stamp_origin
  before insert on articles
  for each row execute function stamp_article_origin();

One place, unforgettable. A trial clock that any code path can forget to start, or start twice, is not a clock.

The sweep — a tick inside domain.run_loop(), not new infra

There is no cron anywhere: no pg_cron, no render.yaml, no Supabase scheduled function. There is, however, domain.run_loop() — a persistent asyncio task started in the worker's lifespan (main.py:49) already ticking every DOMAIN_CHECK_INTERVAL. The trial sweep is another tick in that loop. No extension, no new service, no config.

Write it as a state query, never as an event.

sql
-- go offline
update knowledge_bases
   set offline_at = now(), purge_at = now() + interval '7 days'
 where trial_started_at < now() - interval '30 days'
   and offline_at is null
   and owner_plan = 'free';        -- via join on profiles

-- purge
select id from knowledge_bases where purge_at < now();

"Every KB past 30 days that hasn't gone offline yet" self-heals after a missed tick. "Fire on day 30" does not — and the loop only runs while the worker is alive. Render Starter shouldn't idle, but the state-based form costs nothing and removes the question entirely.

Stage	Action
Past 30d	offline_at, purge_at = +7d. Articles flip to visibility='draft' — reader 404s, content intact in the authoring app behind a restore prompt. Telegram alert.
Past purge_at	Hard delete articles, screenshots, KB. Telegram alert.

Offline flips visibility, not lifecycle. Migration 0005 split these: lifecycle is generating|ready|published, visibility is draft|unlisted|listed, and the reader gates on visibility. Touching lifecycle would rewrite production history for nothing.

Upgrading clears all three columns. Restore is a column update, not a data operation — which is what makes the day-30 offline state a sales screen rather than an outage.

Countdown UI — one pill, escalating

Runs and days both drain; showing two meters is noise. One pill, whichever is scarcer. Clicking opens the upgrade path (proactive). Copy lives in pricing-spec.md §7 — do not invent new strings.

Window	Treatment
Days 30–15	Neutral pill, brand-quiet — "12 guides · 22 days left"
Days 14–8	Amber pill, names the consequence
Days 7–0	Persistent banner, dismissible per session only
Days 30–37 (offline)	Full-page restore state — the highest-intent screen in the free funnel

The limit must also appear before they invest: at the dropzone, pre-upload (ux-spec-v2.md §1).

6. Failure taxonomy

Codes first, screens second. failure_detail is logged, never rendered.

Code	Cause	User-facing copy	Recovery
video_unreadable	ffprobe fails	"We couldn't read this recording. It may be corrupted, or the upload didn't finish."	Re-upload
video_too_long	over duration cap	"Recordings up to {N} minutes for now."	Trim + re-upload
model_unavailable	Gemini 5xx / 429	"Our processing service is busy right now. Your recording is safe — nothing's wrong with your file."	Auto-retry once, then button
model_bad_output	malformed JSON after 1 retry	"Something went wrong while building your article. This one's on us."	Button
model_blocked	safety filter	"We couldn't process this recording. Get in touch and we'll take a look."	Support
frame_extraction_failed	ffmpeg	"Something went wrong while capturing screenshots. This one's on us."	Button
timeout	exceeds JOB_TIMEOUT_MIN	"This took longer than expected. Your recording is safe."	Button
spend_cap	circuit breaker	"We've hit a temporary processing limit. Nothing's wrong with your file — try again shortly."	Button
quota_exceeded	run cap	Not a failure. Upgrade modal (pricing-spec.md §7).	Upgrade
Three rules the screens must hold
Never blame the user's file when it's ours. spend_cap, model_unavailable, model_bad_output, timeout all say so explicitly. A user who believes their recording is bad re-records, fails again, and leaves.
Retry must not require re-upload. Re-run from the stored video. Requiring re-upload roughly doubles abandonment at the moment they are already annoyed. (Compatible with ux-spec-v2.md §9 — video is retained until first publish. New rule added there: a failed job's video is purged after 7 days, since it will never reach a publish event.)
Every failure screen carries the job id in a prefilled mailto. support@quink.online?subject=Generation issue [job 8f3a…] — kills the "can you send me the link?" round trip, which at this volume is most of the support cost.
quota_exceeded is checked before upload completes

The user must never watch a 90-second progress bar that was doomed. Check the run quota at file selection; if capped, the upgrade modal fires at the dropzone — and explicitly notes they can still write manually.

7. Alerting — Telegram bot

~20 lines, free, instant push, no domain verification, no deliverability, no inbox to check. Resend is for customer-facing mail later — a different job; do not conflate.

Event	Why it fires
quota_exceeded	Hot lead. They tried run #4.
User reaches 2 of 3 runs	Warm. Watch, don't act.
Any model_* / timeout / frame_extraction_failed	The product is broken right now.
spend_cap tripped	Money.
Paid user over monthly runs	The soft-cap conversation (§4).
First article_published in a KB	The B2 moment — reach out.
domain_connected	Committed. Day-30 call clock starts.
Trial at day 7	Last chance to reach out before it goes offline.
KB went offline (day 30)	Restore pitch — highest-intent moment.
KB purged (day 37)	Post-mortem: did they ever publish?

Payload: email · KB name · plan · runs used · days left · job id · direct /admin link. One tap from notification to the row you act on.

The day-7 and day-30 alerts exist because there is no automated email. Disclosure is met by in-app copy + T&C; the courtesy nudge is manual. Acceptable at 10 customers, not beyond.

8. Prices in the DB — plans table

Split the config. Limits are behaviour and belong in code (§2); prices are business inputs and belong in the database where they change without a deploy.

sql
create table plans (
  id             text primary key,          -- free|founding|starter|growth|internal
  display_name   text not null,
  price_monthly  numeric(10,2),
  price_annual   numeric(10,2),
  currency       text not null default 'INR',
  payment_link   text,                      -- Razorpay link — edited WITH the price
  is_public      boolean not null default true,   -- founding/internal = false
  sort_order     int
);
SPA reads it for display (RLS: public read on display columns only, never payment_link for non-public plans).
Worker reads it when producing a payment link.
Lee edits it in the Supabase table editor.

Two traps, both documented in pricing-spec.md §11:

Display price ≠ charged price. Until Phase 3 the actual charge is a Razorpay link or a manual invoice. Editing ₹999 → ₹1,299 changes what the page says, not what anyone pays. payment_link sits in the same row so the two get edited together.
One price per plan, for everyone. No per-customer price column, by decision. Raising founding later raises it for everyone on it, which contradicts "locked forever." Exposure is low now (charging is manual) and real at Phase 3. Revisit before automating subscriptions — checklist.md D2.
9. Admin surface + KB routing
/admin, four tabs

RLS-gated on the underlying views, not just a route guard. A route guard alone is theatre when the SPA talks to Supabase directly.

Tab	Contents	Actions
Users	email, plan, plan_since, plan_note, runs used, days left, KB link	Plan dropdown (writes plan + plan_since), edit note, mailto
Leads	everyone at 2/3 runs, capped, or inside 7 days of expiry — sorted by heat	mailto with the founding-offer template prefilled
Runs	recent jobs: status, failure_code, duration, est cost, user	Open job, re-run
KBs	owner, subdomain, article counts (generated vs manual), expiry state, last reader view	Open-as-owner, generate claim link, mark demo, extend trial

The plan dropdown is the manual upgrade path. Safer than hand-editing production rows in the Supabase table editor, and it timestamps plan_since for you. Flipping to a paid plan must also clear trial_started_at / offline_at / purge_at.

Since there is no transactional email, activation is: user pays → Lee flips the dropdown → the app works on their next load → Lee replies by hand. The blocked state must therefore carry the checklist's activation-expectation copy ("activated within a few hours") so nobody sits watermarked overnight after paying.

Open-as-owner needs a banner. Persistent, unmissable: "Viewing as admin — {KB name}" with an exit action. Never browse a customer's KB with no indicator; you will eventually publish or delete something by accident.

Ownership transfer — claim link
sql
alter table knowledge_bases
  add column claim_token      uuid,
  add column claim_expires_at timestamptz,
  add column is_demo          boolean not null default false;

Claiming reassigns owner_id and consumes the token. It does not touch entitlements — with plan owner-level (§2), the new owner's plan applies automatically, including the watermark and a fresh 30-day clock. That correctness is free, and only free because plan isn't on the KB.

Lee sends quink.online/claim/<token>. The founder signs up or logs in, the KB reassigns to their account, token is consumed.

Better than editing emails in Supabase for a reason beyond convenience: it makes the reverse-demo email one link that both demos the product and converts. They click, see their own product documented, and "it's yours if you want it" becomes literally true and self-serve.

KB routing — the real refactor

Worse than expected. The authoring app has no routes at all: App.tsx is an 11-phase useState machine mounted under <Route path="*">, and the KB is resolved at App.tsx:65 by .eq('owner_id', userId).single().

That .single() throws the moment an account has two KBs. Multi-KB isn't "add a switcher" — the current query crashes. This is a hard blocker on checklist.md §1.3, the three reverse demos, which need 30 KBs on one account.

react-router-dom v6 is already mounted for the reader, so there's no dependency call to make. Two constraints on the shape:

/kb/ is taken. /kb/:kbSlug and /kb/:kbSlug/:articleSlug are the reader's preview paths (main.tsx:35-37). Authoring goes under /app/.
Key on kb.id, not subdomain. knowledge_bases.subdomain is trigger-provisioned and mutable — since migration 0013 it can change on the KB going live. A bookmarked authoring URL keyed on it dies on rename. Ugly authoring URLs are fine; they're internal. The reader keeps pretty slugs, which is where prettiness actually earns something.
Authoring:  quink.online/app/:kbId/article/:articleId    — resolved from PATH, by id
Reader:     acme.quink.online/:article-slug              — resolved from HOSTNAME

Keep the two resolvers strictly separate. One shared "get current KB" helper that sometimes reads the path and sometimes the host is how a customer eventually sees someone else's KB.

Don't convert all eleven phases

The temptation is to turn the phase machine into eleven routes. Resist it — that's days of work and it makes the product worse. Upload → generating → editor is a genuine linear wizard; routes there hand the user a back button mid-generation.

Only the two boundaries that need to be linkable become routes:

Replace .single() with .eq('id', kbId) driven by the route param. This alone un-blocks the reverse demos and is the smallest change on the list.
/app/:kbId — the KB shell. The phase machine keeps running inside it, untouched.
/app/:kbId/article/:articleId — so an article is linkable from admin and email.

Everything else stays a phase. profiles.last_kb_id persists the active KB so a refresh doesn't dump an admin into a picker, and bare / redirects there.

The switcher — one component, two states:

PLANS[plan].kbs === 1 → static label. No dropdown, no affordance, no hint that multi-KB exists. Do not tease a locked feature in the main chrome.
kbs > 1 → dropdown with search (30 demos is past list-scanning range), recent-first, plus a "New KB" action.

This is the Growth-tier multi-KB feature built once, not an admin hack thrown away later.

10. help.quink.online

Zero new code on an internal-plan account — assuming V1 confirms domain mapping works. Its real value is as the smoke test: Lee runs the CNAME recipe himself before a paying customer does.

The prose gap (surfaced, not resolved)

Articles are step blocks. Real help centers need some prose pages — "About", "Where does my video go?", "How pricing works." Right now Quink may not be able to write its own help center, a dogfooding failure that resurfaces at the first Starter customer.

Not fixing it now. Two consequences instead:

Content is written as genuine steps. Procedural docs are honestly step-shaped — connecting a domain is a numbered sequence. Costs nothing.
The trust page moves to the marketing site. It's prose, it's a sales asset, and it sits beside the legal pages anyway.

Cheapest future fix when it becomes a customer complaint: an article-level layout: 'steps' | 'prose' flag that suppresses numbering and the image slot. One column, one conditional in the renderer. Not a new block-type system. Logged, not built.

Content plan (all step-shaped)
Getting started — recording a good screen recording · creating your first article · editing steps · swapping a screenshot
Publishing — preview and publish · connecting a custom domain (write this first — highest support load)
Account — free tier: 3 guides + 30 days · what happens at the cap · what happens at day 30 · plans

That third group is doing real work: the clearer the expiry is documented, the further it sits from a dark-pattern complaint.

Off the KB, on the marketing site

Privacy, T&C, and the trust page ship as static routes on quink.online. The Google OAuth consent screen needs a stable URL, they must never be noindexed, and they cannot be one accidental article-delete away from disappearing.

Support email

Cloudflare Email Routing → Lee's inbox. Free, catch-all, already in the stack, no Workspace seat. 15 minutes — and every failure screen depends on it existing, so it goes first.

11. Build order
0.  Snapshot + edit-timestamp + source columns      IRREVERSIBLE — before anything else
    + jobs.article_id  cascade → set null           ← also irreversible in practice
    + articles_stamp_origin trigger + backfill
1.  Cloudflare email routing → support@             15 min, unblocks §6
2.  PLANS config + profiles columns + plans table
    + migrate knowledge_bases.plan → profiles.plan, drop the old column
    + reader_kb RPC projects noindex/watermark, not plan
    + fold config.py PAID_P… into PLANS
3.  jobs → run ledger (+ user_id), retire free_articles_used
4.  Enforcement in worker + DB trigger backstop      ← COST FLOOR CLOSES HERE
5.  Circuit breaker
6.  Failure taxonomy + screens + retry-without-reupload
7.  Trial lifecycle: columns + sweep in domain.run_loop() + countdown pill + restore
8.  Telegram alert hook
9.  Fix .single() → route param                      ← unblocks reverse demos, smallest win
10. /app/:kbId shell + article route + switcher
11. Admin: Users → Leads → Runs → KBs
12. Claim link + transfer
13. help.quink.online content + Vercel env check
14. 3 reverse demos on products you don't control    ← the last product test

Step 9 moved ahead of the admin surface: it is a one-line fix that removes the crash blocking 30 demo KBs, and admin's open-as-owner depends on it.

Gate: steps 0–7 must land before a stranger touches the product. Step 7 joins the gate because shipping a 30-day deletion without a countdown is the dark-pattern failure pricing-spec.md explicitly warns against. 8–12 are about Lee's ability to see and sell. Step 13 is checklist.md §1.3 and should not slip behind outreach.

12. Metrics — deferred, with two exceptions

Full PostHog instrumentation is a separate exercise. Two items cannot wait, because they are lossy — not captured now means gone forever for every early user:

articles.generated_snapshot (A3 — edit distance)
articles.first_edited_at / last_edited_at (B4 — still edited at day 30/60)

Both are in step 0. Everything else — PostHog install, the six events, dashboards — can be picked up cold later without losing history.

One dependency for that exercise: kbs.last_reader_view_at is what makes the North Star (live KBs with traffic in 30 days) visible in the admin KBs tab. Because reader pages are static-rendered behind a CDN, reads may not hit the backend at all — it needs a fire-and-forget beacon from the reader page, debounced to one write per KB per hour. Flagged so the admin tab isn't built expecting a number that doesn't exist yet.

13. Conflicts and open items
Repo pricing-spec.md was still v1 (Solo tier, ₹2,499, no unit economics) while v2 was the live decision set. The v3 in this batch supersedes both — delete the old file rather than keeping it alongside.
Free-tier unit changed in three specs. pricing-spec.md §2/§3/§6/§7/§9, ux-spec-v2.md §1/§6/§9/§10, checklist.md §1.2 all updated. Nothing should still say "3 lifetime articles."
Trial clock anchor — "first article created" is assumed throughout. Confirm or override before building the trigger (pricing-spec.md §9.5). The only open decision left in this plan.
plan ownership overrides the code-side recommendation (§2). Keeping it on knowledge_bases is the smaller change; it breaks on claim-link transfer, on internal demo KBs, and on Growth run caps. Migrating is one update today. If you disagree, say so before step 2 — it is very hard to reverse afterwards.
free_articles_used increments before Stage 2 — a live bug burning runs on jobs that die at ffmpeg. Fixed incidentally by the ledger in step 3.
Vercel env vars — domain code stubs without VERCEL_TOKEN / VERCEL_PROJECT_ID, and _refuse_if_serving_real_users() blocks stub in prod. Confirm they're set on Render before §12's smoke test, or it isn't a smoke test.
Is there already a transactional email sender? domain.py reportedly emails on domain-live. If a real sender is wired, the day-7 and day-30 expiry nudges do not need to be manual, and §7's "no transactional email in Phase 1" is wrong. Check before building the alert set.
Failed-job video retention — new rule added to ux-spec-v2.md §9: purge after 7 days, since a failed job never reaches the publish event that would collect it.
Prose articles (§10). Logged, deferred, cheap fix named.
starter and founding are identical config today (§2). Intentional; they diverge at the first Starter price change.
Domain sequencing. Founding customers launch on *.quink.online and move to a custom domain later — a quiet win that moves the CNAME support burden away from first contact, when the relationship is thinnest.
D2 is now load-bearing. One price per plan means raising founding later raises it for everyone on it. Low exposure while charging is manual; real at Phase 3.