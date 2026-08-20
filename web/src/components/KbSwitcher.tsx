import { useEffect, useMemo, useRef, useState } from 'react'
import { limitsFor } from '../lib/plans'
import type { KnowledgeBase } from '../lib/types'

// One component, two states.
//
// Visibility is decided by how many KBs the account ACTUALLY holds, not by the plan's
// allowance. Those differ in a case we create on purpose: a founder claims a demo KB and
// keeps a second one that already had content, so they hold two KBs on a one-KB plan. Gate
// on the plan and the switcher vanishes, stranding them with no way to reach the KB they
// just claimed. The plan limit governs whether you can MAKE another one; the count governs
// whether you can get to the ones you have.
//
// With a single KB this is a plain label: no dropdown, no chevron, no hint that multi-KB
// exists. Teasing a locked feature in the main chrome is an ad in the one place the user
// cannot dismiss it — and this is the Growth multi-KB feature built once, not an admin
// hack to be thrown away later.

type Props = {
  kb: KnowledgeBase
  // Null inside someone else's help center — no plan, so no "New help center" action.
  plan: string | null
  kbs: KnowledgeBase[]
  userId: string | null
  onSwitch: (kbId: string) => void
  onCreate?: () => void
}

export default function KbSwitcher({ kb, plan, kbs, userId, onSwitch, onCreate }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const showSwitcher = kbs.length > 1
  // OWNED only. Being invited into a colleague's help center must not consume the
  // invitee's own allowance — that would make accepting an invite cost you the ability to
  // make your own (team-access-spec L5).
  const owned = kbs.filter((k) => k.owner_id === userId)
  const canCreate = !!plan && owned.length < limitsFor(plan).kbs

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

  // Two sections. The header is the ONLY place the distinction appears: inside a help
  // center, an admin's experience is the owner's minus billing and the domain, and
  // labelling every row would make it feel like a lesser kind of access.
  const sections: [string, KnowledgeBase[]][] = [
    ['Yours', matches.filter((k) => k.owner_id === userId)],
    ['Shared with you', matches.filter((k) => k.owner_id !== userId)],
  ]

  if (!showSwitcher) return <span className="lib-kb-name">{kb.name}</span>

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
            {sections.map(([label, rows]) =>
              rows.length === 0 ? null : (
                <div key={label}>
                  {/* Only worth a heading when there is something to tell apart. */}
                  {sections.every(([, r]) => r.length > 0) && (
                    <p className="kbsw-group">{label}</p>
                  )}
                  {rows.map((k) => (
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
                </div>
              ),
            )}
            {matches.length === 0 && <p className="kbsw-empty">No help centers match.</p>}
          </div>
          {onCreate && canCreate && (
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
