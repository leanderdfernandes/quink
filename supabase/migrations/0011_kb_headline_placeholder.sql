-- Theming: two more customer-editable reader strings the redesigned help center exposes
-- (build spec §1, "Quink Flow" CUSTOMIZE screen).
--   headline           — the big line in the hero (was a hardcoded "How can we help?").
--   search_placeholder — the hero search box placeholder (was hardcoded).
-- `about` continues to serve as the hero description/tagline. Empty defaults mean the reader
-- falls back to sensible built-ins, so this is safe for existing KBs.
alter table public.knowledge_bases
  add column headline           text not null default '',
  add column search_placeholder text not null default '';

-- reader_kb must surface both to the anon reader. Return type changes → drop+recreate
-- (create-or-replace can't alter a function's return columns).
drop function if exists public.reader_kb(text);

create function public.reader_kb(p_key text)
returns table (
  id uuid, name text, about text, headline text, search_placeholder text,
  primary_color text, font_pairing text,
  logo_path text, favicon_path text, subdomain text, custom_domain text,
  domain_status text, plan text
)
language sql stable security definer set search_path = public as $$
  select kb.id, kb.name, kb.about, kb.headline, kb.search_placeholder,
         kb.primary_color, kb.font_pairing,
         kb.logo_path, kb.favicon_path, kb.subdomain, kb.custom_domain,
         kb.domain_status, kb.plan
    from public.knowledge_bases kb
   where kb.subdomain = p_key
      or (kb.custom_domain = p_key and kb.domain_status = 'live')
   limit 1
$$;

grant execute on function public.reader_kb(text) to anon, authenticated;
