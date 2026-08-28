import { useState } from 'react'
import { Tabs, TabPanel, type SettingsTab } from '../components/Tabs'
import ProductSettings from './ProductSettings'
import ThemeSettings from './ThemeSettings'
import DomainSettings from './DomainSettings'
import People from './People'
import OwnerOnly from '../components/OwnerOnly'
import DeleteAccountModal from '../components/DeleteAccountModal'
import type { Entitlements } from '../lib/plans'
import type { Person } from '../lib/people'
import type { KnowledgeBase as KB } from '../lib/types'

// Settings, as one screen with four tabs (ux-spec-v2 §11).
//
// It replaces four rail rows. The rail was carrying Articles, Product details, Theming,
// View live site, Domain, People, AI runs and Delete account — eight destinations for a
// product whose whole value is in one of them. Everything that is not "make an article" is
// behind one door now.
//
// THE TAB IS IN THE URL (`/app/:kbId/settings/:tab`), so a refresh keeps your place and a
// link to Theming is a link someone can send. The old `/people` route redirects here.
//
// This component owns the page chrome — the back button and the tab rail — and each panel
// renders its content only. That is why ProductSettings/ThemeSettings/DomainSettings/People
// no longer have their own `settings-top`: two back buttons on one screen is what you get
// otherwise, and one of them lies about where it goes.

type Props = {
  kb: KB
  tab: SettingsTab
  onTab: (tab: SettingsTab) => void
  ent: Entitlements | null
  isOwner: boolean
  userId: string
  people: Person[]
  onSaved: (kb: KB) => void
  onUpgrade: () => void
  onLeft: () => void
  kbs: KB[]
  onSignOut: () => void
}

export default function Settings({
  kb,
  tab,
  onTab,
  ent,
  isOwner,
  userId,
  people,
  onSaved,
  onUpgrade,
  onLeft,
  kbs,
  onSignOut,
}: Props) {
  const [deleting, setDeleting] = useState(false)
  return (
    <div className="set">
      {/* A page header, on the same column and the same left edge as "All articles" one
          level up — so moving between the two rail rows changes the content and nothing
          else. No back button: the rail is the way back now. */}
      <div className="set-hd">
        <h1>Settings</h1>
        <p className="cap">{kb.name}</p>
      </div>

      <div className="set-tabs">
        <Tabs
          label="Settings sections"
          value={tab}
          onChange={onTab}
          tabs={[
            { value: 'product', label: 'Product & context' },
            { value: 'theming', label: 'Theming' },
            { value: 'domain', label: 'Domain' },
            // The count is the one number worth carrying on a tab: it is the only tab
            // whose contents someone else can change while you are looking at it.
            { value: 'team', label: 'Team', count: people.length || undefined },
          ]}
        />
      </div>

      <TabPanel tab="product" value={tab}>
        <ProductSettings kb={kb} ent={ent} onSaved={onSaved} onUpgrade={onUpgrade} />
      </TabPanel>

      {/* Theming's CONTROL column is the same width and starts on the same line as every
          other panel; the live preview takes the space to its right. It reads as this page
          with a tool attached rather than as a different screen. */}
      <TabPanel tab="theming" value={tab}>
        <ThemeSettings kb={kb} ent={ent} onSaved={onSaved} />
      </TabPanel>

      <TabPanel tab="domain" value={tab}>
        {/* A custom domain points a real website at this help center and stays with the
            person accountable for it (§10j) — the worker refuses an admin, which would
            land here as a raw 403 on a screen that looks broken. A named state instead:
            the tab still opens, it just says whose decision this is. */}
        {isOwner ? (
          <DomainSettings kb={kb} onChange={onSaved} />
        ) : (
          <div className="settings-single">
            <OwnerOnly
              heading="The address is managed by the owner"
              body={`${kb.name} is reachable at its Quink address, and a custom domain can be connected to it. Connecting or changing one points a real website at this help center, so it stays with the person accountable for it.`}
              ownerName={ent?.owner_name ?? null}
            />
          </div>
        )}
      </TabPanel>

      <TabPanel tab="team" value={tab}>
        <People
          kb={kb}
          userId={userId}
          isOwner={isOwner}
          ent={ent}
          onUpgrade={onUpgrade}
          onLeft={onLeft}
        />
        {/* Account deletion, as a danger zone at the bottom of the page rather than a rail
            row. Owner-only and last: it is findable by someone who came looking for it and
            out of the way of everyone else. The two-step confirm is unchanged. */}
        {isOwner && (
          <div className="settings-single">
            <div className="danger-zone">
              <div>
                <b>Delete your account</b>
                <p>
                  This deletes every help center you own, with every article, screenshot
                  and recording. It is permanent and there is no backup to restore from.
                </p>
              </div>
              <button className="danger-go" onClick={() => setDeleting(true)}>
                Delete account
              </button>
            </div>
          </div>
        )}
      </TabPanel>

      {/* Two-step confirm, unchanged: the dialog names everything that goes, or it is not
          informed consent. */}
      {deleting && (
        <DeleteAccountModal
          kbs={kbs.length ? kbs : [kb]}
          onClose={() => setDeleting(false)}
          onDeleted={onSignOut}
        />
      )}
    </div>
  )
}
