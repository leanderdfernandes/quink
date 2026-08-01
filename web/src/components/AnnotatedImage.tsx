import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
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

// Reference width the shape constants are expressed against. Anything sized in user units
// is scaled by naturalWidth/REF so it occupies the same fraction of the picture whatever the
// recording's resolution was.
const REF_W = 1000
const STROKE = 4
const TEXT_SIZE = 27

export type Natural = { w: number; h: number }

export function Shape({ a, nat }: { a: Annotation; nat: Natural }) {
  const x1 = a.x1 * nat.w
  const y1 = a.y1 * nat.h
  const x2 = (a.x2 ?? a.x1) * nat.w
  const y2 = (a.y2 ?? a.y1) * nat.h
  // vector-effect keeps a stroke the same weight on both axes no matter what the transform
  // does — the belt to the braces above.
  const stroke = {
    stroke: a.c,
    strokeWidth: STROKE,
    vectorEffect: 'non-scaling-stroke' as const,
    fill: 'none',
  }

  switch (a.t) {
    case 'arrow':
      return (
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          strokeLinecap="round"
          markerEnd={`url(#${ARROW_MARKER_ID})`}
          {...stroke}
        />
      )
    case 'box':
      return (
        <rect
          x={Math.min(x1, x2)}
          y={Math.min(y1, y2)}
          width={Math.abs(x2 - x1)}
          height={Math.abs(y2 - y1)}
          rx={6}
          {...stroke}
        />
      )
    case 'ellipse':
      return (
        <ellipse
          cx={(x1 + x2) / 2}
          cy={(y1 + y2) / 2}
          rx={Math.abs(x2 - x1) / 2}
          ry={Math.abs(y2 - y1) / 2}
          {...stroke}
        />
      )
    case 'text':
      return (
        <text
          x={x1}
          y={y1}
          fill={a.c}
          fontFamily="'Hanken Grotesk', system-ui, sans-serif"
          // Scaled to the picture, not to the pixel grid: a 27u label on a 1000px-wide
          // recording and on a 2560px-wide one must cover the same share of the screenshot.
          fontSize={TEXT_SIZE * (nat.w / REF_W)}
          fontWeight={700}
          dominantBaseline="hanging"
        >
          {a.text ?? ''}
        </text>
      )
    default:
      return null
  }
}

// The invisible hit target. Same geometry as the shape, drawn with a wide transparent
// stroke — so the clickable area is generous while the visible line stays 4px.
function HitArea({ a, nat }: { a: Annotation; nat: Natural }) {
  const x1 = a.x1 * nat.w
  const y1 = a.y1 * nat.h
  const x2 = (a.x2 ?? a.x1) * nat.w
  const y2 = (a.y2 ?? a.y1) * nat.h
  const hit = {
    stroke: 'transparent',
    strokeWidth: 22,
    vectorEffect: 'non-scaling-stroke' as const,
    fill: 'none',
  }
  if (a.t === 'arrow') return <line x1={x1} y1={y1} x2={x2} y2={y2} {...hit} />
  if (a.t === 'box')
    return (
      <rect
        x={Math.min(x1, x2)}
        y={Math.min(y1, y2)}
        width={Math.abs(x2 - x1)}
        height={Math.abs(y2 - y1)}
        rx={6}
        {...hit}
      />
    )
  return (
    <ellipse
      cx={(x1 + x2) / 2}
      cy={(y1 + y2) / 2}
      rx={Math.abs(x2 - x1) / 2}
      ry={Math.abs(y2 - y1) / 2}
      {...hit}
    />
  )
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
                  takes no pointers at all. */}
              {drawing && a.t !== 'text' && <HitArea a={a} nat={nat} />}
            </g>
          ))}
          {overlay?.(nat)}
        </svg>
      )}

      {children}
    </div>
  )
}
