-- Quink — folders (build spec §7 / CONTENT screen)
--
-- A folder is ONE concept doing double duty: the org unit in the editor's article
-- library AND the category card on the live help center. Publishing an article means
-- filing it in a folder (a null folder_id = "Unfiled", which cannot be published).
--
-- This supersedes the free-text `articles.category` hook from migration 0005: a string
-- can't be renamed in place, can't be reordered, and can't hold an empty folder — all of
-- which the CONTENT screen needs. We migrate the column into real rows, then drop it.

-- ---------------------------------------------------------------------------
-- folders
-- ---------------------------------------------------------------------------
create table public.folders (
  id       uuid primary key default gen_random_uuid(),
  kb_id    uuid not null references public.knowledge_bases(id) on delete cascade,
  name     text not null default '',
  -- Manual ordering (drag-and-drop reorder lands later — build spec §7). Rendered
  -- ascending; new folders append at max+1.
  position integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index folders_kb_id_idx on public.folders(kb_id, position);

create trigger folders_touch before update on public.folders
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- articles.folder_id — nullable = Unfiled. Deleting a folder sends its articles to
-- Unfiled (set null), NEVER deletes the article (the CONTENT delete-confirm promises
-- exactly this).
-- ---------------------------------------------------------------------------
alter table public.articles
  add column folder_id uuid references public.folders(id) on delete set null;
create index articles_folder_id_idx on public.articles(folder_id);

-- Migrate the free-text categories into folders, then retire the column. One folder per
-- distinct non-blank category per KB; articles re-point at their new folder by name.
with distinct_cats as (
  select distinct kb_id, category
    from public.articles
   where category is not null and btrim(category) <> ''
),
new_folders as (
  insert into public.folders (kb_id, name, position)
  select kb_id, category,
         (row_number() over (partition by kb_id order by category)) - 1
    from distinct_cats
  returning id, kb_id, name
)
update public.articles a
   set folder_id = f.id
  from new_folders f
 where a.kb_id = f.kb_id and a.category = f.name;

alter table public.articles drop column category;

-- ---------------------------------------------------------------------------
-- RLS — owner-only, reached through the KB (same shape as articles_all_own).
-- ---------------------------------------------------------------------------
alter table public.folders enable row level security;

create policy folders_all_own on public.folders
  for all using (
    exists (select 1 from public.knowledge_bases kb
            where kb.id = folders.kb_id and kb.owner_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.knowledge_bases kb
            where kb.id = folders.kb_id and kb.owner_id = (select auth.uid()))
  );
