import { useEffect, useMemo, useRef, useState } from 'react'
import { limitsFor } from '../lib/plans'
import type { KnowledgeBase } from '../lib/types'

// One component, two states, decided by the plan's KB allowance.
//
// On a 1-KB plan this is a plain label: no dropdown, no chevron, no hint that multi-KB
// exists. Teasing a locked feature in the main chrome is an ad in the one place the user
// cannot dismiss it — and this is the Growth multi-KB feature built once, not an admin
// hack to be thrown away later.

type Props = {
  kb: KnowledgeBase
  plan: string
  kbs: KnowledgeBase[]
  onSwitch: (kbId: string) => void
  onCreate?: () => void
}

export default function KbSwitcher({ kb, plan, kbs, onSwitch, onCreate }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const multi = limitsFor(plan).kbs > 1

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? kbs.filter((k) => k.name.toLowerCase().includes(q)) : kbs
  }, [kbs, query])

  if (!multi) return <span className="lib-kb-name">{kb.name}</span>

  return (
    <div className="kbsw" ref={ref}>
      <button
        className="kbsw-trigger"
        onClick={() => {
          setOpen((v) => !v)
          setQuery('')
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="lib-kb-name">{kb.name}</span>
        <span className="kbsw-chev" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="kbsw-menu" role="listbox">
          {/* Search, not just a list: 30 demo KBs is well past scanning range. */}
          <input
            className="kbsw-search"
            autoFocus
            placeholder="Search help centers…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="kbsw-list">
            {matches.map((k) => (
              <button
                key={k.id}
                role="option"
                aria-selected={k.id === kb.id}
                className={`kbsw-item${k.id === kb.id ? ' on' : ''}`}
                onClick={() => {
                  setOpen(false)
                  if (k.id !== kb.id) onSwitch(k.id)
                }}
              >
                <span className="kbsw-item-name">{k.name}</span>
                {k.subdomain && <span className="kbsw-item-sub">{k.subdomain}</span>}
              </button>
            ))}
            {matches.length === 0 && <p className="kbsw-empty">No help centers match.</p>}
          </div>
          {onCreate && (
            <button
              className="kbsw-new"
              onClick={() => {
                setOpen(false)
                onCreate()
              }}
            >
              + New help center
            </button>
          )}
        </div>
      )}
    </div>
  )
}
