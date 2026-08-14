-- 0034 — restore `f.watermark or kb.is_demo` in reader_kb
--
-- REGRESSION REPAIR, not a new decision. CLAUDE.md §10d locks this:
--
--   "A demo renders watermarked (`f.watermark or kb.is_demo`). A demo on `internal` used to
--    render clean and gain a badge the instant it was claimed — the thing they accept
--    looking visibly worse than the thing they were shown, seconds after saying yes. The
--    handover must change nothing visually."
--
-- Migration 0023 §5 shipped exactly that. Migration 0024 needed to add the header-treatment
-- columns, and since the RETURN TABLE shape changed it did `drop function` + `create
-- function` — retyping the whole projection and writing back a bare `f.watermark`. 0025 and
-- 0026 each did the same thing again and carried the loss forward. Nobody noticed because
-- the affected surface is a demo KB on `internal`, which only exists during outreach.
-- 0024's own comment cites the rule two lines above breaking it.
--
-- WHY IT MATTERS RIGHT NOW: the reverse demo is the acquisition channel. Today a prospect
-- opens their demo and sees a clean, unbranded help center; they click claim; their account
-- is `free`; `plan_flags('free').watermark` is true and a "Made with Quink" badge appears in
-- the footer within seconds of them saying yes. The one moment the product must not appear
-- to degrade is the moment somebody accepts it.
--
-- THE ARITHMETIC, both sides of the handover:
--   before — plan `internal` (watermark false) + is_demo true  -> false or true  = TRUE
--   after  — plan `free`     (watermark true)  + is_demo false -> true  or false = TRUE
-- Unchanged. `claim_kb()` clears is_demo, and the plan flip covers it from the other side —
-- which is why the badge does honest work as an upgrade lever from first contact instead of
-- arriving as a punishment for accepting.
--
-- ONE EXPRESSION CHANGES. The rest is 0026's body verbatim, including every comment and the
-- whole offline projection, so a diff shows the single edit. The RETURN TABLE is byte
-- identical to 0026 — `watermark` was already boolean — so this is `create or replace`
-- rather than the drop+create that caused the problem in the first place.
--
-- Note `watermark` stays OUTSIDE the offline blanking, exactly as before: an offline help
-- center renders ReaderOffline, which has no footer to put a badge in.
--
-- LESSON, worth more than the fix: three consecutive drop+create migrations silently
-- reverted a locked decision because each one retyped a 19-column projection by hand. When
-- the shape must change, diff the new body against the old one before applying it.
-- `supabase/test_claim.py` caught this the whole time and was being run past.

create or replace function public.reader_kb(p_key text)
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
         -- An offline help center is never indexable, whatever the plan says.
         case when kb.offline_at is null then f.noindex             else true end,
         -- RESTORED (0023 -> lost in 0024). A demo renders watermarked whatever plan it
         -- sits on, so claiming it changes nothing visually. §10d.
         (f.watermark or kb.is_demo),
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
