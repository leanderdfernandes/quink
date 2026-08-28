// Shown whenever an admin is inside a KB they do not own.
//
// This is a safety control, not decoration. Admin sessions can WRITE to any customer KB
// (migration 0015 widened the policies deliberately, because a read-only open-as-owner
// cannot do the one job it exists for). The only thing standing between that and
// publishing or deleting something in the wrong account is knowing where you are — so
// this bar is persistent, cannot be dismissed, and always offers the way out.

type Props = {
  kbName: string
  onExit: () => void
}

export default function AdminBanner({ kbName, onExit }: Props) {
  return (
    <div className="admin-bar" role="alert">
      <svg
          className="admin-bar-ic"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 3.8 2.8 19.5h18.4L12 3.8Z" />
          <path d="M12 9.5v4.2" />
          <circle cx="12" cy="16.6" r=".8" fill="currentColor" stroke="none" />
        </svg>
      <span className="admin-bar-text">
        Viewing as admin — <strong>{kbName}</strong>
      </span>
      <button className="admin-bar-exit" onClick={onExit}>
        Exit to admin
      </button>
    </div>
  )
}
