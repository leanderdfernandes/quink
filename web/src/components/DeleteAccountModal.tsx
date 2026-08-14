import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { READER_DOMAIN, SUPPORT_EMAIL, WORKER_URL } from '../lib/config'
import type { KnowledgeBase as KB } from '../lib/types'

// Self-serve account deletion (DPDP right to withdraw consent). The worker does the actual
// work — deleting auth.users and storage objects both need the service role, and the browser
// must never hold that key. This screen's whole job is INFORMED CONSENT.
//
// Three rules it is built to:
//
//   1. **Real numbers, not a generic warning.** "This cannot be undone" is wallpaper; people
//      click through it. The actual article count, the actual address that stops resolving
//      and the actual domain being released are the things that make someone stop and check
//      they meant the account they are signed into.
//   2. **Type the name.** A checkbox is clicked reflexively — it is one more thing between
//      the user and the button they already decided to press. Typing the help center's name
//      cannot be done without reading what is being deleted.
//   3. **Plain and non-punitive.** Someone leaving is allowed to leave. No guilt, no
//      retention pitch, no "are you sure?" stacked twice. The one offer here is the export
//      line, and it tells the truth: there is no export, so anything they want to keep has
//      to be copied out by hand first.
//
// The permanence line is deliberate and literal: we are not on Supabase Pro, so there is no
// point-in-time recovery. Saying "no backup to restore from" is a fact about our
// infrastructure, not a scare tactic, and the confirmation email repeats it word for word.

type Props = {
  kbs: KB[]
  onClose: () => void
  // Called after the account is gone. The session is already invalid at that point — every
  // row behind it has been deleted — so the caller signs out rather than re-rendering.
  onDeleted: () => void
}

export default function DeleteAccountModal({ kbs, onClose, onDeleted }: Props) {
  const [typed, setTyped] = useState('')
  const [articles, setArticles] = useState<number | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Read here rather than threaded down as a prop: naming the address being deleted is this
  // dialog's job, and the session already knows it. Someone signed into two accounts in two
  // tabs finds out which one this is from the sentence, not from remembering.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null))
  }, [])

  // The name they have to type, and the one the copy names. A multi-KB account (a claimer
  // can hold two on a one-KB plan) types the FIRST one and the list below shows the rest, so
  // the phrase on screen always matches a real help center.
  const primary = kbs[0]
  const confirmName = primary?.name?.trim() ?? ''
  const domains = kbs.filter((k) => k.custom_domain).map((k) => k.custom_domain as string)

  useEffect(() => {
    if (!kbs.length) {
      setArticles(0)
      return
    }
    let cancelled = false
    ;(async () => {
      // head+exact: the count is all we need and some of these accounts have hundreds of
      // rows. RLS scopes it to this owner, so no filter beyond the kb list is required.
      const { count } = await supabase
        .from('articles')
        .select('id', { count: 'exact', head: true })
        .in(
          'kb_id',
          kbs.map((k) => k.id),
        )
      if (!cancelled) setArticles(count ?? 0)
    })()
    return () => {
      cancelled = true
    }
  }, [kbs])

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      // No body. The worker derives the account from this token and has no parameter that
      // could name a different one — sending an id here would be ignored, and there is
      // deliberately nothing to send it in.
      const res = await fetch(`${WORKER_URL}/api/account/delete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'We couldn’t delete your account.')
      onDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We couldn’t delete your account.')
      setBusy(false)
    }
  }

  const ready = confirmName.length > 0 && typed.trim() === confirmName && !busy

  return (
    <div
      className="pub-overlay"
      onClick={busy ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Delete your account"
    >
      <div className="card wall da" onClick={(e) => e.stopPropagation()}>
        <h2>Delete your account</h2>
        <p className="cap" style={{ marginTop: 10 }}>
          This deletes everything on {email ? <b>{email}</b> : 'this account'}. It is
          permanent — we don’t keep a copy, and there is no backup to restore from.
        </p>

        <ul className="da-list">
          <li>
            <b>
              {articles === null ? 'Counting…' : `${articles} ${articles === 1 ? 'article' : 'articles'}`}
            </b>{' '}
            across {kbs.length === 1 ? 'your help center' : `${kbs.length} help centers`},
            with every screenshot and recording.
          </li>
          {kbs.map((k) => (
            <li key={k.id}>
              <b>
                {k.subdomain ? `${k.subdomain}.${READER_DOMAIN}` : k.name}
              </b>{' '}
              stops resolving. Anyone who has bookmarked it or linked to it gets nothing.
            </li>
          ))}
          {domains.map((d) => (
            <li key={d}>
              <b>{d}</b> is released from our hosting. It stops serving your help center, and
              you’re free to point it anywhere else.
            </li>
          ))}
          <li>
            You’re signed out and can’t sign back in. Signing up again with the same address
            starts a completely new, empty account.
          </li>
        </ul>

        {/* The honest version of "export your data first". There is no export, and implying
            one would send someone off to look for a button that isn't there. */}
        <p className="note">
          There’s no export yet, so copy out anything you want to keep before you do this.
        </p>

        <label className="da-confirm">
          Type <b>{confirmName}</b> to confirm
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={busy}
            autoComplete="off"
            spellCheck={false}
            aria-label={`Type ${confirmName} to confirm deletion`}
          />
        </label>

        {error && (
          <p className="note da-err">
            {error}
            {SUPPORT_EMAIL && (
              <>
                {' '}
                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                    'Deleting my Quink account',
                  )}`}
                >
                  {SUPPORT_EMAIL}
                </a>
              </>
            )}
          </p>
        )}

        <div className="wall-actions">
          {/* Cancel is the primary-weighted button. The destructive one is reachable and
              plain — it does not need to look dangerous once the name has been typed. */}
          <button className="btn" onClick={onClose} disabled={busy}>
            Keep my account
          </button>
          <button className="btn btn-ghost da-go" onClick={remove} disabled={!ready}>
            {busy ? 'Deleting…' : 'Delete everything'}
          </button>
        </div>
      </div>
    </div>
  )
}
