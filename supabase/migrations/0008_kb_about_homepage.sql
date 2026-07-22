-- Reader home page (customizable intro). The reader now opens on a landing page — logo,
-- name and a short blurb the customer writes — instead of dropping straight into an article.
alter table public.knowledge_bases
  add column about text not null default '';

-- reader_kb must surface `about` to the anon reader. Return type changes, so drop+recreate
-- (create-or-replace can't alter a function's return columns).
drop function if exists public.reader_kb(text);

create function public.reader_kb(p_key text)
returns table (
  id uuid, name text, about text, primary_color text, font_pairing text,
  logo_path text, favicon_path text, subdomain text, custom_domain text,
  domain_status text, plan text
)
language sql stable security definer set search_path = public as $$
  select kb.id, kb.name, kb.about, kb.primary_color, kb.font_pairing,
         kb.logo_path, kb.favicon_path, kb.subdomain, kb.custom_domain,
         kb.domain_status, kb.plan
    from public.knowledge_bases kb
   where kb.subdomain = p_key
      or (kb.custom_domain = p_key and kb.domain_status = 'live')
   limit 1
$$;

grant execute on function public.reader_kb(text) to anon, authenticated;
