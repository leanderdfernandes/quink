-- Non-destructive annotations on a step's screenshot (slice 4).
--
-- A JSONB ARRAY of shapes in NORMALIZED 0-1 coordinates, rendered as an SVG overlay by one
-- shared component in both the editor and the reader. Nothing is ever written into the
-- image: the stored WebP is never modified, never re-encoded, never copied.
--
-- Why normalized and not pixels: the same frame renders at a different width in the editor
-- canvas, the reader's article measure, and a phone. Pixel coordinates would need the
-- image's natural size stored alongside them and would still drift the first time anything
-- about the layout changed. 0-1 against the image's own box is the only form that survives.
--
-- Shape payload (settled — matches the prototype byte for byte):
--   { "t": "arrow"|"box"|"ellipse", "c": "#RRGGBB", "x1":n, "y1":n, "x2":n, "y2":n }
--   { "t": "text",                  "c": "#RRGGBB", "x1":n, "y1":n, "text": "..." }
--
-- NO BLUR, deliberately (4c). A blur would have to be flattened into a derivative image, and
-- the frames bucket is PUBLIC (migration 0007) — so that derivative would sit next to a
-- publicly addressable UNREDACTED original at a predictable path, which is worse than no
-- redaction tool at all because it looks like one. Blur ships after a bucket split.

alter table public.steps
  add column annotations jsonb not null default '[]'::jsonb;

comment on column public.steps.annotations is
  'Non-destructive SVG overlay shapes in normalized 0-1 coordinates. The underlying image object is never modified. Empty array = no annotations. NO blur shapes: the frames bucket is public, so a flattened redaction would sit beside a readable original (see 0007).';

-- NOTE for whoever adds the next column to this table: `steps` is plain row-level RLS, not
-- a column allowlist like `jobs` (0020). Anything added here lands in the client's
-- `select('*')` immediately. That is correct for annotations — the reader has to render
-- them — but it is not automatic, and it is worth checking before adding a column that
-- should not be public.
