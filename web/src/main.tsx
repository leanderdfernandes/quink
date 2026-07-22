import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import App from './App'
import ReaderSite from './reader/ReaderSite'
import { readerKeyFromHost } from './lib/config'
import './styles.css'

// Two apps, one bundle. Which one renders is decided by the HOST:
//   {sub}.quink.online / a custom domain  -> the PUBLIC reader site, on clean paths
//                                            (`/`, `/{article}`, `/category/{id}`)
//   quink.online / www / localhost        -> the authoring SPA, with the reader still
//                                            reachable at the /kb/{slug} dev path.
// `?kb={slug}` on the app host is a convenience override that redirects into that path.
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
          <Route path="/kb/:kbSlug" element={<ReaderSite />} />
          <Route path="/kb/:kbSlug/category/:folderId" element={<ReaderSite />} />
          <Route path="/kb/:kbSlug/:articleSlug" element={<ReaderSite />} />
          <Route path="*" element={<KbQueryRedirect />} />
        </Routes>
      )}
    </BrowserRouter>
  </StrictMode>,
)
