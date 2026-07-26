-- Failure taxonomy, recovery and retry.
--
-- 0014 added `failure_code` and nothing ever wrote to it: every failure landed as one
-- generic exception string, in `error` AND `failure_detail`, and the SPA rendered `error`
-- straight into the DOM. This migration gives the pipeline the columns it needs to
-- classify, degrade and retry — and makes the "internal only, never rendered" comment on
-- failure_detail true at the database level instead of on trust.

-- ---------------------------------------------------------------------------
-- jobs: degrade, remember the context, and link a retry to what it retries
-- ---------------------------------------------------------------------------
alter table public.jobs
  -- Degraded outcomes SHIP an article, so they are not failure codes and they do not stop
  -- the run counting. Comma-separated because a run can degrade twice (Stage 2 died AND
  -- some frames were lost) and the question we ask of this column is always "how often",
  -- which `like '%stage2_failed%'` answers fine at this volume.
  add column degraded text,
  -- The context form the user typed, kept so a RETRY re-runs Stage 1 with the same
  -- grounding. Without it the second attempt silently produces a different article from
  -- the same recording — the user would have no idea why.
  add column context  jsonb,
  -- Which job this one is a second attempt at. `set null` so the ledger row still outlives
  -- what it points to, exactly like article_id (0014).
  add column retry_of uuid references public.jobs(id) on delete set null;

comment on column public.jobs.degraded is
  'Non-null when the article shipped with something missing: stage2_failed (unpolished text) and/or frames_partial (steps with no screenshot). A degraded run is a SUCCESS and DOES count against quota — the user got an editable article.';
comment on column public.jobs.retry_of is
  'The failed job this run re-attempts. Each attempt is its own ledger row; only the one that actually succeeds can carry counted_against_quota, which is what keeps one article = one run.';

-- `error` was a byte-for-byte duplicate of failure_detail and the only thing that ever
-- leaked a raw exception (including Gemini's raw output) into the browser. Deleting it is
-- cheaper than remembering not to select it.
alter table public.jobs drop column error;

-- ---------------------------------------------------------------------------
-- failure_detail is internal — enforced, not merely commented
-- ---------------------------------------------------------------------------
-- RLS is row-level and CANNOT express column scope (CLAUDE.md §10e.2 — the same lesson
-- that made profiles.plan world-writable). Column GRANTS are the only mechanism, and a
-- column-level REVOKE does nothing while a table-level SELECT is still held: the table
-- grant has to go first, then the allowed columns come back individually.
--
-- Adding a column to this table therefore does NOT expose it to clients any more — which
-- is the safe default for a table that holds cost estimates and raw error text. Anything
-- the SPA genuinely needs must be added to the grant below, deliberately.
revoke select on public.jobs from anon, authenticated;

grant select (
  id,
  kb_id,
  user_id,
  article_id,
  stage,
  status,
  failure_code,          -- the entire contract with the SPA; copy is chosen from this
  degraded,
  counted_against_quota,
  over_cap,
  video_purged_at,       -- drives "retry" vs "upload it again" without a round trip
  retry_of,
  created_at,
  updated_at,
  finished_at
) on public.jobs to anon, authenticated;

-- Deliberately NOT granted: failure_detail (raw exception text, logs only), context (no
-- reader needs it back), video_path (a storage path), video_duration_seconds and
-- est_cost_usd (our cost model, not the customer's business).

-- The timeout sweep's query: in-flight jobs older than the ceiling. Partial index so the
-- every-tick sweep stays a cheap lookup rather than a scan of the whole ledger.
create index jobs_inflight_idx on public.jobs (created_at)
  where status in ('queued', 'running');
