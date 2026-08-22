import { Outlet } from 'react-router-dom'
import { IS_PRODUCTION, APP_ENV } from '../lib/config'

// A layout route, not a component someone remembers to render: it wraps the authoring
// routes in main.tsx so every screen inside them carries the bar, including the ones that
// return early (loading, removed-access, failure).
//
// It is NOT wrapped around the reader — /kb/:kbSlug preview or a help-center host. The
// reader has to look identical in both environments or it stops being a valid preview of
// what a customer sees, and that is worth more than the reminder.
//
// Same amber, same height and same type scale as the viewing-as-admin bar (.admin-bar):
// both answer "you are not where you think you are", and a second visual language for the
// same question is how one of them stops being read.
export default function StagingBanner() {
  // Zero footprint in production — no element, no class, nothing to inspect.
  if (IS_PRODUCTION) return <Outlet />
  return (
    <>
      <div className="staging-bar" role="alert">
        <span className="admin-bar-dot" aria-hidden />
        <span className="admin-bar-text">
          <strong>{APP_ENV.toUpperCase()}</strong> — not production data
        </span>
      </div>
      <Outlet />
    </>
  )
}
