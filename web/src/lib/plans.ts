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
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    lifetime_runs: 3, monthly_runs: null, kbs: 1,
    expiry_days: 30, custom_domain: false, watermark: true, noindex: true,
  },
  founding: {
    lifetime_runs: null, monthly_runs: 20, kbs: 1,
    expiry_days: null, custom_domain: true, watermark: false, noindex: false,
  },
  starter: {
    lifetime_runs: null, monthly_runs: 20, kbs: 1,
    expiry_days: null, custom_domain: true, watermark: false, noindex: false,
  },
  growth: {
    lifetime_runs: null, monthly_runs: 80, kbs: 5,
    expiry_days: null, custom_domain: true, watermark: false, noindex: false,
  },
  internal: {
    lifetime_runs: null, monthly_runs: null, kbs: 999,
    expiry_days: null, custom_domain: true, watermark: false, noindex: true,
  },
}

export const DEFAULT_PLAN: PlanId = 'free'

export function limitsFor(plan: string | null | undefined): PlanLimits {
  return PLANS[(plan ?? DEFAULT_PLAN) as PlanId] ?? PLANS[DEFAULT_PLAN]
}

// Runs charged to this user, counted off the append-only jobs ledger. Display only — the
// worker enforces the cap before the Gemini call, and the DB has a backstop trigger.
//
// Deliberately NOT a stored counter: deleting an article must never hand a run back, and
// count(*) over rows that outlive their articles is the whole mechanism.
export async function runsUsed(userId: string): Promise<number> {
  const { count } = await supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('counted_against_quota', true)
  return count ?? 0
}

// The owner's plan. Entitlements are owner-level, so this is the one read — never off a KB.
export async function fetchPlan(userId: string): Promise<PlanId> {
  const { data } = await supabase.from('profiles').select('plan').eq('id', userId).single()
  return ((data?.plan as PlanId) ?? DEFAULT_PLAN)
}
