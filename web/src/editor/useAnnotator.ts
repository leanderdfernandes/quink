import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  MIN_SIZE,
  REF_W,
  TEXT_SIZE,
  angleTo,
  clamp01,
  clampRect,
  endsOf,
  handlePoints,
  rectOf,
  resizeRect,
  round,
  textWidthPx,
  withRect,
  type HandleId,
  type Natural,
} from '../lib/annotations'
import type { Annotation } from '../lib/types'

// The annotation interaction model, lifted out of the deleted Annotator.tsx unchanged.
//
// Settled and not up for redesign: drag to draw, click to select, drag to move, tool snaps
// back to Select after every shape, V A B C T / Delete / Escape, colour defaults to the KB's
// brand and recolours the selected shape. Only the CONTAINER changed — this now runs inside
// the step card's own screenshot instead of a second surface that rendered the same shapes
// at a different size.
//
// Three things were broken in the modal version and are fixed here (item 2b):
//   MOVE — the shapes lived under a layer with pointer-events:none inherited from the shared
//          reader overlay, so a click never reached a shape and a drag never started. The
//          layer is now interactive only when `drawing` is true; the reader's copy is inert.
//   MOVE — no setPointerCapture on the container, so a drag died the instant the pointer
//          left the shape it started on. Capture is taken on the element that owns the
//          handlers, not on the shape.
//   TEXT — the input committed on blur, and the blur fired as the click that placed it
//          settled, so the field vanished before a character could be typed. Commit is now
//          explicit (Enter / clicking away after typing) and guarded against the empty
//          first blur.

export type Tool = 'select' | 'arrow' | 'box' | 'ellipse' | 'text'

export const TOOLS: { t: Tool; key: string; label: string }[] = [
  { t: 'select', key: 'V', label: 'Select' },
  { t: 'arrow', key: 'A', label: 'Arrow' },
  { t: 'box', key: 'B', label: 'Box' },
  { t: 'ellipse', key: 'C', label: 'Circle' },
  { t: 'text', key: 'T', label: 'Text' },
]

// Brand first, then four semantic colours from the design system. Deliberately not a picker:
// five choices that all look deliberate on a screenshot beat a spectrum where most points
// look like a mistake.
export const SEMANTIC = [
  { c: '#B23B3B', label: 'Red' },
  { c: '#B4791F', label: 'Amber' },
  { c: '#2F7D57', label: 'Green' },
  { c: '#211F1B', label: 'Ink' },
]

// Below this, a drag is a click that wandered rather than a shape. Normalized, so it is the
// same physical slop at every rendered size. Shared with resize, which enforces it as a
// floor — the two have to agree, or a shape you cannot draw is a shape you can shrink into.
const MIN_DRAG = MIN_SIZE

// How close the pointer has to be to a handle to grab it, as a share of the picture's width
// — the same unit the handles are drawn in, so the target scales with the picture.
//
// Comfortably BIGGER than the 0.011 the dot is drawn at, and deliberately so. At 0.016 the
// slop was about three CSS pixels: aiming at the centre of a handle and landing four pixels
// low grabbed the shape underneath and moved it instead, which reads as the handle being
// broken rather than missed. This is roughly two and a half times the visible dot.
const GRAB_RADIUS = 0.028

// What the pointer is currently doing to the selected shape. `null` means drawing a new one
// or nothing at all.
type Gesture =
  | { kind: 'move'; px: number; py: number; from: Annotation }
  | { kind: 'resize'; id: HandleId; from: Annotation }
  | { kind: 'rotate'; from: Annotation }

export function useAnnotator(
  initial: Annotation[],
  brandColor: string,
  onCommit: (a: Annotation[]) => void,
  onExit: () => void,
) {
  const [items, setItems] = useState<Annotation[]>(initial)
  const [tool, setTool] = useState<Tool>('select')
  const [colour, setColour] = useState(brandColor)
  const [sel, setSel] = useState<number | null>(null)
  const [draft, setDraft] = useState<Annotation | null>(null)
  const [typing, setTyping] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<Gesture | null>(null)
  const box = useRef<HTMLElement | null>(null)
  // The image's NATURAL pixel size, handed up by AnnotatedImage on load. Every rotation and
  // resize computes in this space: it is square (one x unit == one y unit) where normalized
  // space is not, and rotating in normalized space shears the result.
  const nat = useRef<Natural>({ w: 1000, h: 563 })
  const setNatural = useCallback((n: Natural) => {
    if (n.w && n.h) nat.current = n
  }, [])

  // Every write goes through here so the caller's autosave sees each change as it happens —
  // there is no Save button (4e) and there is no commit-on-close to forget.
  const write = useCallback(
    (next: Annotation[]) => {
      setItems(next)
      onCommit(next)
    },
    [onCommit],
  )

  // Pointer -> normalized 0-1 against the IMAGE's own box, which is the element carrying the
  // handlers. Clamped: a drag that leaves the picture stops at the edge rather than storing
  // a coordinate that is not on the image.
  const at = useCallback((e: ReactPointerEvent) => {
    const el = (box.current ?? (e.currentTarget as HTMLElement)).getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - el.left) / el.width)),
      y: Math.min(1, Math.max(0, (e.clientY - el.top) / el.height)),
    }
  }, [])

  // The same reading, UNCLAMPED. Only rotation wants this: the gesture is a direction from
  // the box centre, and clamping the pointer to the picture would jam that direction against
  // the edge exactly when the user swings the handle wide to turn the label.
  const atRaw = useCallback((e: ReactPointerEvent) => {
    const el = (box.current ?? (e.currentTarget as HTMLElement)).getBoundingClientRect()
    return { x: (e.clientX - el.left) / el.width, y: (e.clientY - el.top) / el.height }
  }, [])

  const pick = useCallback((t: Tool) => {
    setTool(t)
    if (t !== 'select') setSel(null)
  }, [])

  // With a shape selected this recolours THAT shape; otherwise it sets the colour for the
  // next one. One control, two obvious jobs, no mode.
  const chooseColour = useCallback(
    (c: string) => {
      setColour(c)
      if (sel !== null) write(items.map((a, i) => (i === sel ? { ...a, c } : a)))
    },
    [sel, items, write],
  )

  const remove = useCallback(() => {
    if (sel === null) return
    write(items.filter((_, i) => i !== sel))
    setSel(null)
  }, [sel, items, write])

  function onPointerDown(e: ReactPointerEvent) {
    if (typing) return
    box.current = e.currentTarget as HTMLElement
    const p = at(e)

    if (tool === 'select') {
      // A handle ALWAYS wins over the shape it belongs to, and this is decided by DISTANCE,
      // not by e.target.
      //
      // Asking the DOM does not work here. Handles sit exactly on a shape's outline, and
      // that outline carries a 22px transparent hit stroke; the handle circles are painted
      // last and document.elementFromPoint agrees they are on top, but a real pointer event
      // still arrives with the shape's line as its target. Verified in Chrome: clicking dead
      // centre on an arrow's endpoint handle moved the whole arrow instead of dragging the
      // end. Removing the drop-shadow filter changed nothing, so it is not that.
      //
      // We already know where every handle is — handlePoints computes it to draw them. Using
      // that instead of the DOM makes the grab exact, and independent of paint order,
      // filters and stroke widths.
      if (sel !== null && items[sel]) {
        const n = nat.current
        const px = p.x * n.w
        const py = p.y * n.h
        const reach = GRAB_RADIUS * n.w
        let best: { id: HandleId; d: number } | null = null
        for (const hp of handlePoints(items[sel], n)) {
          const d = Math.hypot(hp.x - px, hp.y - py)
          if (d <= reach && (!best || d < best.d)) best = { id: hp.id, d }
        }
        if (best) {
          drag.current =
            best.id === 'rot'
              ? { kind: 'rotate', from: items[sel] }
              : { kind: 'resize', id: best.id, from: items[sel] }
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          return
        }
      }

      const hit = (e.target as Element).closest?.('[data-i]')
      const id = hit?.getAttribute('data-i')
      if (id == null) {
        setSel(null)
        return
      }
      const i = Number(id)
      setSel(i)
      drag.current = { kind: 'move', px: p.x, py: p.y, from: items[i] }
      // On the CONTAINER, not the shape: without this the drag ends the moment the pointer
      // leaves the few pixels of the shape it started on, which is what "move doesn't work"
      // actually was.
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      return
    }

    if (tool === 'text') {
      // preventDefault is load-bearing, not hygiene. Without it the browser's own
      // mousedown focus handling runs AFTER React has mounted the input, moves focus to the
      // surface, and fires an immediate empty blur — which cancelled the placement and put
      // the tool back to Select before a single key could land. That was the whole bug.
      e.preventDefault()
      setTyping(p)
      return
    }

    setDraft({ t: tool, c: colour, x1: p.x, y1: p.y, x2: p.x, y2: p.y })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (draft) {
      const p = at(e)
      setDraft({ ...draft, x2: p.x, y2: p.y })
      return
    }
    const g = drag.current
    if (!g || sel === null) return
    const p = at(e)
    const n = nat.current
    // Pointer in NATURAL PIXELS. Everything below works here and converts back on the way
    // out; see the note at the top of lib/annotations.
    const px = p.x * n.w
    const py = p.y * n.h

    // Local state only while the pointer is down — the write lands on release, so a drag is
    // one autosave rather than sixty.
    const put = (next: Annotation) =>
      setItems((prev) => prev.map((a, i) => (i === sel ? next : a)))

    if (g.kind === 'move') {
      const dx = p.x - g.px
      const dy = p.y - g.py
      if (g.from.t === 'arrow') {
        // Dragging the shaft moves the whole arrow — both ends, same delta, so its length
        // and angle are untouched.
        const e0 = endsOf(g.from)
        put({
          ...g.from,
          x1: round(clamp01(e0.x1 + dx)),
          y1: round(clamp01(e0.y1 + dy)),
          x2: round(clamp01(e0.x2 + dx)),
          y2: round(clamp01(e0.y2 + dy)),
        })
        return
      }
      const r0 = rectOf(g.from, n)
      // Clamped as a ROTATED extent, so a turned label stops at the edge by its corner
      // rather than by the corner it would have had unrotated. Rotation and size are not
      // touched by a move — that is the whole contract of the gesture.
      const moved = clampRect(
        { ...r0, x: r0.x + dx, y: r0.y + dy },
        g.from.rot ?? 0,
        n,
      )
      put(withRect(g.from, moved))
      return
    }

    if (g.kind === 'resize') {
      if (g.from.t === 'arrow') {
        // Two points, two handles, each end independent.
        const e0 = endsOf(g.from)
        put(
          g.id === 'p1'
            ? { ...g.from, x1: round(p.x), y1: round(p.y), x2: round(e0.x2), y2: round(e0.y2) }
            : { ...g.from, x1: round(e0.x1), y1: round(e0.y1), x2: round(p.x), y2: round(p.y) },
        )
        return
      }
      put(withRect(g.from, resizeRect(g.from, n, g.id, px, py)))
      return
    }

    // Rotate. About the box centre, in pixel space; Shift snaps to 15°.
    const r0 = rectOf(g.from, n)
    const cx = (r0.x + r0.w / 2) * n.w
    const cy = (r0.y + r0.h / 2) * n.h
    const raw = atRaw(e)
    put({ ...g.from, rot: angleTo(cx, cy, raw.x * n.w, raw.y * n.h, e.shiftKey) })
  }

  function onPointerUp(e: ReactPointerEvent) {
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // Capture was never taken (a plain click on empty space). Nothing to release.
    }
    if (draft) {
      const d = endsOf(draft)
      const wide = Math.abs(d.x2 - d.x1) > MIN_DRAG
      const tall = Math.abs(d.y2 - d.y1) > MIN_DRAG
      // A drag that never got past the minimum is DISCARDED, not committed small. The
      // alternative leaves a shape too small to see and too small to click, which the user
      // can neither use nor remove.
      if (wide || tall) {
        // Arrows keep their two points; everything else is committed as a rect, which is the
        // form resize and rotation need.
        const shape: Annotation =
          draft.t === 'arrow'
            ? { ...draft, x1: round(d.x1), y1: round(d.y1), x2: round(d.x2), y2: round(d.y2) }
            : withRect(draft, {
                x: Math.min(d.x1, d.x2),
                y: Math.min(d.y1, d.y2),
                w: Math.max(Math.abs(d.x2 - d.x1), MIN_SIZE),
                h: Math.max(Math.abs(d.y2 - d.y1), MIN_SIZE),
              })
        write([...items, shape])
        setSel(items.length)
      }
      setDraft(null)
      // Snaps back after every shape: most steps get one, and optimising for five in a row
      // would make the common case a two-step action every time.
      setTool('select')
      return
    }
    if (drag.current) {
      drag.current = null
      onCommit(items)
    }
  }

  // Whether the text field has actually held focus. A blur before that is the browser
  // moving focus around, never the user leaving the field, and must not cancel anything.
  const textFocused = useRef(false)

  function commitText(value: string) {
    const v = value.trim()
    if (v && typing) {
      // Text needs a BOX, not a point: its handles have to sit on something, and its font
      // size is derived from the box height so that scaling can be proportional. Measured
      // once, here — the string never changes after this, and proportional resize preserves
      // the ratio, so the box hugs the type forever without re-measuring.
      const n = nat.current
      const fs = TEXT_SIZE * (n.w / REF_W)
      const w = (textWidthPx(v, fs) + fs * 0.7) / n.w
      const h = (fs * 1.44) / n.h
      const r = clampRect({ x: typing.x, y: typing.y, w, h }, 0, n)
      write([...items, withRect({ t: 'text', c: colour, text: v }, r)])
      setSel(items.length)
    }
    setTyping(null)
    setTool('select')
    textFocused.current = false
  }

  // Escape backs out one layer at a time — selection, then tool, then the mode itself — so
  // it can never throw away a session's work in one keystroke.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.target as HTMLElement)?.isContentEditable) return
      const map: Record<string, Tool> = {
        v: 'select',
        a: 'arrow',
        b: 'box',
        c: 'ellipse',
        t: 'text',
      }
      const next = map[e.key.toLowerCase()]
      if (next) {
        e.preventDefault()
        pick(next)
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
        else onExit()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [sel, tool, pick, remove, onExit])

  return {
    items,
    tool,
    colour,
    sel,
    draft,
    typing,
    pick,
    chooseColour,
    remove,
    commitText,
    cancelText: () => {
      setTyping(null)
      setTool('select')
      textFocused.current = false
    },
    // The text field reports when it genuinely has focus, so a blur can tell "the user
    // clicked away" from "the browser moved focus during mount".
    onTextFocus: () => {
      textFocused.current = true
    },
    textEverFocused: () => textFocused.current,
    // AnnotatedImage reports the image's natural size once it loads. Rotation and resize are
    // computed in that space, so this is not optional bookkeeping — before it arrives the
    // fallback ratio is used, and no gesture can run because nothing is selectable yet.
    setNatural,
    handlers: { onPointerDown, onPointerMove, onPointerUp },
  }
}
