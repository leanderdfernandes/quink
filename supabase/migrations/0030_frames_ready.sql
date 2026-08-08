-- When the 1fps dense frame set stopped being written.
--
-- THE BUG THIS FIXES. The dense set runs AFTER the job is marked `done` (pipeline.py — it
-- backs the frame picker and nothing the user sees on arrival, so making every run wait on
-- it taxed everyone for a feature most never open). But `jobs.status` was the only evidence
-- the picker had, so it read `done` as "the frame pass finished" and told the user
-- "We couldn't pull the frames from this recording" during a window that is MINUTES long:
--
--   job 4446c9c6  finished 05:21:10   dense frames landed 05:23:45 → 05:24:36  (114 objects)
--
-- Three and a half minutes of a lie, on a run that worked perfectly. Every generated
-- article in the project has a complete dense set, so this window was the whole defect.
--
-- Stamped when the dense pass ENDS, success or failure — it answers "is anything still
-- coming?", not "did it work?". Whether it worked is what listing the prefix already says.
alter table public.jobs
  add column frames_ready_at timestamptz;

comment on column public.jobs.frames_ready_at is
  'When the 1fps dense frame pass stopped, success or failure. Null while it is still to come — including for a job whose status is already done, because the pass runs past the finish line. The frame picker uses this, never status, to tell "still pulling frames" from "there will never be any".';

-- Migration 0020 revoked table SELECT on `jobs` and granted back a column list, precisely so
-- that adding a column does NOT expose it. This one is needed by the SPA, so it is granted
-- here, deliberately.
grant select (frames_ready_at) on public.jobs to anon, authenticated;

-- Backfill. Every dense pass that ran before this column existed has long since ended, and
-- a null here now means "still coming" — so leaving old rows null would flip the bug the
-- other way round and have the picker promise frames forever on every article we already
-- have. In-flight rows stay null, which is correct: theirs really are still coming.
update public.jobs
   set frames_ready_at = coalesce(finished_at, updated_at)
 where frames_ready_at is null
   and status in ('done', 'error');
