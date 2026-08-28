const { Micro, Button, IconButton, Icon, Card, Input, Chip, Row, State, Group, Menu, Notice, AvatarStack } = window.QuinkDesignSystem_6ae0bd

// The article library. v2 changes:
//   · Folders are groups on the page, not cards inside cards.
//   · State appears only on rows that aren't the norm — a column of forty "Draft" pills was
//     the single biggest source of the generated feel.
//   · The filter chips select with an INK fill, so they don't compete with New article.
//   · The page title is the serif, with the counts as mono metadata beneath it.

function Library({ onNew, onOpen }) {
  const [filter, setFilter] = React.useState('All')
  const [menu, setMenu] = React.useState(false)
  const [q, setQ] = React.useState('')

  const match = (a) =>
    (filter === 'All' || (filter === 'Live' ? a.state === 'live' || a.state === 'edits' : a.state === 'draft')) &&
    (!q || a.title.toLowerCase().includes(q.toLowerCase()))

  const folders = FOLDERS.map((f) => ({ ...f, articles: f.articles.filter(match) }))
  const unfiled = UNFILED.filter(match)
  const total = FOLDERS.reduce((n, f) => n + f.articles.length, 0) + UNFILED.length
  const live = [...FOLDERS.flatMap((f) => f.articles), ...UNFILED].filter((a) => a.state === 'live' || a.state === 'edits').length

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Bar
        left={<Crumb items={[KB.name]} />}
        right={<>
          <AvatarStack people={['Priya Raman', 'Sam Okafor', 'Lee Chen', 'Dana Wu']} />
          <ThemeToggle />
          <Button variant="ghost" size="sm">Sign out</Button>
        </>} />

      <div style={{ flex: 1, display: 'flex', width: '100%', maxWidth: 'calc(var(--shell-app) + var(--rail) + var(--gutter) * 2)', margin: '0 auto' }}>
        <Rail current="library" runs={KB.runs} />

        <main style={{ flex: 1, minWidth: 0, padding: 'var(--s-10) var(--gutter) var(--s-24)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--s-6)', marginBottom: 'var(--s-8)' }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: 'var(--t-d3)' }}>All articles</h1>
              <Micro style={{ marginTop: 8 }}>{total} articles · {live} live · 2 folders</Micro>
            </div>
            <Button variant="secondary" icon="folder-plus">New folder</Button>
            <span style={{ position: 'relative' }}>
              <Button icon="plus" iconAfter="chevron" onClick={() => setMenu(!menu)}>New article</Button>
              {menu && (
                <Menu width={320} style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 'var(--z-menu)' }}
                  items={[
                    { label: 'From a recording', sub: 'Drop in a screen recording and get a drafted guide.', icon: 'film', onClick: () => { setMenu(false); onNew() } },
                    { label: 'Write by hand', sub: 'Start from an empty article. Unlimited on every plan.', icon: 'pencil', onClick: () => setMenu(false) },
                  ]} />
              )}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', marginBottom: 'var(--s-8)' }}>
            <Input search placeholder="Search your articles…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 2 }}>
              <Chip on={filter === 'All'} count={total} onClick={() => setFilter('All')}>All</Chip>
              <Chip on={filter === 'Live'} count={live} onClick={() => setFilter('Live')}>Live</Chip>
              <Chip on={filter === 'Drafts'} count={total - live} onClick={() => setFilter('Drafts')}>Drafts</Chip>
            </div>
          </div>

          {folders.map((f) => (
            <Group key={f.name} name={f.name} count={`${f.articles.length} ${f.articles.length === 1 ? 'article' : 'articles'}`}
              actions={<><IconButton icon="pencil" label="Rename folder" size="sm" /><IconButton icon="dots" label="More" size="sm" /></>}
              empty={f.articles.length === 0 ? 'Nothing here matches that filter.' : undefined}>
              {f.articles.map((a) => (
                <Row key={a.title} onClick={onOpen} title={a.title} desc={a.desc}
                  state={a.state !== 'draft' ? <State state={a.state} sub={a.sub} /> : undefined}
                  meta={<Micro as="span" style={{ flex: 'none' }}>{a.steps} steps · {a.when}</Micro>}
                  actions={<>
                    <IconButton icon="external" label="View live page" size="sm" />
                    <IconButton icon="dots" label="More" size="sm" />
                  </>} />
              ))}
            </Group>
          ))}

          {/* Unfiled is a real place, not an error state — a quiet surface says that without
              a dashed rectangle. The warning about folders is a notice, not a tinted row. */}
          <Group name="Unfiled" quiet count={`${unfiled.length} articles`}>
            <div style={{ padding: '10px 12px 4px' }}>
              <Notice tone="caution">These need a folder before they can go live — the folder is the category readers browse.</Notice>
            </div>
            {unfiled.map((a) => (
              <Row key={a.title} onClick={onOpen} title={a.title} desc={a.desc}
                meta={<Micro as="span" style={{ flex: 'none' }}>{a.steps} steps · {a.when}</Micro>}
                actions={<><Button variant="ghost" size="sm" icon="folder">File it</Button><IconButton icon="dots" label="More" size="sm" /></>} />
            ))}
          </Group>
        </main>
      </div>
    </div>
  )
}

Object.assign(window, { Library })
