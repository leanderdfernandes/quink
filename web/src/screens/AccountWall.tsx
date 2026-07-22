import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { isDisposableEmail } from '../lib/disposable'
import { COPY } from '../lib/config'

// Screen 2 — the account wall (ux-spec §2, LOCKED).
//
// Fires AFTER upload, BEFORE generation. The expensive Gemini pipeline never runs for
// an unverified session — total cost protection, kills scripted budget-burn. This costs
// little conversion only while signup stays feather-light, so: Google first, one tap.
//
// The file is held in memory by App and uploaded AFTER auth. It is never written to
// Storage anonymously — that would need a public-write bucket, which is the exact abuse
// vector this wall exists to close.

type Props = {
  fileName: string
  fileSize: string
}

export default function AccountWall({ fileName, fileSize }: Props) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function google() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
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
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
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
            We sent a sign-in link to <strong>{email}</strong>. Open it and your guide
            starts building.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ justifyContent: 'center' }}>
      <div className="card wall">
        {/* Open padlock — unlocking, not blocking. */}
        <div className="padlock" aria-hidden>
          🔓
        </div>

        <h2>{COPY.wallHeading}</h2>
        <p className="cap" style={{ marginTop: 8, marginBottom: 20 }}>
          {COPY.wallNoCard}
        </p>

        {/* The file pill reminds them their recording is loaded and waiting. */}
        <div style={{ marginBottom: 22 }}>
          <span className="pill" title={fileName}>
            {COPY.wallFilePill}
            <span className="size">{fileSize}</span>
          </span>
        </div>

        <button className="google-btn" onClick={google} disabled={busy}>
          <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden>
            <path
              fill="#4285F4"
              d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.1z"
            />
            <path
              fill="#34A853"
              d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.4 46 24 46z"
            />
            <path
              fill="#FBBC05"
              d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.5C3 17.1 2.1 20.4 2.1 24s.9 6.9 2.4 9.9l7.3-5.7z"
            />
            <path
              fill="#EA4335"
              d="M24 10.4c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 3.9 29.9 2 24 2 15.4 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9.4 12.2-9.4z"
            />
          </svg>
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

        {/* Reframes the gate as protecting the user, and states the real reason plainly. */}
        <p className="footnote">{COPY.wallFootnote}</p>
      </div>
    </div>
  )
}
