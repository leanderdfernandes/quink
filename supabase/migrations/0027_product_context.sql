-- Two-tier context (slice 3b).
--
-- Today every context field the user types is PER RUN: product name, audience, tone and
-- description are asked again on every upload, and the run that matters most — the second
-- one, when they already trust the product — gets the same generic form as the first. The
-- product half of that never changes between recordings, so it belongs on the help center.
--
-- The split is by WHO IT DESCRIBES, not by how often it changes:
--   product tier   — the thing being documented. Lives here, reused by every run.
--   recording tier — what THIS video shows. Per file, optional, never stored on the KB.
--
-- NOT `about`. `knowledge_bases.about` already exists, is returned by reader_kb(), and is
-- rendered on the public help center: it is READER-facing prose. These four are MODEL-facing
-- grounding, injected into the Stage 1 prompt and never shown to anyone. Unifying them would
-- mean either publishing prompt notes to customers or grounding the model on marketing copy.
-- Prefilling `about` from product_description on a first save is fine and is a UI choice.
--
-- These travel with the KB through claim_kb(), deliberately, exactly like theming (0016):
-- they describe the help center's subject matter, not its owner's entitlements. Do NOT add
-- them to that function's reset list.

alter table public.knowledge_bases
  add column product_name        text not null default '',
  add column product_description text not null default '',
  add column audience            text not null default '',
  add column tone                text not null default '';

comment on column public.knowledge_bases.product_name is
  'Model-facing product grounding, reused as the default for every run in this KB. NOT reader-facing — that is `about`, which reader_kb() returns and the public site renders.';
comment on column public.knowledge_bases.product_description is
  'What the product does, for Stage 1 grounding. Never rendered to readers.';

-- No policy changes: knowledge_bases is already owner-or-admin for all operations (0015),
-- and reader_kb() returns an explicit column list, so these four cannot leak into the
-- reader projection by being added here.
