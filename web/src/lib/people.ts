import { supabase } from './supabase'
import { WORKER_URL } from './config'

// Team access, SPA side. Everything here goes through the SECURITY DEFINER functions in
// migration 0035 — nothing in this file reads `kb_members`, `kb_invites` or `profiles`
// directly, and nothing may start:
//
//   * both membership tables have every grant revoked from `authenticated`; the RPCs are
//     the only way in, by design;
//   * rendering a member list means reading other people's email and display name.
//     `kb_people()` projects exactly the fields the screen needs. Widening the `profiles`
//     select policy to do it in the client would open every profile in the database.
//
// And never a bare PostgREST embed between `knowledge_bases` and `profiles`: `kb_members`
// created a second FK path between those tables, so an unnamed embed now returns PGRST201.
// That already broke the trial sweep silently (CLAUDE.md §10j).

export type AccessState = 'ok' | 'removed' | 'none'

// One shape for both halves of the People list, because it is one list: a pending invite
// sitting beside the people who accepted is what makes an invite feel completed rather
// than sent into a void.
export type Person = {
  kind: 'member' | 'invite'
  // user id for a member, invite id for an invite.
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  role: string
  is_owner: boolean
  at: string
  expires_at: string | null
}

export type InviteState = 'valid' | 'expired' | 'revoked' | 'accepted' | 'frozen' | 'unknown'

export type InvitePreview = {
  state: InviteState
  kb_name: string
  logo_path: string | null
  primary_color: string | null
  inviter: string | null
  email: string
  expires_at: string | null
}

export async function fetchPeople(kbId: string): Promise<Person[]> {
  const { data } = await supabase.rpc('kb_people', { p_kb_id: kbId })
  return (data as Person[] | null) ?? []
}

// 'ok' | 'removed' | 'none'. The three are deliberately different screens: "you were
// removed" and "this doesn't exist for you" feel the same to the software and nothing like
// each other to the person it happens to.
export async function fetchAccessState(kbId: string): Promise<AccessState> {
  const { data } = await supabase.rpc('kb_access_state', { p_kb_id: kbId })
  return (data as AccessState | null) ?? 'none'
}

// Returns the invite token. Throws the RPC's own message — invite_to_kb() writes real
// user-facing sentences ("that person is already here"), and inventing a second set of
// strings in the client is how the two drift.
export async function inviteToKb(kbId: string, email: string): Promise<string> {
  const { data, error } = await supabase.rpc('invite_to_kb', {
    p_kb_id: kbId,
    p_email: email,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function revokeInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_kb_invite', { p_invite_id: inviteId })
  if (error) throw new Error(error.message)
}

export async function removeMember(kbId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_kb_member', {
    p_kb_id: kbId,
    p_user_id: userId,
  })
  if (error) throw new Error(error.message)
}

// Anonymous, like claim_preview(): the accept screen has to render for a signed-out
// visitor. Zero rows is an unknown token.
export async function fetchInvitePreview(token: string): Promise<InvitePreview> {
  const { data } = await supabase.rpc('invite_preview', { p_token: token })
  const row = (data as InvitePreview[] | null)?.[0]
  return (
    row ?? {
      state: 'unknown',
      kb_name: '',
      logo_path: null,
      primary_color: null,
      inviter: null,
      email: '',
      expires_at: null,
    }
  )
}

// Returns the kb id on success. NULL is a state, not an error — unknown, expired, revoked,
// or already spent — and the caller re-reads the preview to render which. It throws only
// for the two refusals that are about this specific caller: a mismatched account, and a
// help center whose owner has dropped to a plan without teammates.
export async function acceptInvite(token: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('accept_kb_invite', { p_token: token })
  if (error) throw new Error(error.message)
  return (data as string | null) ?? null
}

// The invite row commits first; the email is a separate step that cannot fail it (§10h).
// The send lives in the worker because that is where Resend's key is — the SPA never holds
// it. Returns false when the mail didn't go out, so the screen can say so instead of
// promising delivery that never happened.
//
// Keyed on the ADDRESS, not the token: there is one live invite per address per help
// center (a partial unique index says so), the worker resolves the token itself, and the
// capability therefore never touches the inviter's browser. The same call is both the
// first send and Resend — one endpoint, no second path to keep in step.
export async function sendInviteEmail(kbId: string, email: string): Promise<boolean> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const res = await fetch(`${WORKER_URL}/api/invite/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ kb_id: kbId, email }),
    })
    if (!res.ok) return false
    return !!(await res.json().catch(() => ({}))).sent
  } catch {
    // The worker being unreachable must not look like a failed invite. The row exists and
    // Resend is one "Resend" click away.
    return false
  }
}

// --- Display ---------------------------------------------------------------------------
// profiles carries no name column; kb_people() reads whatever Google put in the OAuth
// metadata, which is often nothing. The address is the fallback that always exists — but
// never the WHOLE address in a sentence: "priya@acme.co invited you to help maintain Acme"
// reads like a phishing mail. The local part is what people call each other anyway.
export function nameFromEmail(email: string | null): string | null {
  const local = (email ?? '').split('@')[0]?.trim()
  return local || null
}

export function displayName(p: Person): string {
  return p.name?.trim() || nameFromEmail(p.email) || p.email
}

export function initials(p: Person): string {
  const source = p.name?.trim() || p.email.split('@')[0]
  const parts = source.replace(/[._-]+/g, ' ').trim().split(/\s+/)
  const first = parts[0]?.[0] ?? '?'
  const second = parts[1]?.[0] ?? parts[0]?.[1] ?? ''
  return (first + second).toUpperCase()
}

// --- Surviving the sign-in round trip --------------------------------------------------
// Same net as lib/claim.ts, and here for the same reason: Invite.tsx asks the provider to
// return to window.location.href, which only works if `/invite/*` is in Supabase's redirect
// allowlist. When it is not, the provider falls back to the Site URL, the token is gone,
// and someone who was invited lands in a stranger's empty app. That is a dashboard setting,
// invisible from code — and it is exactly how the claim path broke in production.
const KEY = 'quink.invite_token'

export function stashInviteToken(token: string): void {
  try {
    localStorage.setItem(KEY, token)
  } catch {
    // Private mode. The URL is still the primary carrier; this was only ever the net.
  }
}

// Read-and-clear: a token left behind would bounce the user into an accept screen on some
// unrelated future sign-in.
export function takeInviteToken(): string | null {
  try {
    const t = localStorage.getItem(KEY)
    if (t) localStorage.removeItem(KEY)
    return t
  } catch {
    return null
  }
}

export function clearInviteToken(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing to clean up */
  }
}
