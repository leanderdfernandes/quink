// Two surfaces belong to the person whose card is on file — the custom domain, and
// anything about money — and an admin reaches both by using the app normally.
//
// A 403 or a hidden rail item are both worse than saying so: one looks broken, the other
// makes people ask a colleague why the thing they were told about isn't there. This says
// what the state is and who can change it, and offers nothing to click, because there is
// nothing an admin can do here and a dead CTA teaches people the product is broken.
//
// It NEVER carries a price, a plan name or a payment state (team-access-spec L7). Naming
// the owner is not billing information — it is the answer to "who do I ask".

type Props = {
  heading: string
  body: React.ReactNode
  ownerName: string | null
  modal?: boolean
  onDismiss?: () => void
  dismissLabel?: string
}

export default function OwnerOnly({
  heading,
  body,
  ownerName,
  modal,
  onDismiss,
  dismissLabel = 'Close',
}: Props) {
  const card = (
    <div className="card wall" onClick={(e) => e.stopPropagation()}>
      <h2>{heading}</h2>
      <p className="cap" style={{ marginTop: 10 }}>
        {body}
      </p>
      <p className="note" style={{ marginTop: 14 }}>
        {ownerName
          ? `${ownerName} owns this help center and can change it.`
          : 'The owner of this help center can change it.'}
      </p>
      {onDismiss && (
        <div className="wall-actions">
          <button className="btn btn-ghost" onClick={onDismiss}>
            {dismissLabel}
          </button>
        </div>
      )}
    </div>
  )

  if (!modal) return card
  return (
    <div
      className="pub-overlay"
      onClick={onDismiss}
      role="dialog"
      aria-modal="true"
      aria-label={heading}
    >
      {card}
    </div>
  )
}
