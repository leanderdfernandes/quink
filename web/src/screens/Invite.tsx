import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { publicBrandingUrl } from '../lib/storage'
import {
  acceptInvite,
  clearInviteToken,
  fetchInvitePreview,
  nameFromEmail,
  stashInviteToken,
  type InvitePreview,
} from '../lib/people'
import Wordmark from '../components/Wordmark'

// The receiving end of an invite. Mirrors /claim/:token deliberately — same shape, same
// OAuth handling, same rule: show what they were invited to before asking for anything.
//
// It wears the HELP CENTER's logo and colour, not Quink's, because the thing they were
// invited to is their colleague's help center. Quink is the tool underneath.
//
// FIVE states, each with its own words. Merging them is what makes an error screen a dead
// end: "something went wrong" tells someone whose invite expired nothing they can act on.
// Already-a-member is not one of them — that is a silent redirect into the help center.

type Phase = 'loading' | 'preview' | 'accepting' | 'wrong' | 'sent'

export default function Invite() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [signedInAs, setSignedInAs] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Accepting is fired by a click or by returning from auth having already clicked. Twice
  // would race itself for no reason.
  const accepting = useRef(false)

  const accept = useCallback(async () => {
    if (!token || accepting.current) return
    accepting.current = true
    setPhase('accepting')
    clearInviteToken()
    try {
      const kbId = await acceptInvite(token)
      if (kbId) {
        // Straight in. Already-a-member lands here too — re-clicking an invite you have
        // already accepted is not an error, it is a bookmark.
        navigate(`/app/${kbId}`, { replace: true })
        return
      }
      // Null is a STATE, not an error: unknown, expired, revoked, or spent by someone
      // else. Re-read the preview and let it say which.
      accepting.current = false
      setPreview(await fetchInvitePreview(token))
      setPhase('preview')
    } catch {
      // The one refusal that is about this specific account rather than this invite.
      accepting.current = false
      setPhase('wrong')
    }
  }, [token, navigate])

  useEffect(() => {
    if (!token) return
    let cancelled = false

    void (async () => {
      const [p, { data: s }] = await Promise.all([
        fetchInvitePreview(token),
        supabase.auth.getSession(),
      ])
      if (cancelled) return
      setPreview(p)
      setSignedInAs(s.session?.user.email ?? null)

      // Signed in already: try it. accept_kb_invite() is the authority on every state
      // except a frozen plan, which it refuses outright — asking it there would turn a
      // clear message into the wrong-account screen.
      if (s.session && p.state !== 'frozen') return void accept()
      setPhase('preview')
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s && !cancelled) {
        setSignedInAs(s.user.email ?? null)
        void accept()
      }
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [token, accept])

  async function google(switchAccount = false) {
    setBusy(true)
    setError(null)
    // Stash BEFORE leaving: the redirect carries the token in the path, but only if
    // `/invite/*` is in Supabase's allowlist — a setting invisible from here. Losing it
    // strands an invited person in a stranger's empty app.
    if (token) stashInviteToken(token)
    // `prompt: select_account` is what makes the wrong-account screen recoverable in one
    // click. Without it Google silently returns the same session they are already in and
    // the screen simply reappears.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.href,
        queryParams: switchAccount ? { prompt: 'select_account' } : {},
      },
    })
    if (error) {
      setError(error.message)
      setBusy(false)
    }
  }

  async function emailLink(e: React.FormEvent) {
    e.preventDefault()
    const address = email.trim()
    if (!address) return
    setBusy(true)
    setError(null)
    if (token) stashInviteToken(token)
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: window.location.href },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setPhase('sent')
  }

  if (phase === 'loading' || phase === 'accepting' || !preview) return <div className="page" />

  const color = preview.primary_color || undefined
  const logo = publicBrandingUrl(preview.logo_path)
  // invite_preview() returns the inviter's ADDRESS — there is no name column anywhere to
  // return instead — so it is shortened the same way the People list and the invite email
  // shorten it. A full address in a sentence reads like phishing.
  const inviter = nameFromEmail(preview.inviter) || 'whoever invited you'
  const mark = (dim = false) =>
    logo && !dim ? (
      <img className="inv-logo" src={logo} alt="" />
    ) : (
      <span className="inv-mark" style={dim ? undefined : { background: color }}>
        {(preview.kb_name || 'Q').charAt(0).toUpperCase()}
      </span>
    )

  const shell = (children: React.ReactNode) => (
    <div className="page" style={{ justifyContent: 'center' }}>
      <div className="card wall inv">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <Wordmark height={22} />
        </div>
        {children}
      </div>
    </div>
  )

  if (phase === 'sent') {
    return shell(
      <>
        <h2>Check your email</h2>
        <p className="cap" style={{ marginTop: 8 }}>
          We sent a sign-in link to <strong>{email}</strong>. Opening it accepts the invite.
        </p>
      </>,
    )
  }

  // --- Wrong account -------------------------------------------------------------------
  // The state people actually hit: the invite lands in a work inbox and the browser is
  // signed into a personal Google account. It must recover in one click, not explain itself
  // and stop.
  if (phase === 'wrong') {
    return shell(
      <>
        {mark()}
        <h2>This invite was sent to a different address</h2>
        <div className="inv-mismatch">
          <span>
            <i>Invited</i>
            <b>{preview.email}</b>
          </span>
          <span>
            <i>Signed in as</i>
            <b>{signedInAs ?? 'another account'}</b>
          </span>
        </div>
        <button className="google-btn" onClick={() => google(true)} disabled={busy}>
          Sign in with a different account
        </button>
        <form onSubmit={emailLink} style={{ marginTop: 12 }}>
          <input
            type="text"
            inputMode="email"
            placeholder={preview.email}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ marginBottom: 10 }}
          />
          <button className="btn btn-lg btn-ghost" type="submit" disabled={busy || !email.trim()}>
            Email me a sign-in link
          </button>
        </form>
        {error && <p className="err">{error}</p>}
      </>,
    )
  }

  // --- Expired -------------------------------------------------------------------------
  if (preview.state === 'expired') {
    return shell(
      <>
        {mark(true)}
        <h2>This invite has expired</h2>
        <p className="cap" style={{ marginTop: 8 }}>
          Invites to {preview.kb_name} are good for 14 days. Ask {inviter} to send a new
          one — it takes them a moment.
        </p>
      </>,
    )
  }

  // --- Revoked -------------------------------------------------------------------------
  // Deliberately vague about who withdrew it. That can be an awkward conversation, and it
  // is not ours to start.
  if (preview.state === 'revoked') {
    return shell(
      <>
        {mark(true)}
        <h2>This invite is no longer active</h2>
        <p className="cap" style={{ marginTop: 8 }}>
          The link was withdrawn. If you think that's a mistake, ask the person who invited
          you to {preview.kb_name}.
        </p>
      </>,
    )
  }

  // --- Frozen: the owner dropped to a plan without teammates ---------------------------
  // Not revoked and not expired — it resumes on its own if they upgrade before it runs out,
  // so the copy says exactly that instead of sending someone away.
  if (preview.state === 'frozen') {
    return shell(
      <>
        {mark(true)}
        <h2>{preview.kb_name} can't add people right now</h2>
        <p className="cap" style={{ marginTop: 8 }}>
          Adding teammates is part of every paid plan, and this help center is on the free
          one. Your invite still works — ask {inviter} to choose a plan and open this link
          again.
        </p>
      </>,
    )
  }

  // --- Already accepted by someone else, or an unknown link ----------------------------
  if (preview.state === 'accepted' || preview.state === 'unknown') {
    return shell(
      <>
        {mark(true)}
        <h2>{preview.state === 'accepted' ? 'This invite has been used' : 'Link not found'}</h2>
        <p className="cap" style={{ marginTop: 8 }}>
          {preview.state === 'accepted'
            ? `Someone has already accepted this invite to ${preview.kb_name}. If that should be you, sign in with the account you accepted on.`
            : "This link doesn't lead anywhere. Check you copied the whole thing, or ask whoever sent it for a new one."}
        </p>
      </>,
    )
  }

  // --- Valid ---------------------------------------------------------------------------
  return shell(
    <>
      {mark()}
      <h2>
        {preview.inviter ? `${inviter} invited you` : 'You have been invited'} to help maintain{' '}
        {preview.kb_name}
      </h2>
      <p className="cap" style={{ marginTop: 8, marginBottom: 22 }}>
        Sign in to accept. You'll be able to write, edit and publish guides here.
      </p>

      <button className="google-btn" onClick={() => google()} disabled={busy}>
        Continue with Google
      </button>

      <div className="divider">or</div>

      <form onSubmit={emailLink}>
        <input
          type="text"
          inputMode="email"
          placeholder={preview.email}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        <button className="btn btn-lg btn-ghost" type="submit" disabled={busy || !email.trim()}>
          Email me a link
        </button>
      </form>

      <p className="note" style={{ marginTop: 16 }}>
        Invites expire 14 days after they're sent. Sign in with{' '}
        <strong>{preview.email}</strong> — that's the address this one was sent to.
      </p>

      {error && <p className="err">{error}</p>}
    </>,
  )
}
