import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { READER_DOMAIN, WORKER_URL } from '../lib/config'
import type { KnowledgeBase as KB } from '../lib/types'

// Custom domain (build spec §4). The state machine is the real work; verification is
// stubbed behind the worker. The free {subdomain}.quink.site is always live and never
// goes down — adding a custom domain only layers on top.

type Props = {
  kb: KB
  onBack: () => void
  onChange: (kb: KB) => void
}

type Record = { type: string; host: string; value: string; ttl: number }

async function post(path: string, body: unknown) {
  // The worker checks this token owns the kb_id — otherwise anyone could connect or
  // disconnect a custom domain on any KB.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const res = await fetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || 'Something went wrong.')
  return data
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="dns-field">
      <span className="dns-label">{label}</span>
      <code className="dns-value">{value}</code>
      <button
        className="btn btn-ghost dns-copy"
        onClick={async () => {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

export default function DomainSettings({ kb, onBack, onChange }: Props) {
  const [status, setStatus] = useState(kb.domain_status)
  const [domainInput, setDomainInput] = useState(kb.custom_domain ?? '')
  const [record, setRecord] = useState<Record | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Poll the KB while mid-verification so the UI flips to live the moment the background
  // job resolves it — the user doesn't have to refresh.
  useEffect(() => {
    if (status !== 'pending' && status !== 'verifying') return
    const t = setInterval(async () => {
      const { data } = await supabase
        .from('knowledge_bases')
        .select('*')
        .eq('id', kb.id)
        .single()
      if (data) {
        const next = data as KB
        setStatus(next.domain_status)
        onChange(next)
        if (next.domain_error) setError(next.domain_error)
      }
    }, 4000)
    return () => clearInterval(t)
  }, [status, kb.id, onChange])

  async function connect() {
    setBusy(true)
    setError(null)
    try {
      const r = await post('/api/domain/connect', {
        kb_id: kb.id,
        domain: domainInput.trim(),
      })
      setRecord(r.record)
      setStatus('pending')
      onChange({ ...kb, custom_domain: domainInput.trim(), domain_status: 'pending' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect the domain.')
    }
    setBusy(false)
  }

  async function checkNow() {
    setBusy(true)
    setError(null)
    try {
      const r = await post('/api/domain/check', { kb_id: kb.id })
      setStatus(r.status)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check failed.')
    }
    setBusy(false)
  }

  async function disconnect() {
    setBusy(true)
    await post('/api/domain/disconnect', { kb_id: kb.id }).catch(() => {})
    setStatus('none')
    setRecord(null)
    setDomainInput('')
    onChange({ ...kb, custom_domain: null, domain_status: 'none' })
    setBusy(false)
  }

  // DEV ONLY: drive the stub verifier so the transitions are testable with no real DNS.
  async function simulateDns() {
    await post('/api/domain/stub', { domain: domainInput.trim(), resolves: true }).catch(
      (e) => setError(e instanceof Error ? e.message : 'Stub unavailable'),
    )
    await checkNow()
  }

  const freeHost = `${kb.subdomain}.${READER_DOMAIN}`

  return (
    <div className="settings">
      <header className="settings-top">
        <button
          className="btn btn-ghost"
          style={{ padding: '6px 12px', fontSize: 13 }}
          onClick={onBack}
        >
          ← Help center
        </button>
      </header>

      <div className="settings-single">
        <h2 style={{ marginBottom: 4 }}>Domain</h2>
        <p className="cap" style={{ marginBottom: 28 }}>
          Your help center is always live at its free address. Add your own domain when
          you’re ready.
        </p>

        {/* Free subdomain — always live. */}
        <div className="domain-card">
          <div className="domain-card-head">
            <span className="domain-host">{freeHost}</span>
            <span className="domain-pill live">Live</span>
          </div>
          <p className="cap">Free address. This never goes down.</p>
        </div>

        {/* Custom domain */}
        {status === 'none' && (
          <div className="domain-card">
            <label>Your domain</label>
            <div className="domain-connect-row">
              <input
                type="text"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="docs.yourcompany.com"
                spellCheck={false}
              />
              <button className="btn" onClick={connect} disabled={busy || !domainInput.trim()}>
                Connect
              </button>
            </div>
            {error && <p className="err">{error}</p>}
          </div>
        )}

        {(status === 'pending' || status === 'verifying') && (
          <div className="domain-card">
            <div className="domain-card-head">
              <span className="domain-host">{kb.custom_domain || domainInput}</span>
              <span className="domain-pill pending">Waiting for DNS</span>
            </div>
            <p className="cap" style={{ marginBottom: 16 }}>
              Add this one record at your DNS provider. Not seeing it yet is normal — DNS can
              take a few hours. You can close this page; we’ll email you the moment it’s live.
            </p>

            {record && (
              <div className="dns-record">
                <CopyField label="Type" value={record.type} />
                <CopyField label="Host" value={record.host} />
                <CopyField label="Value" value={record.value} />
                <CopyField label="TTL" value={String(record.ttl)} />
              </div>
            )}

            <div className="domain-actions">
              <button className="btn btn-ghost" onClick={checkNow} disabled={busy}>
                {busy ? 'Checking…' : 'Check again'}
              </button>
              <button className="linklike" onClick={disconnect} disabled={busy}>
                Cancel
              </button>
              {import.meta.env.DEV && (
                <button className="linklike dev-stub" onClick={simulateDns}>
                  ⚙ Simulate DNS (dev)
                </button>
              )}
            </div>
            {error && <p className="err">{error}</p>}
          </div>
        )}

        {status === 'live' && (
          <div className="domain-card">
            <div className="domain-card-head">
              <span className="domain-host">{kb.custom_domain}</span>
              <span className="domain-pill live">Live</span>
            </div>
            <p className="cap" style={{ marginBottom: 16 }}>
              Your help center is served on your domain. Old links at {freeHost} redirect
              here automatically.
            </p>
            <button className="linklike" onClick={disconnect} disabled={busy}>
              Remove domain
            </button>
          </div>
        )}

        {status === 'failed' && (
          <div className="domain-card">
            <div className="domain-card-head">
              <span className="domain-host">{kb.custom_domain}</span>
              <span className="domain-pill failed">Not found</span>
            </div>
            <p className="err" style={{ marginBottom: 16 }}>
              {error || kb.domain_error || 'We couldn’t find the DNS record.'}
            </p>
            <div className="domain-actions">
              <button className="btn btn-ghost" onClick={checkNow} disabled={busy}>
                Try again
              </button>
              <button className="linklike" onClick={disconnect} disabled={busy}>
                Start over
              </button>
              {import.meta.env.DEV && (
                <button className="linklike dev-stub" onClick={simulateDns}>
                  ⚙ Simulate DNS (dev)
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
