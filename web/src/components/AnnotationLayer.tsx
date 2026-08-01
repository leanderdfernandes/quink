import type { Annotation } from '../lib/types'

// The overlay, rendered identically by the editor and the reader from this one component.
//
// Two renderers would be two ways for a published article to look different from the draft
// that produced it — and the draft is the one the author checked. So the editor's canvas
// mounts this inside its drawing surface, and the reader mounts it over the published
// image, and neither owns a copy of how a shape looks.
//
// Coordinates are NORMALIZED 0-1 against the image's own box. The SVG uses a fixed viewBox
// with preserveAspectRatio="none", so the layer stretches to whatever size the image is
// rendered at without any measurement, at any breakpoint, with no resize observer.

// The viewBox is arbitrary — only the RATIO of stroke width to it is meaningful, and
// non-uniform scaling means a 16:9 box keeps strokes visually even. 1000 wide is enough
// resolution that rounding at three decimals is invisible.
const VB_W = 1000
const VB_H = 562
const STROKE = 4
const TEXT_SIZE = 27

export const ARROW_MARKER_ID = 'quink-arrowhead'

const x = (n: number) => n * VB_W
const y = (n: number) => n * VB_H

// One shape. Exported so the editor can reuse it for the in-progress draft without
// duplicating any geometry — a shape must look the same while being drawn as after.
export function Shape({ a }: { a: Annotation }) {
  const x1 = x(a.x1)
  const y1 = y(a.y1)
  const x2 = x(a.x2 ?? a.x1)
  const y2 = y(a.y2 ?? a.y1)

  switch (a.t) {
    case 'arrow':
      return (
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={a.c}
          strokeWidth={STROKE}
          strokeLinecap="round"
          markerEnd={`url(#${ARROW_MARKER_ID})`}
          vectorEffect="non-scaling-stroke"
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
          fill="none"
          stroke={a.c}
          strokeWidth={STROKE}
          vectorEffect="non-scaling-stroke"
        />
      )
    case 'ellipse':
      return (
        <ellipse
          cx={(x1 + x2) / 2}
          cy={(y1 + y2) / 2}
          rx={Math.abs(x2 - x1) / 2}
          ry={Math.abs(y2 - y1) / 2}
          fill="none"
          stroke={a.c}
          strokeWidth={STROKE}
          vectorEffect="non-scaling-stroke"
        />
      )
    case 'text':
      return (
        <text
          x={x1}
          y={y1}
          fill={a.c}
          fontFamily="'Hanken Grotesk', system-ui, sans-serif"
          fontSize={TEXT_SIZE}
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

// `context-stroke` makes the head inherit each arrow's own colour, so one marker serves
// every colour instead of one marker definition per swatch.
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

export default function AnnotationLayer({
  annotations,
  className,
}: {
  annotations: Annotation[] | null | undefined
  className?: string
}) {
  const shapes = annotations ?? []
  if (!shapes.length) return null
  return (
    <svg
      className={className ?? 'anno-layer'}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <ArrowDefs />
      {shapes.map((a, i) => (
        <Shape key={i} a={a} />
      ))}
    </svg>
  )
}
