-- 0026 — Header link
--
-- One optional label + URL pair, rendered opposite the masthead in the reader band. It is
-- how most readers get back out of a help center and into the product, and every hosted
-- help center has one.
--
-- Theming, not entitlement: it lives on knowledge_bases beside header_style/primary_color,
-- so it travels with the KB through claim_kb() and is deliberately NOT in that function's
-- reset list (§10d) — a claimer receives the help center looking exactly as demoed.
--
-- The URL is CUSTOMER-SUPPLIED and renders on a page we host and serve to anonymous
-- readers, so the scheme is constrained in the database rather than only in the client:
-- http/https only. That closes javascript:, data: and vbscript: at the layer a future
-- second writer (an importer, an admin tool, a support script) cannot skip. The SPA
-- validates and defaults the scheme too, but this is the backstop.
alter table public.knowledge_bases
  add column if not exists header_link_label text,
  add column if not exists header_link_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'knowledge_bases_header_link_url_check'
  ) then
    alter table public.knowledge_bases
      add constraint knowledge_bases_header_link_url_check
      check (header_link_url is null or header_link_url ~* '^https?://[^\s<>"]+$');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- reader_kb returns them. Third shape change to this function (0024 added the header
-- treatment, 0025 added `offline`); the ARGUMENT signature is still reader_kb(text) and the
-- other three reader RPCs are untouched.
-- ---------------------------------------------------------------------------
-- Carried over verbatim from 0025, including the offline projection: while a help center is
-- paused everything except id/name/watermark/offline is blanked, and the link is part of
-- "everything" — a paused help center must not still be advertising an outbound link.
drop function if exists public.reader_kb(text);

create function public.reader_kb(p_key text)
returns table (
  id uuid, name text, about text, headline text, search_placeholder text,
  primary_color text, font_pairing text,
  logo_path text, favicon_path text, subdomain text, custom_domain text,
  domain_status text, noindex boolean, watermark boolean,
  header_style text, header_image_path text,
  header_link_label text, header_link_url text,
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
         case when kb.offline_at is null then f.noindex             else true end,
         f.watermark,
         case when kb.offline_at is null then kb.header_style       else 'solid' end,
         case when kb.offline_at is null then kb.header_image_path  else null end,
         case when kb.offline_at is null then kb.header_link_label  else null end,
         case when kb.offline_at is null then kb.header_link_url    else null end,
         kb.offline_at is not null as offline
    from public.knowledge_bases kb
    join public.profiles p on p.id = kb.owner_id
    cross join lateral public.plan_flags(p.plan) f
   where (kb.subdomain = p_key
      or (kb.custom_domain = p_key and kb.domain_status = 'live'))
   limit 1
$$;

grant execute on function public.reader_kb(text) to anon, authenticated;
