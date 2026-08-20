import { supabase } from './supabase'

// Entitlements, SPA side. MIRRORS `PLANS` in worker/config.py — same shape, same values.
// The worker is the enforcement point; this copy exists only so the UI can show a user
// where they stand. If the two drift, that's a bug.
//
// LIMITS ONLY. Prices live in the `plans` table in Supabase so they change without a
// deploy. `null` means unlimited throughout.
//
// `plan` is OWNER-level — it lives on profiles, never on a KB.

export type PlanId = 'free' | 'founding' | 'starter' | 'growth' | 'internal'

export type PlanLimits = {
  lifetime_runs: number | null
  monthly_runs: number | null
  kbs: number
  expiry_days: number | null
  custom_domain: boolean
  watermark: boolean
  noindex: boolean
  // Inviting teammates. Resolved from the KB OWNER's plan, never the caller's — a
  // free-plan user who is an admin inside a paid help center can invite.
  can_invite: boolean
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    lifetime_runs: 3, monthly_runs: null, kbs: 1,
    expiry_days: 30, custom_domain: false, watermark: true, noindex: true,
    can_invite: false,
  },
  founding: {
    lifetime_runs: null, monthly_runs: 20, kbs: 1,
    expiry_days: null, custom_domain: true, watermark: false, noindex: false,
    can_invite: true,
  },
  starter: {
    lifetime_runs: null, monthly_runs: 20, kbs: 1,
    expiry_days: null, custom_domain: true, watermark: false, noindex: false,
    can_invite: true,
  },
  growth: {
    lifetime_runs: null, monthly_runs: 80, kbs: 5,
    expiry_days: null, custom_domain: true, watermark: false, noindex: false,
    can_invite: true,
  },
  internal: {
    lifetime_runs: null, monthly_runs: null, kbs: 999,
    expiry_days: null, custom_domain: true, watermark: false, noindex: true,
    can_invite: true,
  },
}

export const DEFAULT_PLAN: PlanId = 'free'

// How many runs one account may have going at once. MIRRORS `LANES` in worker/config.py,
// which is the enforcement point — this copy only decides how many files the dock uploads
// at a time, so five dropped recordings do not saturate the connection. If they drift, the
// client just queues more conservatively or more eagerly than the server; the server wins.
export const LANES: Record<PlanId, number> = {
  free: 1,
  founding: 2,
  starter: 2,
  growth: 2,
  internal: 3,
}

export const lanesFor = (plan: string | null | undefined): number =>
  LANES[(plan ?? DEFAULT_PLAN) as PlanId] ?? LANES[DEFAULT_PLAN]

export function limitsFor(plan: string | null | undefined): PlanLimits {
  return PLANS[(plan ?? DEFAULT_PLAN) as PlanId] ?? PLANS[DEFAULT_PLAN]
}

// --- Entitlements, resolved for a KB rather than guessed from the caller -----------------
//
// This replaces reading limits off the signed-in user's plan, which was only ever correct
// for the owner. A member sits inside someone else's help center spending the OWNER's
// allowance, and `profiles` is closed, so the SPA cannot resolve any of this itself — it
// used to fall back to `free` and render a watermark badge to somebody editing a paying
// customer's help center.
//
// One call answers everything a screen needs. It deliberately carries no price and no
// marketing copy, and `plan` — the tier NAME — comes back null unless you own the KB.
// Limits and usage are operational; billing is not. That line is load-bearing.
//
// `watermark` is computed by the same database function the READER uses (kb_watermark, in
// migration 0036), so the preview and the live site cannot disagree. Never recompute it
// here from a plan id.
export type Entitlements = {
  is_owner: boolean
  /** OWNER ONLY — null for a member. Never render it; it exists for owner-only screens. */
  plan: PlanId | null
  owner_name: string | null
  /** null = uncapped */
  lifetime_runs: number | null
  runs_used: number
  /** null = no trial clock */
  expiry_days: number | null
  can_invite: boolean
  watermark: boolean
  noindex: boolean
}

// Null when this account cannot edit the KB — the same answer a stranger's probe gets from
// the database, which returns no row rather than a row of nulls.
export async function fetchEntitlements(kbId: string): Promise<Entitlements | null> {
  const { data } = await supabase.rpc('kb_entitlements', { p_kb_id: kbId })
  return ((data as Entitlements[] | null)?.[0]) ?? null
}

// Runs left before the wall, or null when there is no wall. Display and the local refusal
// only — the worker enforces the real cap before the Gemini call, and the DB has a backstop
// trigger. The client may REFUSE work it can already tell will be rejected; it may never
// GRANT (§10b).
export function runsLeftFrom(ent: Entitlements | null): number | null {
  if (!ent || ent.lifetime_runs === null) return null
  return Math.max(ent.lifetime_runs - ent.runs_used, 0)
}

// This account's own plan and staff flag, in one read.
//
// `plan` is THIS user's, which is the KB's entitlement only when this user owns the KB.
// A member sits inside someone else's help center spending the OWNER's allowance, and the
// owner's row is not readable from the client (profiles is closed, deliberately) — so the
// caller must not apply this plan to a KB it does not own. App.tsx holds it as null in
// that case rather than falling back to `free`, which would gate a teammate inside a paid
// help center on their own lifetime cap. That is exactly the bug team-access-spec §5 names.
//
// `is_admin` is QUINK STAFF, a different concept from a KB admin, and it is only read to
// decide two things: the viewing-as-admin banner, and that the switcher must not be filled
// with every customer's help center.
export async function fetchProfile(
  userId: string,
): Promise<{ plan: PlanId; isAdmin: boolean }> {
  const { data } = await supabase
    .from('profiles')
    .select('plan, is_admin')
    .eq('id', userId)
    .single()
  return {
    plan: (data?.plan as PlanId) ?? DEFAULT_PLAN,
    isAdmin: !!data?.is_admin,
  }
}
