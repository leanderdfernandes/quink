-- 0037 — per-article "Common questions", and the search that finds them.
--
-- Three things: a `faqs` column on articles, the search function extended to index FAQ
-- text, and an anon RPC that records searches which found nothing.
--
-- ===========================================================================
-- LIVE-DEFINITION DIFF (CLAUDE.md §10j) — public.article_search_text
-- ===========================================================================
-- Pulled from pg_proc on the live project before writing this file, NOT from a previous
-- migration. The live body is, clause by clause:
--
--   1. coalesce(p_title, '')                                  -- title
--   2. || ' ' || coalesce(p_subtitle, '')                     -- subtitle
--   3. || ' ' || coalesce((                                   -- every step, tags stripped
--        select string_agg(
--          regexp_replace(
--            coalesce(s->>'heading','') || ' ' || coalesce(s->>'body_text',''),
--            '<[^>]+>', ' ', 'g'),
--          ' ')
--        from jsonb_array_elements(coalesce(p_content->'steps','[]'::jsonb)) s
--      ), '')
--
-- Signature: (p_title text, p_subtitle text, p_content jsonb) returns text.
-- Volatility: IMMUTABLE. Not SECURITY DEFINER. No `set search_path`.
--
-- CHANGES BELOW, and nothing else:
--   * clauses 1, 2 and 3 are reproduced VERBATIM — same coalesces, same regexp, same
--     separator, same '[]'::jsonb fallback;
--   * ONE new clause 4 appends the FAQ text, built the way clause 3 is: question
--     concatenated with answer, `<[^>]+>` stripped (answers are TipTap HTML, questions are
--     plain), string_agg'd with a space, coalesced to '';
--   * signature, volatility, security and search_path are UNCHANGED. They must stay so:
--     `articles.search_vector` is a GENERATED ALWAYS column over this function, and a
--     generated column's expression may only call an IMMUTABLE function.
--
-- WHY THIS FUNCTION AND NOT reader_search. reader_search reads `a.search_vector` for
-- ranking and calls article_search_text for the ts_headline snippet, so extending this ONE
-- function indexes FAQ text and puts FAQ text into snippets in the same stroke.
-- reader_search is therefore NOT touched by this migration — no replace, so no chance of
-- silently dropping a clause from it the way 0024 dropped the watermark.
--
-- NO BACKFILL IS NEEDED, and that is not an oversight. Replacing the function does not
-- recompute stored generated columns — but `faqs` only reaches `published_content` when an
-- article is PUBLISHED, and that publish is an UPDATE, which recomputes search_vector with
-- the new body. Every article that has FAQ text to index is written after this runs; every
-- article published before it has no `faqs` key and nothing to find.

-- ---------------------------------------------------------------------------
-- 1. articles.faqs
-- ---------------------------------------------------------------------------
-- The DRAFT copy. Owner/editor-scoped by the existing `articles` RLS, never anon-readable.
-- The reader only ever sees the copy frozen into published_content (CLAUDE.md §10f).
--
-- Shape: [{ "id": "f_a1b2c3d4", "q": "plain text", "a": "<p>TipTap HTML</p>" }]. Order is
-- array order. `id` is minted client-side once and never changes, because it is the anchor
-- target — deriving it from the question text would break every inbound link the first time
-- someone reworded a question.
--
-- `articles` carries TABLE-level grants, not the narrowed column list `knowledge_bases` got
-- in 0035, so this column is writable by the SPA on creation. Verified against
-- information_schema.column_privileges before writing this, because if it HAD been a
-- narrowed grant the autosave would have failed silently.
alter table public.articles
  add column if not exists faqs jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. article_search_text — see the diff at the top of this file
-- ---------------------------------------------------------------------------
create or replace function public.article_search_text(
  p_title text,
  p_subtitle text,
  p_content jsonb
) returns text
language sql immutable as $fn$
  select coalesce(p_title, '') || ' ' || coalesce(p_subtitle, '') || ' ' ||
    coalesce((
      select string_agg(
        regexp_replace(
          coalesce(s->>'heading', '') || ' ' || coalesce(s->>'body_text', ''),
          '<[^>]+>', ' ', 'g'),
        ' ')
      from jsonb_array_elements(coalesce(p_content->'steps', '[]'::jsonb)) s
    ), '') || ' ' ||
    -- NEW. People search in questions, not in step headings — this is the line that makes a
    -- FAQ findable. Answers are HTML and get the same tag strip step bodies get.
    coalesce((
      select string_agg(
        regexp_replace(
          coalesce(f->>'q', '') || ' ' || coalesce(f->>'a', ''),
          '<[^>]+>', ' ', 'g'),
        ' ')
      from jsonb_array_elements(coalesce(p_content->'faqs', '[]'::jsonb)) f
    ), '')
$fn$;

-- ---------------------------------------------------------------------------
-- 3. reader_search_misses — what readers looked for and did not find
-- ---------------------------------------------------------------------------
-- The point is to have data on day one of real traffic, not to build analytics. One table,
-- four columns, no schema for a dashboard nobody has asked for yet.
--
-- THERE IS DELIBERATELY NO VISITOR COLUMN. The spec this was built from named a
-- `visitor_hash`; it is not here. 0025 states the promise in the schema itself — the reader
-- surface "stores NOTHING that could identify a reader: no ip, no user agent, no session id,
-- no fingerprint ... there is deliberately no column to put such a value in" — and
-- privacy-policy.md §"Usage information" says in as many words "We do not build profiles of
-- your readers." A per-visitor hash is exactly such a profile key, and CLAUDE.md §10 says a
-- change that would make a sentence in those documents false does not ship without the
-- sentence changing. A search query is about the HELP CENTER's gap, not about the person who
-- typed it, so the row names the KB and nothing else.
--
-- kb_id is `on delete set null` for the same reason article_feedback's is (0025): the
-- day-37 purge deletes a KB and would otherwise erase the record that the searches ever
-- happened. The row stops naming what it was about rather than forgetting it.
create table if not exists public.reader_search_misses (
  id uuid primary key default gen_random_uuid(),
  kb_id uuid references public.knowledge_bases(id) on delete set null,
  query_text text not null,
  created_at timestamptz not null default now(),
  constraint reader_search_misses_len check (length(query_text) <= 120)
);

create index if not exists reader_search_misses_kb_idx
  on public.reader_search_misses (kb_id, created_at desc);

alter table public.reader_search_misses enable row level security;

-- No policies for anon or authenticated: the only door is the definer function below. Belt
-- and braces on top of RLS — §10e.2 is explicit that reading a policy is not proof, so the
-- grant is removed outright rather than relied on to match nothing.
revoke all on public.reader_search_misses from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. log_reader_search_miss — anon, fire-and-forget, leaks nothing
-- ---------------------------------------------------------------------------
-- kb_id is NOT a parameter. Same reasoning as submit_article_feedback (0025): readers are
-- anonymous, so there is no identity to derive from auth.uid() and §10e.1's concern does not
-- apply — but the caller must not get to assert WHERE the row lands either. The host key is
-- resolved through the same predicate reader_kb uses, so a caller can only ever file against
-- a help center it could already read.
--
-- Returns void on EVERY path — unknown host, offline help center, empty query, successful
-- insert. An anonymous caller must not be able to tell an offline KB from one that never
-- existed, and the reader has nothing to do with the answer anyway.
--
-- NOT RATE LIMITED, deliberately and by instruction. The abuse surface is real and worth
-- stating plainly: anyone who can reach the anon key can write unbounded rows here, one row
-- per call, 120 chars each. There is no per-visitor key to limit on (see above), so the only
-- shape available is the per-kb-per-minute count article_feedback uses. Left for its own
-- commit; recorded in OPEN-ITEMS.
create or replace function public.log_reader_search_miss(host_key text, q text)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_kb_id uuid;
  v_q text;
begin
  -- Lowercase, collapse runs of whitespace, trim, cap. In that order: collapsing before
  -- trimming turns a query that is nothing but spaces into '' rather than ' '.
  v_q := left(btrim(regexp_replace(lower(coalesce(q, '')), '\s+', ' ', 'g')), 120);
  if v_q = '' then
    return;
  end if;

  select kb.id into v_kb_id
    from public.knowledge_bases kb
   where (kb.subdomain = host_key
       or (kb.custom_domain = host_key and kb.domain_status = 'live'))
     and kb.offline_at is null
   limit 1;

  if v_kb_id is null then
    return;
  end if;

  insert into public.reader_search_misses (kb_id, query_text) values (v_kb_id, v_q);
end $fn$;

revoke all on function public.log_reader_search_miss(text, text) from public;
grant execute on function public.log_reader_search_miss(text, text) to anon, authenticated;
