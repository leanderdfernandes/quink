-- Product context becomes a guarded write (PRD "Context & AI Editing" §4).
--
-- SHAPE NOTE — this is deliberately NOT `knowledge_bases.product_context jsonb`.
-- PRD §9 asks for one jsonb column {name, description, updated_at, updated_by}. Migration
-- 0027 already landed that data as four flat columns (product_name, product_description,
-- audience, tone), and they are read by prompts.build_context_block, Upload.tsx, App.tsx
-- and QueueDock. A jsonb column beside them would be a SECOND source of truth for the same
-- four facts, and the pipeline would have to pick one. So the two audit fields the PRD
-- names are added to the existing columns instead, and the jsonb is not created.
-- (Flagged in OPEN-ITEMS.)
--
-- What actually changes:
--   1. `updated_at` / `updated_by` — Settings → Product renders "Last updated {date} by
--      {name}", which nothing recorded before.
--   2. The four columns stop being client-writable. A length cap enforced only in the
--      browser is a courtesy, not a control (§10e.2 is the same lesson one level up: RLS
--      is row-level and cannot express column scope, so a COLUMN GRANT is the mechanism).
--      After this, set_product_context() is the only way in.
--
-- NO `create or replace` on an existing function here — set_product_context is new.

alter table public.knowledge_bases
  add column product_context_updated_at timestamptz,
  add column product_context_updated_by uuid references auth.users(id) on delete set null;

comment on column public.knowledge_bases.product_context_updated_at is
  'When the product tier (0027) was last written through set_product_context(). Rendered by Settings -> Product; nothing else reads it.';
comment on column public.knowledge_bases.product_context_updated_by is
  'Who wrote it. `on delete set null` so a departed teammate does not take the row with them.';

-- knowledge_bases still holds a TABLE-level SELECT grant, so the two columns above are
-- readable by anyone the kb_select policy already admits. That is intended: they are
-- rendered on the settings screen.
--
-- UPDATE is column-scoped (0035 narrowed it to sixteen). Take four of them back.
revoke update (product_name, product_description, audience, tone)
  on public.knowledge_bases from authenticated, anon;

-- The cap. 600 chars, matching the PRD, and it lives HERE rather than only on the input.
create function public.product_context_cap() returns int
language sql immutable as $$ select 600 $$;

comment on function public.product_context_cap() is
  'One number, so the check below and any future caller cannot disagree about it. Mirrored by PRODUCT_DESCRIPTION_MAX in web/src/lib/config.ts.';

create function public.set_product_context(
  p_kb_id       uuid,
  p_name        text,
  p_description text default '',
  p_audience    text default '',
  p_tone        text default ''
)
returns table (
  product_name        text,
  product_description text,
  audience            text,
  tone                text,
  updated_at          timestamptz,
  updated_by          uuid,
  updated_by_name     text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_desc text := btrim(coalesce(p_description, ''));
begin
  -- §10e.1: identity comes from auth.uid(), never from an argument. p_kb_id is the
  -- SUBJECT of the write; the ACTOR is proved here and cannot be supplied by the caller.
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- can_edit_kb(), not owns_kb(). PRD §4 flags this as open, and §10j settles it: this is
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
  -- REJECTED, not truncated. Silently dropping the tail of what someone typed is a worse
  -- answer than saying no: they would never learn the guide was grounded on half of it.
  if length(v_desc) > public.product_context_cap() then
    raise exception 'description is over % characters', public.product_context_cap()
      using errcode = '22001';
  end if;
  if length(coalesce(p_audience, '')) > 80 or length(coalesce(p_tone, '')) > 80 then
    raise exception 'audience and tone are too long' using errcode = '22001';
  end if;

  return query
  update public.knowledge_bases kb
     set product_name              = v_name,
         product_description       = v_desc,
         audience                  = btrim(coalesce(p_audience, '')),
         tone                      = btrim(coalesce(p_tone, '')),
         product_context_updated_at = now(),
         product_context_updated_by = v_uid
   where kb.id = p_kb_id
  returning kb.product_name, kb.product_description, kb.audience, kb.tone,
            kb.product_context_updated_at, kb.product_context_updated_by,
            (select public.person_name(pr.id, pr.email)
               from public.profiles pr where pr.id = v_uid);
end;
$$;

comment on function public.set_product_context(uuid, text, text, text, text) is
  'The only write path for the product tier (0027). Editor-gated, capped server-side, stamps who and when. The four columns are no longer client-writable.';

-- Supabase's default privileges grant EXECUTE on every new function in `public` to anon
-- and authenticated, so `from public` alone leaves anon holding an explicit grant of its
-- own. Both roles have to be named. (Verified: the first apply of this migration failed
-- its own anon assertion for exactly this reason.)
revoke all on function public.set_product_context(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.set_product_context(uuid, text, text, text, text) to authenticated;

revoke all on function public.product_context_cap() from public, anon;
