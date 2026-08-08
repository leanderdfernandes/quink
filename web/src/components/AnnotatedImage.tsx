import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  contrastInk,
  endsOf,
  fontSizeFor,
  rectOf,
  type Natural,
  type Rect,
} from '../lib/annotations'
import type { Annotation } from '../lib/types'

// A screenshot and the shapes drawn on it, as ONE box. Every surface uses this — the step
// card at rest, the step card in annotate mode, and the reader. Computed twice, it diverges.
//
// THE BUG THIS EXISTS TO KILL. The overlay used a fixed viewBox with
// preserveAspectRatio="none", which is only correct when the overlay's box happens to have
// the image's exact aspect ratio. Anywhere the image sat in a fixed-ratio container while
// the shapes were drawn against a natural-ratio one, the SVG scaled non-uniformly: positions
// drifted, circles went elliptical, strokes came out thicker on one axis than the other, and
// text squashed. Two surfaces rendering the same shapes at two different ratios was the
// whole cause.
//
// The fix is structural rather than arithmetic:
//   1. the wrapper SHRINK-WRAPS the image (width:fit-content), so the box is the image's box
//   2. the overlay is inset:0 on that box, so overlay box === rendered image box, always
//   3. viewBox is the image's NATURAL pixel size, read once on load
//   4. preserveAspectRatio is left at its default — with (1) and (2) the ratios are already
//      identical, and the default degrades by letterboxing UNIFORMLY if anything ever breaks
//      that, which keeps a circle a circle instead of silently distorting it
//
// Nothing here measures the rendered size or watches for resizes. The box cannot disagree
// with the image because it is derived from it.

export const ARROW_MARKER_ID = 'quink-arrowhead'

const STROKE = 4

export type { Natural } from '../lib/annotations'

// Geometry lives in lib/annotations — the editor's handles, this renderer and the reader all
// read a shape through the same two accessors, so a legacy row can never render one way here
// and another way there.
function rotAbout(a: Annotation, r: Rect, nat: Natural): string | undefined {
  if (!a.rot) return undefined
  const cx = (r.x + r.w / 2) * nat.w
  const cy = (r.y + r.h / 2) * nat.h
  return `rotate(${a.rot} ${cx} ${cy})`
}

export function Shape({ a, nat }: { a: Annotation; nat: Natural }) {
  // vector-effect keeps a stroke the same weight on both axes no matter what the transform
  // does — the belt to the braces above.
  const stroke = {
    stroke: a.c,
    strokeWidth: STROKE,
    vectorEffect: 'non-scaling-stroke' as const,
    fill: 'none',
  }

  if (a.t === 'arrow') {
    const e = endsOf(a)
    return (
      <line
        x1={e.x1 * nat.w}
        y1={e.y1 * nat.h}
        x2={e.x2 * nat.w}
        y2={e.y2 * nat.h}
        strokeLinecap="round"
        markerEnd={`url(#${ARROW_MARKER_ID})`}
        {...stroke}
      />
    )
  }

  const r = rectOf(a, nat)
  const x = r.x * nat.w
  const y = r.y * nat.h
  const w = r.w * nat.w
  const h = r.h * nat.h

  switch (a.t) {
    case 'box':
      return <rect x={x} y={y} width={w} height={h} rx={6} {...stroke} />
    case 'ellipse':
      return (
        <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...stroke} />
      )
    case 'text': {
      // A SOLID FILL behind the type, and the type flipped to whatever survives on it.
      // Coloured text alone reads fine on a pale screenshot and vanishes on a dark one, and
      // which of the two a recording shows is not something the author should have to think
      // about. See contrastInk.
      const fs = fontSizeFor(r, nat)
      return (
        <g transform={rotAbout(a, r, nat)}>
          <rect x={x} y={y} width={w} height={h} rx={Math.min(h * 0.28, w / 2)} fill={a.c} />
          <text
            x={x + w / 2}
            y={y + h / 2}
            fill={contrastInk(a.c)}
            fontFamily="'Hanken Grotesk', system-ui, sans-serif"
            // Derived from the box height, never set independently — this is what makes a
            // scale proportional instead of a stretch.
            fontSize={fs}
            fontWeight={700}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {a.text ?? ''}
          </text>
        </g>
      )
    }
    default:
      return null
  }
}

// The invisible hit target. Same geometry as the shape, drawn with a wide transparent
// stroke — so the clickable area is generous while the visible line stays 4px.
function HitArea({ a, nat }: { a: Annotation; nat: Natural }) {
  const hit = {
    stroke: 'transparent',
    strokeWidth: 22,
    vectorEffect: 'non-scaling-stroke' as const,
    fill: 'none',
  }
  if (a.t === 'arrow') {
    const e = endsOf(a)
    return (
      <line x1={e.x1 * nat.w} y1={e.y1 * nat.h} x2={e.x2 * nat.w} y2={e.y2 * nat.h} {...hit} />
    )
  }
  const r = rectOf(a, nat)
  const x = r.x * nat.w
  const y = r.y * nat.h
  const w = r.w * nat.w
  const h = r.h * nat.h
  // Text is a filled label, so its INSIDE is the target — unlike an open box, where a click
  // in the middle correctly deselects.
  if (a.t === 'text')
    return (
      <g transform={rotAbout(a, r, nat)}>
        <rect x={x} y={y} width={w} height={h} fill="transparent" stroke="none" />
      </g>
    )
  if (a.t === 'box') return <rect x={x} y={y} width={w} height={h} rx={6} {...hit} />
  return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...hit} />
}

// `context-stroke` makes the head inherit each arrow's own colour, so one definition serves
// every swatch instead of one per colour.
export const ArrowDefs = () => (
  <defs>
    <marker
      id={ARROW_MARKER_ID}
      viewBox="0 0 10 10"
      refX="8"
      refY="5"
      markerWidth="4.5"
      markerHeight="4.5"
      orient="auto-start-reverse"
    >
      <path d="M0 0.6L9 5L0 9.4z" fill="context-stroke" />
    </marker>
  </defs>
)

type Props = {
  src: string
  alt: string
  annotations: Annotation[] | null | undefined
  className?: string
  // Annotate mode. The overlay stops being decoration and starts taking pointers — the
  // reader's copy must never do this, which is why it is opt-in rather than a default.
  drawing?: boolean
  // Rendered inside the same <svg>, in the same coordinate space: the in-progress shape and
  // the selection box. Kept here so a draft can never be drawn against different maths than
  // a committed shape.
  overlay?: (nat: Natural) => ReactNode
  onPointerDown?: (e: ReactPointerEvent) => void
  onPointerMove?: (e: ReactPointerEvent) => void
  onPointerUp?: (e: ReactPointerEvent) => void
  // Toolbar, text input — anything positioned against the image box rather than the page.
  children?: ReactNode
  onNatural?: (n: Natural) => void
}

export default function AnnotatedImage({
  src,
  alt,
  annotations,
  className,
  drawing = false,
  overlay,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  children,
  onNatural,
}: Props) {
  const [nat, setNat] = useState<Natural | null>(null)
  const shapes = annotations ?? []

  return (
    <div
      className={`aimg${drawing ? ' drawing' : ''}${className ? ` ${className}` : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        decoding="async"
        onLoad={(e) => {
          const el = e.currentTarget
          const next = { w: el.naturalWidth, h: el.naturalHeight }
          if (!next.w || !next.h) return
          setNat(next)
          onNatural?.(next)
        }}
      />

      {/* Nothing renders until the natural size is known: drawing against a guessed ratio
          for one frame is exactly the flicker-then-jump this component removes. */}
      {nat && (shapes.length > 0 || drawing) && (
        <svg className="aimg-layer" viewBox={`0 0 ${nat.w} ${nat.h}`} aria-hidden>
          <ArrowDefs />
          {shapes.map((a, i) => (
            <g key={i} data-i={i} className="aimg-hit">
              <Shape a={a} nat={nat} />
              {/* A 4px line is a 4px hit target, which is not a target. While drawing, an
                  invisible fat stroke sits under each open shape so selecting an arrow is a
                  click rather than a game. Never rendered on the reader, where the overlay
                  takes no pointers at all. Text is included now that it can be moved and
                  scaled — it used to be unselectable, which was fine when it was also
                  immovable. */}
              {drawing && <HitArea a={a} nat={nat} />}
            </g>
          ))}
          {overlay?.(nat)}
        </svg>
      )}

      {children}
    </div>
  )
}
