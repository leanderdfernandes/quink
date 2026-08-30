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
  // How long the SOURCE RECORDING is kept after the run that made it. `null` = for the
  // life of the article. It is the meter for video-grounded editing (PRD §8), which is why
  // the SPA needs it at all: the upload screen has to state the retention it is promising,
  // and the step menu has to know whether "Check the recording" can exist. ENFORCED by the
  // worker's retention sweep — this copy only renders it.
  video_retention_days: number | null
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    lifetime_runs: 3, monthly_runs: null, kbs: 1,
    expiry_days: 30, custom_domain: false, watermark: true, noindex: true,
    can_invite: false,
    video_retention_days: 7,
  },
  founding: {
    lifetime_runs: null, monthly_runs: 20, kbs: 1,
    expiry_days: null, custom_domain: true, watermark: false, noindex: false,
    can_invite: true,
    video_retention_days: null,
  },
  starter: {
    lifetime_runs: null, monthly_runs: 20, kbs: 1,
    expiry_days: null, custom_domain: true, watermark: false, noindex: false,
    can_invite: true,
    video_retention_days: null,
  },
  growth: {
    lifetime_runs: null, monthly_runs: 80, kbs: 5,
    expiry_days: null, custom_domain: true, watermark: false, noindex: false,
    can_invite: true,
    video_retention_days: null,
  },
  internal: {
    lifetime_runs: null, monthly_runs: null, kbs: 999,
    expiry_days: null, custom_domain: true, watermark: false, noindex: true,
    can_invite: true,
    video_retention_days: null,
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
  /** LIFETIME, off the append-only ledger. The number the free-tier wall is measured against. */
  runs_used: number
  /**
   * Runs inside the current billing period. Optional because it arrives with migration 0039
   * — an SPA deployed ahead of that migration reads `undefined` and the meter falls back to
   * the lifetime number rather than rendering NaN.
   */
  cycle_runs_used?: number
  /** null = no trial clock */
  expiry_days: number | null
  can_invite: boolean
  watermark: boolean
  noindex: boolean
  /**
   * How long the source recording is kept, in days — null = for the life of the article.
   * A LIMIT, so it comes back to members too, unlike `plan`. Optional because it arrives
   * with migration 0041: an SPA deployed ahead of it reads `undefined`, which
   * videoRetentionFrom() below reads as "we do not know" rather than as "forever".
   */
  video_retention_days?: number | null
}

/**
 * The retention window to state to THIS caller for THIS help center, or `undefined` when we
 * genuinely do not know yet (entitlements not loaded, or an SPA running ahead of 0041).
 *
 * Never falls back to the caller's own plan. That fallback is the `lanesFor` gap
 * (OPEN-ITEMS D.2) and it is harmless there — it queues conservatively — but here it would
 * tell a member inside a paid help center that we delete their recording in a week. A
 * retention period is a promise; guessing at one is worse than not stating it.
 */
export function videoRetentionFrom(
  ent: Entitlements | null,
): number | null | undefined {
  if (!ent) return undefined
  return ent.video_retention_days
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

// The three shapes of the rail run meter, chosen from the plan CONFIG.
//
// Nothing here compares a plan name. `PLANS` is the one tier table (limits in code, prices
// in the DB — CLAUDE.md §10b), so adding a tier changes one object and this picks the right
// shape for it automatically. A `plan === 'free'` here would be a second tier table.
//
//   lifetime cap (free)      2 of 3 free runs   — the wall they will actually hit
//   monthly cap  (paid)      13 of 20           — resets with the billing period
//   no cap       (internal)  43 this cycle      — a number, not a budget: no track, no copy
//
// The closing sentence is pricing-spec §3's abundance framing: we meter the cost, never the
// value. Free users get the shorter version — "the run already happened" explains a mental
// model they have not formed yet, and the meter is not where to teach it.
export function runMeter(ent: Entitlements): {
  used: number
  cap: number | null
  count: string
  copy: string
} {
  // Falls back to the lifetime count when the SPA is running ahead of migration 0039,
  // which is a slightly stale number rather than a NaN-wide progress bar.
  const cycle = ent.cycle_runs_used ?? ent.runs_used

  // THE CAP COMES OFF THE ENTITLEMENT, NEVER OFF THE TIER NAME.
  //
  // `plan` is deliberately null for anyone who is not the owner — limits and usage go to
  // everyone who may edit, the tier NAME goes to the owner alone (§10l, migration 0041) —
  // and limitsFor() fails open to the cheapest tier. So a KB admin inside an uncapped help
  // center was shown the FREE wall measured against the OWNER's real usage — "49 of 3 free
  // runs used", observed live on Hive Help. `lifetime_runs` is on `ent` for exactly this
  // reason: plan_flags() resolves it through the owner and returns it to members too.
  if (ent.lifetime_runs !== null) {
    return {
      used: ent.runs_used,
      cap: ent.lifetime_runs,
      count: `${ent.runs_used} of ${ent.lifetime_runs} free runs`,
      copy: 'Deleted guides still count. Writing by hand is unlimited.',
    }
  }
  // Monthly is the one limit kb_entitlements does not return yet, so this branch still
  // needs the tier — and a non-owner has none. Unknown falls through to the uncapped shape
  // below: a plain number, no track, no copy. Stating nothing is the rule when we do not
  // know (§10f); substituting the cheapest tier is how this bug happened. Paid run caps are
  // SOFT anyway (§10b), so a member is not being kept from a wall they could hit.
  const monthly = ent.plan ? limitsFor(ent.plan).monthly_runs : null
  if (monthly !== null) {
    return {
      used: cycle,
      cap: monthly,
      count: `${cycle} of ${monthly}`,
      copy:
        'Deleted guides still count — the run already happened. ' +
        'Writing by hand is unlimited.',
    }
  }
  return { used: cycle, cap: null, count: `${cycle} this cycle`, copy: '' }
}
