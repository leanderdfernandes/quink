-- 0024 — Masthead band treatment
--
-- The reader's band (masthead + headline + search, one surface) can be filled four ways,
-- all derived from the ONE stored brand colour except `image`, which sits a customer photo
-- behind a brand scrim. Until now the reader hardcoded 'solid' because there was nothing to
-- read; this adds the column so it becomes a per-KB choice.
--
-- Why this is theming and not an entitlement: it lives on knowledge_bases beside
-- primary_color / font_pairing / logo_path, NOT on profiles. It describes the help center,
-- so it must travel with the KB through claim_kb() — and therefore is deliberately NOT
-- added to that function's reset list (§10d): a claimer should receive the help center
-- looking exactly as it was demoed, same rule as `f.watermark or kb.is_demo`.
--
-- `solid` is the default deliberately. A tint mixed toward paper goes flat grey for any
-- desaturated brand (slate, charcoal); a flat fill of the brand itself cannot.

alter table public.knowledge_bases
  add column if not exists header_style text not null default 'solid',
  add column if not exists header_image_path text;

-- Constraint separate from the add so re-running is safe.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'knowledge_bases_header_style_check'
  ) then
    alter table public.knowledge_bases
      add constraint knowledge_bases_header_style_check
      check (header_style in ('solid', 'ink', 'tint', 'image'));
  end if;
end $$;

-- header_image_path lives in the PUBLIC `branding` bucket alongside logo/favicon, keyed
-- {kb_id}/… like everything else (§10b). Storage RLS already resolves that first path
-- segment through knowledge_bases, so the existing policies cover it and no bucket work is
-- needed. Being public is correct here: it is a masthead, served to anonymous readers on
-- every page, and it must be CDN-cacheable like the logo.

-- ---------------------------------------------------------------------------
-- reader_kb must return them, or the reader cannot see them.
-- ---------------------------------------------------------------------------
-- The reader is anon and base-table RLS is fully closed to it (migration 0006), so this
-- RPC is the only door. Redeclared in full rather than patched: the return type changes,
-- and Postgres will not alter a function's OUT columns in place.
--
-- Everything else is carried over from 0022 verbatim, including `kb.offline_at is null` —
-- the offline gate is the reason this function exists in its current shape and must not be
-- dropped while extending it.
drop function if exists public.reader_kb(text);

create function public.reader_kb(p_key text)
returns table (
  id uuid, name text, about text, headline text, search_placeholder text,
  primary_color text, font_pairing text,
  logo_path text, favicon_path text, subdomain text, custom_domain text,
  domain_status text, noindex boolean, watermark boolean,
  header_style text, header_image_path text
)
language sql stable security definer set search_path = public as $$
  select kb.id, kb.name, kb.about, kb.headline, kb.search_placeholder,
         kb.primary_color, kb.font_pairing,
         kb.logo_path, kb.favicon_path, kb.subdomain, kb.custom_domain,
         kb.domain_status, f.noindex, f.watermark,
         kb.header_style, kb.header_image_path
    from public.knowledge_bases kb
    join public.profiles p on p.id = kb.owner_id
    cross join lateral public.plan_flags(p.plan) f
   where (kb.subdomain = p_key
      or (kb.custom_domain = p_key and kb.domain_status = 'live'))
     and kb.offline_at is null
   limit 1
$$;

grant execute on function public.reader_kb(text) to anon, authenticated;
