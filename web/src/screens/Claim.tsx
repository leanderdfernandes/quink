import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { isDisposableEmail } from '../lib/disposable'
import { helpCenterUrl, SUPPORT_EMAIL } from '../lib/config'
import { FREE_ARTICLE_EXPIRY_DAYS } from '../lib/config'
import {
  clearClaimToken,
  fetchClaimPreview,
  markJustClaimed,
  stashClaimToken,
  type ClaimPreview,
} from '../lib/claim'
import Wordmark from '../components/Wordmark'

// The receiving end of the reverse-demo motion: someone gets a link to a help center we
// built for their product, and it becomes theirs.
//
// This is the whole acquisition funnel, so it is deliberately the shortest screen in the
// app: no explanation of what Quink is, no pricing, no tour. They have already seen the
// product — it's their own documentation.
//
// THE ONE RULE: show the goods before asking for anything. The preview renders for a
// signed-out visitor, with the KB's real name, its real article count, and a link to the
// live site. Bouncing straight to a signup form asks someone to create an account for a
// thing they haven't seen.
//
// The token is the capability, and it is not bound to an email address. The founder who
// receives it forwards it to whoever runs their docs, and that person is the real user.

type Phase = 'loading' | 'preview' | 'signin' | 'claiming' | 'sent'

export default function Claim() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [preview, setPreview] = useState<ClaimPreview | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [signedIn, setSignedIn] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The claim is fired by a click, or by returning from auth having already clicked. Once
  // is enough — two in-flight claims would race each other for no reason.
  const claiming = useRef(false)

  const claim = useCallback(async () => {
    if (!token || claiming.current) return
    claiming.current = true
    setPhase('claiming')
    clearClaimToken()

    const { data, error } = await supabase.rpc('claim_kb', { p_token: token })
    if (!error && data) {
      // Land INSIDE the KB with the articles visible. Not a dashboard, not a setup wizard —
      // the articles are the demo. The greeting rides in sessionStorage rather than the
      // URL so it survives App remounting and never ends up in a shared link.
      markJustClaimed()
      navigate(`/app/${data}`, { replace: true })
      return
    }

    // Null is a STATE, not an error. Someone else won the race, the link expired between
    // render and click, or it was already spent by an account that isn't this one. Re-read
    // the preview and let it say which — never show a stack of errors here.
    claiming.current = false
    setPreview(await fetchClaimPreview(token))
    setPhase('preview')
  }, [token, navigate])

  // Resolve the token and the session together, then decide what to render. The auth
  // listener catches the return trip from a full-page sign-in redirect and finishes the
  // claim without the user having to click twice.
  useEffect(() => {
    if (!token) return
    let cancelled = false

    void (async () => {
      const [p, { data: s }] = await Promise.all([
        fetchClaimPreview(token),
        supabase.auth.getSession(),
      ])
      if (cancelled) return
      setPreview(p)
      setSignedIn(!!s.session)

      // Back from auth with a live token: finish what they already asked for.
      if (s.session && p.status === 'valid') return void claim()
      // A used link, re-clicked by the person who spent it, is not a dead end — claim_kb
      // hands back the KB id for the owner and null for everyone else, so this is safe to
      // try and tells us nothing if they aren't.
      if (s.session && p.status === 'claimed') return void claim()
      setPhase('preview')
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s && !cancelled) {
        setSignedIn(true)
        void claim()
      }
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [token, claim])

  function startSignIn() {
    // Stash BEFORE leaving the page. The redirect below carries the token in the URL, but
    // that depends on a Supabase allowlist setting we cannot see from here — see lib/claim.
    if (token) stashClaimToken(token)
    setPhase('signin')
  }

  async function google() {
    setBusy(true)
    setError(null)
    // Back to THIS url, token and all — losing it across the OAuth round trip strands them
    // on a link that only works once.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
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
    if (isDisposableEmail(address)) {
      setError('Please use a permanent email address.')
      return
    }
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: window.location.href },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setPhase('sent')
  }

  if (phase === 'loading' || phase === 'claiming' || !preview) return <div className="page" />

  const shell = (children: React.ReactNode) => (
    <div className="page" style={{ justifyContent: 'center' }}>
      <div className="card wall">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <Wordmark height={26} />
        </div>
        {children}
      </div>
    </div>
  )

  if (phase === 'sent') {
    return shell(
      <>
        <div className="padlock" aria-hidden>
          ✉️
        </div>
        <h2>Check your email</h2>
        <p className="cap" style={{ marginTop: 8 }}>
          We sent a sign-in link to <strong>{email}</strong>. Opening it finishes the
          handover.
        </p>
      </>,
    )
  }

  // --- Expired -------------------------------------------------------------------------
  if (preview.status === 'expired') {
    const mailto = SUPPORT_EMAIL
      ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
          `New claim link for ${preview.kb_name}`,
        )}`
      : null
    return shell(
      <>
        <h2>This link has expired</h2>
        <p className="cap" style={{ marginTop: 8 }}>
          Claim links last 30 days. {preview.kb_name} is still here — ask for a fresh link
          and it's yours.
        </p>
        {mailto && (
          <a className="btn btn-lg" href={mailto} style={{ marginTop: 20 }}>
            Ask for a new link
          </a>
        )}
      </>,
    )
  }

  // --- Already claimed -----------------------------------------------------------------
  // Reached only when the signed-in visitor is NOT the owner (the owner was redirected into
  // the KB above), or when nobody is signed in at all.
  if (preview.status === 'claimed') {
    return shell(
      <>
        <h2>This help center has been claimed</h2>
        <p className="cap" style={{ marginTop: 8 }}>
          {preview.kb_name} already belongs to someone.{' '}
          {signedIn
            ? "If that should be you, sign in with the account you used."
            : 'Sign in with the account that claimed it to open it.'}
        </p>
      </>,
    )
  }

  // --- Invalid -------------------------------------------------------------------------
  // One state for "never existed" and "revoked". Telling them apart lets someone probe.
  if (preview.status === 'invalid') {
    return shell(
      <>
        <h2>Link not found</h2>
        <p className="cap" style={{ marginTop: 8 }}>
          This link doesn't lead anywhere. Check you copied the whole thing, or ask whoever
          sent it for a new one.
        </p>
      </>,
    )
  }

  // --- Sign-in, after they've chosen to claim ------------------------------------------
  if (phase === 'signin') {
    return shell(
      <>
        <h2>Nearly yours</h2>
        <p className="cap" style={{ marginTop: 8, marginBottom: 22 }}>
          Sign in and {preview.kb_name} moves to your account — articles, screenshots and
          all. Nothing to set up.
        </p>

        <button className="google-btn" onClick={google} disabled={busy}>
          Continue with Google
        </button>

        <div className="divider">or</div>

        <form onSubmit={emailLink}>
          <input
            type="text"
            inputMode="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ marginBottom: 10 }}
          />
          <button
            className="btn btn-lg btn-ghost"
            type="submit"
            disabled={busy || !email.trim()}
          >
            Email me a link
          </button>
        </form>

        {error && <p className="err">{error}</p>}
      </>,
    )
  }

  // --- Valid: the preview. The whole point of this screen. ------------------------------
  const count = preview.article_count
  return shell(
    <>
      <span className="eyebrow">Ready for you</span>
      <h2 style={{ marginTop: 14 }}>{preview.kb_name}</h2>
      <p className="cap" style={{ marginTop: 8 }}>
        {count === 1 ? '1 article' : `${count} articles`} about your product, already
        written and published. Take it over and it's yours to edit, extend and put on your
        own domain.
      </p>

      {preview.subdomain && (
        <a
          className="linklike"
          href={helpCenterUrl(preview.subdomain)}
          target="_blank"
          rel="noreferrer"
          style={{ display: 'inline-block', marginTop: 14 }}
        >
          See it live →
        </a>
      )}

      <button
        className="btn btn-lg"
        style={{ marginTop: 22 }}
        onClick={() => (signedIn ? void claim() : startSignIn())}
      >
        Claim this help center
      </button>

      {/* Disclosed HERE, before they invest — never after (pricing-spec §2). */}
      <p className="note" style={{ marginTop: 16 }}>
        Free help centers are kept for {FREE_ARTICLE_EXPIRY_DAYS} days. Choose a plan any
        time to keep it live.
      </p>

      {error && <p className="err">{error}</p>}
    </>,
  )
}
