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

// Runs charged to this KB's OWNER, counted off the append-only jobs ledger. Display only —
// the worker enforces the cap before the Gemini call, and the DB has a backstop trigger.
//
// Deliberately NOT a stored counter: deleting an article must never hand a run back, and
// count(*) over rows that outlive their articles is the whole mechanism.
//
// Goes through an rpc rather than counting the table: jobs_select_own is keyed on
// `user_id`, so an admin who is not the owner cannot see the rows their quota is measured
// in — and widening that policy would show someone who claimed a demo the previous
// owner's ledger.
export async function runsUsed(kbId: string): Promise<number> {
  const { data } = await supabase.rpc('kb_runs_used', { p_kb_id: kbId })
  return (data as number) ?? 0
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
