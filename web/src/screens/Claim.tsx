import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { isDisposableEmail } from '../lib/disposable'
import Wordmark from '../components/Wordmark'

// The receiving end of the reverse-demo motion: a founder gets a link to a help center we
// built for their product, signs in, and it becomes theirs.
//
// This is the whole acquisition funnel, so it is deliberately the shortest screen in the
// app: no explanation of what Quink is, no pricing, no tour. They have already seen the
// product — it's their own documentation. The only question here is "yes, mine".

type State = 'checking' | 'signin' | 'claiming' | 'failed'

export default function Claim() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState<State>('checking')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const claim = useCallback(async () => {
    setState('claiming')
    const { data, error } = await supabase.rpc('claim_kb', { p_token: token })
    if (error || !data) {
      setState('failed')
      return
    }
    navigate(`/app/${data}`, { replace: true })
  }, [token, navigate])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void claim()
      else setState('signin')
    })
    // Signing in is a full-page redirect back to this same URL, so the listener catches
    // the return trip and finishes the claim without the user clicking anything twice.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) void claim()
    })
    return () => sub.subscription.unsubscribe()
  }, [claim])

  async function google() {
    setBusy(true)
    setError(null)
    // Back to THIS url, token and all — the token is the capability, and losing it across
    // the OAuth round trip would strand them on a link that only works once.
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
    else setSent(true)
  }

  if (state === 'checking' || state === 'claiming') return <div className="page" />

  // One state for an unknown token and an expired one. Telling them apart would let
  // someone probe for live links.
  if (state === 'failed') {
    return (
      <div className="page" style={{ justifyContent: 'center' }}>
        <div className="card wall">
          <h2>This link has expired</h2>
          <p className="cap" style={{ marginTop: 8 }}>
            Ask whoever sent it for a fresh one — they can generate a new link in seconds.
          </p>
        </div>
      </div>
    )
  }

  if (sent) {
    return (
      <div className="page" style={{ justifyContent: 'center' }}>
        <div className="card wall">
          <div className="padlock" aria-hidden>
            ✉️
          </div>
          <h2>Check your email</h2>
          <p className="cap" style={{ marginTop: 8 }}>
            We sent a sign-in link to <strong>{email}</strong>. Opening it finishes the
            handover.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ justifyContent: 'center' }}>
      <div className="card wall">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <Wordmark height={26} />
        </div>

        <h2>This help center is yours</h2>
        <p className="cap" style={{ marginTop: 8, marginBottom: 22 }}>
          Sign in and it moves to your account — articles, screenshots and all. Nothing to
          set up.
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
      </div>
    </div>
  )
}
