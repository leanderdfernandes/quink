-- 0038 — undo and discard become ONE atomic, guarded operation.
--
-- NO LIVE-DEFINITION DIFF SECTION: `replace_steps` is a new function and replaces nothing.
-- Nothing else in this file is a `create or replace` over an existing object.
--
-- ===========================================================================
-- THE BUG THIS EXISTS FOR
-- ===========================================================================
-- Undo (`applySnapshot`) and "discard changes" (`discardChanges`) both replace an article's
-- whole step list. Both did it from the browser as TWO unguarded statements:
--
--     delete from steps where article_id = ?
--     insert into steps (...) values (...), (...), ...
--
-- With two admins in one article -- which team access (0035) made an ordinary thing -- those
-- four statements interleave, and one real interleaving is:
--
--     C1 DELETE  ->  C2 DELETE (finds nothing)  ->  C1 INSERT 5  ->  C2 INSERT 4
--
-- leaving NINE rows where there should be five, every step duplicated. That is not a
-- hypothetical: article a6aa3969 has two insert batches 70ms apart, one of five rows and one
-- of four, both machine-generated and identical. The second author's undo stack was at a
-- different point, which is why the batches differ in length.
--
-- The stale-write guard from 0036 (§10k) already prevents exactly this for the debounced text
-- path, and `OPEN-ITEMS` D.2 records undo/discard as knowingly outside it. This closes that.
--
-- The second, quieter bug in the same two statements: they are not atomic. A DELETE that
-- succeeds followed by an INSERT that fails -- a dropped connection between two awaits -- left
-- the article with ZERO steps and an "Couldn't undo that" toast. One function body is one
-- transaction, so that window is gone too.
--
-- WHY A DEFINER FUNCTION RATHER THAN A CLIENT-SIDE CLAIM. A claim from the browser would fix
-- the interleaving above but not the atomicity, because the delete and the insert would still
-- be two round trips that can fail independently. Serialising on the article row inside one
-- transaction fixes both, and it is the same row lock the guard already uses: a concurrent
-- caller blocks on the UPDATE, then re-evaluates its predicate against the committed row,
-- sees `updated_at` has moved, and matches zero rows. The loser writes NOTHING -- no delete,
-- no insert -- and is told to re-read.

-- The most steps one call may write. Not a product limit -- the editor has no cap -- but this
-- takes a client-supplied array and turns it into rows, and an unbounded array is an
-- unbounded write. Set far above any real article.
create or replace function public.replace_steps(
  p_article_id uuid,
  p_base_updated_at timestamptz,
  p_title text,
  p_subtitle text,
  p_faqs jsonb,
  p_steps jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_kb_id uuid;
  v_new timestamptz;
  v_rows jsonb;
begin
  if jsonb_array_length(coalesce(p_steps, '[]'::jsonb)) > 500 then
    raise exception 'too many steps';
  end if;

  select kb_id into v_kb_id from public.articles where id = p_article_id;
  -- Unknown article and no-access article are ONE answer (§10c): distinguishing them turns
  -- this into a probe for which article ids exist.
  if v_kb_id is null or not public.can_edit_kb(v_kb_id) then
    raise exception 'not found, or no access';
  end if;

  -- THE GUARD, and the article patch, in one conditional update -- the same rule the editor's
  -- own `claim` follows (§10k): an article edit IS the claim, because claiming and then
  -- patching would bump `updated_at` twice and leave the caller's base stale against itself.
  --
  -- `updated_at` is forced by the touch_updated_at trigger, so it is not set here; RETURNING
  -- hands back whatever the trigger wrote, which is what the caller must hold as its new base.
  update public.articles
     set title          = p_title,
         subtitle       = p_subtitle,
         faqs           = coalesce(p_faqs, '[]'::jsonb),
         last_edited_by = auth.uid(),
         last_edited_at = now()
   where id = p_article_id
     and updated_at = p_base_updated_at
  returning updated_at into v_new;

  -- Zero rows: somebody else saved between the caller's last read and now. REFUSE the whole
  -- thing. Not an error -- a state (§10d) -- so the caller renders the conflict strip and the
  -- user chooses, rather than seeing a failure for something that merely happened in an order
  -- nobody controls.
  if v_new is null then
    return jsonb_build_object('ok', false);
  end if;

  delete from public.steps where article_id = p_article_id;

  with ins as (
    insert into public.steps (
      article_id, step_number, heading, body_text,
      screenshot_url, is_edited, timestamp_seconds, annotations
    )
    select p_article_id,
           (s->>'step_number')::int,
           coalesce(s->>'heading', ''),
           coalesce(s->>'body_text', ''),
           -- '' and JSON null both mean "no screenshot". The column is nullable and the
           -- editor tests it for truthiness, so an empty string would read as an image.
           nullif(s->>'screenshot_url', ''),
           coalesce((s->>'is_edited')::boolean, false),
           (s->>'timestamp_seconds')::numeric,
           coalesce(s->'annotations', '[]'::jsonb)
      from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) s
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(ins) order by (to_jsonb(ins)->>'step_number')::int), '[]'::jsonb)
    from ins
    into v_rows;

  return jsonb_build_object('ok', true, 'updated_at', v_new, 'steps', v_rows);
end $fn$;

revoke all on function public.replace_steps(uuid, timestamptz, text, text, jsonb, jsonb) from public;
grant execute on function public.replace_steps(uuid, timestamptz, text, text, jsonb, jsonb)
  to authenticated;
