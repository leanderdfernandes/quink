-- Schema for the four help-center features (theming · sharing · reader site · custom
-- domain). CLAUDE.md §7 + the build spec: add ALL schema now even where UI is partial —
-- schema rework later is the expensive kind, code isn't. UI ships feature-by-feature on
-- top of this.
--
-- Reconciliation note (flagged, not silent): 0004 already shipped publish as a
-- `published_content` snapshot + `articles.status='published'`, and the reader renders that
-- snapshot. The build spec wants three states draft/unlisted/listed + a frozen slug. We
-- KEEP the snapshot model (it's correct) and layer the states on: `status` stays the
-- pipeline lifecycle (generating→ready), a new `visibility` column carries the publish
-- state. Reader gate = visibility <> 'draft'. Nothing from 0004 is thrown away.

-- ---------------------------------------------------------------------------
-- slug + subdomain helpers
-- ---------------------------------------------------------------------------
create or replace function public.slugify(p text)
returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g'))
$$;

-- First free "{base}", "{base}-1", "{base}-2", … across ALL KBs (subdomains are global).
create or replace function public.unique_subdomain(p_base text)
returns text language plpgsql as $$
declare base text; cand text; n int := 0;
begin
  base := nullif(public.slugify(p_base), '');
  if base is null then base := 'help'; end if;
  cand := base;
  while exists (select 1 from public.knowledge_bases where subdomain = cand) loop
    n := n + 1;
    cand := base || '-' || n;
  end loop;
  return cand;
end $$;

-- ---------------------------------------------------------------------------
-- knowledge_bases — theming, domain state machine, analytics hook
-- ---------------------------------------------------------------------------
-- Theming (build spec §1). Display name reuses the existing `name`. Primary colour is the
-- ONLY colour stored — hover/tint/active/rail derive from it at render (color-mix). The
-- old unused `theme` jsonb (0001) is superseded by these discrete columns; left in place
-- rather than dropped (nothing reads it).
alter table public.knowledge_bases
  add column primary_color text not null default '#1F6E6B'
    check (primary_color ~* '^#[0-9a-f]{6}$'),
  add column font_pairing text not null default 'modern'
    check (font_pairing in ('modern', 'editorial', 'classic')),
  add column logo_path    text,   -- public `branding` bucket path
  add column favicon_path text,   -- derived from the logo on upload; override allowed

  -- Custom-domain state machine (build spec §4). `custom_domain` already exists (0001).
  -- The subdomain ({subdomain}.quink.site) is live from signup and never goes down; adding
  -- a custom domain only flips these, never takes the KB offline.
  add column domain_status text not null default 'none'
    check (domain_status in ('none', 'pending', 'verifying', 'live', 'failed')),
  add column domain_last_checked_at timestamptz,
  add column domain_error text,

  -- Deferred analytics hook (build spec §Schema). Bumped by the reader; no UI yet.
  add column reader_views bigint not null default 0;

-- Auto-provision a subdomain on every KB insert (covers the signup trigger and any future
-- multi-KB creation). Free subdomain live from signup — build spec §4.
create or replace function public.set_kb_subdomain()
returns trigger language plpgsql as $$
begin
  if new.subdomain is null then
    new.subdomain := public.unique_subdomain(new.name);
  end if;
  return new;
end $$;

create trigger kb_subdomain before insert on public.knowledge_bases
  for each row execute function public.set_kb_subdomain();

-- Backfill KBs that predate the trigger.
update public.knowledge_bases
   set subdomain = public.unique_subdomain(name)
 where subdomain is null;

-- ---------------------------------------------------------------------------
-- articles — publish states, frozen slug, folders hook, full-text search
-- ---------------------------------------------------------------------------
alter table public.articles
  -- Publish/link state (build spec §2). Same thing as "is it shared" — no separate share
  -- flag to drift out of sync. draft = 404; unlisted = link-only; listed = in nav+search.
  add column visibility text not null default 'draft'
    check (visibility in ('draft', 'unlisted', 'listed')),

  -- URL slug. Generated from the title, editable while draft, FROZEN once published (a
  -- changing slug breaks links pasted into support tickets). Unique per KB; NULL until set.
  add column slug text,

  -- Deferred folders/categories hook (build spec §Schema). No folder UI yet — flat list.
  add column category text;

create unique index articles_kb_slug_uidx
  on public.articles (kb_id, slug) where slug is not null;

-- Backfill the one pre-existing published article into the new model.
update public.articles
   set visibility = 'listed',
       slug = coalesce(nullif(public.slugify(title), ''), 'article')
 where status = 'published' and slug is null;

-- Full-text search (build spec §3) over the PUBLISHED snapshot (title + subtitle + step
-- text, HTML stripped). Immutable so it can back a stored generated column.
create or replace function public.article_search_text(
  p_title text, p_subtitle text, p_content jsonb
) returns text language sql immutable as $$
  select coalesce(p_title, '') || ' ' || coalesce(p_subtitle, '') || ' ' ||
    coalesce((
      select string_agg(
        regexp_replace(
          coalesce(s->>'heading', '') || ' ' || coalesce(s->>'body_text', ''),
          '<[^>]+>', ' ', 'g'),
        ' ')
      from jsonb_array_elements(coalesce(p_content->'steps', '[]'::jsonb)) s
    ), '')
$$;

alter table public.articles
  add column search_vector tsvector
    generated always as (
      to_tsvector('english', public.article_search_text(title, subtitle, published_content))
    ) stored;

create index articles_search_idx on public.articles using gin (search_vector);
