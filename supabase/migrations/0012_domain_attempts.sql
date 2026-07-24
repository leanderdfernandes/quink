-- Persist the custom-domain verification attempt counter (build spec §4).
--
-- It used to be an in-memory dict in the worker. The worker restarts on every deploy and
-- Render recycles idle instances, so the counter reset constantly: the backoff never grew
-- past its floor (hammering the hosting API for every pending domain) and DOMAIN_MAX_ATTEMPTS
-- was effectively unreachable, so a domain whose DNS was simply wrong stayed "waiting for
-- DNS" forever instead of telling the user to fix it.
--
-- Reset to 0 on connect/disconnect and on going live; incremented by each failed check.
alter table public.knowledge_bases
  add column domain_attempts integer not null default 0;
