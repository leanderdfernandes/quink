import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import App from './App'
import Admin from './screens/Admin'
import Claim from './screens/Claim'
import Invite from './screens/Invite'
import ReaderSite from './reader/ReaderSite'
import StagingBanner from './components/StagingBanner'
import { readerKeyFromHost } from './lib/config'
import './styles.css'

// Two apps, one bundle. Which one renders is decided by the HOST:
//   {sub}.quink.online / a custom domain  -> the PUBLIC reader site, on clean paths
//                                            (`/`, `/{article}`, `/category/{id}`)
//   quink.online / www / localhost        -> the authoring SPA, with the reader still
//                                            reachable at the /kb/{slug} dev path.
// `?kb={slug}` on the app host is a convenience override that redirects into that path.
//
// Authoring lives under /app/ and is keyed on kb.id, NOT on the subdomain: the subdomain is
// trigger-provisioned and follows the KB name on rename (migration 0013), so a bookmarked
// authoring URL keyed on it dies the first time someone renames their help center.
// Authoring URLs are internal — ugly and stable beats pretty and fragile. The reader keeps
// slugs, which is the surface where prettiness actually earns something.
//
// Only the KB shell and the article are routes. The upload -> account wall -> generating
// wizard stays a state machine inside App on purpose: routing those steps hands the user a
// browser back button in the middle of a 90-second job they cannot re-enter.
function KbQueryRedirect() {
  const [params] = useSearchParams()
  const kb = params.get('kb')
  return kb ? <Navigate to={`/kb/${kb}`} replace /> : <App />
}

const hostKey = readerKeyFromHost(window.location.host)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      {hostKey !== null ? (
        // On a help-center host the KB comes from the host, so paths are clean.
        <Routes>
          <Route path="/" element={<ReaderSite hostKey={hostKey} />} />
          <Route path="/category/:folderId" element={<ReaderSite hostKey={hostKey} />} />
          <Route path="/:articleSlug" element={<ReaderSite hostKey={hostKey} />} />
        </Routes>
      ) : (
        <Routes>
          {/* Reader preview — unchanged, and the reason authoring is not on /kb/. */}
          <Route path="/kb/:kbSlug" element={<ReaderSite />} />
          <Route path="/kb/:kbSlug/category/:folderId" element={<ReaderSite />} />
          <Route path="/kb/:kbSlug/:articleSlug" element={<ReaderSite />} />

          {/* Everything below the reader preview is the AUTHORING app, so the staging bar
              wraps exactly this and nothing above it. In production the layout element
              renders an <Outlet /> and contributes no DOM at all. */}
          <Route element={<StagingBanner />}>
            <Route path="/admin" element={<Admin />} />
            {/* The receiving end of a reverse demo. Above /app/ because an unauthenticated
                visitor must land here, not be bounced through the signed-out landing page. */}
            <Route path="/claim/:token" element={<Claim />} />
            {/* The receiving end of a team invite. Above /app/ for the same reason as
                /claim/: the visitor is usually signed out, or signed in as the wrong person,
                and must land HERE rather than be bounced through the landing page. */}
            <Route path="/invite/:token" element={<Invite />} />

            {/* App renders both: it resolves the KB from :kbId when present, and otherwise
                runs the signed-out landing/upload flow at "/" and redirects once it knows
                which KB to open. */}
            <Route path="/app/:kbId" element={<App />} />
            <Route path="/app/:kbId/article/:articleId" element={<App />} />
            {/* People is a route, not a wizard phase: it is a place you send someone to. */}
            <Route path="/app/:kbId/people" element={<App />} />
            <Route path="*" element={<KbQueryRedirect />} />
          </Route>
        </Routes>
      )}
    </BrowserRouter>
  </StrictMode>,
)
