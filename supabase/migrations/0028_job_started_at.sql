-- The timeout clock measures WORK, not WAITING (slice 3i).
--
-- retention.sweep_timeouts() measured elapsed time from created_at. That was correct while
-- a job began work the instant it was created. Lanes (slice 3c) broke that assumption: a
-- job now sits at 'queued' until the account has a free lane, so on the free tier's single
-- lane a user who drops four recordings has the fourth waiting through three full runs.
-- Under the old rule that fourth job was failed as a TIMEOUT — killed for waiting its turn,
-- and told "no worker progress", which is not what happened.
--
-- started_at is the moment the lane is acquired, which is the moment queue time ends and
-- work begins. It is written in pipeline.run, in the same `with` that takes the semaphore,
-- because that is the one place that already knows the difference.

alter table public.jobs
  add column started_at timestamptz;

comment on column public.jobs.started_at is
  'When this job acquired a lane and began work. NULL while queued. The timeout sweep measures a running job from here, never from created_at, so queue time cannot be mistaken for a hung process.';

-- Deliberately NOT granted to anon/authenticated. Migration 0020 revoked table SELECT on
-- jobs and grants back an explicit column list, precisely so that adding a column does not
-- expose it. The SPA has no use for this: the dock renders "in line" from status='queued'
-- and the editor's strip renders the stage. Add it to that grant only if a client genuinely
-- needs it, and deliberately.

-- The sweep's partial index already covers (created_at) where status in ('queued','running')
-- (0020). The running half of the sweep now filters on started_at as well, and at this
-- volume that is a filter over an already-tiny partial-index result — not worth a second
-- index until the in-flight set stops being small.
