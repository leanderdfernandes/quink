import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Extension } from '@tiptap/core'
import { ArticleLink } from './marks'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { brokenArticleIds, newFaqId, type HrefResolver } from '../lib/articleLinks'
import type { Faq } from '../lib/types'

// The article tail: "Common questions" (migration 0037).
//
// It is NOT a step type and must never become one. A step is an action a reader performs in
// order; a question is a thing they arrive already wondering, out of order, usually from
// search. Same article, different unit — which is why this is its own column and its own
// panel rather than a `kind` on `steps`.
//
// The control vocabulary is StepCard's, deliberately: hover-only tools, a ⠿ handle that is
// the ONLY draggable part of the row, and no appearance controls of any kind.

// Six is where a FAQ list stops being a tail and starts being an article someone should have
// written. Eight is where we stop it. Neither is a policy — the first is a sentence, and the
// second just removes the add control rather than greying it out, because a disabled button
// is a thing to argue with.
const SOFT_MAX = 6
const HARD_MAX = 8

const PLACEHOLDER_Q = 'What do readers get stuck on?'

// Mark links whose target no longer resolves. A decoration rather than a DOM side-effect,
// because ProseMirror owns that DOM and would wipe an attribute we set behind its back on
// the next redraw.
//
// The draft is NOT auto-unwrapped — the author sees what broke and decides. Publish degrades
// it safely either way (articleLinks.resolveArticleLinks), so a link left alone here can
// never reach a reader as a dead anchor.
//
// The "Target removed" chip is a CSS ::after on this class. Rendering it as a second widget
// decoration would be a second thing to keep positioned for no gain.
const DeadLinks = Extension.create<{ isDead: () => (id: string) => boolean }>({
  name: 'deadArticleLinks',
  addOptions() {
    return { isDead: () => () => false }
  },
  addProseMirrorPlugins() {
    // Read through the getter on every recompute: the article map loads async, and an
    // options value captured at configure time would be the empty map forever.
    const getIsDead = this.options.isDead
    return [
      new Plugin({
        props: {
          decorations(state) {
            const isDead = getIsDead()
            const out: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (!node.isText) return
              const link = node.marks.find((m) => m.type.name === 'link')
              const id = link?.attrs.articleId as string | undefined
              if (id && isDead(id)) {
                out.push(
                  Decoration.inline(pos, pos + node.nodeSize, { class: 'faq-a-dead' }),
                )
              }
            })
            return DecorationSet.create(state.doc, out)
          },
        },
      }),
    ]
  },
})

type Props = {
  faqs: Faq[]
  onChange: (faqs: Faq[]) => void
  // Bumped by undo/discard, which replace the array wholesale from outside. TipTap owns its
  // document after mount, so those rows have to remount to show the restored text — the same
  // problem StepCard solves with its per-step rev.
  rev: number
  readOnly?: boolean
  // Articles in this KB that a link may point at, and where they live now.
  targets: { id: string; title: string; slug: string | null }[]
  href: HrefResolver
}

export default function FaqPanel({
  faqs,
  onChange,
  rev,
  readOnly = false,
  targets,
  href,
}: Props) {
  const dragFrom = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)

  // Never a bare "+ Add" with nothing above it: an empty panel shows one blank row with
  // ghost text asking the question the author should be answering.
  //
  // It is RENDERED, not stored. Writing a starter row into `articles.faqs` on mount would
  // mean opening any article without questions saved a change to it — marking it dirty,
  // bumping `updated_at` (which is the stale-write guard's base, §10k) and adding a phantom
  // unpublished edit to every article in the list. The row becomes real on the first
  // keystroke, which is also the first moment it means anything.
  //
  // The id is minted once per mount so it survives re-renders; if the row is never typed
  // into, nothing ever uses it.
  const blank = useRef<Faq>({ id: newFaqId(), q: '', a: '' })
  const rows = faqs.length ? faqs : [blank.current]
  // True while that row is still a placeholder — the source array is empty.
  const phantom = faqs.length === 0

  const patch = (i: number, p: Partial<Faq>) =>
    onChange(rows.map((f, n) => (n === i ? { ...f, ...p } : f)))

  // Deleting the placeholder is a no-op: there is nothing stored to remove, and re-rendering
  // it immediately is the correct empty state anyway.
  const remove = (i: number) => {
    if (phantom) return
    onChange(faqs.filter((_, n) => n !== i))
  }

  const add = () => onChange([...rows, { id: newFaqId(), q: '', a: '' }])

  function onDragEnter(to: number) {
    const from = dragFrom.current
    if (from === null || from === to) return
    const next = rows.slice()
    const [row] = next.splice(from, 1)
    next.splice(to, 0, row)
    dragFrom.current = to
    onChange(next)
  }

  return (
    <section className="ed-faq" aria-labelledby="ed-faq-cap">
      <div className="ed-faq-hd">
        <h2 id="ed-faq-cap">Common questions</h2>
        <span className="ed-faq-n">
          {faqs.length} of {HARD_MAX}
        </span>
      </div>
      {rows.length >= SOFT_MAX && (
        <p className="ed-faq-hint">
          More than six questions usually means this belongs in its own article.
        </p>
      )}

      {rows.map((f, i) => (
        <FaqRow
          key={`${f.id}-${rev}`}
          faq={f}
          readOnly={readOnly}
          targets={targets}
          href={href}
          dragging={dragging}
          onQuestion={(q) => patch(i, { q })}
          onAnswer={(a) => patch(i, { a })}
          onDelete={() => remove(i)}
          onDragStart={() => {
            dragFrom.current = i
            setDragging(true)
          }}
          onDragEnterRow={() => onDragEnter(i)}
          onDrop={() => {
            dragFrom.current = null
            setDragging(false)
          }}
        />
      ))}

      {/* Removed, not disabled, at the ceiling. */}
      {!readOnly && rows.length < HARD_MAX && (
        <button type="button" className="ed-faq-add" onClick={add}>
          + Add a question
        </button>
      )}
    </section>
  )
}

function FaqRow({
  faq,
  readOnly,
  targets,
  href,
  dragging,
  onQuestion,
  onAnswer,
  onDelete,
  onDragStart,
  onDragEnterRow,
  onDrop,
}: {
  faq: Faq
  readOnly: boolean
  targets: { id: string; title: string; slug: string | null }[]
  href: HrefResolver
  dragging: boolean
  onQuestion: (q: string) => void
  onAnswer: (a: string) => void
  onDelete: () => void
  onDragStart: () => void
  onDragEnterRow: () => void
  onDrop: () => void
}) {
  const [linking, setLinking] = useState(false)
  const [url, setUrl] = useState('')

  // Held in a ref so the decoration plugin, configured once at mount, always reads the
  // CURRENT resolver rather than the one that existed before the article map arrived.
  const hrefRef = useRef(href)
  hrefRef.current = href

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      // Restricted on purpose. An answer is a paragraph or two — headings would give the
      // reader a second document outline inside a step-numbered page, and images belong to
      // steps, which is where the frame picker lives.
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        orderedList: false,
        // One app-level undo covers the whole editor (Editor.tsx), same as StepCard.
        undoRedo: false,
        link: false,
      }),
      ArticleLink.configure({ openOnClick: false, autolink: false }),
      Placeholder.configure({ placeholder: 'Answer it in a sentence or two.' }),
      DeadLinks.configure({
        isDead: () => (id: string) => !hrefRef.current(id),
      }),
    ],
    content: faq.a || '',
    onUpdate: ({ editor }) => onAnswer(editor.getHTML()),
  })

  useEffect(() => {
    editor?.setEditable(!readOnly)
  }, [editor, readOnly])

  const dead = useMemo(() => brokenArticleIds(faq.a, href), [faq.a, href])

  function linkTo(attrs: { href: string; articleId?: string | null }) {
    editor?.chain().focus().extendMarkRange('link').setLink(attrs).run()
    setLinking(false)
    setUrl('')
  }

  return (
    <div
      className={`ed-faq-row${dragging ? ' is-dragging' : ''}`}
      onDragEnter={readOnly ? undefined : onDragEnterRow}
      onDragOver={(e) => e.preventDefault()}
      onDrop={readOnly ? undefined : onDrop}
    >
      {/* Only the handle is draggable — same as StepCard, so selecting text in an answer
          still works and the two gestures in this editor stay one gesture. */}
      <span
        className="ed-grip ed-faq-grip"
        draggable={!readOnly}
        onDragStart={onDragStart}
        onDragEnd={onDrop}
        aria-hidden
      >
        ⠿
      </span>

      <div className="ed-faq-body">
        <input
          className="ed-faq-q"
          value={faq.q}
          disabled={readOnly}
          placeholder={PLACEHOLDER_Q}
          aria-label="Question"
          onChange={(e) => onQuestion(e.target.value)}
        />
        <div className="ed-faq-a">
          <EditorContent editor={editor} />
        </div>

        {dead.size > 0 && (
          <p className="ed-faq-warn">
            {dead.size === 1 ? 'A link here points' : `${dead.size} links here point`} at an
            article that has been removed. Publishing turns{' '}
            {dead.size === 1 ? 'it' : 'them'} back into plain text.
          </p>
        )}
      </div>

      <div className="ed-faq-tools">
        <button
          type="button"
          disabled={readOnly}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setLinking((v) => !v)}
          title="Link the selected text"
        >
          Link
        </button>
        <button
          type="button"
          className="danger"
          disabled={readOnly}
          onClick={onDelete}
          title="Delete this question"
        >
          Delete
        </button>
      </div>

      {linking && (
        <div className="ed-faq-link">
          {/* Two modes, one panel: an article in this help center, or any URL. The article
              list comes first because it is the one that keeps working — its link is stored
              by id and re-resolved at every publish. */}
          <p className="ed-faq-link-cap">Link to an article</p>
          <div className="ed-faq-link-list">
            {targets.length === 0 ? (
              <span className="ed-faq-link-none">No other articles yet.</span>
            ) : (
              targets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => linkTo({ href: `/${t.slug ?? ''}`, articleId: t.id })}
                >
                  {t.title || 'Untitled'}
                </button>
              ))
            )}
          </div>
          <p className="ed-faq-link-cap">Or paste a URL</p>
          <div className="ed-faq-link-url">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
              aria-label="Link URL"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && url.trim()) linkTo({ href: url.trim() })
              }}
            />
            <button type="button" disabled={!url.trim()} onClick={() => linkTo({ href: url.trim() })}>
              Link
            </button>
          </div>
          <button
            type="button"
            className="ed-faq-unlink"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor?.chain().focus().extendMarkRange('link').unsetLink().run()
              setLinking(false)
            }}
          >
            Remove link
          </button>
        </div>
      )}
    </div>
  )
}
