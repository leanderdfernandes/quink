import { useState, type ReactNode } from 'react'
import { helpCenterUrl } from '../lib/config'
import { runsLeftFrom, type Entitlements, type PlanId } from '../lib/plans'
import { publicBrandingUrl } from '../lib/storage'
import { trialBannerLabel, trialFor, trialPillLabel } from '../lib/trial'
import type { Person } from '../lib/people'
import type { KnowledgeBase as KB } from '../lib/types'
import AccountMenu from './AccountMenu'
import AvatarStack from './AvatarStack'
import KbSwitcher from './KbSwitcher'
import LegalFooter from './LegalFooter'
import Wordmark from './Wordmark'

// THE APP SHELL — the top bar, the banners and the rail, in one place.
//
// It exists because Articles and Settings were two different SHAPES of screen. Articles was
// a destination inside a rail; Settings replaced the entire page, rail included, and grew a
// "← Help center" back button to get you out. So the rail was navigation for exactly one of
// the two things it listed, and the second one behaved like a modal that had escaped.
//
// Both live in here now. The rail is the navigation for both, which is why Settings no
// longer needs a back button: the way back is the row above the one you are on.
//
// EVERY SCREEN BEGINS ON THE SAME VERTICAL LINE. `.lib-main` owns one content column, left
// aligned at a fixed gutter from the rail rather than centred in whatever space is left
// over — which is what made the old library page look like it was floating away from its
// own sidebar. Anything rendered as a child inherits that column.

type Props = {
  kb: KB
  plan: PlanId | null
  ent: Entitlements | null
  isOwner: boolean
  userId: string | null
  kbs: KB[]
  people: Person[]
  /** Which rail row is lit. */
  active: 'articles' | 'settings'
  /** Rendered on the Articles row. Absent while the list is still loading. */
  articleCount?: number
  onSwitchKb: (kbId: string) => void
  onOpenArticles: () => void
  onOpenSettings: () => void
  onOpenPeople: () => void
  onUpgrade: () => void
  onSignOut: () => void
  justClaimed?: boolean
  onDismissWelcome?: () => void
  /** Suppresses the day-7 banner until the article count is real. */
  loading?: boolean
  children: ReactNode
}

export default function AppShell({
  kb,
  plan,
  ent,
  isOwner,
  userId,
  kbs,
  people,
  active,
  articleCount,
  onSwitchKb,
  onOpenArticles,
  onOpenSettings,
  onOpenPeople,
  onUpgrade,
  onSignOut,
  justClaimed,
  onDismissWelcome,
  loading,
  children,
}: Props) {
  const [bannerHidden, setBannerHidden] = useState(false)

  // Runs and days both drain. ONE pill, escalating with the clock (pricing-spec §6).
  // With no plan to read — an admin inside someone else's help center — there is no clock
  // to show. The countdown is a bill arriving, and it is not theirs.
  const trial = ent
    ? trialFor(kb, ent.expiry_days)
    : { stage: 'none' as const, daysLeft: 0, graceLeft: 0 }
  // Both are billing surfaces — a countdown to a bill and a button to pay it — so neither
  // renders for someone who cannot act on them (team-access-spec L7).
  const pill = isOwner ? trialPillLabel(trial, runsLeftFrom(ent)) : null
  const showBanner = isOwner && trial.stage === 'urgent' && !bannerHidden && !loading

  const initial = (kb.name.trim()[0] || 'Q').toUpperCase()
  const logo = publicBrandingUrl(kb.logo_path)

  return (
    <div className="lib">
      <header className="lib-top">
        <div className="lib-top-brand">
          <Wordmark height={20} />
          <span className="lib-sep">/</span>
          {logo ? (
            <img className="lib-kb-logo" src={logo} alt="" />
          ) : (
            <span className="lib-kb-badge" style={{ background: kb.primary_color }}>
              {initial}
            </span>
          )}
          <KbSwitcher kb={kb} plan={plan} kbs={kbs} userId={userId} onSwitch={onSwitchKb} />
          {/* An action on the KB beside it, not a nav destination — which is why it sits
              here rather than in the rail: it leaves the app entirely. */}
          <a
            className="lib-live"
            href={helpCenterUrl(kb.subdomain)}
            target="_blank"
            rel="noreferrer"
            title="Open the published help center"
          >
            <ExternalIcon />
            View live site
          </a>
        </div>
        <div className="lib-top-right">
          <AvatarStack people={people} onOpen={onOpenPeople} />
          {pill && (
            <button
              className={`counter counter-btn${trial.stage === 'warning' ? ' amber' : ''}`}
              onClick={onUpgrade}
            >
              {pill}
            </button>
          )}
          <AccountMenu onSignOut={onSignOut} />
        </div>
      </header>

      {/* Handover greeting. Two sentences, above the articles, gone on click. */}
      {justClaimed && (
        <div className="claim-welcome">
          <span>
            <b>{kb.name} is yours.</b> Every article is editable — open one and change
            anything. Add more from a recording or write one by hand.
          </span>
          <button className="trial-banner-x" onClick={onDismissWelcome} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      {/* Days 7–0: a persistent banner, not a pill (pricing-spec §7). */}
      {showBanner && (
        <div className="trial-banner">
          <span>{trialBannerLabel(trial, articleCount ?? 0)}</span>
          <button className="btn" onClick={onUpgrade}>
            Keep my help center
          </button>
          <button
            className="trial-banner-x"
            onClick={() => setBannerHidden(true)}
            aria-label="Dismiss until next visit"
          >
            ✕
          </button>
        </div>
      )}

      <div className="lib-body">
        {/* TWO rows (ux-spec-v2 §11). The rail carried eight destinations for a product
            whose whole value is in one of them; everything that is not "make an article"
            is behind Settings now. View live site moved to the top bar — it is an action
            on this help center, not a place. The run meter and Delete account moved into
            Settings, where a number nobody can act on is not competing with the work. */}
        <nav className="rail" aria-label="Sections">
          <button
            className={`rail-item${active === 'articles' ? ' on' : ' link'}`}
            aria-current={active === 'articles' ? 'page' : undefined}
            onClick={onOpenArticles}
          >
            <BookIcon />
            Articles
            {articleCount != null && <span className="rail-count">{articleCount}</span>}
          </button>
          <button
            className={`rail-item${active === 'settings' ? ' on' : ' link'}`}
            aria-current={active === 'settings' ? 'page' : undefined}
            onClick={onOpenSettings}
          >
            <GearIcon />
            Settings
          </button>
        </nav>

        <main className="lib-main">
          {children}
          {/* Compact and at the very bottom: this is a working surface, not a marketing
              page, but the links have to be reachable by clicking. */}
          <LegalFooter compact />
        </main>
      </div>
    </div>
  )
}

/* --- Inline icons (lucide paths, stroked with currentColor) --- */
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

const BookIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" {...stroke} aria-hidden>
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
  </svg>
)
const GearIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" {...stroke} aria-hidden>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </svg>
)
const ExternalIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...stroke} aria-hidden>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <path d="M15 3h6v6M10 14 21 3" />
  </svg>
)
