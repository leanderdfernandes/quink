-- Restore `audience` and `tone` to the product tier, and let the upload card override them
-- for ONE run without writing them back.
--
-- WHY THIS REVERSES 0044. 0044 dropped both columns on PRD §4's reading that they "move
-- voice, not accuracy, and accuracy is the actual problem this section exists to solve".
-- That reading is superseded by an explicit product decision: the two come back, but not in
-- the shape §4 was arguing against. v1 asked for audience and tone as abstract free-text
-- dropdowns with no visible consequence — which is why they felt like they did nothing.
-- They return as two LABELLED RANGES (Formal…Casual, Brief…Thorough) beside a sample
-- sentence that rewrites itself as you move them, plus one plain question, "Who is it
-- for?". The complaint §4 recorded was that the fields did very little; the fix is showing
-- what they do, not removing them.
--
-- THE PIPELINE DOES NOT CHANGE. worker/prompts.build_context_block has read
-- product['audience'] and product['tone'] since before 0044 and never stopped — 0044 only
-- removed the WRITE path, deliberately keeping the read so old job rows would still replay.
-- This migration re-opens the write path into keys the prompt builder already handles, so
-- no worker deploy is required for the values to reach Stage 1 and Stage 2.
--
-- NEITHER COUNTS AGAINST THE BUDGET, for the same reason `name` does not:
-- context_char_budget() caps the PROSE injected into every run (description + notes). These
-- two are structural metadata, and each gets its own cap here — 200 for the audience
-- sentence, 40 for a label the client generates from a fixed list.
--
-- ---------------------------------------------------------------------------------------
-- LIVE-DEFINITION DIFF — public.set_product_context   (CLAUDE.md §10j, last bullet)
-- ---------------------------------------------------------------------------------------
-- Printed from pg_proc before writing this file; the live body is 0044's, verbatim. Not a
-- `create or replace`: the argument list changes, so Postgres would keep the old function as
-- an overload — two write paths, one of which cannot set the new fields and would silently
-- blank them on every save made by a stale client. Dropped by full signature and recreated,
-- both inside this transaction, so no caller sees a gap.
--
--   BEFORE  set_product_context(p_kb_id uuid, p_name text, p_description text,
--                               p_notes jsonb default '[]'::jsonb)
--   AFTER   set_product_context(p_kb_id uuid, p_name text, p_description text,
--                               p_notes jsonb default '[]'::jsonb,
--                               p_audience text default '', p_tone text default '')
--
--   CHANGED   + p_audience text     stored, capped at 200, exempt from the budget
--             + p_tone text         stored, capped at 40,  exempt from the budget
--   UNCHANGED   returns (product_context jsonb, updated_by_name text) · security definer ·
--               set search_path = public · auth.uid() identity (§10e.1) · can_edit_kb()
--               gate (§10j) · name required · name <= 120 · 50-note ceiling · note
--               normalisation · the shared budget over description + notes · reject not
--               truncate · the who/when stamp · grant to authenticated only
--
-- The two new parameters carry defaults, so a client deployed before this migration keeps
-- working and writes empty strings — which is the same as not setting them.
-- ---------------------------------------------------------------------------------------

begin;

drop function if exists public.set_product_context(uuid, text, text, jsonb);

create function public.set_product_context(
  p_kb_id       uuid,
  p_name        text,
  p_description text default '',
  p_notes       jsonb default '[]'::jsonb,
  p_audience    text default '',
  p_tone        text default ''
)
returns table (product_context jsonb, updated_by_name text)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_name  text := btrim(coalesce(p_name, ''));
  v_desc  text := btrim(coalesce(p_description, ''));
  v_aud   text := btrim(coalesce(p_audience, ''));
  v_tone  text := btrim(coalesce(p_tone, ''));
  v_notes jsonb;
  v_used  int;
begin
  -- §10e.1: identity comes from auth.uid(), never from an argument. p_kb_id is the
  -- SUBJECT of the write; the ACTOR is proved here and cannot be supplied by the caller.
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- can_edit_kb(), not owns_kb() (§10j): this is something that MAKES ARTICLES — every
  -- future guide is grounded on it — and everything in that class is editor-gated.
  if not public.can_edit_kb(p_kb_id) then
    raise exception 'not your knowledge base' using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'product name is required' using errcode = '22023';
  end if;
  if length(v_name) > 120 then
    raise exception 'product name is too long' using errcode = '22001';
  end if;

  -- Structural, so capped individually rather than out of the shared pool. Rejected, not
  -- truncated, like everything else here.
  if length(v_aud) > 200 then
    raise exception 'audience is too long' using errcode = '22001';
  end if;
  -- The client builds this from a fixed list (toneLabel in web/src/lib/config.ts). 40 is not
  -- a product limit; it is the ceiling past which the value cannot have come from that list.
  if length(v_tone) > 40 then
    raise exception 'tone is too long' using errcode = '22001';
  end if;

  -- Notes are normalised HERE rather than trusted from the client: a note with no id, or
  -- with twenty extra keys, or that is not an object at all, must not reach the column.
  -- Anything that is not a json array is treated as no notes rather than raising — an old
  -- client sending nothing is not an error.
  if p_notes is null or jsonb_typeof(p_notes) <> 'array' then
    v_notes := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
             'id',    coalesce(nullif(btrim(n->>'id'), ''), gen_random_uuid()::text),
             'title', btrim(coalesce(n->>'title', '')),
             'body',  btrim(coalesce(n->>'body', ''))
           )), '[]'::jsonb)
      into v_notes
      from jsonb_array_elements(p_notes) n
     where jsonb_typeof(n) = 'object';
  end if;

  if jsonb_array_length(v_notes) > 50 then
    raise exception 'too many notes' using errcode = '22001';
  end if;

  -- THE BUDGET, SERVER-SIDE. The client meter is a courtesy; this is the control. Summed
  -- exactly as the meter sums it, so the two cannot disagree about what 100% means.
  -- Unchanged by this migration: audience and tone are NOT in it.
  select length(v_desc) + coalesce(sum(length(n->>'title') + length(n->>'body')), 0)
    into v_used
    from jsonb_array_elements(v_notes) n;

  -- REJECTED, not truncated. Silently dropping the tail of what someone typed is a worse
  -- answer than saying no: they would never learn the guide was grounded on half of it.
  if v_used > public.context_char_budget() then
    raise exception 'context is % characters, over the % limit',
      v_used, public.context_char_budget() using errcode = '22001';
  end if;

  return query
  update public.knowledge_bases kb
     set product_context = jsonb_build_object(
           'name',        v_name,
           'description', v_desc,
           'notes',       v_notes,
           'audience',    v_aud,
           'tone',        v_tone,
           'updated_at',  now(),
           'updated_by',  v_uid
         )
   where kb.id = p_kb_id
  returning kb.product_context,
            (select public.person_name(pr.id, pr.email)
               from public.profiles pr where pr.id = v_uid);
end;
$fn$;

comment on function public.set_product_context(uuid, text, text, jsonb, text, text) is
  'The only write path for the product tier (0044; audience/tone restored by 0048). Editor-gated, budget enforced server-side over description + notes only, normalises notes, caps audience at 200 and tone at 40, stamps who and when. product_context is not in the UPDATE grant, so this is the only way in.';

comment on column public.knowledge_bases.product_context is
  'The product tier, folded (0044). {name, description, notes:[{id,title,body}], audience, tone, updated_at, updated_by}. Written only by set_product_context(); read by the SPA and copied into jobs.context per run — the upload card may override audience/tone and append one note FOR ONE RUN without writing back here.';

-- Supabase's default privileges grant EXECUTE on every new function in `public` to anon and
-- authenticated, so `from public` alone leaves anon holding an explicit grant of its own.
-- Both roles have to be named. (0040 learned this the hard way.)
revoke all on function public.set_product_context(uuid, text, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.set_product_context(uuid, text, text, jsonb, text, text)
  to authenticated;

commit;
