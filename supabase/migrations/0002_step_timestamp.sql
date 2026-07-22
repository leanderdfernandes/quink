-- Persist each step's source timestamp.
--
-- Why this is needed (it is not speculative — two in-scope things break without it):
--   1. Tier-1 frame-picker (ux-spec §4) shows "±3s candidate frames" around the step's
--      moment. Without the timestamp there is no centre to build that window around.
--   2. EVAL-PLAN §4's judge scores screenshot_alignment by checking each step's timestamp
--      against the ground-truth window. Un-stored, that dimension cannot be scored.
--
-- The MM:SS string stays model-facing only; seconds is the internal representation
-- (LEARNINGS #2, field-name note). The JSON contract in CLAUDE.md §6 is unchanged —
-- this is persistence state alongside it, like is_edited.
--
-- Nullable: a Tier-3 uploaded image has no moment in the video, and a step whose frame a
-- human replaced by scrubbing has a timestamp that no longer matches its screenshot.

alter table public.steps
  add column timestamp_seconds numeric;

comment on column public.steps.timestamp_seconds is
  'Source moment in the video, in seconds. Centres the Tier-1 filmstrip and lets the eval judge score screenshot alignment. Null when the image did not come from a video timestamp.';
