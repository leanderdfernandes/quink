-- Fold the product tier into one jsonb column, and give it notes (PRD "Context & AI
-- Editing" §4, §9). This ANSWERS OPEN-ITEMS G1, which 0040 raised and left open.
--
-- WHY NOW, AND WHY A FOLD RATHER THAN AN ADDITION. 0040 refused to create
-- `product_context jsonb` beside the four flat columns from 0027, because that is a second
-- source of truth for the same facts and the pipeline would have to pick one. That
-- reasoning still holds — so this migration does not add the column beside them, it MOVES
-- them into it and drops the originals. After this there is exactly one place product
-- context lives, in both halves of the product.
--
-- What forced the question: §4 wants `notes[]` — repeatable {id, title, body} blocks. That
-- does not fit a flat text column, and bolting on `product_notes jsonb` beside four flat
-- columns would have left the tier spread across five columns and two shapes.
--
-- WHAT IS DROPPED, DELIBERATELY. `audience` and `tone` go with the fold. PRD §4 calls them
-- a v1 leftover (ux-spec.md Screen 1) that "move voice, not accuracy", and cuts them. They
-- are NOT carried into the jsonb — a column nothing writes is a column that rots.
--
--   RETRY COMPATIBILITY IS NOT AFFECTED. `jobs.context` stores its own snapshot of the
--   grounding at run time and a retry re-runs from that stored copy, never from the KB
--   (CLAUDE.md §10g). Job rows written before today still carry audience/tone inside their
--   jsonb, and worker/prompts.build_context_block still reads them for exactly that reason.
--   This migration touches the KB, not the ledger.
--
-- ---------------------------------------------------------------------------------------
-- LIVE-DEFINITION DIFF — public.set_product_context
-- ---------------------------------------------------------------------------------------
-- Printed from pg_proc before writing this file. The live body is 0040's, verbatim.
--
-- This is NOT a `create or replace`. The argument types change, so the new function is a
-- DIFFERENT function to Postgres and the old one would survive as an overload — two write
-- paths, one of them uncapped against the new budget. It is dropped by full signature and
-- recreated. Both statements are in this transaction, so no caller sees a gap.
--
--   BEFORE  set_product_context(p_kb_id uuid, p_name text, p_description text,
--                               p_audience text default '', p_tone text default '')
--           returns table (product_name text, product_description text, audience text,
--                          tone text, updated_at timestamptz, updated_by uuid,
--                          updated_by_name text)
--
--   AFTER   set_product_context(p_kb_id uuid, p_name text, p_description text,
--                               p_notes jsonb default '[]'::jsonb)
--           returns table (product_context jsonb, updated_by_name text)
--
--   CHANGED   - p_audience, p_tone            removed (cut by PRD §4)
--             + p_notes jsonb                 added
--             ~ cap 600 chars on description  -> 6000 shared across description + notes
--             ~ returns four columns + audit  -> the jsonb itself + the resolved name
--   UNCHANGED   security definer · set search_path = public · auth.uid() identity ·
--               can_edit_kb() gate · name required · name <= 120 · reject not truncate ·
--               the who/when stamp · grant to authenticated only
-- ---------------------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------
-- COLUMN ADDITION, STATED: knowledge_bases gains `product_context jsonb`. It is NOT added
-- to the UPDATE grant list from 0035 — the RPC below is the only writer, which is the same
-- control 0040 established and §10e.2's lesson one level up (RLS is row-level and cannot
-- express column scope, so a column GRANT is the mechanism). The four columns it replaces
-- are removed from that grant by being dropped.
alter table public.knowledge_bases
  add column product_context jsonb not null default '{}'::jsonb;

comment on column public.knowledge_bases.product_context is
  'The product tier, folded (0044). {name, description, notes:[{id,title,body}], updated_at, updated_by}. Written only by set_product_context(); read by the SPA and copied into jobs.context per run. Replaces product_name/product_description/audience/tone from 0027.';

-- ---------------------------------------------------------------------------
-- 2. Backfill, before anything is dropped
-- ---------------------------------------------------------------------------
-- `notes` starts empty for everyone: there is nothing in the old shape to derive one from,
-- and inventing a note out of the description would put the same text in two places.
-- The two audit columns from 0040 move inside and are dropped with the rest.
update public.knowledge_bases
   set product_context = jsonb_strip_nulls(jsonb_build_object(
         'name',        coalesce(product_name, ''),
         'description', coalesce(product_description, ''),
         'notes',       '[]'::jsonb,
         'updated_at',  product_context_updated_at,
         'updated_by',  product_context_updated_by
       ));

-- ---------------------------------------------------------------------------
-- 3. Drop the old shape
-- ---------------------------------------------------------------------------
alter table public.knowledge_bases
  drop column product_name,
  drop column product_description,
  drop column audience,
  drop column tone,
  drop column product_context_updated_at,
  drop column product_context_updated_by;

-- ---------------------------------------------------------------------------
-- 4. The budget
-- ---------------------------------------------------------------------------
-- 600 -> 6000, and it now covers description PLUS every note title and body, summed. The
-- name is exempt: it is structural metadata, not prose, and it is separately capped at 120.
--
-- Why a raise at all: 0027's 600 was sized for one paragraph. §4 asks for a glossary, a
-- feature list and a roles breakdown as separate notes, which 600 cannot hold. 6000 chars
-- is ~1,500 tokens, and the ceiling exists because this text is injected into EVERY
-- generation call — it protects per-run prompt size and cost, not UI tidiness.
drop function if exists public.product_context_cap();

create function public.context_char_budget() returns int
language sql immutable as $$ select 6000 $$;

comment on function public.context_char_budget() is
  'One number, so the RPC and any future caller cannot disagree. Mirrored by CONTEXT_CHAR_BUDGET in worker/config.py and web/src/lib/config.ts. Covers description + every note title and body, combined. `name` is exempt.';

revoke all on function public.context_char_budget() from public, anon;

-- ---------------------------------------------------------------------------
-- 5. The write path
-- ---------------------------------------------------------------------------
drop function if exists public.set_product_context(uuid, text, text, text, text);

create function public.set_product_context(
  p_kb_id       uuid,
  p_name        text,
  p_description text default '',
  p_notes       jsonb default '[]'::jsonb
)
returns table (product_context jsonb, updated_by_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text := btrim(coalesce(p_name, ''));
  v_desc  text := btrim(coalesce(p_description, ''));
  v_notes jsonb;
  v_used  int;
begin
  -- §10e.1: identity comes from auth.uid(), never from an argument. p_kb_id is the
  -- SUBJECT of the write; the ACTOR is proved here and cannot be supplied by the caller.
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- can_edit_kb(), not owns_kb(). PRD §4 flags this as open and §10j settles it: this is
  -- something that MAKES ARTICLES — every future guide is grounded on it — and everything
  -- in that class is editor-gated. An admin who may rewrite the article may ground it.
  if not public.can_edit_kb(p_kb_id) then
    raise exception 'not your knowledge base' using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'product name is required' using errcode = '22023';
  end if;
  if length(v_name) > 120 then
    raise exception 'product name is too long' using errcode = '22001';
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
           'updated_at',  now(),
           'updated_by',  v_uid
         )
   where kb.id = p_kb_id
  returning kb.product_context,
            (select public.person_name(pr.id, pr.email)
               from public.profiles pr where pr.id = v_uid);
end;
$$;

comment on function public.set_product_context(uuid, text, text, jsonb) is
  'The only write path for the product tier (0044). Editor-gated, budget enforced server-side over description + notes, normalises notes, stamps who and when. product_context is not in the UPDATE grant, so this is the only way in.';

-- Supabase's default privileges grant EXECUTE on every new function in `public` to anon
-- and authenticated, so `from public` alone leaves anon holding an explicit grant of its
-- own. Both roles have to be named. (0040 learned this the hard way — its first apply
-- failed its own anon assertion for exactly this reason.)
revoke all on function public.set_product_context(uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.set_product_context(uuid, text, text, jsonb) to authenticated;
