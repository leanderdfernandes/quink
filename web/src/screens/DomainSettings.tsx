import { useEffect, useState } from 'react'
import State from '../components/State'
import { supabase } from '../lib/supabase'
import { READER_DOMAIN, WORKER_URL } from '../lib/config'
import type { KnowledgeBase as KB } from '../lib/types'

// Custom domain (build spec §4). The worker owns the state machine and registers the host
// with the platform that serves us (that is what buys routing + the TLS cert). The free
// {subdomain}.quink.online is always live and never goes down — a custom domain only
// layers on top.
//
// Custom domains are a paid feature (pricing-spec §Free/§Starter), but the gate lives ONLY
// in the worker (config.DOMAIN_REQUIRES_PAID_PLAN) — no plan list mirrored here to drift
// out of sync.
//
// Rebuilt against articles-domain-design-pass.html. Two things were wrong before: both
// addresses were stamped LIVE with nothing saying which one readers actually land on, and
// neither was clickable. Exactly one card is now marked as serving; the other is marked as
// redirecting to it, which is what the reader does (ReaderSite canonicalizes the subdomain
// to a live custom domain).

type Props = {
  kb: KB
  onBack: () => void
  onChange: (kb: KB) => void
}

type DnsRecord = { type: string; host: string; value: string; ttl: number }

// UNCHANGED, deliberately: the mid-verification poll cadence. The copy below is derived
// from this constant rather than written out, so the screen cannot claim an interval the
// code isn't keeping.
const POLL_MS = 4000

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

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="dm-copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        } catch {
          setCopied(false)
        }
      }}
      aria-label={`Copy ${value}`}
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

// An address, as a link that opens in a new tab, with copy beside it. Both addresses on
// this screen get the same treatment — the thing you want to do with an address is visit it
// or send it to someone.
function Address({ host, live = true }: { host: string; live?: boolean }) {
  return (
    <span className="dm-addr">
      {live ? (
        <a href={`https://${host}`} target="_blank" rel="noopener">
          {host}
          <ExternalIcon />
        </a>
      ) : (
        <span className="dm-addr-flat">{host}</span>
      )}
    </span>
  )
}

function RecordTable({ records }: { records: DnsRecord[] }) {
  if (!records.length) return null
  return (
    <>
      <div className="dm-dns">
        <div className="dm-dns-h">
          <span>Type</span>
          <span>Name</span>
          <span>Value</span>
          <span />
        </div>
        {records.map((r) => (
          <div className="dm-dns-r" key={`${r.type}-${r.host}-${r.value}`}>
            <span>{r.type}</span>
            <span>{r.host}</span>
            <span title={r.value}>{r.value}</span>
            <CopyButton value={r.value} />
          </div>
        ))}
      </div>
      <p className="dm-note">
        Leave TTL at {records[0].ttl} seconds, or whatever your provider suggests.
      </p>
    </>
  )
}

export default function DomainSettings({ kb, onBack, onChange }: Props) {
  const [status, setStatus] = useState(kb.domain_status)
  const [domainInput, setDomainInput] = useState(kb.custom_domain ?? '')
  const [adding, setAdding] = useState(false)
  const [records, setRecords] = useState<DnsRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [lastChecked, setLastChecked] = useState(kb.domain_last_checked_at)

  // DNS takes hours, so users leave and come back. Re-fetch the records they still have to
  // add rather than showing a "waiting for DNS" card with nothing to act on.
  useEffect(() => {
    if (!kb.custom_domain || status === 'none') return
    let cancelled = false
    post('/api/domain/records', { kb_id: kb.id })
      .then((r) => !cancelled && setRecords(r.records ?? []))
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // Only on mount / when the connected domain changes — not on every status tick.
  }, [kb.id, kb.custom_domain]) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll the KB while mid-verification so the UI flips to live the moment the background
  // job resolves it — the user doesn't have to refresh. UNCHANGED cadence.
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
        setLastChecked(next.domain_last_checked_at)
        onChange(next)
        if (next.domain_error) setError(next.domain_error)
      }
    }, POLL_MS)
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
      setRecords(r.records ?? [])
      setStatus('pending')
      setAdding(false)
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
      setLastChecked(new Date().toISOString())
      if (r.status === 'live') onChange({ ...kb, domain_status: 'live' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check failed.')
    }
    setBusy(false)
  }

  async function disconnect() {
    setBusy(true)
    await post('/api/domain/disconnect', { kb_id: kb.id }).catch(() => {})
    setStatus('none')
    setRecords([])
    setDomainInput('')
    setConfirmRemove(false)
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
  const customHost = kb.custom_domain || domainInput
  const customServing = status === 'live' && !!kb.custom_domain
  const waiting = status === 'pending' || status === 'verifying'

  return (
    <div className="settings">
      <header className="settings-top">
        <button
          className="btn btn-ghost btn-sm"
          onClick={onBack}
        >
          ← Help center
        </button>
      </header>

      <div className="dm">
        <h1>Domain</h1>
        <p className="dm-lede">
          Your help center is always reachable at its free address. Add your own domain
          whenever you're ready.
        </p>

        {/* Exactly one card is marked as serving readers. When there is no custom domain,
            that is the free address — it is the primary, not a placeholder above nothing. */}
        {customServing && (
          <div className="dm-card serving">
            <div className="dm-row1">
              <Address host={customHost} />
              <State className="dm-tag" state="live" label="Serving readers" />
              <CopyButton value={`https://${customHost}`} />
            </div>
            <p className="dm-note">
              This is the address readers reach. The certificate is issued and renews on its
              own.
            </p>
            {confirmRemove ? (
              <div className="dm-confirm">
                <p>
                  Remove {customHost}? Your help center goes straight back to{' '}
                  <b>{freeHost}</b> and stays online. Links you've already shared on{' '}
                  {customHost} stop working — anything pointing at the free address keeps
                  working, because that one never goes away.
                </p>
                <button className="row-confirm" disabled={busy} onClick={disconnect}>
                  {busy ? 'Removing…' : 'Remove it'}
                </button>
                <button className="row-cancel" onClick={() => setConfirmRemove(false)}>
                  Keep it
                </button>
              </div>
            ) : (
              <button className="dm-danger" onClick={() => setConfirmRemove(true)}>
                Remove this domain
              </button>
            )}
          </div>
        )}

        <div className={`dm-card${customServing ? '' : ' serving'}`}>
          <div className="dm-row1">
            <Address host={freeHost} />
            <State
              className="dm-tag"
              state={customServing ? 'unlisted' : 'live'}
              label={customServing ? 'Redirects' : 'Serving readers'}
            />
            <CopyButton value={`https://${freeHost}`} />
          </div>
          <p className="dm-note">
            {customServing
              ? `Your free address. Anyone who opens an old link here lands on ${customHost} instead, so nothing you've shared breaks. It never goes away.`
              : 'Your free address. It never goes away.'}
          </p>
        </div>

        {/* Waiting on DNS — the record, inline and copyable, with the check running in
            view. Nobody should have to go looking for this in an email. */}
        {waiting && (
          <div className="dm-card">
            <div className="dm-row1">
              <Address host={customHost} live={false} />
              <State className="dm-tag" state="saving" label="Waiting on DNS" />
            </div>
            <p className="dm-note">
              Add this record with whoever manages {customHost}, then we'll take it from
              here.
            </p>
            <RecordTable records={records} />
            <p className="dm-check">
              <span className="dm-spin" aria-hidden />
              Checking every {Math.round(POLL_MS / 1000)} seconds. DNS can take a few hours
              to spread.
              {lastChecked && <> Last checked {new Date(lastChecked).toLocaleTimeString()}.</>}
            </p>
            <p className="dm-note">
              You can close this page — we'll email you the moment it's live.
            </p>
            <div className="dm-actions">
              <button className="btn btn-ghost" onClick={checkNow} disabled={busy}>
                {busy ? 'Checking…' : 'Check now'}
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

        {/* Failed — what we know, plus the record to compare against. "It failed" with
            nothing to check against leaves the person with nothing to do. */}
        {status === 'failed' && (
          <div className="dm-card bad">
            <div className="dm-row1">
              <Address host={customHost} live={false} />
              <State className="dm-tag" state="failed" label="Not connected" />
            </div>
            <p className="dm-bad">
              {error || kb.domain_error || 'We checked and could not reach this domain yet.'}
            </p>
            <p className="dm-note">
              We checked {kb.domain_attempts} times over the last few hours. Compare what
              your provider has against the record below — if they already match, DNS may
              still be spreading, and Check again will pick it up.
            </p>
            <RecordTable records={records} />
            <div className="dm-actions">
              <button className="btn btn-ghost" onClick={checkNow} disabled={busy}>
                {busy ? 'Checking…' : 'Check again'}
              </button>
              <button className="linklike" onClick={() => setConfirmRemove(true)}>
                Use a different domain
              </button>
              {import.meta.env.DEV && (
                <button className="linklike dev-stub" onClick={simulateDns}>
                  ⚙ Simulate DNS (dev)
                </button>
              )}
            </div>
            {confirmRemove && (
              <div className="dm-confirm">
                <p>
                  Drop {customHost} and start over? Nothing on your help center changes — it
                  is still served at <b>{freeHost}</b>. If you already pointed DNS at us,
                  remove that record too.
                </p>
                <button className="row-confirm" disabled={busy} onClick={disconnect}>
                  {busy ? 'Removing…' : 'Start over'}
                </button>
                <button className="row-cancel" onClick={() => setConfirmRemove(false)}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {status === 'none' &&
          (adding ? (
            <div className="dm-card">
              <label className="dm-label" htmlFor="dm-domain">
                Your domain
              </label>
              <div className="dm-connect">
                <input
                  id="dm-domain"
                  type="text"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  placeholder="help.yourcompany.com"
                  spellCheck={false}
                  autoFocus
                />
                <button className="btn" onClick={connect} disabled={busy || !domainInput.trim()}>
                  {busy ? 'Connecting…' : 'Connect'}
                </button>
              </div>
              <p className="dm-note">
                We'll show you the one record to add. Your free address keeps working
                throughout.
              </p>
              {error && <p className="dm-bad">{error}</p>}
              <button className="linklike" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button className="dm-add" onClick={() => setAdding(true)}>
              + Use your own domain
            </button>
          ))}
      </div>
    </div>
  )
}

const ExternalIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <path d="M15 3h6v6M10 14 21 3" />
  </svg>
)
