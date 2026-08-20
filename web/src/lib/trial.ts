import type { KnowledgeBase } from './types'

// The free-trial countdown, SPA side. ONE computation, used by the pill, the banner, the
// restore screen and the dropzone disclosure — so the four can never show different numbers
// on the same day. The worker's copy is worker/trial.py; if they drift, the app and the
// inbox disagree, which is the one thing pricing-spec §7 says must not happen.
//
// MIRRORS worker/config.py: TRIAL_WARN_DAYS and TRIAL_GRACE_DAYS.
export const TRIAL_WARN_DAYS = [14, 7] as const
export const TRIAL_GRACE_DAYS = 7

export type TrialStage =
  | 'none' //     paid plan, or the clock hasn't started (no articles yet)
  | 'neutral' //  days 30–15: quiet, brand-coloured, states both limits
  | 'warning' //  days 14–8: amber, names the consequence
  | 'urgent' //   days 7–0: persistent banner, not a pill
  | 'offline' //  expired: reader is dark, articles are intact, restore is one reply away

export type Trial = {
  stage: TrialStage
  /** Whole days until the reader goes dark. Never below 0. */
  daysLeft: number
  /** Whole days of grace left once offline. Never below 0. */
  graceLeft: number
}

// Ceiling, matching worker/trial.py days_left(). With twelve hours to go a user reads
// "1 day left", not "0" — rounding a live day down to zero is a countdown lying in the
// direction that costs someone their work.
function wholeDaysUntil(iso: string, addDays: number): number {
  const end = new Date(iso).getTime() + addDays * 86400_000
  return Math.ceil((end - Date.now()) / 86400_000)
}

// Takes the OWNER's expiry_days, not a plan id: the clock belongs to whoever owns the help
// center, and inside someone else's a member cannot read their tier. kb_entitlements()
// resolves it, so this stays a pure computation over a number and two timestamps.
export function trialFor(kb: KnowledgeBase, expiryDays: number | null): Trial {
  // A paid plan has no clock at all. Taking expiry_days rather than testing for 'free'
  // keeps the entitlement table the only place tiers are described.
  if (expiryDays === null || !kb.trial_started_at) {
    return { stage: 'none', daysLeft: 0, graceLeft: 0 }
  }

  if (kb.offline_at) {
    return {
      stage: 'offline',
      daysLeft: 0,
      graceLeft: Math.max(0, wholeDaysUntil(kb.offline_at, TRIAL_GRACE_DAYS)),
    }
  }

  const daysLeft = Math.max(0, wholeDaysUntil(kb.trial_started_at, expiryDays))
  const stage: TrialStage =
    daysLeft <= TRIAL_WARN_DAYS[1] ? 'urgent'
    : daysLeft <= TRIAL_WARN_DAYS[0] ? 'warning'
    : 'neutral'
  return { stage, daysLeft, graceLeft: 0 }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// pricing-spec §6/§7 copy, word for word. Runs and days both drain, and §6 is explicit that
// two competing meters is noise — so this is ONE string, not two badges. In the neutral
// window it names both numbers (§6's "12 guides · 22 days left"); once the clock is the
// scarcer resource it takes over entirely and the run count steps out of the way.
export function trialPillLabel(t: Trial, runsLeft: number | null): string | null {
  const guides = runsLeft === null ? null : `${plural(runsLeft, 'guide')}`
  if (t.stage === 'none') return guides && `${guides} left`
  if (t.stage === 'neutral') {
    return [guides, `${plural(t.daysLeft, 'day')} left`].filter(Boolean).join(' · ')
  }
  if (t.stage === 'warning') return `Your articles are removed in ${plural(t.daysLeft, 'day')}`
  return null // urgent + offline are a banner and a screen, never a pill
}

// The day-7 persistent banner (pricing-spec §7), which must carry the article count — "your
// 12 articles" is the sentence that makes this real, where "your content" does not.
export function trialBannerLabel(t: Trial, articles: number): string {
  return `${plural(t.daysLeft, 'day')} left — your ${plural(
    articles,
    'article',
  )} and help center will be removed.`
}
