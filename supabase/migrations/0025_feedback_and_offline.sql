-- 0025 — Article feedback, and offline as its own reader result
--
-- Two unrelated changes ship together only because both are reader-facing data shape.

-- ---------------------------------------------------------------------------
-- 1. article_feedback — the reader's "Did this answer your question?"
-- ---------------------------------------------------------------------------
-- The widget has been useState-only since it shipped. The copy calls it anonymous, so this
-- table stores NOTHING that could identify a reader: no ip, no user agent, no session id,
-- no fingerprint. That is a promise in the UI, and the schema is where it is either kept or
-- quietly broken later — there is deliberately no column to put such a value in.
--
-- BOTH foreign keys are `on delete set null`, and article_id has to be — not just kb_id.
-- `articles.kb_id` is itself ON DELETE CASCADE, so the day-37 purge deletes a KB, which
-- deletes its articles, which would have cascaded straight through to this table: setting
-- only kb_id to null would have been decorative while the record still vanished. Same
-- reasoning and same shape as jobs.article_id in 0014 and jobs.kb_id in 0022 — the row
-- stops naming what it was about rather than forgetting that it happened.
--
-- The consequence is deliberate: after a purge the counts survive as anonymous history and
-- the per-article summary simply has nothing left to join to.
create table if not exists public.article_feedback (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.articles(id) on delete set null,
  kb_id uuid references public.knowledge_bases(id) on delete set null,
  helpful boolean not null,
  missing_text text,
  created_at timestamptz not null default now(),
  constraint article_feedback_missing_len check (missing_text is null or length(missing_text) <= 2000)
);

create index if not exists article_feedback_article_idx on public.article_feedback (article_id);
create index if not exists article_feedback_kb_idx on public.article_feedback (kb_id, created_at desc);
-- Serves the rate-limit probe below.
create index if not exists article_feedback_recent_idx on public.article_feedback (article_id, created_at desc);

alter table public.article_feedback enable row level security;

-- No policies for anon or authenticated: every read and write goes through the two definer
-- functions below. Belt and braces on top of RLS — §10e.2 is explicit that a policy read is
-- not proof, so the grant is removed outright rather than relied upon to be un-matched.
revoke all on public.article_feedback from anon, authenticated;

-- ---------------------------------------------------------------------------
-- submit_article_feedback — anon insert, server-side validated
-- ---------------------------------------------------------------------------
-- §10e.1 says a definer function derives identity from auth.uid() and never from an
-- argument. Readers are anonymous, so there IS no identity to derive — which makes the
-- rule's underlying concern (a caller asserting who they are) inapplicable, but makes a
-- different one urgent: a caller asserting WHERE the row belongs. So kb_id is NOT a
-- parameter. It is looked up from the article, and the article must itself be published on
-- a live help center or the call is refused. A client that passes a draft article's id, an
-- article on an offline KB, or a kb_id that isn't the article's, gets nothing.
--
-- RATE LIMIT: at most 5 rows per article per minute.
--   Chosen because it is the only limit that can exist without storing something
--   identifying. With no ip, session or fingerprint there is no way to tell two readers
--   apart, so the window is necessarily per-ARTICLE and global, not per-reader. That makes
--   it a flood guard (a script hammering one article) rather than a per-person quota, and
--   5/min is set well above any plausible organic rate for a single help-center article
--   while still capping a loop at 7200/day instead of unbounded.
--   The honest double-submit case is handled client-side instead: the widget renders once
--   per article per session and cannot be resubmitted.
-- Over the limit the function returns false and inserts nothing. The widget shows the same
-- acknowledgement either way — telling a flooder they were blocked just tells them the
-- limit.
create or replace function public.submit_article_feedback(
  p_article_id uuid,
  p_helpful boolean,
  p_missing_text text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_kb_id uuid;
  v_recent int;
  v_text text;
begin
  -- The article must be published AND its help center live. reader_article applies the same
  -- two conditions; feedback must not be reachable for anything a reader cannot read.
  select a.kb_id into v_kb_id
    from public.articles a
    join public.knowledge_bases kb on kb.id = a.kb_id
   where a.id = p_article_id
     and a.visibility in ('listed', 'unlisted')
     and kb.offline_at is null;

  if v_kb_id is null then
    return false;
  end if;

  select count(*) into v_recent
    from public.article_feedback
   where article_id = p_article_id
     and created_at > now() - interval '1 minute';

  if v_recent >= 5 then
    return false;
  end if;

  -- Empty or whitespace-only notes are stored as null, not as ''. Trimmed and capped here
  -- as well as by the check constraint, so an oversized note is truncated rather than
  -- raising into an anonymous caller.
  v_text := nullif(btrim(coalesce(p_missing_text, '')), '');
  if v_text is not null then
    v_text := left(v_text, 2000);
  end if;

  insert into public.article_feedback (article_id, kb_id, helpful, missing_text)
  values (p_article_id, v_kb_id, p_helpful, v_text);

  return true;
end $$;

grant execute on function public.submit_article_feedback(uuid, boolean, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- article_feedback_summary — the owner's read, aggregates only
-- ---------------------------------------------------------------------------
-- Separate function, authenticated only, and it proves the caller owns the KB through
-- auth.uid() (or is_admin()). Anon has no SELECT path to this table at all.
create or replace function public.article_feedback_summary(p_kb_id uuid)
returns table (
  article_id uuid,
  title text,
  helpful_count bigint,
  not_helpful_count bigint,
  last_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select f.article_id,
         coalesce(nullif(a.published_content->>'title', ''), a.title) as title,
         count(*) filter (where f.helpful)     as helpful_count,
         count(*) filter (where not f.helpful) as not_helpful_count,
         max(f.created_at)                     as last_at
    from public.article_feedback f
    join public.articles a on a.id = f.article_id
   where f.kb_id = p_kb_id
     and exists (
       select 1 from public.knowledge_bases kb
        where kb.id = p_kb_id
          and (kb.owner_id = auth.uid() or public.is_admin())
     )
   group by f.article_id, a.title, a.published_content
   order by max(f.created_at) desc
$$;

grant execute on function public.article_feedback_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Offline is its own result, not "does not exist"
-- ---------------------------------------------------------------------------
-- 0022 filtered offline KBs out of reader_kb entirely, so a lapsed trial and a typo in the
-- URL produced the identical zero rows and the identical "this help center doesn't exist"
-- screen. That tells a paying-adjacent customer's OWN readers that their site is gone,
-- which is a support ticket for them and a bad look for us.
--
-- reader_kb now RESOLVES an offline KB and flags it. What it must not do is leak anything
-- else while offline, so every other field is blanked in the projection: no branding, no
-- domain, no headline. Name and the flag only — enough to say "X has paused this" and
-- nothing more. noindex is forced true so a crawler never indexes the offline page.
--
-- The other three reader RPCs keep their `offline_at is null` join untouched (§10i: all
-- four are gated, because a kb_id is not a secret). Article content therefore remains
-- unreachable — this changes what the RESOLVER says, not what the content RPCs return.
drop function if exists public.reader_kb(text);

create function public.reader_kb(p_key text)
returns table (
  id uuid, name text, about text, headline text, search_placeholder text,
  primary_color text, font_pairing text,
  logo_path text, favicon_path text, subdomain text, custom_domain text,
  domain_status text, noindex boolean, watermark boolean,
  header_style text, header_image_path text,
  offline boolean
)
language sql stable security definer set search_path = public as $$
  select kb.id,
         kb.name,
         case when kb.offline_at is null then kb.about              else '' end,
         case when kb.offline_at is null then kb.headline           else '' end,
         case when kb.offline_at is null then kb.search_placeholder else '' end,
         case when kb.offline_at is null then kb.primary_color      else '#1f6e6b' end,
         case when kb.offline_at is null then kb.font_pairing       else 'modern' end,
         case when kb.offline_at is null then kb.logo_path          else null end,
         case when kb.offline_at is null then kb.favicon_path       else null end,
         case when kb.offline_at is null then kb.subdomain          else null end,
         case when kb.offline_at is null then kb.custom_domain      else null end,
         case when kb.offline_at is null then kb.domain_status      else 'none' end,
         -- An offline help center is never indexable, whatever the plan says.
         case when kb.offline_at is null then f.noindex             else true end,
         f.watermark,
         case when kb.offline_at is null then kb.header_style       else 'solid' end,
         case when kb.offline_at is null then kb.header_image_path  else null end,
         kb.offline_at is not null as offline
    from public.knowledge_bases kb
    join public.profiles p on p.id = kb.owner_id
    cross join lateral public.plan_flags(p.plan) f
   where (kb.subdomain = p_key
      or (kb.custom_domain = p_key and kb.domain_status = 'live'))
   limit 1
$$;

grant execute on function public.reader_kb(text) to anon, authenticated;
