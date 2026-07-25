import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Wordmark from '../components/Wordmark'

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
  profiles: { email: string } | null
}

export default function Admin() {
  const navigate = useNavigate()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [kbs, setKbs] = useState<AdminKb[]>([])

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
        .select('id, name, subdomain, owner_id, profiles(email)')
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
          className="btn btn-ghost"
          style={{ marginLeft: 'auto', padding: '6px 12px', fontSize: 13 }}
          onClick={() => navigate('/')}
        >
          Back to my help center
        </button>
      </header>

      <div className="settings-body">
        <h2>Help centers</h2>
        <p className="cap" style={{ marginBottom: 18 }}>
          {kbs.length} total. Opening one shows the viewing-as-admin bar until you exit.
        </p>

        <table className="admin-table">
          <thead>
            <tr>
              <th>Help center</th>
              <th>Owner</th>
              <th>Address</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {kbs.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td className="cap">{k.profiles?.email ?? '—'}</td>
                <td className="cap">{k.subdomain ?? '—'}</td>
                <td>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '4px 10px', fontSize: 13 }}
                    onClick={() => navigate(`/app/${k.id}`)}
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
