import { useCallback, useEffect, useRef, useState } from 'react'
import AnnotationLayer, { ArrowDefs, Shape } from '../components/AnnotationLayer'
import type { Annotation } from '../lib/types'

// The drawing surface (slice 4).
//
// The interaction model is settled and taken from the prototype unchanged: drag to draw,
// click to select, drag to move, and the tool SNAPS BACK to Select after every shape. That
// last one is the opinionated part — most steps get one shape, and optimising for drawing
// five in a row would make the common case a two-step action every time.
//
// Four tools and a colour. No stroke weight, no fill, no opacity, no freehand, no layers:
// this is a repair tool for pointing at a button, not an illustration app, and every control
// it doesn't have is a decision the author doesn't have to make.
//
// NO BLUR, deliberately (4c) — see migration 0029. A blur has to be flattened into a
// derivative image, and the frames bucket is public, so that derivative would sit next to a
// readable original at a predictable path. A redaction tool that doesn't redact is worse
// than none, because people trust it.
//
// There is no Save button (4e): Done commits to local state and rides the editor's existing
// 700ms autosave. Cancel discards. Nothing refetches and nothing remounts.

type Tool = 'select' | 'arrow' | 'box' | 'ellipse' | 'text'

type Props = {
  imageUrl: string
  annotations: Annotation[]
  // The KB's brand colour — the DEFAULT, so the common case is zero decisions and the
  // result is on-brand without anyone choosing to make it so.
  brandColor: string
  onDone: (annotations: Annotation[]) => void
  onCancel: () => void
}

// Brand first, then four semantic colours. Deliberately the functional palette from the
// design system rather than a picker: five choices that all look intentional beat a spectrum
// where most points look wrong on a screenshot.
const SEMANTIC = [
  { c: '#B23B3B', label: 'Red' },
  { c: '#B4791F', label: 'Amber' },
  { c: '#2F7D57', label: 'Green' },
  { c: '#211F1B', label: 'Ink' },
]

const TOOLS: { t: Tool; key: string; label: string }[] = [
  { t: 'select', key: 'V', label: 'Select' },
  { t: 'arrow', key: 'A', label: 'Arrow' },
  { t: 'box', key: 'B', label: 'Box' },
  { t: 'ellipse', key: 'C', label: 'Circle' },
  { t: 'text', key: 'T', label: 'Text' },
]

// Below this, a drag is a click that wandered — not a shape. Normalized, so it is the same
// physical slop at every render size.
const MIN_DRAG = 0.015

const ToolIcon = ({ t }: { t: Tool }) => {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (t) {
    case 'select':
      return (
        <svg {...common}>
          <path d="M5 3l6.5 16 2.2-6.3L20 10.5z" />
        </svg>
      )
    case 'arrow':
      return (
        <svg {...common}>
          <path d="M6 18L18 6M18 6h-7M18 6v7" />
        </svg>
      )
    case 'box':
      return (
        <svg {...common}>
          <rect x="4" y="6" width="16" height="12" rx="2" />
        </svg>
      )
    case 'ellipse':
      return (
        <svg {...common}>
          <ellipse cx="12" cy="12" rx="8" ry="7" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <path d="M5 6h14M12 6v12M9 18h6" />
        </svg>
      )
  }
}

const round = (n: number) => Math.round(n * 1000) / 1000

export default function Annotator({
  imageUrl,
  annotations,
  brandColor,
  onDone,
  onCancel,
}: Props) {
  const [items, setItems] = useState<Annotation[]>(annotations)
  const [tool, setTool] = useState<Tool>('select')
  const [colour, setColour] = useState(brandColor)
  const [sel, setSel] = useState<number | null>(null)
  const [draft, setDraft] = useState<Annotation | null>(null)
  const [typing, setTyping] = useState<{ x: number; y: number } | null>(null)
  const surface = useRef<HTMLDivElement>(null)
  const drag = useRef<{ px: number; py: number; from: Annotation } | null>(null)
  const textInput = useRef<HTMLInputElement>(null)

  // Pointer -> normalized 0-1 against the image's own box. Clamped: a drag that leaves the
  // surface should stop at the edge rather than store a coordinate off the image.
  const at = useCallback((e: React.PointerEvent) => {
    const r = surface.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    }
  }, [])

  const pick = useCallback(
    (t: Tool) => {
      setTool(t)
      if (t !== 'select') setSel(null)
    },
    [],
  )

  // Changing colour with a shape selected recolours THAT shape. Otherwise it sets the colour
  // for the next one — one control, two obvious jobs, no mode.
  function chooseColour(c: string) {
    setColour(c)
    if (sel !== null) {
      setItems((prev) => prev.map((a, i) => (i === sel ? { ...a, c } : a)))
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (typing) return
    const p = at(e)

    if (tool === 'select') {
      const id = (e.target as SVGElement).getAttribute?.('data-i')
      if (id === null || id === undefined) {
        setSel(null)
        return
      }
      const i = Number(id)
      setSel(i)
      drag.current = { px: p.x, py: p.y, from: items[i] }
      surface.current?.setPointerCapture(e.pointerId)
      return
    }

    if (tool === 'text') {
      setTyping(p)
      return
    }

    setDraft({ t: tool, c: colour, x1: p.x, y1: p.y, x2: p.x, y2: p.y })
    surface.current?.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (draft) {
      const p = at(e)
      setDraft({ ...draft, x2: p.x, y2: p.y })
      return
    }
    if (drag.current && sel !== null) {
      const p = at(e)
      const { px, py, from } = drag.current
      const dx = p.x - px
      const dy = p.y - py
      setItems((prev) =>
        prev.map((a, i) =>
          i === sel
            ? {
                ...a,
                x1: from.x1 + dx,
                y1: from.y1 + dy,
                ...(from.x2 !== undefined
                  ? { x2: from.x2 + dx, y2: (from.y2 ?? 0) + dy }
                  : {}),
              }
            : a,
        ),
      )
    }
  }

  function onPointerUp() {
    if (draft) {
      const big =
        Math.abs((draft.x2 ?? 0) - draft.x1) > MIN_DRAG ||
        Math.abs((draft.y2 ?? 0) - draft.y1) > MIN_DRAG
      if (big) {
        setItems((prev) => [
          ...prev,
          {
            ...draft,
            x1: round(draft.x1),
            y1: round(draft.y1),
            x2: round(draft.x2 ?? draft.x1),
            y2: round(draft.y2 ?? draft.y1),
          },
        ])
        setSel(items.length)
      }
      setDraft(null)
      // Snaps back after every shape. One shape is the common case.
      setTool('select')
    }
    drag.current = null
  }

  function commitText(value: string) {
    const v = value.trim()
    if (v && typing) {
      setItems((prev) => [
        ...prev,
        { t: 'text', c: colour, x1: round(typing.x), y1: round(typing.y), text: v },
      ])
    }
    setTyping(null)
    setTool('select')
  }

  const remove = useCallback(() => {
    if (sel === null) return
    setItems((prev) => prev.filter((_, i) => i !== sel))
    setSel(null)
  }, [sel])

  // V A B C T · Delete · Escape. Escape backs out one layer at a time — first a selection,
  // then the tool, then the whole surface — so it never throws away work in one keystroke.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return
      const k = e.key.toLowerCase()
      const map: Record<string, Tool> = {
        v: 'select',
        a: 'arrow',
        b: 'box',
        c: 'ellipse',
        t: 'text',
      }
      if (map[k]) {
        pick(map[k])
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel !== null) {
        e.preventDefault()
        remove()
        return
      }
      if (e.key === 'Escape') {
        if (sel !== null) setSel(null)
        else if (tool !== 'select') setTool('select')
        else onCancel()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [sel, tool, pick, remove, onCancel])

  useEffect(() => {
    if (typing) textInput.current?.focus()
  }, [typing])

  const selected = sel === null ? null : items[sel]

  return (
    <div className="anno">
      <div className="anno-bar">
        <div className="anno-tools" role="toolbar" aria-label="Annotation tools">
          {TOOLS.map((t) => (
            <button
              key={t.t}
              type="button"
              className="anno-tool"
              aria-pressed={tool === t.t}
              title={`${t.label} (${t.key})`}
              onClick={() => pick(t.t)}
            >
              <ToolIcon t={t.t} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <div className="anno-colours" role="group" aria-label="Colour">
          <button
            type="button"
            className="anno-sw"
            aria-pressed={colour === brandColor}
            title="Your brand colour"
            style={{ background: brandColor }}
            onClick={() => chooseColour(brandColor)}
          />
          {SEMANTIC.map((s) => (
            <button
              key={s.c}
              type="button"
              className="anno-sw"
              aria-pressed={colour === s.c}
              title={s.label}
              style={{ background: s.c }}
              onClick={() => chooseColour(s.c)}
            />
          ))}
        </div>

        <div className="anno-acts">
          <button
            type="button"
            className="anno-del"
            disabled={sel === null}
            onClick={remove}
          >
            Delete shape
          </button>
          <button type="button" className="anno-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="anno-done" onClick={() => onDone(items)}>
            Done
          </button>
        </div>
      </div>

      <div
        ref={surface}
        className={`anno-surface${tool === 'select' ? '' : ' drawing'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <img src={imageUrl} alt="" draggable={false} />

        {/* The committed shapes, drawn by the SAME component the reader uses — so what is
            being edited here is literally what will be published. */}
        <svg className="anno-layer" viewBox="0 0 1000 562" preserveAspectRatio="none">
          <ArrowDefs />
          {items.map((a, i) => (
            <g key={i} data-i={i} className="anno-hit">
              <Shape a={a} />
            </g>
          ))}
          {draft && <Shape a={draft} />}
          {selected && <SelectionBox a={selected} />}
        </svg>

        {typing && (
          <input
            ref={textInput}
            className="anno-text-in"
            placeholder="Type…"
            style={{
              left: `${typing.x * 100}%`,
              top: `${typing.y * 100}%`,
              color: colour,
            }}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') commitText(e.currentTarget.value)
              if (e.key === 'Escape') {
                setTyping(null)
                setTool('select')
              }
            }}
            onBlur={(e) => commitText(e.currentTarget.value)}
          />
        )}
      </div>

      <p className="anno-hint">
        {tool === 'select'
          ? sel !== null
            ? 'Drag to move · Delete to remove'
            : 'Click a shape to select it'
          : tool === 'text'
            ? 'Click where the text should go'
            : 'Drag to draw'}
      </p>
    </div>
  )
}

// The selection affordance. A dashed inset rather than handles: there is no resize, so
// handles would advertise something that does not exist.
function SelectionBox({ a }: { a: Annotation }) {
  const x1 = a.x1 * 1000
  const y1 = a.y1 * 562
  const x2 = (a.x2 ?? a.x1) * 1000
  const y2 = (a.y2 ?? a.y1) * 562
  const box =
    a.t === 'text'
      ? { x: x1 - 8, y: y1 - 6, w: (a.text?.length ?? 0) * 15 + 16, h: 38 }
      : {
          x: Math.min(x1, x2) - 9,
          y: Math.min(y1, y2) - 9,
          w: Math.abs(x2 - x1) + 18,
          h: Math.abs(y2 - y1) + 18,
        }
  return (
    <rect
      className="anno-sel"
      x={box.x}
      y={box.y}
      width={box.w}
      height={box.h}
      rx={6}
      pointerEvents="none"
    />
  )
}

export { AnnotationLayer }
