-- Stage 1 emits clarification questions (PRD "Context & AI Editing" §5).
--
-- The model does NOT author question text. It selects a `type` from a CLOSED enum and fills
-- evidence slots; the UI renders our copy template per type. That is the load-bearing
-- control in this whole slice (§7 control 3): a question is a surface a trusting user is
-- about to act on, so a recording that could inject an arbitrary question is a phishing
-- vector. Nothing here reaches the database straight from model output — worker/clarify.py
-- validates, caps and drops in between.
--
-- ---------------------------------------------------------------------------
-- CLIENT COLUMN ALLOWLIST (§10g). `jobs` has NO table-level SELECT grant: 0020 revoked it
-- and granted back a column list, precisely so that adding a column does not expose it.
-- This migration adds THREE columns and grants back TWO of them, deliberately:
--
--   clarifications        GRANTED. The paused screen renders the questions; it has to read
--                         them. Every value in it has already been through clarify.py's
--                         enum check and length caps before the worker wrote it.
--   awaiting_input        GRANTED. It drives the 2s poll and the "waiting for you" label.
--   clarification_answers NOT GRANTED. The client SENDS answers through
--                         submit_clarification_answers() and never needs to read them back;
--                         the worker is the only reader. Nothing is gained by exposing it
--                         and one more column of user-supplied text is one more surface.
--
-- No `create or replace` on any existing function in this migration.
-- ---------------------------------------------------------------------------

alter table public.jobs
  add column clarifications        jsonb,
  add column clarification_answers jsonb,
  add column awaiting_input        boolean not null default false;

comment on column public.jobs.clarifications is
  'Stage 1''s questions, AFTER worker/clarify.py validated them: closed enum, evidence slots only, at most CLARIFICATION_CAP, ranked by impact. Never raw model output.';
comment on column public.jobs.clarification_answers is
  'Structured answers — option ids, or a capped literal for element_name. Never recounted prose (§7 control 8). Worker-only; not in the client grant.';
comment on column public.jobs.awaiting_input is
  'Stage 3 (writing) blocks on this being false. Stage 2 (screenshots) runs regardless — the user is holding up the one stage that needs them, and nothing else.';

grant select (clarifications, awaiting_input) on public.jobs to anon, authenticated;

-- Overflow past the cap, and anything left unanswered, carries into the editor as cards.
-- `articles` DOES hold table-level select/update grants, so this is readable and clearable
-- by anyone the articles_all_own policy already admits — which is what the editor needs.
alter table public.articles
  add column open_clarifications jsonb;

comment on column public.articles.open_clarifications is
  'Questions that never got asked during the run (over the cap) or were skipped. Same validated shape as jobs.clarifications. The editor renders them as one-tap cards and clears them.';

-- The paused-flow poll asks "is this job waiting for me?" on every tick. Partial, because
-- the answer is false for all but a handful of rows at any moment.
create index jobs_awaiting_input_idx on public.jobs (kb_id) where awaiting_input;
