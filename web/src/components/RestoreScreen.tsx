import { SUPPORT_EMAIL } from '../lib/config'
import type { Trial } from '../lib/trial'

// The post-expiry state (pricing-spec §7). Free help centers go offline 30 days after the
// first article and are deleted 7 days after that.
//
// pricing-spec §7 calls this the highest-intent moment in the entire free funnel, and the
// reason is in the second sentence: nothing was destroyed to get here. "Upgrade to restore"
// converts where "your work is gone" does not — which is why the sweep takes the site
// offline rather than deleting anything, and why this screen leads with what still exists.
//
// The CTA is a mailto, deliberately. There is no checkout yet, and the same call was made
// for UpgradeModal: a dead button on the highest-intent screen in the funnel teaches users
// the product is broken rather than paid. Swap it for Lemon Squeezy the day it lands.

type Props = {
  kbName: string
  trial: Trial
  articleCount: number
  // Offline hides the KB from READERS, not from its owner (migration 0022 gates the reader
  // RPCs on offline_at and touches no article). Blocking editing would punish exactly the
  // person we are trying to convert, so this is an interstitial with a way through.
  onContinue: () => void
}

export default function RestoreScreen({ kbName, trial, articleCount, onContinue }: Props) {
  const subject = `Restore my help center — ${kbName}`
  const mailto = SUPPORT_EMAIL
    ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`
    : null

  return (
    <div className="page" style={{ justifyContent: 'center' }}>
      <div className="card wall">
        <span className="pill amber">Offline</span>
        <h2 style={{ marginTop: 14 }}>Your help center is offline</h2>

        {/* pricing-spec §7, verbatim. The count and the grace window are the whole message:
            over-disclosure is what makes this deletion defensible at all (§2). */}
        <p className="cap" style={{ marginTop: 10 }}>
          Your {articleCount} {articleCount === 1 ? 'article is' : 'articles are'} safe for{' '}
          {trial.graceLeft} more {trial.graceLeft === 1 ? 'day' : 'days'}. Choose a plan to
          bring them back — nothing was lost.
        </p>

        <div className="wall-actions">
          {mailto ? (
            <a className="btn" href={mailto}>
              Restore my help center
            </a>
          ) : (
            <button className="btn" onClick={onContinue}>
              Keep editing
            </button>
          )}
          {/* Never trapped on this screen. */}
          <button className="btn btn-ghost" onClick={onContinue}>
            Back to my articles
          </button>
        </div>

        <p className="note" style={{ marginTop: 16 }}>
          Your readers see nothing until it's restored. You can still sign in, write and
          edit everything — that never stops.
        </p>
      </div>
    </div>
  )
}
