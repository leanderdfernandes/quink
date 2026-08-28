-- How strongly the brand washes into secondary surfaces, as its own control.
--
-- WHAT THIS IS NOT. There was a `tint` before — one of four masthead TREATMENTS from
-- migration 0024 (`header_style in ('solid','ink','tint','image')`), removed from the
-- picker because the design system says the band is a flat brand fill and a tint mixed
-- toward paper goes grey for any desaturated customer colour. 0024's own header says the
-- same thing. That stored value still renders; it resolves to `solid`.
--
-- This is a different thing that happens to share a word: a scalar, independent of
-- `primary_color`, controlling the `--brand-tint` / `--brand-wash` end of the ramp — the
-- quiet brand-in-paper surfaces behind cards, rows and the search field. It has never
-- existed. (OPEN-ITEMS H4 records both, so the next reader does not conflate them either.)
--
-- WHY A PERCENT AND NOT A HEX. It is a strength, not a colour. Storing a second hex would
-- let the two drift apart — a customer could set a brand of teal and a wash of pink — and
-- the whole premise of this theming system is that ONE stored colour drives every shade
-- (0024, reader/theme.ts). A percentage keeps that true.
--
-- NO `create or replace` on anything: this migration adds a column and nothing else.

-- COLUMN ADDITION, STATED: knowledge_bases gains `brand_wash smallint`.
--
-- 9 is the design system's own value for --brand-tint (tokens/colors.css mixes the brand at
-- 9% into --bg), so an existing help center that never touches this control renders exactly
-- as it does today. The range is enforced by a CHECK rather than by the input: 0 is "no
-- wash at all, plain neutral surfaces", 30 is as far as a tint can go before it stops being
-- a background and starts competing with the content on it.
alter table public.knowledge_bases
  add column brand_wash smallint not null default 9
    check (brand_wash between 0 and 30);

comment on column public.knowledge_bases.brand_wash is
  'How strongly --brand mixes into secondary surfaces, in percent (0-30, default 9). Independent of primary_color, which stays the one stored COLOUR. Consumed by reader/theme.ts to build --brand-tint and --brand-wash. Not the retired header_style=tint, which was a masthead treatment.';

-- The theming screen writes this the same way it writes primary_color and font_pairing: a
-- direct, column-scoped UPDATE (0035 narrowed the grant to sixteen columns; this makes
-- seventeen). It is not owner-only — theming is something that MAKES ARTICLES look right
-- and is editor-gated like the rest of that class (§10j) — and it is not a money or
-- identity column, so it does not need the RPC treatment product_context has.
grant update (brand_wash) on public.knowledge_bases to authenticated;
