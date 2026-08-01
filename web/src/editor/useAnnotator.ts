import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
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
// same physical slop at every rendered size.
const MIN_DRAG = 0.015

const round = (n: number) => Math.round(n * 1000) / 1000

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
  const drag = useRef<{ px: number; py: number; from: Annotation } | null>(null)
  const box = useRef<HTMLElement | null>(null)

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
      const hit = (e.target as Element).closest?.('[data-i]')
      const id = hit?.getAttribute('data-i')
      if (id == null) {
        setSel(null)
        return
      }
      const i = Number(id)
      setSel(i)
      drag.current = { px: p.x, py: p.y, from: items[i] }
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
    if (drag.current && sel !== null) {
      const p = at(e)
      const { px, py, from } = drag.current
      const dx = p.x - px
      const dy = p.y - py
      // Local state only while the pointer is down — the write lands on release, so a drag
      // is one autosave rather than sixty.
      setItems((prev) =>
        prev.map((a, i) =>
          i === sel
            ? {
                ...a,
                x1: round(from.x1 + dx),
                y1: round(from.y1 + dy),
                ...(from.x2 !== undefined
                  ? { x2: round(from.x2 + dx), y2: round((from.y2 ?? 0) + dy) }
                  : {}),
              }
            : a,
        ),
      )
    }
  }

  function onPointerUp(e: ReactPointerEvent) {
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // Capture was never taken (a plain click on empty space). Nothing to release.
    }
    if (draft) {
      const wide = Math.abs((draft.x2 ?? 0) - draft.x1) > MIN_DRAG
      const tall = Math.abs((draft.y2 ?? 0) - draft.y1) > MIN_DRAG
      if (wide || tall) {
        const shape: Annotation = {
          ...draft,
          x1: round(draft.x1),
          y1: round(draft.y1),
          x2: round(draft.x2 ?? draft.x1),
          y2: round(draft.y2 ?? draft.y1),
        }
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
      write([
        ...items,
        { t: 'text', c: colour, x1: round(typing.x), y1: round(typing.y), text: v },
      ])
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
    handlers: { onPointerDown, onPointerMove, onPointerUp },
  }
}
