import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Wordmark from '../components/Wordmark'
import { timeAgo } from './KnowledgeBase'

// The admin shell. Deliberately thin this slice: the Users / Leads / Runs / KBs tabs are
// the next one. What is here is the entry point open-as-owner needs — a way to reach a KB
// you don't own, and a place for the admin banner's exit action to land.
//
// The route guard below is NOT the security boundary. It only decides what to render; the
// actual protection is RLS (migration 0015), which answers a non-admin with zero rows no
// matter how they reach the data. A route guard alone is theatre when the SPA talks to
// Supabase directly.

type AdminKb = {
  id: string
  name: string
  subdomain: string | null
  owner_id: string
  // Null until someone actually reads the help center (migration 0031). Read-only here —
  // this is the North Star metric's raw input, not a control.
  last_reader_view_at: string | null
  profiles: { email: string } | null
}

export default function Admin() {
  const navigate = useNavigate()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [kbs, setKbs] = useState<AdminKb[]>([])
  const [toast, setToast] = useState<string | null>(null)

  // Generating a link is the ONLY admin path to moving a KB — there is deliberately no
  // force-transfer. One code path means one place the entitlement resets can be forgotten,
  // and the recipient's consent is implicit in them clicking.
  async function claimLink(kbId: string) {
    // create_claim_link returns the ASSEMBLED url, so there is no second place that knows
    // how a claim link is spelled. p_base follows the current origin so a link generated
    // in local dev is actually clickable there.
    const { data, error } = await supabase.rpc('create_claim_link', {
      p_kb_id: kbId,
      p_base: window.location.origin,
    })
    if (error || !data) {
      setToast('Could not create a claim link.')
      return
    }
    await navigator.clipboard.writeText(data as string).catch(() => {})
    setToast(`Claim link copied — valid 30 days. ${data}`)
    setTimeout(() => setToast(null), 12000)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) {
        if (!cancelled) setAllowed(false)
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', auth.user.id)
        .maybeSingle()
      if (cancelled) return

      if (!profile?.is_admin) {
        setAllowed(false)
        return
      }
      setAllowed(true)

      // Reaches every KB only because is_admin() widened the policy. For anyone else this
      // same query returns their own rows and nothing more.
      const { data } = await supabase
        .from('knowledge_bases')
        // Explicit FK: kb_members gives knowledge_bases a second path to profiles, and a
        // bare embed is ambiguous (PGRST201).
        .select('id, name, subdomain, owner_id, last_reader_view_at, profiles!knowledge_bases_owner_id_fkey(email)')
        .order('created_at', { ascending: false })
      if (!cancelled) setKbs((data as unknown as AdminKb[]) ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (allowed === null) return <div className="page" />

  if (!allowed) {
    return (
      <div className="page" style={{ justifyContent: 'center' }}>
        <div className="card wall">
          <h2>Not available</h2>
          <p className="cap" style={{ marginTop: 8 }}>
            This page isn't available on your account.
          </p>
          <button
            className="btn btn-ghost"
            style={{ marginTop: 18 }}
            onClick={() => navigate('/')}
          >
            Back to your help center
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="settings">
      <header className="settings-top">
        <Wordmark height={20} />
        <span className="lib-kb-tag">Admin</span>
        <button
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: 'auto' }}
          onClick={() => navigate('/')}
        >
          Back to my help center
        </button>
      </header>

      <div className="settings-body">
        {toast && <p className="claim-toast">{toast}</p>}
        <h2>Help centers</h2>
        <p className="cap" style={{ marginBottom: 18 }}>
          {kbs.length} total. Opening one shows the viewing-as-admin bar until you exit.
        </p>

        {/* Five columns will not fit a phone. The wrapper scrolls the table rather than
            the page, so the rest of the screen stays put. */}
        <div className="admin-tablewrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Help center</th>
              <th>Owner</th>
              <th>Address</th>
              <th>Last read</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {kbs.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td className="cap">{k.profiles?.email ?? '—'}</td>
                <td className="cap">{k.subdomain ?? '—'}</td>
                {/* Null is "never read", which is the honest value and is not backfilled. */}
                <td className="cap">
                  {k.last_reader_view_at ? timeAgo(k.last_reader_view_at) : '—'}
                </td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => navigate(`/app/${k.id}`)}
                  >
                    Open
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => claimLink(k.id)}
                  >
                    Claim link
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
