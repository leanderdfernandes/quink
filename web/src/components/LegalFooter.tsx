import { PRODUCT_NAME } from '../lib/config'

// The four legal links, in one component, used by the marketing landing and by the app.
// Razorpay's activation reviewer looks for footer links, not just working URLs — a page that
// exists but is unreachable by clicking reads as one built for the review.
//
// PLAIN <a>, NEVER react-router <Link>. These four routes are static HTML files served by
// Vercel from public/; they are deliberately NOT React routes (see web/scripts/build-legal.mjs
// for why). A client-side <Link> would keep the SPA mounted and fall through to the "*"
// catch-all in main.tsx, rendering the app instead of the document — and it would do so only
// for people already inside the app, which is the hardest version of this bug to notice. A
// full page load is the point, not a regression.
//
// Not exported to the reader. Published help centers get these links through the WATERMARK
// instead (ReaderSite), so a paid customer's own domain carries no Quink legal links —
// pricing-spec §Starter sells "remove 'Made with' branding fully", and putting our terms in
// their footer would both break that and confuse their readers about whose terms they are
// reading.

const LINKS: [href: string, label: string][] = [
  ['/privacy', 'Privacy'],
  ['/terms', 'Terms'],
  ['/refunds', 'Refunds & Cancellation'],
  ['/contact', 'Contact'],
]

// ONE line, not two blocks. These four links have to be REACHABLE — that is the whole
// requirement — but they are a document trail, not navigation, and a stacked two-row
// footer gave them the visual weight of a section on every screen in the app. Links and
// copyright now share a row at the quietest type size in the system.
export default function LegalFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={`lf${compact ? ' lf-compact' : ''}`} aria-label="Legal">
      {LINKS.map(([href, label]) => (
        <a key={href} href={href}>
          {label}
        </a>
      ))}
      <span className="lf-meta">
        © {new Date().getFullYear()} {PRODUCT_NAME}. Made in India.
      </span>
    </footer>
  )
}
