import { supabase } from './supabase'

// The receiving end of the reverse-demo motion. The token IS the capability: nothing here
// is bound to an email address, because the founder who gets the link forwards it to
// whoever actually runs their docs, and that person is the real user.

export type ClaimStatus = 'valid' | 'expired' | 'claimed' | 'invalid'

export type ClaimPreview = {
  kb_name: string
  article_count: number
  subdomain: string | null
  status: ClaimStatus
}

// Anonymous on purpose — the preview has to render for a signed-out visitor. Asking
// someone to create an account before showing them what they've been offered is asking
// them to buy the box unopened.
//
// Zero rows is 'invalid', which deliberately does not distinguish "never existed" from
// "revoked": telling them apart turns the route into a probe for live links.
export async function fetchClaimPreview(token: string): Promise<ClaimPreview> {
  const { data, error } = await supabase.rpc('claim_preview', { p_token: token })
  const row = (data as ClaimPreview[] | null)?.[0]
  if (error || !row) {
    return { kb_name: '', article_count: 0, subdomain: null, status: 'invalid' }
  }
  return row
}

// --- Surviving the sign-in round trip --------------------------------------------------
// Claim.tsx asks the provider to return to window.location.href, so the token normally
// rides home in the URL. That depends on the exact path being allowed by Supabase's
// redirect allowlist — and when it is not, the provider silently falls back to the Site
// URL, the path is gone, and the user lands in an empty app having just signed up for a
// help center they were promised. That is the single worst outcome in this flow, and it is
// a dashboard setting rather than anything visible in code.
//
// So the token is also stashed here before auth starts. localStorage and not IndexedDB
// (which lib/pending.ts needs for a 100MB File): this is one short string, and localStorage
// survives the same full-page redirect.
const KEY = 'quink.claim_token'

export function stashClaimToken(token: string): void {
  try {
    localStorage.setItem(KEY, token)
  } catch {
    // Private mode / storage disabled. The URL path is still the primary carrier; this was
    // only ever the safety net, so failing to set it must not block sign-in.
  }
}

// Read-and-clear. One-shot by construction: a token left behind would bounce the user into
// a claim screen on some unrelated future sign-in.
export function takeClaimToken(): string | null {
  try {
    const t = localStorage.getItem(KEY)
    if (t) localStorage.removeItem(KEY)
    return t
  } catch {
    return null
  }
}

export function clearClaimToken(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing to clean up */
  }
}

// --- "you just claimed this" -----------------------------------------------------------
// A one-shot handoff from the claim screen to the KB shell, NOT a query parameter.
//
// ?claimed=1 looked simpler and was wrong twice over: the flag has to be stripped from the
// URL straight away (or it re-greets on every refresh and rides along in any link they
// share), and that strip races App's mount — on the recovery path above, where App has
// already mounted once at "/", the greeting was consumed before it could render.
// sessionStorage survives the remount, is read-and-clear, and dies with the tab.
const CLAIMED_KEY = 'quink.just_claimed'

export function markJustClaimed(): void {
  try {
    sessionStorage.setItem(CLAIMED_KEY, '1')
  } catch {
    // Worst case they don't get a greeting. Never worth failing the claim over.
  }
}

// A PURE read — it deliberately does not clear. Read-and-clear looks tidier and loses the
// greeting entirely: React StrictMode mounts, unmounts and remounts in dev, so the
// throwaway first mount consumes the flag and the instance that actually renders sees
// nothing. Anything that clears on read has the same hole, in an initialiser or an effect.
export function isJustClaimed(): boolean {
  try {
    return sessionStorage.getItem(CLAIMED_KEY) === '1'
  } catch {
    return false
  }
}

// Cleared by the user dismissing the greeting — an explicit action, which no amount of
// remounting can fire by accident. It also dies with the tab, so the worst case is a
// re-greet after a manual refresh of a help center they claimed seconds ago.
export function clearJustClaimed(): void {
  try {
    sessionStorage.removeItem(CLAIMED_KEY)
  } catch {
    /* nothing to clean up */
  }
}
