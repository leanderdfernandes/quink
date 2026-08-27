import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BubbleMenu } from '@tiptap/react/menus'
import { useEditorState, type Editor } from '@tiptap/react'
import { key } from '../lib/keys'
import { isExternalUrl, toHref, type LinkTarget } from '../lib/articleLinks'

// The selection toolbar.
//
// Rich text was recall-only: Ctrl+B, and nothing that told you the rest existed. Recall-based
// UI is invisible UI. The bubble surfaces the marks at the moment of intent — the user has
// already selected text, which means they have already decided to act on it — and its
// ACTIVE STATES are the second half of the feature: reading back what is already applied is
// how people learn the marks exist at all.
//
// SIX ACTIONS AND NO BLOCK TRANSFORMS. No H2, no list, no quote, no "turn into". A step body
// is a typed node in our schema and a heading inside one produces an invalid document. This
// is a deliberate exclusion — if a later request asks for them, that is a schema
// conversation, not a toolbar one.
//
// RIGHT-CLICK WAS CONSIDERED AND REJECTED. A custom context menu has to carry Cut/Copy/Paste
// or it feels broken, which doubles its height, and it costs the user spellcheck. The
// `contextmenu` event stays native and is not intercepted anywhere.

type Props = {
  editor: Editor | null
  /** Other articles in this help center, for the link picker. */
  targets: LinkTarget[]
  /**
   * "Change this…" (PRD §6.1) — the one AI item on the bar, and it is deliberately last
   * and separated. The marks are instant and local; this one asks a question and comes back
   * with a proposal, which is a different KIND of act and should not sit in the same run of
   * buttons as Bold.
   *
   * Absent when the parent cannot steer (no article id yet, mid-generation), rather than
   * present and inert: an item that does nothing teaches people the feature is broken.
   */
  onSteer?: (selection: string) => void
}

export default function SelectionToolbar({ editor, targets, onSteer }: Props) {
  // One flag for every reason the bubble should go away: a scroll, Escape, typing, or a
  // drag in progress. Unmounting the whole menu is cheaper and more predictable than
  // persuading the plugin's shouldShow to re-run, and it is what "hide" actually means.
  const [hidden, setHidden] = useState(false)
  const [linking, setLinking] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)
  // True between pointerdown and pointerup. A drag fires selectionUpdate on every mouse
  // move, so without this the "fresh selection" effect below would un-hide the bubble on
  // the first pixel of the drag and it would chase the cursor after all.
  const dragging = useRef(false)

  const closeLink = useCallback(() => setLinking(false), [])

  useEffect(() => {
    if (!editor) return
    const inChrome = (t: EventTarget | null) =>
      t instanceof globalThis.Node && !!barRef.current?.contains(t)

    // While the mouse is down the selection is still being drawn. A bubble that chases the
    // cursor IS the flicker; not drawing one until the user lets go is both calmer and
    // simpler than debouncing the position through a frame.
    const down = (e: PointerEvent) => {
      if (inChrome(e.target)) return
      dragging.current = true
      setHidden(true)
    }
    const up = () => {
      dragging.current = false
      setHidden(false)
    }
    const scroll = () => setHidden(true)

    const keydown = (e: KeyboardEvent) => {
      // EVERY step card mounts one of these. Without this guard, Escape pressed anywhere on
      // the page would call focus() on all of them and the last one would win — a keystroke
      // in one step yanking the caret into another.
      if (!editor.isFocused && !inChrome(document.activeElement)) return

      if (e.key === 'Escape') {
        setHidden(true)
        setLinking(false)
        // Focus goes back where it came from, with the selection intact.
        editor.commands.focus()
        return
      }
      // The keyboard route INTO the bubble. It floats on <body>, so it is nowhere near the
      // editor in tab order — and Tab on a non-empty selection is otherwise unbound here
      // (list indent needs a collapsed cursor), so this takes nothing away.
      if (e.key === 'Tab' && !e.shiftKey && !editor.state.selection.empty && !hidden) {
        const first = barRef.current?.querySelector('button')
        if (first) {
          e.preventDefault()
          first.focus()
          return
        }
      }
      // Any printable key without a modifier is typing, and typing is not formatting. Only
      // in the EDITOR though — the same keystroke in the link panel's search field is the
      // user using the bubble, and hiding it there would unmount the field mid-word.
      if (editor.isFocused && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1)
        setHidden(true)
    }

    document.addEventListener('pointerdown', down, true)
    document.addEventListener('pointerup', up, true)
    // Capture, so a scroll inside the editor's own scroller counts too.
    document.addEventListener('scroll', scroll, true)
    document.addEventListener('keydown', keydown, true)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('pointerup', up, true)
      document.removeEventListener('scroll', scroll, true)
      document.removeEventListener('keydown', keydown, true)
    }
  }, [editor, hidden])

  // A fresh selection is a fresh intent: whatever hid the bubble last time is spent.
  useEffect(() => {
    if (!editor) return
    const onSelect = () => {
      if (!dragging.current) setHidden(false)
      if (editor.state.selection.empty) setLinking(false)
    }
    editor.on('selectionUpdate', onSelect)
    return () => {
      editor.off('selectionUpdate', onSelect)
    }
  }, [editor])

  // Unmounted rather than filtered out through `shouldShow`: the plugin only re-evaluates
  // that on an editor transaction, and a scroll is not one — the bubble would sit there
  // until the user next touched the document. Not rendering it is unambiguous.
  if (!editor || hidden) return null

  return (
    <BubbleMenu
      editor={editor}
      // Fixed, on the body, so the flip and the clamp are measured against the VIEWPORT.
      // Anchored inside the editor they would be measured against a box that scrolls, and a
      // selection near the top of the window would still clip.
      appendTo={() => document.body}
      options={{
        strategy: 'fixed',
        placement: 'top',
        offset: 8,
        flip: true,
        shift: { padding: 10 },
      }}
      shouldShow={({ editor, from, to }) =>
        // Never on a collapsed cursor, and never where the user cannot edit — a stale
        // session that has lost can_edit_kb() has already had setEditable(false) called on
        // it, so this one condition covers read-only, the build lock and lost access alike.
        editor.isEditable && to > from
      }
    >
      <div ref={barRef}>
        {linking ? (
          <LinkPanel editor={editor} targets={targets} onClose={closeLink} />
        ) : (
          <Bar
            editor={editor}
            onLink={() => setLinking(true)}
            onSteer={
              onSteer &&
              (() => {
                const { from, to } = editor.state.selection
                onSteer(editor.state.doc.textBetween(from, to, ' ').trim())
              })
            }
          />
        )}
      </div>
    </BubbleMenu>
  )
}

// --- the bar --------------------------------------------------------------------------

type Action = {
  id: string
  label: string
  shortcut?: string
  mark?: string
  glyph: React.ReactNode
  run: (e: Editor) => void
  sepBefore?: boolean
}

// One list, so the button order, the active readback and the arrow-key roving cannot
// disagree with each other.
const ACTIONS: Action[] = [
  {
    id: 'bold',
    label: 'Bold',
    shortcut: key('B'),
    mark: 'bold',
    glyph: <span className="tb-b">B</span>,
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    id: 'italic',
    label: 'Italic',
    shortcut: key('I'),
    mark: 'italic',
    glyph: <span className="tb-i">I</span>,
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    id: 'strike',
    label: 'Strikethrough',
    mark: 'strike',
    glyph: <span className="tb-s">S</span>,
    run: (e) => e.chain().focus().toggleStrike().run(),
  },
  {
    id: 'link',
    label: 'Link',
    shortcut: key('K'),
    mark: 'link',
    sepBefore: true,
    glyph: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
        <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
      </svg>
    ),
    // Opens the panel instead of running a command; the parent owns that state.
    run: () => {},
  },
  {
    id: 'code',
    label: 'Code',
    mark: 'code',
    glyph: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="m16 18 6-6-6-6" />
        <path d="m8 6-6 6 6 6" />
      </svg>
    ),
    run: (e) => e.chain().focus().toggleCode().run(),
  },
  {
    id: 'clear',
    label: 'Clear formatting',
    sepBefore: true,
    glyph: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M4 7V4h16v3" />
        <path d="M9 20h6" />
        <path d="M12 4v16" />
      </svg>
    ),
    // Marks only. `clearNodes()` would be a block transform, which this bar does not do.
    run: (e) => e.chain().focus().unsetAllMarks().run(),
  },
]

function Bar({
  editor,
  onLink,
  onSteer,
}: {
  editor: Editor
  onLink: () => void
  onSteer?: () => void
}) {
  const btns = useRef<(HTMLButtonElement | null)[]>([])

  // B2 — the readback is half the feature, and it only works if this subscribes to the
  // editor. Nothing else here re-renders on a transaction, so calling editor.isActive()
  // straight from the render would freeze the button states at whatever they were when the
  // bubble first appeared: select bold text, and B would read as off.
  const active = useEditorState({
    editor,
    selector: ({ editor }) =>
      ACTIONS.map((a) => (a.mark ? editor.isActive(a.mark) : false)).join(','),
  }).split(',')

  // A toolbar is ONE tab stop; the arrows move inside it.
  function onKeyDown(e: React.KeyboardEvent) {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const live = btns.current.filter(Boolean) as HTMLButtonElement[]
    const at = live.indexOf(document.activeElement as HTMLButtonElement)
    live[(at + dir + live.length) % live.length]?.focus()
  }

  return (
    <div className="tb" role="toolbar" aria-label="Text formatting" onKeyDown={onKeyDown}>
      {ACTIONS.map((a, i) => {
        const on = active[i] === 'true'
        return (
          <span key={a.id} className="tb-slot">
            {a.sepBefore && <span className="tb-sep" aria-hidden />}
            <button
              type="button"
              ref={(el) => {
                btns.current[i] = el
              }}
              className={on ? 'active' : undefined}
              // The name is on the button, not only in the tooltip: the tooltip is
              // supplementary and a screen reader never sees it.
              aria-label={a.label}
              aria-pressed={a.mark ? on : undefined}
              data-tip={a.shortcut ? `${a.label} ${a.shortcut}` : a.label}
              // Keeps the selection. Without it the press blurs the editor first and the
              // command applies to nothing.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => (a.id === 'link' ? onLink() : a.run(editor))}
            >
              {a.glyph}
            </button>
          </span>
        )
      })}
      {/* Last, after a separator, and the only item on the bar that is a WORD rather than a
          glyph — because it is the only one that opens a conversation instead of toggling a
          mark. The marks are instant and local; this one asks and comes back. */}
      {onSteer && (
        <span className="tb-slot">
          <span className="tb-sep" aria-hidden />
          <button
            type="button"
            ref={(el) => {
              btns.current[ACTIONS.length] = el
            }}
            className="tb-steer"
            aria-label="Change this with AI"
            data-tip="Change this…"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onSteer}
          >
            Change this…
          </button>
        </span>
      )}
    </div>
  )
}

// --- the link panel -------------------------------------------------------------------

function LinkPanel({
  editor,
  targets,
  onClose,
}: {
  editor: Editor
  targets: LinkTarget[]
  onClose: () => void
}) {
  // Opening on an existing link pre-fills its target rather than asking again.
  const existing = editor.getAttributes('link') as { href?: string }
  const [q, setQ] = useState(existing.href ?? '')
  const [cur, setCur] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.select()
  }, [])

  const external = isExternalUrl(q)
  // Internal first, and by id: an article link is the one that keeps working, because
  // publish re-resolves it to the target's current slug every time (lib/articleLinks.ts).
  // An empty query shows what the author most recently touched — the likeliest target.
  const rows = useMemo(() => {
    if (external) return []
    const t = q.trim().toLowerCase()
    return (t ? targets.filter((a) => a.title.toLowerCase().includes(t)) : targets).slice(0, 5)
  }, [q, targets, external])

  useEffect(() => setCur(0), [q])

  function apply(to: { href: string; articleId?: string | null }) {
    editor.chain().focus().extendMarkRange('link').setLink(to).run()
    onClose()
  }

  function commit() {
    if (external) return apply({ href: toHref(q) })
    const pick = rows[cur]
    if (pick) apply({ href: `/${pick.slug ?? ''}`, articleId: pick.id })
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      // Both halves come back: the caret AND the range it was sitting on.
      editor.commands.focus()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const n = Math.max(rows.length, 1)
      setCur((c) => (c + (e.key === 'ArrowDown' ? 1 : -1) + n) % n)
    }
  }

  return (
    <div className="tb-link" onKeyDown={onKeyDown}>
      <div className="tb-link-in">
        <svg viewBox="0 0 24 24" strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search articles or paste a URL"
          aria-label="Search articles or paste a URL"
          autoComplete="off"
        />
      </div>

      {external ? (
        <div
          className="tb-link-row cur"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => apply({ href: toHref(q) })}
        >
          <span className="tb-link-ico">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M15 3h6v6" />
              <path d="M10 14 21 3" />
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            </svg>
          </span>
          <span className="tb-link-txt">
            <b>{q.trim()}</b>
            <span>Somewhere else on the web</span>
          </span>
        </div>
      ) : rows.length === 0 ? (
        <p className="tb-link-none">
          {targets.length === 0 ? 'No other articles yet.' : 'Nothing matches.'}
        </p>
      ) : (
        rows.map((a, i) => (
          <div
            key={a.id}
            className={`tb-link-row${i === cur ? ' cur' : ''}`}
            // mousedown, prevented — so the selection survives the press.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply({ href: `/${a.slug ?? ''}`, articleId: a.id })}
            onMouseEnter={() => setCur(i)}
          >
            <span className="tb-link-ico">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M4 19.5V5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-1.5Z" />
              </svg>
            </span>
            <span className="tb-link-txt">
              <b>{a.title || 'Untitled'}</b>
              <span>
                {a.folder ?? 'No folder'} · {a.steps} {a.steps === 1 ? 'step' : 'steps'}
              </span>
            </span>
          </div>
        ))
      )}

      {editor.isActive('link') && (
        <button
          type="button"
          className="tb-link-off"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            editor.chain().focus().extendMarkRange('link').unsetLink().run()
            onClose()
          }}
        >
          Remove link
        </button>
      )}

      <div className="tb-link-foot">
        <span>↵ to link · esc to cancel</span>
        <span>{external ? 'External' : 'Internal'}</span>
      </div>
    </div>
  )
}
