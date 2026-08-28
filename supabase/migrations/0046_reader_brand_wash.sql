-- Carry brand_wash (0045) out to the reader.
--
-- Without this the control is decoration: the authoring preview would move and the live
-- help center would not, which is worse than not shipping the slider at all.
--
-- ---------------------------------------------------------------------------------------
-- LIVE-DEFINITION DIFF — public.reader_kb(text)
-- ---------------------------------------------------------------------------------------
-- Printed from pg_get_functiondef(oid) immediately before writing this file, and diffed
-- line by line. This function has been silently reverted ONCE already — 0024 recreated it
-- from an older body and dropped the watermark clause, and 0025/0026 carried the loss
-- (OPEN-ITEMS D.4). Everything below is the live body with ONE row added.
--
-- The return type changes, so this is a DROP + CREATE, not a `create or replace`: Postgres
-- refuses to replace a function whose OUT columns differ. Both statements are in this
-- transaction, so no reader sees a window where the RPC is missing.
--
--   ADDED    + brand_wash smallint, positioned immediately after primary_color, because it
--              is a property of that colour and a caller reading the row in order should
--              meet them together.
--            + `case when kb.offline_at is null then kb.brand_wash else 9 end`
--              Offline collapses it to the design system default, exactly like
--              primary_color collapses to '#1f6e6b' and font_pairing to 'modern' — an
--              offline help center must not leak its owner's theming.
--
--   UNCHANGED  every other column, in order · the offline collapse on each · the
--              kb_watermark(p.plan, kb.is_demo) call, WITH its comment · the
--              plan_flags lateral · the subdomain/custom_domain lookup · `limit 1` ·
--              language sql · stable · security definer · set search_path to 'public'
--
--   NOT TOUCHED  the grants. They are re-stated at the foot of this file because a DROP
--                takes them with it, and re-granting from memory is how anon quietly
--                loses (or gains) execute.
-- ---------------------------------------------------------------------------------------

drop function if exists public.reader_kb(text);

create function public.reader_kb(p_key text)
returns table (
  id uuid, name text, about text, headline text, search_placeholder text,
  primary_color text, brand_wash smallint, font_pairing text, logo_path text,
  favicon_path text, subdomain text, custom_domain text, domain_status text,
  noindex boolean, watermark boolean, header_style text, header_image_path text,
  header_link_label text, header_link_url text, offline boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select kb.id,
         kb.name,
         case when kb.offline_at is null then kb.about              else '' end,
         case when kb.offline_at is null then kb.headline           else '' end,
         case when kb.offline_at is null then kb.search_placeholder else '' end,
         case when kb.offline_at is null then kb.primary_color      else '#1f6e6b' end,
         -- ADDED (0046). Collapses to the design system default when offline, like every
         -- other themed value on this row.
         case when kb.offline_at is null then kb.brand_wash         else 9::smallint end,
         case when kb.offline_at is null then kb.font_pairing       else 'modern' end,
         case when kb.offline_at is null then kb.logo_path          else null end,
         case when kb.offline_at is null then kb.favicon_path       else null end,
         case when kb.offline_at is null then kb.subdomain          else null end,
         case when kb.offline_at is null then kb.custom_domain      else null end,
         case when kb.offline_at is null then kb.domain_status      else 'none' end,
         -- An offline help center is never indexable, whatever the plan says.
         case when kb.offline_at is null then f.noindex             else true end,
         -- RESTORED (0023 -> lost in 0024). A demo renders watermarked whatever plan it
         -- sits on, so claiming it changes nothing visually. §10d. The expression moved
         -- into kb_watermark() in 0036 so the editor preview cannot disagree with this;
         -- it computes exactly what `(f.watermark or kb.is_demo)` computed here.
         public.kb_watermark(p.plan, kb.is_demo),
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
$function$;

comment on function public.reader_kb(text) is
  'The published help center, resolved by HOSTNAME (subdomain or a live custom domain). Anon-callable: it is what the reader site runs on. Every themed value collapses to a neutral default while offline_at is set.';

-- The DROP took these with it. Restated rather than assumed: this RPC is the one the
-- public reader calls with no session at all, so anon MUST hold execute.
revoke all on function public.reader_kb(text) from public;
grant execute on function public.reader_kb(text) to anon, authenticated;
