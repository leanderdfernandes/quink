import { COPY, SUPPORT_EMAIL } from '../lib/config'

// The upgrade modal (pricing-spec §7, reactive variant). Fires when a free account tries a
// video run it doesn't have — at the DROPZONE, before the upload, never after a 90-second
// progress bar that was doomed from the start.
//
// It is emphatically NOT a failure screen. Nothing went wrong; they hit a limit that was
// disclosed on this same screen before they picked the file.
//
// Every word lives in COPY (lib/config.ts) alongside the rest, and the contact address is
// SUPPORT_EMAIL — one address, one constant, so it cannot drift from the one on the failure
// screens.

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
        <span className="pill">{COPY.upgradePill}</span>
        <h2 style={{ marginTop: 14 }}>{COPY.upgradeHeading}</h2>
        <p className="cap" style={{ marginTop: 10 }}>
          {COPY.upgradeBody}
        </p>

        <div className="wall-actions">
          {/* The primary action is the one that WORKS. pricing-spec §7 leads with "Start
              with Starter", but checkout doesn't exist yet and a dead CTA on the highest-
              intent screen in the funnel teaches users the product is broken, not paid.
              Swap this for the Starter card the day Lemon Squeezy lands. */}
          <button className="btn" onClick={onWriteManually}>
            {COPY.upgradeManualCta}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            {COPY.upgradeDismiss}
          </button>
        </div>

        {/* Until checkout exists, this mailto IS the buy button — the same call the restore
            screen makes. Without it the person who wants to pay right now has nowhere to go
            from the screen that just told them they cannot. */}
        {SUPPORT_EMAIL && (
          <p className="note" style={{ marginTop: 16 }}>
            {COPY.upgradeContact}{' '}
            <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Quink plans')}`}>
              {SUPPORT_EMAIL}
            </a>
          </p>
        )}

        <p className="note" style={{ marginTop: 10 }}>
          {COPY.upgradeNote}
        </p>
      </div>
    </div>
  )
}
