-- Record how much context a run was grounded on.
--
-- The generation prompt now carries up to CONTEXT_CHAR_BUDGET (6,000) characters of
-- workspace context plus a recording note, injected into the Stage 1 VIDEO call on every
-- run. GENERATION-GAPS §0 is blunt about what we can and cannot measure: the eval has a
-- noise floor of about one point at n=1 and nobody has run the n>=3 baseline, so the one
-- question this change raises -- does article quality degrade as context grows? -- cannot
-- be answered from the scores alone. It needs the x-axis.
--
-- One integer, written once, at the same moment as video_duration_seconds and est_cost_usd.
-- The context ITSELF is already on the row in jobs.context and is not duplicated here; this
-- is the length of the ASSEMBLED block as Stage 1 received it, which is not derivable from
-- that column (it includes our labels, the recording note, and the fence-escaping pass).
--
-- NO FUNCTION IS RECREATED, so there is no live-definition diff to state.
--
-- NOT GRANTED TO CLIENTS, deliberately. 0020 revoked table SELECT on jobs from anon and
-- authenticated and grants back an explicit column list, precisely so that adding a column
-- stops being a way to expose one by accident (CLAUDE.md §10g). The SPA has no use for this
-- number -- it is not a meter, it is not a limit, and it is not a promise to anyone. If a
-- surface ever needs it, it gets added to that grant deliberately and on purpose.

alter table public.jobs add column if not exists context_chars int;

comment on column public.jobs.context_chars is
  'Characters in the assembled Stage 1 context block for this run (labels, values, recording note, after fence-escaping). Analysis only: lets context size be correlated against output quality once the n>=3 eval baseline exists. Not granted to anon/authenticated. Null on rows created before 0047 and on any run that died before the stage boundary that writes it.';

-- ---------------------------------------------------------------------------
-- 2. The recording-note cap, given one home
-- ---------------------------------------------------------------------------
-- The per-run half of context (PRD §4b): the one-line "What does this recording show"
-- note. It is NOT part of context_char_budget() -- that pool is the workspace context,
-- paid for by every future guide, while this is typed fresh per upload and priced per
-- upload. Summing them would let a long glossary silently shrink the note.
--
-- ENFORCEMENT IS IN THE WORKER, not here. Unlike the workspace context, this value never
-- passes through an RPC: it travels in the POST /api/generate body and lands in
-- jobs.context written by the service role, so there is no database write path to gate.
-- This function is therefore DECLARATIVE -- it exists so the number has exactly one home
-- per CLAUDE.md §10b and a future caller cannot invent a second one, which is the same
-- reason context_char_budget() exists. It is added on Lee's instruction, having been
-- raised as a deliberate omission first.
--
-- Same shape and the same grants as context_char_budget(), so the two cannot drift in
-- how they are reached.
create function public.recording_note_max() returns int
language sql immutable as $$ select 600 $$;

comment on function public.recording_note_max() is
  'Max characters in the per-upload "What does this recording show" note (PRD §4b). Mirrored by RECORDING_NOTE_MAX in worker/config.py and web/src/lib/config.ts. ENFORCED IN THE WORKER at POST /api/generate -- the note never passes through an RPC, so this is the number''s single home, not its gate. Separate from context_char_budget(): that pool is workspace context, this is per-run.';

revoke all on function public.recording_note_max() from public, anon;
