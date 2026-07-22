import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import App from './App'
import ReaderSite from './reader/ReaderSite'
import './styles.css'

// Two apps, one bundle. `/kb/{slug}[/{article}]` is the PUBLIC reader site (anon); every
// other path is the authoring SPA. In prod the reader is served per-customer-domain and
// the host maps to the KB; in dev the /kb/{slug} path simulates that subdomain (build
// spec §Local testing). `?kb={slug}` is a convenience override that redirects into it.
function KbQueryRedirect() {
  const [params] = useSearchParams()
  const kb = params.get('kb')
  return kb ? <Navigate to={`/kb/${kb}`} replace /> : <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/kb/:kbSlug" element={<ReaderSite />} />
        <Route path="/kb/:kbSlug/category/:folderId" element={<ReaderSite />} />
        <Route path="/kb/:kbSlug/:articleSlug" element={<ReaderSite />} />
        <Route path="*" element={<KbQueryRedirect />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
