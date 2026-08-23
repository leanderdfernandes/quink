import { createClient } from '@supabase/supabase-js'

// Vite always defines `import.meta.env` in the browser bundle, so the fallback is dead
// code there and softens nothing. It exists because the runnable checks in web/checks/
// import lib modules that transitively reach this file, under plain node where
// `import.meta.env` is undefined — without it they die on a TypeError instead of on the
// named error below.
const env =
  import.meta.env ??
  (globalThis as { process?: { env?: Record<string, string> } }).process?.env ??
  {}
const url = env.VITE_SUPABASE_URL
const anonKey = env.VITE_SUPABASE_ANON_KEY

// Fail loudly at boot rather than with an opaque network error six screens deep.
if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy web/.env.example to web/.env.local and fill them in.',
  )
}

// PKCE (authorization-code) flow, NOT the default implicit flow. Implicit returns the
// access AND refresh token in the URL fragment (#access_token=…&refresh_token=…), so the
// callback URL *is* the session — copy it anywhere and you're logged in, and it leaks via
// history, referrers and server logs. PKCE returns only a single-use ?code= that's useless
// without the code_verifier stored in this browser; supabase-js exchanges it automatically
// (detectSessionInUrl) and no token ever appears in the URL.
export const supabase = createClient(url, anonKey, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
})
