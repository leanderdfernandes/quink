import type { Annotation } from './types'

// Annotation GEOMETRY. One module, used by the editor's handles, the shape renderer and the
// reader — the same rule the rest of this codebase follows for anything computed twice.
//
// TWO SPACES, and confusing them is the whole class of bug this file exists to prevent:
//
//   NORMALISED (0–1)  is what we STORE. It is the only form that survives the step card
//                     being narrowed, the reader's measure, and a phone.
//   NATURAL PIXELS    is what we COMPUTE IN. It is the SVG's viewBox — the recording's own
//                     pixel size — so it is resolution-independent AND square: one unit of x
//                     is one unit of y.
//
// Rotation must happen in natural-pixel space. Normalised x and y have different scales
// (they divide by nat.w and nat.h), so rotating a normalised offset shears it: a square
// turned 45° comes out a rhombus, and handles drift off the corners they belong to.
//
// The public functions all take `nat` and return normalised, so callers never hold pixels
// for longer than one expression.

export type Natural = { w: number; h: number }

// A normalised axis-aligned box, before rotation. Rotation is stored separately (`rot`) and
// applied about the box CENTRE — never baked into x/y/w/h, or resizing a rotated shape would
// have to un-bake it first.
export type Rect = { x: number; y: number; w: number; h: number }

// Reference width the size constants below are expressed against, mirroring
// AnnotatedImage. A shape must occupy the same share of a 1000px recording and a 2560px one.
export const REF_W = 1000
export const TEXT_SIZE = 27

// Roughly 1.5% of the image on either axis. Below this a shape is invisible but still
// selectable, which is worse than not existing: the user sees nothing and cannot get rid of
// what they cannot see.
export const MIN_SIZE = 0.015

// How much taller the text's box is than its font size — the padding that makes the fill
// behind the type read as a label rather than a tight crop. Load-bearing: the font size is
// DERIVED from the box height through this, which is what keeps type from stretching when
// the box is scaled.
const TEXT_BOX_RATIO = 1.44

export const round = (n: number) => Math.round(n * 1000) / 1000

export const isRectShape = (t: Annotation['t']) => t !== 'arrow'

// --- rotation ---------------------------------------------------------------------
// Both take and return PIXEL offsets from a centre. Feeding these normalised values is the
// mistake described at the top of the file.

export function rotatePx(dx: number, dy: number, deg: number): { x: number; y: number } {
  if (!deg) return { x: dx, y: dy }
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return { x: dx * c - dy * s, y: dx * s + dy * c }
}

// --- text measurement -------------------------------------------------------------
// A text annotation's box has to hug its string, or the handles sit in empty space. Measured
// once per string at a reference size and scaled — advance width is linear in font size, so
// one measurement covers every zoom level.

const MEASURE_AT = 100
const FONT_STACK = "'Hanken Grotesk', system-ui, sans-serif"
let measureCtx: CanvasRenderingContext2D | null = null
const widthCache = new Map<string, number>()

export function textWidthPx(text: string, fontSizePx: number): number {
  let per = widthCache.get(text)
  if (per === undefined) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
    if (!measureCtx) return text.length * 0.55 * fontSizePx // canvas unavailable: estimate
    measureCtx.font = `700 ${MEASURE_AT}px ${FONT_STACK}`
    per = measureCtx.measureText(text).width / MEASURE_AT
    widthCache.set(text, per)
  }
  return per * fontSizePx
}

// The font size a text box of this height renders at. The ONLY place the two are related,
// so scaling a box can never stretch the type — the type is a function of the box.
export const fontSizeFor = (r: Rect, nat: Natural) => (r.h * nat.h) / TEXT_BOX_RATIO

// --- the accessors ------------------------------------------------------------------
// Every consumer goes through these, which is what lets the stored shape change without a
// migration. Shapes written before this pass stored two CORNERS (x1,y1,x2,y2) — a box is now
// an origin and a size, because that is the form resize and rotation both need. Legacy rows
// are upgraded on read and rewritten in the new form the first time they are touched; there
// is no migration because `annotations` is jsonb and this is the only reader.

export function rectOf(a: Annotation, nat: Natural): Rect {
  if (a.w !== undefined && a.h !== undefined) {
    return { x: a.x ?? 0, y: a.y ?? 0, w: a.w, h: a.h }
  }
  // Legacy text: a bare point, drawn at a fixed size. Rebuild the box it implied so it lands
  // exactly where it always did.
  if (a.t === 'text') {
    const fs = TEXT_SIZE * (nat.w / REF_W)
    const h = (fs * TEXT_BOX_RATIO) / nat.h
    const w = (textWidthPx(a.text ?? '', fs) + fs * 0.7) / nat.w
    return { x: a.x1 ?? 0, y: a.y1 ?? 0, w, h }
  }
  // Legacy box/ellipse: two corners, in either order.
  const x1 = a.x1 ?? 0
  const y1 = a.y1 ?? 0
  const x2 = a.x2 ?? x1
  const y2 = a.y2 ?? y1
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  }
}

export function endsOf(a: Annotation): { x1: number; y1: number; x2: number; y2: number } {
  return { x1: a.x1 ?? 0, y1: a.y1 ?? 0, x2: a.x2 ?? a.x1 ?? 0, y2: a.y2 ?? a.y1 ?? 0 }
}

// Write a rect back onto a shape in the CURRENT form, dropping the legacy corner fields so a
// row can never carry both and leave the next reader guessing which one is true.
export function withRect(a: Annotation, r: Rect): Annotation {
  const next: Annotation = {
    ...a,
    x: round(r.x),
    y: round(r.y),
    w: round(r.w),
    h: round(r.h),
  }
  delete next.x1
  delete next.y1
  delete next.x2
  delete next.y2
  return next
}

// --- handles --------------------------------------------------------------------------
// An arrow is two points, not a box: giving it a bounding box and eight handles would invite
// a resize gesture that has no meaning for it. Text is proportional, so it gets corners only
// — an edge handle on proportional text is a control that lies about what it does.

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rot' | 'p1' | 'p2'

// Direction of each handle from the box centre, in local (unrotated) space.
export const HANDLE_DIR: Record<string, { x: number; y: number }> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
}

const BOX_HANDLES: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const TEXT_HANDLES: HandleId[] = ['nw', 'ne', 'se', 'sw', 'rot']

export function handleIdsFor(a: Annotation): HandleId[] {
  if (a.t === 'arrow') return ['p1', 'p2']
  if (a.t === 'text') return TEXT_HANDLES
  return BOX_HANDLES
}

// How far above the box the rotate handle floats, as a share of the picture's width.
const ROT_ARM = 0.055

export type HandlePoint = { id: HandleId; x: number; y: number }

// Handle positions in NATURAL PIXELS, already rotated. This is the function that keeps
// handles glued to a rotated box: each offset is rotated about the centre in pixel space
// before it is placed, so the corner handles sit on the corners the user can see.
export function handlePoints(a: Annotation, nat: Natural): HandlePoint[] {
  if (a.t === 'arrow') {
    const e = endsOf(a)
    return [
      { id: 'p1', x: e.x1 * nat.w, y: e.y1 * nat.h },
      { id: 'p2', x: e.x2 * nat.w, y: e.y2 * nat.h },
    ]
  }
  const r = rectOf(a, nat)
  const rot = a.rot ?? 0
  const cx = (r.x + r.w / 2) * nat.w
  const cy = (r.y + r.h / 2) * nat.h
  const hw = (r.w * nat.w) / 2
  const hh = (r.h * nat.h) / 2
  return handleIdsFor(a).map((id) => {
    // The rotate handle rides above the box IN THE ROTATED FRAME, so it swings round with
    // it — an axis-aligned rotate handle on a turned box points at nothing.
    const local =
      id === 'rot'
        ? { x: 0, y: -hh - ROT_ARM * nat.w }
        : { x: HANDLE_DIR[id].x * hw, y: HANDLE_DIR[id].y * hh }
    const p = rotatePx(local.x, local.y, rot)
    return { id, x: cx + p.x, y: cy + p.y }
  })
}

// Where the rotate handle's tether meets the box, so the connector line starts on the edge
// rather than at the centre. Rotated with everything else.
export function rotAnchorPx(a: Annotation, nat: Natural): { x: number; y: number } {
  const r = rectOf(a, nat)
  const cx = (r.x + r.w / 2) * nat.w
  const cy = (r.y + r.h / 2) * nat.h
  const p = rotatePx(0, -(r.h * nat.h) / 2, a.rot ?? 0)
  return { x: cx + p.x, y: cy + p.y }
}

// --- resize ---------------------------------------------------------------------------

// Resize a rect shape by dragging `id` to the pointer (given in natural pixels).
//
// THE STEP THAT IS EASY TO MISS is the last one. Computing the new width and height in local
// space is not enough: the box's CENTRE is what x/y derive from, so unless the centre is
// moved to keep the anchor — the corner diagonally opposite the handle — pinned where it was
// on screen, the whole shape crawls away from the cursor as it grows.
export function resizeRect(
  a: Annotation,
  nat: Natural,
  id: HandleId,
  px: number,
  py: number,
): Rect {
  const r0 = rectOf(a, nat)
  const rot = a.rot ?? 0
  const w0 = Math.max(r0.w * nat.w, 1)
  const h0 = Math.max(r0.h * nat.h, 1)
  const c0 = { x: (r0.x + r0.w / 2) * nat.w, y: (r0.y + r0.h / 2) * nat.h }
  const dir = HANDLE_DIR[id] ?? { x: 1, y: 1 }

  // Pointer into the box's own frame: subtract the centre, then apply the INVERSE rotation.
  const local = rotatePx(px - c0.x, py - c0.y, -rot)

  // The anchor, in that same local frame. An edge handle anchors the opposite EDGE (its
  // direction component is 0, so the anchor sits on the centre line and that axis is left
  // alone) — which is exactly what makes width and height independent for a box.
  const anchor = { x: (-dir.x * w0) / 2, y: (-dir.y * h0) / 2 }

  let w1 = dir.x === 0 ? w0 : Math.abs(local.x - anchor.x)
  let h1 = dir.y === 0 ? h0 : Math.abs(local.y - anchor.y)

  // Text scales PROPORTIONALLY, because its font size is a function of its height: letting
  // the axes move independently would squash the type, which is the one thing a caption on a
  // screenshot must never do. Larger of the two factors, so the box follows the cursor on
  // whichever axis the user is actually pulling.
  if (a.t === 'text') {
    const s = Math.max(w1 / w0, h1 / h0)
    w1 = w0 * s
    h1 = h0 * s
  }

  w1 = Math.max(w1, MIN_SIZE * nat.w)
  h1 = Math.max(h1, MIN_SIZE * nat.h)

  // Pin the anchor: find where it is on screen now, then place the new centre so the anchor
  // lands back on that same point.
  const aRot = rotatePx(anchor.x, anchor.y, rot)
  const anchorScreen = { x: c0.x + aRot.x, y: c0.y + aRot.y }
  const off = rotatePx((dir.x * w1) / 2, (dir.y * h1) / 2, rot)
  const c1 = { x: anchorScreen.x + off.x, y: anchorScreen.y + off.y }

  return {
    x: (c1.x - w1 / 2) / nat.w,
    y: (c1.y - h1 / 2) / nat.h,
    w: w1 / nat.w,
    h: h1 / nat.h,
  }
}

// The rotation gesture. Angle from the box centre to the pointer, in pixel space; +90 because
// the handle's rest position is straight up, whose atan2 is -90.
export function angleTo(cxPx: number, cyPx: number, px: number, py: number, snap: boolean) {
  const deg = (Math.atan2(py - cyPx, px - cxPx) * 180) / Math.PI + 90
  const norm = ((deg % 360) + 360) % 360
  return snap ? Math.round(norm / 15) * 15 : Math.round(norm)
}

// --- clamping ---------------------------------------------------------------------------

// Keep a shape on the picture. The bounds are the ROTATED extent, computed from the four
// rotated corners in pixel space — clamping the unrotated box would let a turned label hang
// off the edge by its corner.
//
// A shape larger than the image is centred rather than fought: there is no position that
// satisfies both edges, and pinning it to one of them looks like a bug.
export function clampRect(r: Rect, rot: number, nat: Natural): Rect {
  const hw = (r.w * nat.w) / 2
  const hh = (r.h * nat.h) / 2
  let ex = hw
  let ey = hh
  if (rot) {
    const c = Math.abs(Math.cos((rot * Math.PI) / 180))
    const s = Math.abs(Math.sin((rot * Math.PI) / 180))
    ex = hw * c + hh * s
    ey = hw * s + hh * c
  }
  const exN = ex / nat.w
  const eyN = ey / nat.h
  const cx = exN * 2 >= 1 ? 0.5 : Math.min(1 - exN, Math.max(exN, r.x + r.w / 2))
  const cy = eyN * 2 >= 1 ? 0.5 : Math.min(1 - eyN, Math.max(eyN, r.y + r.h / 2))
  return { x: cx - r.w / 2, y: cy - r.h / 2, w: r.w, h: r.h }
}

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

// --- text legibility --------------------------------------------------------------------
// A coloured caption is readable on a pale screenshot and gone on a dark one. This puts the
// chosen colour behind the type as a solid fill and flips the TYPE to whichever of paper or
// ink survives on it — so legibility stops depending on what the recording happened to show.
//
// Chosen over sampling the pixels underneath because sampling needs the frame drawn into a
// canvas, and the frames are served from another origin: without CORS headers the canvas is
// tainted and getImageData throws, so the fallback path would be doing this anyway.
export function contrastInk(hex: string): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  if (Number.isNaN(n) || full.length !== 6) return '#FFFFFF'
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const L =
    0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  // Against the design system's paper and ink rather than pure white/black.
  return L > 0.42 ? '#211F1B' : '#FAF8F4'
}
