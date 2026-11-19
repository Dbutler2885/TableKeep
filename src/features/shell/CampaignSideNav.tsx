import { useId, useRef, useState } from 'react'
import type { Dispatch, MouseEvent, ReactNode, RefObject, SetStateAction } from 'react'
import { ChevronLeft, LogOut, Menu, MessagesSquare, Settings, X } from 'lucide-react'
import type { User } from 'firebase/auth'
import { NavLink } from 'react-router-dom'
import type { NavigateFunction } from 'react-router-dom'
// Sidebar uses the dedicated B&W "Tower Keep" mark; the color "Tablekeep"
// stays on the lobby/picker/auth surfaces via BrandWordmark.
import tablekeepLogo from '../../../logo/Tower Keep.svg'
import { PHONE_NAV_MAX_WIDTH } from '../../constants/layout'
import { DiscordDialog } from '../auth/DiscordDialog'
import { pendingDiscordOutcome } from '../auth/discordReturnOutcome'
import { useMediaQuery } from '../common/useMediaQuery'
import { campaignTabPath, groupHomePath } from '../navigation/tabs'
import type { AppTab, Campaign, GroupRecord, Role } from '../../types/app'
import type { CampaignNavTab } from './shellTabs'
import { usePublishedWidth } from './usePublishedWidth'

const OSE_SRD_URL = 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Main_Page'

export const PHONE_NAV_QUERY = `(max-width: ${PHONE_NAV_MAX_WIDTH}px)`

type CampaignSideNavProps = {
  group: GroupRecord
  campaign: Campaign
  user: User
  username: string
  role: Role | null
  isDemoVisitor: boolean
  activeTab: AppTab
  visibleTabs: CampaignNavTab[]
  setSettingsOpen: Dispatch<SetStateAction<boolean>>
  navigate: NavigateFunction
  onSignOut: () => void
}

// A campaign's navigation. Beside the page it is a sidebar, always open; on a
// phone, where a sidebar would leave the page too little room, it is a bar
// across the top that opens the same sidebar as a drawer.
//
// The Discord connection opens in a dialog from the account buttons. Someone
// just back from connecting on Discord finds it open, with what happened.
export function CampaignSideNav(props: CampaignSideNavProps) {
  const phone = useMediaQuery(PHONE_NAV_QUERY)
  const discordAvailable = !props.isDemoVisitor
  const [discordOpen, setDiscordOpen] = useState(() => discordAvailable && pendingDiscordOutcome() !== null)
  const openDiscord = discordAvailable ? () => setDiscordOpen(true) : null
  const sidebarRef = useRef<HTMLElement>(null)
  usePublishedWidth(sidebarRef, '--side-nav-width', !phone)
  return (
    <>
      {phone ? <PhoneNav {...props} onOpenDiscord={openDiscord} /> : <SideNavContent {...props} navRef={sidebarRef} onOpenDiscord={openDiscord} onChoose={() => undefined} />}
      {discordOpen ? <DiscordDialog userId={props.user.uid} onClose={() => setDiscordOpen(false)} /> : null}
    </>
  )
}

type SideNavProps = CampaignSideNavProps & { onOpenDiscord: (() => void) | null }

function PhoneNav(props: SideNavProps) {
  const { activeTab, visibleTabs } = props
  const drawerId = useId()
  const drawerRef = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const activeLabel = visibleTabs.find((tab) => tab.id === activeTab)?.label

  const openDrawer = () => {
    drawerRef.current?.showModal()
    setOpen(true)
  }
  const closeDrawer = () => drawerRef.current?.close()

  // A click on the dialog itself, not on the sidebar inside it, is a click on
  // the backdrop.
  const closeFromBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) closeDrawer()
  }

  return (
    <>
      <header className="phone-nav-bar">
        <button
          type="button"
          className="phone-nav-toggle"
          onClick={openDrawer}
          aria-label="Open navigation"
          aria-controls={drawerId}
          aria-expanded={open}
        >
          <Menu size={18} strokeWidth={2.5} />
        </button>
        {activeLabel ? <p className="phone-nav-title">{activeLabel}</p> : null}
      </header>

      <dialog
        ref={drawerRef}
        id={drawerId}
        className="side-drawer"
        aria-label="Campaign navigation"
        onClose={() => setOpen(false)}
        onClick={closeFromBackdrop}
      >
        <button type="button" className="side-drawer-close" onClick={closeDrawer} aria-label="Close navigation">
          <X size={18} strokeWidth={2.5} />
        </button>
        <SideNavContent {...props} onChoose={closeDrawer} />
      </dialog>
    </>
  )
}

function SideNavContent({ group, campaign, username, role, visibleTabs, setSettingsOpen, navigate, onSignOut, onOpenDiscord, onChoose, navRef }: SideNavProps & { onChoose: () => void; navRef?: RefObject<HTMLElement | null> }) {
  return (
    <nav ref={navRef} className="side-nav" aria-label="Campaign">
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
          <CampaignNavLink key={tab.id} tab={tab} groupId={group.id} campaignId={campaign.id} onChoose={onChoose} />
        ))}
      </div>

      <AccountPanel
        username={username}
        role={role}
        onOpenDiscord={onOpenDiscord && (() => {
          onChoose()
          onOpenDiscord()
        })}
        onOpenSettings={() => {
          onChoose()
          setSettingsOpen(true)
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
  const label = <CampaignNavLabel label={tab.label} />
  if (tab.id === 'rules') {
    return (
      <a href={OSE_SRD_URL} target="_blank" rel="noreferrer noopener" onClick={onChoose} className="tab-button">
        {label}
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
      {label}
    </NavLink>
  )
}

// `data-label` lets the stylesheet reserve the label's bold width, so the
// sidebar keeps one width whichever tab is active.
function CampaignNavLabel({ label }: { label: string }) {
  return <span className="tab-label" data-label={label}>{label}</span>
}

type AccountPanelProps = {
  username: string
  role: Role | null
  onOpenDiscord: (() => void) | null
  onOpenSettings: () => void
  onSignOut: () => void
}

// Who is signed in, then the account's actions as one row of icon buttons,
// each named for assistive technology and by its tooltip.
function AccountPanel({ username, role, onOpenDiscord, onOpenSettings, onSignOut }: AccountPanelProps) {
  return (
    <div className="account-panel">
      <p className="account-email account-identity">
        <span className="sr-only">Username: </span>
        <span className="account-username">{username}</span>
        {role ? (
          <>
            <span className="sr-only">, role: </span>
            <span className="account-role">{role}</span>
          </>
        ) : null}
      </p>
      <div className="account-actions">
        {onOpenDiscord ? (
          <AccountAction label="Discord" onClick={onOpenDiscord}>
            <MessagesSquare size={16} />
          </AccountAction>
        ) : null}
        {role === 'gm' ? (
          <AccountAction label="Campaign settings" onClick={onOpenSettings}>
            <Settings size={16} />
          </AccountAction>
        ) : null}
        <AccountAction label="Sign out" onClick={onSignOut}>
          <LogOut size={16} />
        </AccountAction>
      </div>
    </div>
  )
}

function AccountAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="account-action" onClick={onClick} aria-label={label} title={label}>
      {children}
    </button>
  )
}
