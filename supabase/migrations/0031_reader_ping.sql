-- 0031 — reader view counting
--
-- `reader_views` has existed since 0005 as a "deferred analytics hook" and has never been
-- incremented by anything. It is the North Star metric (CLAUDE.md §2: live help centers
-- receiving reader traffic in the last 30 days), and until this lands every reader visit is
-- lost permanently — there is no backfill for traffic that already happened.
--
-- mvp-dev-plan §12 specced this as a "fire-and-forget beacon, because reader pages are
-- static-rendered behind a CDN". That premise is wrong and UI-STATE-INVENTORY §D already
-- flags the drift: the reader is a client-side SPA that fetches every page from these RPCs
-- at runtime. So it is an ordinary RPC in the reader_* family, not a CDN workaround.

alter table public.knowledge_bases
  add column if not exists last_reader_view_at timestamptz;

comment on column public.knowledge_bases.last_reader_view_at is
  'Last reader session that reached this help center (debounced to 1/hour by reader_ping). NULL means never read — deliberately not backfilled, because that is the honest value.';

-- ---------------------------------------------------------------------------
-- WHAT `reader_views` ACTUALLY COUNTS — read this before wiring it to anything
-- ---------------------------------------------------------------------------
-- Because of the one-hour server-side debounce in reader_ping, `reader_views` is NOT a view
-- count. It counts HOURS THAT CONTAINED AT LEAST ONE VIEW, per KB, capped at 24/day. One
-- reader and four hundred readers in the same hour both increment it by exactly 1.
--
-- That is the right shape for the North Star ("live help centers receiving reader traffic in
-- the last 30 days"), which asks whether a help center is being read at all — and the
-- debounce is also the abuse ceiling on an anon-callable endpoint, so it is not going away.
--
-- It is the WRONG number for anything customer-facing. pricing-spec.md promises Starter
-- "basic reader analytics (views per article)": that is per-ARTICLE and a real count, and
-- this column is neither. Rendering it as "views" would under-report a customer's actual
-- traffic by whatever their concurrency happens to be, and they would be right to complain.
--
-- Per-article analytics needs its own append-only event table. Do not reach for this column
-- to build it, and do not weaken the debounce to make this column fit — that would trade the
-- rate limit on an anonymous write endpoint for a number that is still not per-article.
comment on column public.knowledge_bases.reader_views is
  'Count of HOURS containing at least one reader session (reader_ping debounces to 1/hour), max 24/day/KB. NOT a view count and NOT the per-article analytics pricing-spec promises Starter — that needs its own event table. Reset by claim_kb().';

-- "Received traffic in the last 30 days" is the North Star query; nulls last keeps the
-- never-read KBs out of the way of it.
create index if not exists knowledge_bases_last_reader_view_at_idx
  on public.knowledge_bases (last_reader_view_at desc nulls last);

-- ---------------------------------------------------------------------------
-- reader_ping — the only reader RPC that writes to knowledge_bases
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER, callable by anon, with a client-supplied id. The WHERE clause IS the
-- entire security model, so it is written to be readable in one screen:
--
--   * it can touch exactly two counter columns, and nothing else on the row;
--   * only on a KB whose CONTENT is already publicly readable;
--   * it returns void — an anon caller learns nothing from calling it, not even whether the
--     id existed. A random uuid and a paused help center are the same silent no-op.
--
-- On the gate. reader_kb's WHERE is `(kb.subdomain = p_key or (kb.custom_domain = p_key and
-- kb.domain_status = 'live'))` — that is hostname RESOLUTION, and it cannot be mirrored by a
-- function keyed on kb_id. It is also not a visibility condition: every KB is trigger-issued
-- a subdomain at insert (0005), so every KB resolves. The condition that actually decides
-- whether a reader can see anything is `offline_at is null`, which reader_kb itself carried
-- until 0025 split "resolves" from "has content", and which all three content RPCs
-- (reader_articles / reader_article / reader_search) still carry verbatim. That is what is
-- copied here: if those three would return nothing, this records nothing.
--
-- Deliberately NOT gated on `is_published`. reader_kb does not look at it either, and the
-- only writer is worker/domain.py, which sets it when a CUSTOM DOMAIN goes live — so 5 of
-- the 6 KBs live today have it false while being fully readable on their subdomain. Gating
-- on it would count zero for almost every real help center. Flagged rather than reconciled.
--
-- The one-hour debounce is also the abuse ceiling: a single KB cannot exceed 24 increments a
-- day no matter how hard the endpoint is hammered. That is precisely why it is server-side
-- and must not move to the client.
create or replace function public.reader_ping(p_kb_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.knowledge_bases
     set reader_views        = coalesce(reader_views, 0) + 1,
         last_reader_view_at = now()
   where id = p_kb_id
     and offline_at is null
     and (last_reader_view_at is null
          or last_reader_view_at < now() - interval '1 hour');
end;
$$;

revoke all on function public.reader_ping(uuid) from public;
grant execute on function public.reader_ping(uuid) to anon, authenticated;

-- KNOWN, INTENDED SIDE EFFECT — 0013 predicted this one by name.
--
-- sync_kb_subdomain() stops the subdomain following the KB name once `old.reader_views > 0`,
-- and 0013 recorded that as a dormant rule: "this rule turns the second half of the
-- protection on by itself the moment reader_views starts counting". This is that moment. An
-- address someone has actually read is now frozen against a rename, as designed — but the
-- real fix 0013 wanted (retired subdomains kept as permanent aliases, so nothing ever needs
-- freezing) is still deferred, and the trigger cannot tell the owner's own visit to their
-- published site from a customer's.
