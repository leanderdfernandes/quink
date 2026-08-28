const { Micro, Button, IconButton, Icon, Card, Segmented, Menu, Notice, State, Thumb, Toolbar, Sheet } = window.QuinkDesignSystem_6ae0bd

// ============================================================================
// The editor — the North Star surface, and where v2's changes are most visible.
//
//  · The article title and every step heading are Newsreader. The canvas now reads like a
//    document you are writing, which is the entire product promise.
//  · The step number is a mono index under a 2px brand rule — the one motif kept from v1,
//    because it is genuinely good and it is in the live product.
//  · Step tools live in a raised cluster that fades in on hover, and they FADE OUT while the
//    selection toolbar is open (`q-quiet-tools`). That pairing is the fix for the toolbar
//    landing on top of other buttons.
//  · No borders on the rail or the bar. The rail is the page surface; the bar is raised.
// ============================================================================

function StepCard({ n, step, active, onSelect }) {
  const [confirm, setConfirm] = React.useState(false)
  return (
    <section id={'step-' + n} style={{ position: 'relative', paddingTop: 'var(--s-12)' }}
      onMouseEnter={onSelect} className="q-step">
      <div style={{ display: 'flex', gap: 'var(--s-5)', alignItems: 'flex-start' }}>
        <div style={{ flex: 'none', width: 26, paddingTop: 7, borderTop: '2px solid var(--brand)' }}>
          <span className="q-micro" style={{ color: 'var(--brand)', fontWeight: 'var(--w-strong)' }}>
            {String(n).padStart(2, '0')}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 contentEditable suppressContentEditableWarning
            style={{ fontSize: 'var(--t-d5)', outline: 'none', marginBottom: 'var(--s-3)' }}>
            {step.h}
          </h3>
          <p className="q-prose" contentEditable suppressContentEditableWarning
            style={{ outline: 'none', color: step.p ? 'var(--ink-2)' : 'var(--ink-4)' }}>
            {step.p || 'Describe what happens in this step…'}
          </p>

          {step.p ? (
            <figure style={{ marginTop: 'var(--s-6)', maxWidth: 560, position: 'relative' }}
              onMouseEnter={(e) => { const o = e.currentTarget.querySelector('.shot-ov'); if (o) o.style.opacity = 1 }}
              onMouseLeave={(e) => { const o = e.currentTarget.querySelector('.shot-ov'); if (o) o.style.opacity = 0 }}>
              <div style={{ borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: 'var(--e2), var(--edge)' }}>
                <Shot label={`step ${n} screenshot`} />
              </div>
              <div className="shot-ov q-hovertools" style={{ position: 'absolute', right: 10, bottom: 10, display: 'flex', gap: 4, opacity: 0, transition: 'opacity var(--dur-2) var(--ease)' }}>
                <Button variant="secondary" size="sm" icon="image">Swap frame</Button>
                <Button variant="secondary" size="sm" icon="pencil">Annotate</Button>
              </div>
            </figure>
          ) : (
            <Notice style={{ marginTop: 'var(--s-6)', maxWidth: 460 }} icon="image"
              action={<Button variant="secondary" size="sm">Pick a frame</Button>}>
              No screenshot yet.
            </Notice>
          )}
        </div>
      </div>

      {/* Hover-only step tools. Raised cluster, not a row of bordered chips. */}
      <div className="q-hovertools" style={{
        position: 'absolute', top: 'var(--s-10)', right: 0, display: 'flex', gap: 2, padding: 3,
        background: 'var(--surface-1)', borderRadius: 'var(--r-md)', boxShadow: 'var(--e2), var(--edge)',
        opacity: active ? 1 : 0, pointerEvents: active ? 'auto' : 'none',
        transition: 'opacity var(--dur-2) var(--ease)',
      }}>
        {confirm ? (
          <>
            <span style={{ display: 'grid', placeItems: 'center', padding: '0 10px', fontSize: 13, color: 'var(--ink-2)' }}>Delete step?</span>
            <Button variant="critical" size="sm">Delete</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>Cancel</Button>
          </>
        ) : (
          <>
            <IconButton icon="grip" label="Reorder" size="sm" />
            <IconButton icon="split" label="Split step" size="sm" />
            <IconButton icon="merge" label="Merge with previous" size="sm" />
            <IconButton icon="trash" label="Delete step" size="sm" tone="critical" onClick={() => setConfirm(true)} />
          </>
        )}
      </div>
    </section>
  )
}

function Editor({ onBack }) {
  const [mode, setMode] = React.useState('Edit')
  const [active, setActive] = React.useState(1)
  const [pubMenu, setPubMenu] = React.useState(false)
  const [sel, setSel] = React.useState(null)
  const [hidden, setHidden] = React.useState(false)
  const [published, setPublished] = React.useState(false)
  const canvasRef = React.useRef(null)

  // Real selection driving a real toolbar. Selecting any text in the canvas measures the
  // range against the canvas box and hands the rect to <Toolbar>, which decides flip.
  React.useEffect(() => {
    const onUp = () => {
      const s = window.getSelection()
      const box = canvasRef.current
      if (!s || s.isCollapsed || !box || !box.contains(s.anchorNode)) return setSel(null)
      const b = s.getRangeAt(0).getBoundingClientRect()
      if (!b.width) return setSel(null)
      const p = box.getBoundingClientRect()
      setSel({ top: b.top - p.top, bottom: b.bottom - p.top, left: b.left - p.left, width: b.width })
    }
    document.addEventListener('selectionchange', onUp)
    return () => document.removeEventListener('selectionchange', onUp)
  }, [])

  // A demo of the real mechanism: while a selection toolbar is open the canvas carries
  // q-quiet-tools, so every hover-revealed control gets out of its way.
  const canvasCls = 'q-editor-canvas' + (sel ? ' q-quiet-tools' : '')

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Bar
        left={<>
          <Button variant="ghost" icon="arrow-left" onClick={onBack}>Help center</Button>
          <Segmented options={['Edit', 'Preview']} value={mode} onChange={setMode} style={{ marginLeft: 8 }} />
          <span style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
            <IconButton icon="undo" label="Undo" />
            <IconButton icon="redo" label="Redo" disabled />
          </span>
        </>}
        right={<>
          <State state={published ? 'live' : 'edits'} sub={published ? undefined : '1'} style={{ marginRight: 8 }} />
          <ThemeToggle />
          <span style={{ position: 'relative', display: 'flex' }}>
            <Button variant={published ? 'secondary' : 'accent'} onClick={() => setPublished(true)}
              style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
              {published ? 'Published' : 'Publish changes'}
            </Button>
            <button className={'q-btn' + (published ? ' q-btn--secondary' : ' q-btn--accent')}
              onClick={() => setPubMenu(!pubMenu)} aria-label="Publish options"
              style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, padding: '0 10px', marginLeft: 1 }}>
              <Icon name="chevron" size={16} />
            </button>
            {pubMenu && (
              <Menu width={330} style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 'var(--z-menu)' }}
                items={[
                  { type: 'group', label: 'This article' },
                  { label: 'Copy link', icon: 'link' },
                  { label: 'View live page', icon: 'external' },
                  { label: 'Change category', sub: 'Filed under Getting started.', icon: 'folder' },
                  { type: 'divider' },
                  { type: 'group', label: 'Who can find it' },
                  { label: 'Hide from search and browsing', sub: 'Stays live at its link. Removed from your help center’s search results and category pages.', icon: 'eye-off', switch: hidden, onToggle: setHidden },
                  { type: 'divider' },
                  { label: 'Discard unpublished edits', sub: 'Restores the published version. Can’t be undone.', icon: 'undo', critical: true },
                  { label: 'Unpublish', sub: 'Takes it off your help center. Keeps the content.', icon: 'eye-off', critical: true },
                  { label: 'Delete article', sub: 'The article and its recording go together.', icon: 'trash', critical: true },
                ]} />
            )}
          </span>
        </>} />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Step rail */}
        <nav style={{ width: 'var(--rail-steps)', flex: 'none', padding: 'var(--s-6) var(--s-3)', overflow: 'auto' }}>
          <Micro style={{ padding: '0 10px 10px' }}>Steps</Micro>
          <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {ARTICLE.steps.map((s, i) => {
              const n = i + 1
              const on = active === n
              return (
                <li key={n}>
                  <a href={'#step-' + n} onClick={() => setActive(n)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 11, padding: '9px 11px',
                      borderRadius: 'var(--r-md)', textDecoration: 'none',
                      background: on ? 'var(--surface-1)' : 'transparent',
                      boxShadow: on ? 'var(--e1), var(--edge)' : 'none',
                      transition: 'background var(--dur-2) var(--ease)',
                    }}>
                    <span className="q-micro" style={{ width: 14, textAlign: 'right', color: on ? 'var(--brand)' : 'var(--ink-4)', flex: 'none' }}>{n}</span>
                    {s.shot && <Thumb src={s.shot} active={on} />}
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.4, color: on ? 'var(--ink)' : 'var(--ink-3)', fontWeight: on ? 'var(--w-strong)' : 'var(--w-body)' }}>{s.h}</span>
                  </a>
                </li>
              )
            })}
          </ol>
          <button style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginTop: 'var(--s-3)', padding: '9px 10px', borderRadius: 'var(--r-md)', color: 'var(--ink-3)', fontSize: 14, fontWeight: 'var(--w-medium)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--ink)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink-3)' }}>
            <Icon name="plus" size={15} /> Add a step
          </button>
        </nav>

        {/* Canvas */}
        <main className={canvasCls} style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'auto', padding: 'var(--s-12) var(--gutter) var(--s-32)' }}>
          <div style={{ maxWidth: 'var(--shell-prose)', margin: '0 auto', position: 'relative' }} ref={canvasRef}>
            <h1 contentEditable suppressContentEditableWarning
              style={{ fontSize: 'var(--t-d2)', letterSpacing: 'var(--tr-display-lg)', outline: 'none', maxWidth: 'var(--measure-title)' }}>
              {ARTICLE.title}
            </h1>
            <p className="q-lede" contentEditable suppressContentEditableWarning style={{ marginTop: 'var(--s-5)', outline: 'none' }}>
              {ARTICLE.standfirst}
            </p>

            {/* Whole-guide AI action. A quiet inset row, not a dashed box. */}
            <button style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', marginTop: 'var(--s-8)', padding: '13px 16px', borderRadius: 'var(--r-md)', background: 'var(--surface-2)', color: 'var(--ink-2)', fontSize: 15, textAlign: 'left', transition: 'background var(--dur-2) var(--ease)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--brand-wash)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}>
              <span style={{ color: 'var(--brand)', display: 'flex' }}><Icon name="sparkle" size={17} /></span>
              Change something across the whole guide
            </button>

            <div style={{ height: 1, background: 'var(--rule)', marginTop: 'var(--s-10)' }} />

            {ARTICLE.steps.map((s, i) => (
              <StepCard key={i} n={i + 1} step={s} active={active === i + 1} onSelect={() => setActive(i + 1)} />
            ))}

            {/* Select any text above and the toolbar appears over it: it takes --z-toolbar so
                it clears every bar, flips below the selection near the top edge, and quiets the
                per-step hover tools via q-quiet-tools while it is open. */}
            <p style={{ marginTop: 'var(--s-16)', fontSize: 13.5, color: 'var(--ink-3)', maxWidth: '58ch' }}>
              Select any text on this page. The toolbar sits above every bar, flips below the
              selection near the top edge, and quiets the step tools while it is open.
            </p>

            {sel && (
              <Toolbar rect={sel} items={[
                { icon: 'bold', label: 'Bold', on: true },
                { icon: 'italic', label: 'Italic' },
                { icon: 'link', label: 'Link' },
                { type: 'divider' },
                { icon: 'sparkle', label: 'Rewrite this' },
              ]} />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

Object.assign(window, { Editor, StepCard })
