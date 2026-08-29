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
