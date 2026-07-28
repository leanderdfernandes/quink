import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// A device-accurate preview surface.
//
// The obvious implementation — render the reader into a narrow <div> — does not work, and
// looked plausible right up until you measured it. CSS media queries and `vw` units resolve
// against the VIEWPORT, never against an ancestor's width, so a 360px div in a 982px window
// still gets desktop CSS: the reader's 216px category rail stayed put and crushed the article
// rows into a 30px column, and `clamp(33px, 5vw, 54px)` rendered the headline at 49px inside
// a 360px box. That is the "cropped to a vertical" symptom.
//
// An iframe has its own viewport, so the same stylesheet resolves exactly as it will on a
// real device. Nothing about the reader changes; it just gets asked the right question.
//
// ponytail: stylesheets are cloned in rather than reached for via a bundler entry point,
// because there is no second entry to point at — one document, one CSS file. The
// MutationObserver exists only so Vite's dev-mode style injection reaches the frame too.

type Props = {
  /** Logical device width in px. The iframe is sized to this, so it IS the viewport. */
  width: number
  children: ReactNode
  title: string
}

export default function PreviewFrame({ width, children, title }: Props) {
  const ref = useRef<HTMLIFrameElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [doc, setDoc] = useState<Document | null>(null)
  const [height, setHeight] = useState(640)
  // Measured here rather than passed in: the component that owns the constraint should be
  // the one that reads it, and threading it through props made the scale silently stay at 1
  // when the measurement landed a render late.
  const [avail, setAvail] = useState(0)

  useEffect(() => {
    const parent = wrapRef.current?.parentElement
    if (!parent) return
    const measure = () => setAvail(parent.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const frame = ref.current
    if (!frame) return
    const d = frame.contentDocument
    if (!d) return

    d.open()
    d.write('<!doctype html><html><head></head><body></body></html>')
    d.close()
    d.body.style.margin = '0'
    // Let the pane do the scrolling, not the frame: the frame reports its content height and
    // grows, so the preview reads as one continuous page rather than a box with its own bar.
    d.documentElement.style.overflow = 'hidden'

    // Wipe-and-clone rather than diffing: head mutations only happen under dev HMR, and this
    // sidesteps escaping arbitrary stylesheet text into a selector.
    const sync = () => {
      d.head.replaceChildren()
      document
        .querySelectorAll('style, link[rel="stylesheet"], link[rel="preconnect"]')
        .forEach((n) => d.head.appendChild(n.cloneNode(true)))
    }
    sync()
    const mo = new MutationObserver(sync)
    mo.observe(document.head, { childList: true, subtree: true, characterData: true })

    const ro = new ResizeObserver(() => setHeight(d.body.scrollHeight || 640))
    ro.observe(d.body)

    setDoc(d)
    return () => {
      mo.disconnect()
      ro.disconnect()
    }
  }, [])

  const scale = avail > 0 ? Math.min(1, avail / width) : 1

  return (
    <div
      ref={wrapRef}
      className="pvf-wrap"
      style={{ width: width * scale, height: height * scale }}
    >
      <iframe
        ref={ref}
        title={title}
        className="pvf"
        style={{
          width,
          height,
          transform: scale === 1 ? undefined : `scale(${scale})`,
          transformOrigin: 'top left',
        }}
        // Read-only: nothing in a preview should be clickable or reachable by tab.
        {...({ inert: '' } as Record<string, string>)}
      >
        {doc && createPortal(<div className="pvf-root">{children}</div>, doc.body)}
      </iframe>
    </div>
  )
}
