-- The paused generation flow (PRD "Context & AI Editing" §5.4).
--
-- Stage 2 (screenshots) keeps running while the user answers. Only Stage 3 (writing) waits,
-- and the UI says so. That is what makes the pause comfortable: the user is not holding up
-- the machine, they are holding up the one stage that needs them.
--
-- NO TIMEOUT AND NO AUTO-ADVANCE. Writing starts when the client clears `awaiting_input`
-- and at no other moment. This is in tension with §10g's "a job must be able to end", and
-- the tension is resolved in the worker rather than here: time spent awaiting input does
-- not count against JOB_TIMEOUT_MIN, and retention.sweep_timeouts() skips awaiting rows —
-- so a paused job is never mistaken for a hung one, and the state the user sees is
-- "waiting for you" rather than a spinner. Flagged in OPEN-ITEMS.
--
-- ---------------------------------------------------------------------------
-- CLIENT COLUMN ALLOWLIST (§10g). Two columns are added to `jobs` and NEITHER is granted:
--
--   awaiting_input_at         when Stage 1's read finished and the questions appeared
--   clarifications_closed_at  when the user pressed the button and writing began
--
-- They exist for ONE measure, PRD §10's last row: drop-off between read-complete and
-- write-start. "Instrument the last one from day one. If people abandon at the pause, the
-- whole §5.4 mechanic is wrong and we need to know fast." They are ours, not the
-- customer's, so they stay off the grant — same reasoning as est_cost_usd.
--
--   answered:   select count(*) from jobs where clarifications_closed_at is not null;
--   abandoned:  select count(*) from jobs
--                where awaiting_input_at is not null and clarifications_closed_at is null;
--
-- No `create or replace` on an existing function: submit_clarification_answers is new.
-- ---------------------------------------------------------------------------

alter table public.jobs
  add column awaiting_input_at        timestamptz,
  add column clarifications_closed_at timestamptz;

comment on column public.jobs.awaiting_input_at is
  'When Stage 1 finished and the questions were shown. Half of the PRD 10 drop-off measure. Deliberately not in the client grant.';
comment on column public.jobs.clarifications_closed_at is
  'When the user released the write stage - by answering, or by skipping. Null while awaiting_input is still true, and null forever if they never came back.';

-- ---------------------------------------------------------------------------
-- submit_clarification_answers - the only way a client releases the write stage
-- ---------------------------------------------------------------------------
-- Structured values only (§7 control 8). An answer is an option id the stored question
-- actually offered, or - for `element_name` alone, where the useful answer is a name we
-- could not read off the frame - a capped literal. Never recounted prose.
--
-- Mirrored by clarify.validate_answers() in the worker, which is the gate for anything
-- reaching the pipeline by another route. Two implementations of one rule is a cost paid
-- deliberately: this one is the enforcement point for a browser, and a browser is the only
-- thing that can call it.
create function public.submit_clarification_answers(
  p_job_id  uuid,
  p_answers jsonb,
  p_note    text default ''
)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_job    public.jobs%rowtype;
  v_out    jsonb := '{}'::jsonb;
  v_note   text  := btrim(coalesce(p_note, ''));
  v_key    text;
  v_val    jsonb;
  v_idx    int;
  v_q      jsonb;
  v_answer text;
begin
  -- §10e.1. The ACTOR is auth.uid(); p_job_id is the SUBJECT. A p_user_id parameter on a
  -- definer function is a bug on sight.
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into v_job from public.jobs where id = p_job_id;
  -- A job id that does not resolve renders ONE state, exactly like a KB id (§10c): never
  -- distinguish "no such job" from "not yours", or the parameter becomes a probe.
  if v_job.id is null or not public.can_edit_kb(v_job.kb_id) then
    raise exception 'not your job' using errcode = '42501';
  end if;

  -- Already released. Not an error: people double-tap, and a second press must not look
  -- like a failure. `false` means "nothing to do", which the client reads as "carry on".
  if not v_job.awaiting_input then
    return false;
  end if;

  if jsonb_typeof(p_answers) = 'object' then
    for v_key, v_val in select * from jsonb_each(coalesce(p_answers, '{}'::jsonb)) loop
      begin
        v_idx := v_key::int;
      exception when others then
        continue;                                   -- a key that is not an index: dropped
      end;
      v_q := v_job.clarifications -> v_idx;         -- null when out of range
      if v_q is null or jsonb_typeof(v_val) <> 'string' then
        continue;
      end if;
      v_answer := v_val #>> '{}';

      -- The answer must be something the question OFFERED. This is the half that stops an
      -- answer introducing a value the question never contained.
      if exists (
        select 1 from jsonb_array_elements(coalesce(v_q -> 'options', '[]'::jsonb)) o
         where o ->> 'id' = v_answer
      ) then
        v_out := v_out || jsonb_build_object(v_key, v_answer);
      elsif v_q ->> 'type' = 'element_name' and length(v_answer) between 1 and 64 then
        -- The one type where free text is genuinely the answer. Capped, and stripped of
        -- anything that is not printable text so it cannot fake structure downstream.
        v_out := v_out || jsonb_build_object(
          v_key, btrim(regexp_replace(v_answer, '[[:cntrl:]]', '', 'g'))
        );
      end if;
    end loop;
  end if;

  -- The optional "anything else about this recording?" field. USER-supplied data, capped
  -- and fenced by the worker before it reaches a prompt (§7). Over-length is truncated
  -- rather than refused here, unlike the product description: this one is typed inside a
  -- 90-second run and refusing it would strand the user on a screen holding the machine.
  update public.jobs
     set clarification_answers    = jsonb_build_object('answers', v_out, 'note', left(v_note, 600)),
         awaiting_input           = false,
         clarifications_closed_at = now()
   where id = p_job_id;

  return true;
end;
$fn$;

comment on function public.submit_clarification_answers(uuid, jsonb, text) is
  'Release the write stage. Editor-gated, identity from auth.uid(), every answer checked against the option ids the stored question offered. Returns false when the job was already released.';

revoke all on function public.submit_clarification_answers(uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.submit_clarification_answers(uuid, jsonb, text) to authenticated;
