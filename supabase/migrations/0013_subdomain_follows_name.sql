-- The help-center address should be the name the user chose (build spec §4, ux-spec §3).
--
-- Today the subdomain is derived once, by the INSERT trigger, from whatever the KB was
-- called at signup. For anyone on a free email provider that name is the neutral default
-- "My Help Center" — so they rename the KB to "Memory" and stay on my-help-center.quink.online
-- forever. The name is editable; the address silently isn't.
--
-- Three fixes here:
--   1. unique_subdomain becomes SECURITY DEFINER. It was invoker-rights, which was fine
--      only because its one caller (handle_new_user) is itself SECURITY DEFINER. Called
--      from a user-initiated rename it runs under RLS, where kb_all_own hides every other
--      account's rows — so its "is this taken?" scan sees only the caller's own KBs and
--      happily returns a subdomain someone else already owns. The unique index catches it,
--      but as a constraint violation on save rather than a free name.
--   2. It also refuses RESERVED subdomains. A KB named "API" would otherwise be handed
--      api.quink.online, which readerKeyFromHost() treats as infrastructure and routes to
--      the authoring app — the owner's help center becomes unreachable at its own address.
--   3. A rename now moves the address with it, but ONLY while that is still safe.
--
-- On (3), the same instinct as the frozen article slug (0005: "editable while draft, FROZEN
-- once published") applies — a URL already out in the world must not move — but the freeze
-- line is drawn differently, deliberately.
--
-- "Freeze once any article is published" is the obvious rule and it is WRONG here. The
-- activation flow is record -> article -> publish; renaming the KB happens later, in Theme
-- settings. So nearly every real user would publish before they ever rename, and would be
-- stuck on my-help-center-7 permanently — the exact complaint this migration exists to fix.
--
-- What actually makes an address worth protecting is someone having USED it:
--   * domain_status = 'live' — the subdomain is now a real redirect source for a real
--     address, so moving it breaks the redirect for existing links.
--   * reader_views > 0 — somebody has actually read this help center.
-- Until one of those is true, no link worth preserving exists and the address is free to
-- follow the name.
--
-- KNOWN GAP: reader_views is not incremented yet (README, "Deferred"), so today the
-- effective freeze is the custom-domain one. That means a user who publishes, shares the
-- link, and only then renames will break that link. The real fix is keeping retired
-- subdomains as permanent aliases rather than freezing at all — deferred; this rule turns
-- the second half of the protection on by itself the moment reader_views starts counting.

-- ---------------------------------------------------------------------------
-- unique_subdomain — RLS-proof, reserved-aware, self-excluding
-- ---------------------------------------------------------------------------
-- Dropped rather than replaced: adding the defaulted second parameter would leave the old
-- 1-arg function in place and make unique_subdomain('x') ambiguous.
drop function if exists public.unique_subdomain(text);

create function public.unique_subdomain(p_base text, p_exclude uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  cand text;
  n int := 0;
  -- MIRRORS RESERVED_SUBDOMAINS in web/src/lib/config.ts. Both lists must agree: this one
  -- stops us handing the name out, that one stops the reader claiming the host. If they
  -- drift, a KB gets an address that renders the wrong app.
  reserved constant text[] := array['www', 'app', 'api', 'admin', 'dashboard', 'mail'];
begin
  base := nullif(public.slugify(p_base), '');
  if base is null then base := 'help'; end if;
  cand := base;
  -- p_exclude keeps a KB from colliding with itself: without it, re-saving a name would
  -- see the row's own current subdomain and bump it to "-1" on every save.
  while cand = any(reserved)
     or exists (
          select 1 from public.knowledge_bases
           where subdomain = cand
             and (p_exclude is null or id <> p_exclude)
        )
  loop
    n := n + 1;
    cand := base || '-' || n;
  end loop;
  return cand;
end $$;

-- ---------------------------------------------------------------------------
-- Rename moves the address, until the address is public
-- ---------------------------------------------------------------------------
create or replace function public.sync_kb_subdomain()
returns trigger
language plpgsql
as $$
begin
  -- Both conditions read straight off OLD: no subquery, and nothing that RLS could hide
  -- from the invoking user and silently answer wrong.
  if new.name is distinct from old.name
     -- A live custom domain makes the subdomain a redirect source for existing links.
     and old.domain_status <> 'live'
     -- Somebody has actually read this help center at this address.
     and old.reader_views = 0
  then
    new.subdomain := public.unique_subdomain(new.name, old.id);
  end if;
  return new;
end $$;

create trigger kb_subdomain_follows_name
  before update of name on public.knowledge_bases
  for each row execute function public.sync_kb_subdomain();

-- ---------------------------------------------------------------------------
-- Backfill KBs already stranded on a signup-time address
-- ---------------------------------------------------------------------------
-- Same safety rule as the trigger, so a genuinely-in-use address is never moved out from
-- under its readers. Row-by-row so each one resolves collisions against rows already updated.
do $$
declare r record; want text;
begin
  for r in
    select kb.id, kb.name, kb.subdomain
      from public.knowledge_bases kb
     where kb.domain_status <> 'live'
       and kb.reader_views = 0
  loop
    -- Only touch rows whose address no longer reflects the name. Ignores the "-1"/"-2"
    -- collision suffix, which is a legitimate address, not a stale one.
    want := public.unique_subdomain(r.name, r.id);
    if r.subdomain is distinct from want then
      update public.knowledge_bases set subdomain = want where id = r.id;
    end if;
  end loop;
end $$;
