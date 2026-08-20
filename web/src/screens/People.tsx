import { useEffect, useState } from 'react'
import {
  displayName,
  fetchPeople,
  initials,
  inviteToKb,
  removeMember,
  revokeInvite,
  sendInviteEmail,
  type Person,
} from '../lib/people'
import { limitsFor, type PlanId } from '../lib/plans'
import type { KnowledgeBase } from '../lib/types'

// People — /app/:kbId/people. One help center, many editors.
//
// One list, members and pending invites together. Keeping the invite in the same list as
// the people who accepted is what makes sending one feel completed rather than fired into
// a void, and it is why there is no second "pending" section.
//
// The invite field is inline, above the list, not behind a modal: it is one text input and
// one button, and a modal is ceremony for nothing.
//
// Error copy comes from the RPCs. invite_to_kb(), remove_kb_member() and accept_kb_invite()
// were written with real sentences in them ("that person is already here"), and a second
// set of strings here would be a second thing to keep true.

type Props = {
  kb: KnowledgeBase
  userId: string
  // Owner of THIS help center, not Quink staff. Decides the two owner-only surfaces on
  // this screen: the plan gate and its "See plans" call to action.
  isOwner: boolean
  // The owner's plan — null when this account is not the owner, because a member cannot
  // read the owner's profile and must never be shown their tier anyway (spec L7).
  plan: PlanId | null
  onBack: () => void
  onUpgrade: () => void
  // Called after you remove yourself. There is nothing to render afterwards: the very next
  // read of this KB returns nothing.
  onLeft: () => void
}

export default function People({ kb, userId, isOwner, plan, onBack, onUpgrade, onLeft }: Props) {
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<{ text: string; kind: 'ok' | 'err' | '' }>({
    text: "They'll get an email with a link that expires in 14 days.",
    kind: '',
  })
  // Two-step confirm, per row. Removing someone's access is not undoable from here — they
  // have to be invited and accept again — so it does not happen on one click.
  const [confirming, setConfirming] = useState<string | null>(null)

  async function reload() {
    setPeople(await fetchPeople(kb.id))
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    void fetchPeople(kb.id).then((p) => {
      if (cancelled) return
      setPeople(p)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [kb.id])

  // Gate ONLY when we know it is blocked. A member's plan tells us nothing about this help
  // center's entitlements, so an unknown plan renders the working field and lets
  // invite_to_kb() answer — the client may refuse locally, it may never grant (§10b), and
  // guessing "blocked" here would lock a teammate out of a paid help center.
  const gated = isOwner && !limitsFor(plan).can_invite

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const address = email.trim()
    if (!address) return
    setBusy(true)
    try {
      await inviteToKb(kb.id, address)
      setEmail('')
      // The row is committed. The email is a separate step and cannot fail it — so the
      // hint reports what actually happened rather than promising delivery.
      const sent = await sendInviteEmail(kb.id, address)
      setHint({
        text: sent
          ? `Invite sent to ${address.toLowerCase()}.`
          : `${address.toLowerCase()} is invited, but we couldn't send the email just now — use Resend in a moment.`,
        kind: sent ? 'ok' : 'err',
      })
      await reload()
    } catch (err) {
      setHint({ text: err instanceof Error ? err.message : 'Could not send that invite.', kind: 'err' })
    }
    setBusy(false)
  }

  async function resend(p: Person) {
    setBusy(true)
    // Re-sends the SAME live link. Issuing a new token would silently kill the one already
    // sitting in their inbox — the mail they are most likely to open.
    const ok = await sendInviteEmail(kb.id, p.email)
    setHint(
      ok
        ? { text: `Invite re-sent to ${p.email}.`, kind: 'ok' }
        : { text: `Couldn't re-send to ${p.email}. Try again shortly.`, kind: 'err' },
    )
    setBusy(false)
  }

  async function revoke(p: Person) {
    setBusy(true)
    try {
      await revokeInvite(p.id)
      setHint({ text: `The invite to ${p.email} no longer works.`, kind: '' })
      await reload()
    } catch (err) {
      setHint({ text: err instanceof Error ? err.message : 'Could not revoke that invite.', kind: 'err' })
    }
    setBusy(false)
    setConfirming(null)
  }

  async function remove(p: Person) {
    setBusy(true)
    const me = p.id === userId
    try {
      await removeMember(kb.id, p.id)
      if (me) return onLeft()
      setHint({ text: `${displayName(p)} no longer has access.`, kind: '' })
      await reload()
    } catch (err) {
      setHint({ text: err instanceof Error ? err.message : 'Could not remove them.', kind: 'err' })
    }
    setBusy(false)
    setConfirming(null)
  }

  const total = people.length
  const memberCount = people.filter((p) => p.kind === 'member').length

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

      <div className="pp">
        <h1>People</h1>
        <p className="pp-lede">
          Everyone here can write, edit and publish guides in this help center. No per-seat
          fees, however many people you add.
        </p>

        {gated ? (
          // Shown, never hidden. Hiding the screen means nobody learns the capability
          // exists — and this is the first upgrade surface a claimed demo meets, where the
          // pull is a want rather than a limit somebody bumped into.
          <div className="pp-gate">
            <h3>Bring your team in</h3>
            <p>
              Everyone you invite can write, edit and publish in this help center — no
              per-seat fees, however many people you add.
            </p>
            {/* Visible and inert, on purpose: the shape of the thing is the argument. */}
            <div className="pp-invite-row pp-inert" aria-hidden>
              <input type="email" placeholder="name@company.com" disabled />
              <button className="btn" disabled>
                Send invite
              </button>
            </div>
            <div className="pp-gate-foot">
              <button className="btn" onClick={onUpgrade}>
                See plans
              </button>
              <span className="pp-gate-note">
                Adding teammates is part of every paid plan. Free help centers are
                single-editor.
              </span>
            </div>
          </div>
        ) : (
          <form className="pp-invite" onSubmit={send}>
            <label htmlFor="pp-email">Invite by email</label>
            <div className="pp-invite-row">
              <input
                id="pp-email"
                type="email"
                autoComplete="off"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button className="btn" type="submit" disabled={busy || !email.trim()}>
                Send invite
              </button>
            </div>
            <p className={`pp-hint${hint.kind ? ` ${hint.kind}` : ''}`}>{hint.text}</p>
          </form>
        )}

        {/* The owner row renders under the gate too, so a free help center reads as a real
            screen with one person on it rather than as an advert. */}
        {!loading && memberCount === 1 && total === 1 && !gated && (
          <div className="pp-empty">
            <span className="pp-seam" aria-hidden>
              <i />
              <b />
              <i />
            </span>
            <h3>Just you, for now</h3>
            <p>
              Add your whole team. No per-seat fees — invite anyone who should be able to
              write and publish guides here.
            </p>
          </div>
        )}

        {!loading && (
          <>
            <p className="pp-listhead">
              {total} {total === 1 ? 'person' : 'people'}
            </p>
            <div className="pp-list">
              {people.map((p, i) => {
                const you = p.kind === 'member' && p.id === userId
                const confirm = confirming === p.id
                return (
                  <div key={`${p.kind}-${p.id}`} className={`pp-row${p.kind === 'invite' ? ' pending' : ''}`}>
                    <span className={`avatar av-t${i % 4}${p.kind === 'invite' ? ' ghost' : ''}`} aria-hidden>
                      {initials(p)}
                    </span>
                    <span className="pp-who">
                      <span className="pp-name">
                        {p.kind === 'invite' ? p.email : displayName(p)}
                      </span>
                      <span className="pp-sub">
                        {p.kind === 'invite' ? "Invited — hasn't accepted yet" : p.email}
                      </span>
                    </span>
                    <span className="pp-acts">
                      {you && <span className="pp-chip dashed">You</span>}
                      <span className={`pp-chip${p.is_owner ? ' owner' : p.kind === 'invite' ? ' pend' : ''}`}>
                        {p.is_owner ? 'Owner' : p.kind === 'invite' ? 'Pending' : 'Admin'}
                      </span>

                      {/* The owner is immovable — no action, ever, for anyone. */}
                      {p.kind === 'invite' ? (
                        confirm ? (
                          <>
                            <span className="pp-confirm">Revoke this invite?</span>
                            <button className="linklike danger" disabled={busy} onClick={() => revoke(p)}>
                              Revoke
                            </button>
                            <button className="linklike" onClick={() => setConfirming(null)}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="linklike" disabled={busy} onClick={() => resend(p)}>
                              Resend
                            </button>
                            <button className="linklike danger" onClick={() => setConfirming(p.id)}>
                              Revoke
                            </button>
                          </>
                        )
                      ) : p.is_owner ? null : confirm ? (
                        <>
                          <span className="pp-confirm">
                            {you ? 'Leave this help center?' : `Remove ${displayName(p)}?`}
                          </span>
                          <button className="linklike danger" disabled={busy} onClick={() => remove(p)}>
                            {you ? 'Leave' : 'Remove'}
                          </button>
                          <button className="linklike" onClick={() => setConfirming(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button className="linklike danger" onClick={() => setConfirming(p.id)}>
                          {you ? 'Leave' : 'Remove'}
                        </button>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
