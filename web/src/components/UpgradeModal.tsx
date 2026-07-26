import { PLANS } from '../lib/plans'

// The upgrade modal (pricing-spec §7, reactive variant). Fires when a free account tries a
// video run it doesn't have — at the DROPZONE, before the upload, never after a 90-second
// progress bar that was doomed from the start.
//
// It is emphatically NOT a failure screen. Nothing went wrong; they hit a limit that was
// disclosed on this same screen before they picked the file.
//
// The load-bearing sentence is "you can still write articles by hand." Generation is the
// only thing that costs us anything, so it is the only thing capped — and a user who
// believes the whole product is locked has no reason to come back.

type Props = {
  onWriteManually: () => void
  onClose: () => void
}

export default function UpgradeModal({ onWriteManually, onClose }: Props) {
  return (
    // Reuses the publish modal's overlay — one scrim style in the app, not two.
    <div
      className="pub-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Free video guides used"
    >
      <div className="card wall" onClick={(e) => e.stopPropagation()}>
        <span className="pill">
          You've used your {PLANS.free.lifetime_runs} free video guides
        </span>
        <h2 style={{ marginTop: 14 }}>Keep building your help center</h2>
        <p className="cap" style={{ marginTop: 10 }}>
          You can keep writing articles by hand for free. To make more guides from
          recordings — and to publish on your own domain without a watermark — pick a plan.
          Your whole team included, no per-seat fees.
        </p>

        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          {/* The primary action is the one that WORKS. pricing-spec §7 leads with "Start
              with Starter", but checkout doesn't exist yet and a dead CTA on the highest-
              intent screen in the funnel teaches users the product is broken, not paid.
              Swap this for the Starter card the day Lemon Squeezy lands. */}
          <button className="btn" onClick={onWriteManually}>
            Write an article by hand
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            Not now
          </button>
        </div>

        <p className="note" style={{ marginTop: 16 }}>
          Writing by hand is unlimited on every plan — it costs us nothing, so we don't
          charge for it.
        </p>
      </div>
    </div>
  )
}
