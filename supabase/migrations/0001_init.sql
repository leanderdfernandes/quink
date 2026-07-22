-- Quink — initial schema (slice 1)
--
-- Scope note: theming, publishing, quota and domain columns are present but NO UI touches
-- them this slice (CLAUDE.md §7). They exist so adding those features later is additive,
-- not a painful migration.

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- knowledge_bases — one per user this slice ("1 KB per email", ux-spec §3)
-- ---------------------------------------------------------------------------
create table public.knowledge_bases (
  id       uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name     text not null,

  -- Deferred-but-present (CLAUDE.md §7). No UI this slice.
  subdomain          text unique,
  custom_domain      text unique,
  is_published       boolean not null default false,
  theme              jsonb,
  free_articles_used integer not null default 0,
  plan               text not null default 'free',

  created_at timestamptz not null default now()
);
create index knowledge_bases_owner_id_idx on public.knowledge_bases(owner_id);

-- ---------------------------------------------------------------------------
-- articles
-- ---------------------------------------------------------------------------
create table public.articles (
  id       uuid primary key default gen_random_uuid(),
  kb_id    uuid not null references public.knowledge_bases(id) on delete cascade,
  title    text not null default '',
  subtitle text not null default '',
  status   text not null default 'generating'
             check (status in ('generating', 'ready', 'published')),

  -- Storage path to the source video. Kept until first publish, then deleted
  -- (CLAUDE.md §8) — the Tier-2 frame-picker scrubs this during editing.
  -- No publish flow this slice, so videos persist. That is expected, not a leak:
  -- wire the delete-on-publish hook when publishing ships.
  source_video_path text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index articles_kb_id_idx on public.articles(kb_id);

-- ---------------------------------------------------------------------------
-- steps — mirrors the JSON contract (CLAUDE.md §6)
-- ---------------------------------------------------------------------------
create table public.steps (
  id          uuid primary key default gen_random_uuid(),
  article_id  uuid not null references public.articles(id) on delete cascade,
  step_number integer not null,
  heading     text not null default '',
  body_text   text not null default '',

  -- Storage path (not a public URL) to the chosen WebP frame.
  screenshot_url text,

  -- Human-correction memory (CLAUDE.md §8): a pipeline re-run must NOT overwrite
  -- a frame a human chose. Also labeled signal for the eval loop.
  is_edited boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index steps_article_id_idx on public.steps(article_id, step_number);

-- ---------------------------------------------------------------------------
-- jobs — pipeline tracking. A Postgres row (not worker memory) so the SPA polls
-- Supabase directly and needs no worker poll endpoint (CLAUDE.md §5).
-- ---------------------------------------------------------------------------
create table public.jobs (
  id         uuid primary key default gen_random_uuid(),
  kb_id      uuid not null references public.knowledge_bases(id) on delete cascade,
  article_id uuid references public.articles(id) on delete cascade,

  -- Matches the four progress labels, in order (CLAUDE.md §5).
  stage  text not null default 'analyzing'
           check (stage in ('analyzing', 'detecting', 'capturing', 'writing')),
  status text not null default 'queued'
           check (status in ('queued', 'running', 'done', 'error')),
  error  text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_kb_id_idx on public.jobs(kb_id);

-- ---------------------------------------------------------------------------
-- KB auto-provision on signup (ux-spec §3)
--
-- Naming fallback chain:
--   real company domain  -> derive ("maya@acme.io" -> "Acme Help Center")
--   free provider        -> DON'T guess. Neutral "My Help Center"; the SPA shows one
--                           inline editable field on first landing. Never a setup screen.
-- "maya@gmail.com -> Gmail Help Center" is the embarrassing guess this exists to avoid,
-- and the free-provider branch is the COMMON path, not the exception.
-- ---------------------------------------------------------------------------
create table public.free_email_providers (domain text primary key);

insert into public.free_email_providers(domain) values
  ('gmail.com'), ('googlemail.com'),
  ('outlook.com'), ('hotmail.com'), ('hotmail.co.uk'), ('live.com'), ('msn.com'),
  ('yahoo.com'), ('yahoo.co.uk'), ('yahoo.co.in'), ('ymail.com'), ('rocketmail.com'),
  ('icloud.com'), ('me.com'), ('mac.com'),
  ('proton.me'), ('protonmail.com'), ('pm.me'),
  ('aol.com'), ('zoho.com'), ('gmx.com'), ('gmx.de'), ('gmx.net'), ('mail.com'),
  ('yandex.com'), ('yandex.ru'), ('tutanota.com'), ('tuta.io'),
  ('fastmail.com'), ('hey.com'), ('duck.com'),
  ('qq.com'), ('163.com'), ('126.com'), ('sina.com'), ('naver.com'), ('daum.net'),
  ('rediffmail.com');

create or replace function public.kb_name_from_email(p_email text)
returns text
language plpgsql
immutable
as $$
declare
  v_domain text;
  v_label  text;
begin
  v_domain := lower(split_part(p_email, '@', 2));

  if v_domain = '' or v_domain is null then
    return 'My Help Center';
  end if;

  -- Free provider -> don't guess.
  if exists (select 1 from public.free_email_providers where domain = v_domain) then
    return 'My Help Center';
  end if;

  -- Company domain -> derive from the first label. "acme.io" -> "Acme".
  v_label := split_part(v_domain, '.', 1);
  if v_label = '' then
    return 'My Help Center';
  end if;

  return initcap(v_label) || ' Help Center';
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);

  insert into public.knowledge_bases (owner_id, name)
  values (new.id, public.kb_name_from_email(new.email));

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger articles_touch before update on public.articles
  for each row execute function public.touch_updated_at();
create trigger steps_touch before update on public.steps
  for each row execute function public.touch_updated_at();
create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — on for every user table (CLAUDE.md §4). The worker uses the service
-- role key and bypasses these by design; the SPA never should.
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.knowledge_bases     enable row level security;
alter table public.articles            enable row level security;
alter table public.steps               enable row level security;
alter table public.jobs                enable row level security;
alter table public.free_email_providers enable row level security;

create policy profiles_select_own on public.profiles
  for select using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update using (id = (select auth.uid()));

create policy kb_all_own on public.knowledge_bases
  for all using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy articles_all_own on public.articles
  for all using (
    exists (select 1 from public.knowledge_bases kb
            where kb.id = articles.kb_id and kb.owner_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.knowledge_bases kb
            where kb.id = articles.kb_id and kb.owner_id = (select auth.uid()))
  );

create policy steps_all_own on public.steps
  for all using (
    exists (select 1 from public.articles a
            join public.knowledge_bases kb on kb.id = a.kb_id
            where a.id = steps.article_id and kb.owner_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.articles a
            join public.knowledge_bases kb on kb.id = a.kb_id
            where a.id = steps.article_id and kb.owner_id = (select auth.uid()))
  );

-- Read-only to the SPA: only the worker (service role) writes job state.
create policy jobs_select_own on public.jobs
  for select using (
    exists (select 1 from public.knowledge_bases kb
            where kb.id = jobs.kb_id and kb.owner_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Storage buckets — both private. Frames can contain on-screen PII (EVAL-PLAN V6),
-- so they are signed-URL only, never a public bucket.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('videos', 'videos', false),
  ('frames', 'frames', false)
on conflict (id) do nothing;

-- Both buckets are keyed by "<user_id>/..." so ownership is the first path segment.
create policy storage_videos_own on storage.objects
  for all to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy storage_frames_own on storage.objects
  for all to authenticated
  using (bucket_id = 'frames' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'frames' and (storage.foldername(name))[1] = (select auth.uid())::text);
