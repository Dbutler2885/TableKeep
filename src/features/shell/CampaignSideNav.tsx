import type { Dispatch, SetStateAction } from 'react'
import { ChevronLeft, Settings } from 'lucide-react'
import type { User } from 'firebase/auth'
import { NavLink } from 'react-router-dom'
import type { NavigateFunction } from 'react-router-dom'
// Sidebar uses the dedicated B&W "Tower Keep" mark; the color "Tablekeep"
// stays on the lobby/picker/auth surfaces via BrandWordmark.
import tablekeepLogo from '../../../logo/Tower Keep.svg'
import { DiscordConnection } from '../auth/DiscordConnection'
import { DiscordReturnNotice } from '../auth/DiscordReturnNotice'
import { campaignTabPath, groupHomePath } from '../navigation/tabs'
import type { Campaign, GroupRecord, Role } from '../../types/app'
import type { CampaignNavTab } from './shellTabs'

const OSE_SRD_URL = 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Main_Page'

type CampaignSideNavProps = {
  group: GroupRecord
  campaign: Campaign
  user: User
  username: string
  role: Role | null
  isDemoVisitor: boolean
  visibleTabs: CampaignNavTab[]
  drawerOpen: boolean
  setDrawerOpen: Dispatch<SetStateAction<boolean>>
  setSettingsOpen: Dispatch<SetStateAction<boolean>>
  navigate: NavigateFunction
  onSignOut: () => void
}

export function CampaignSideNav({
  group,
  campaign,
  user,
  username,
  role,
  isDemoVisitor,
  visibleTabs,
  drawerOpen,
  setDrawerOpen,
  setSettingsOpen,
  navigate,
  onSignOut,
}: CampaignSideNavProps) {
  return (
    <nav className={`side-nav ${drawerOpen ? 'open' : ''}`}>
      <h1 className="side-title">
        <span className="vtm-fang-anchor">Table</span>
        <img className="side-title-logo" src={tablekeepLogo} alt="" aria-hidden="true" />
        <span className="vtm-fang-anchor">Keep</span>
      </h1>
      <p className="side-meta">{group.name}</p>
      <button
        type="button"
        className="side-campaign-back"
        onClick={() => {
          void navigate(groupHomePath(group.id), { replace: true })
        }}
        aria-label={`Back to ${group.name}`}
      >
        <ChevronLeft size={16} />
        <span>{campaign.name}</span>
      </button>

      <div className="nav-list">
        {visibleTabs.map((tab) => (
          <CampaignNavLink
            key={tab.id}
            tab={tab}
            groupId={group.id}
            campaignId={campaign.id}
            onChoose={() => setDrawerOpen(false)}
          />
        ))}
      </div>

      <AccountPanel
        user={user}
        username={username}
        role={role}
        isDemoVisitor={isDemoVisitor}
        onOpenSettings={() => {
          setSettingsOpen(true)
          setDrawerOpen(false)
        }}
        onSignOut={onSignOut}
      />
    </nav>
  )
}

type CampaignNavLinkProps = {
  tab: CampaignNavTab
  groupId: string
  campaignId: string
  onChoose: () => void
}

// The rules tab is a link out to the OSE SRD rather than a route.
function CampaignNavLink({ tab, groupId, campaignId, onChoose }: CampaignNavLinkProps) {
  if (tab.id === 'rules') {
    return (
      <a
        href={OSE_SRD_URL}
        target="_blank"
        rel="noreferrer noopener"
        onClick={onChoose}
        className="tab-button"
      >
        {tab.label}
      </a>
    )
  }
  return (
    <NavLink
      to={campaignTabPath(groupId, campaignId, tab.id)}
      end
      onClick={onChoose}
      className={({ isActive }) => (isActive ? 'tab-button active' : 'tab-button')}
    >
      {tab.label}
    </NavLink>
  )
}

type AccountPanelProps = {
  user: User
  username: string
  role: Role | null
  isDemoVisitor: boolean
  onOpenSettings: () => void
  onSignOut: () => void
}

function AccountPanel({ user, username, role, isDemoVisitor, onOpenSettings, onSignOut }: AccountPanelProps) {
  return (
    <div className="account-panel">
      <p className="account-email account-username">Username: {username}</p>
      <p className="account-email">Role: {role}</p>
      {isDemoVisitor ? null : (
        <>
          <DiscordConnection userId={user.uid} variant="panel" />
          <DiscordReturnNotice variant="panel" />
        </>
      )}
      {role === 'gm' ? (
        <button
          type="button"
          className="side-settings-button"
          onClick={onOpenSettings}
        >
          <Settings size={14} />
          <span>Campaign settings</span>
        </button>
      ) : null}
      <button type="button" onClick={onSignOut}>
        Sign Out
      </button>
    </div>
  )
}
