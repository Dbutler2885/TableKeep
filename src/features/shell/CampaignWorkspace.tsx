import type { Dispatch, SetStateAction } from 'react'
import { Menu } from 'lucide-react'
import type { User } from 'firebase/auth'
import type { NavigateFunction } from 'react-router-dom'
import { CampaignSettingsModal } from '../campaign/CampaignSettingsModal'
import { CliffhangerModal } from '../notes/CliffhangerModal'
import { TransferNotification } from '../transfers/TransferNotification'
import type { GameSystem } from '../navigation/tabs'
import type { AppTab, Campaign, CharacterRecord, GroupRecord, ItemApprovalRequest, Role } from '../../types/app'
import { ApprovalPrompt } from './ApprovalPrompt'
import { CampaignSideNav } from './CampaignSideNav'
import { CampaignTabContent } from './CampaignTabContent'
import type { CharacterTabProps } from './characterTabProps'
import { contentPanelClass } from './shellTabs'
import type { CampaignNavTab } from './shellTabs'

type CampaignWorkspaceProps = {
  group: GroupRecord
  campaign: Campaign | null
  loading: boolean
  error: string | null
  user: User
  username: string
  role: Role | null
  isDemoVisitor: boolean
  gameSystem: GameSystem
  activeTab: AppTab
  visibleTabs: CampaignNavTab[]
  drawerOpen: boolean
  setDrawerOpen: Dispatch<SetStateAction<boolean>>
  settingsOpen: boolean
  setSettingsOpen: Dispatch<SetStateAction<boolean>>
  navigate: NavigateFunction
  onSignOut: () => void
  setError: (message: string) => void
  characters: CharacterRecord[]
  characterTabProps: CharacterTabProps | null
  pendingRequests: ItemApprovalRequest[]
  approvalBusy: boolean
  onApprove: (request: ItemApprovalRequest) => Promise<void>
  onReject: (request: ItemApprovalRequest) => Promise<void>
  showTransferNotification: boolean
  cliffhangerEnabled: boolean
}

// A group's campaign route: the menu toggle, the campaign (or why there is
// none), and the overlays that sit above it.
export function CampaignWorkspace(props: CampaignWorkspaceProps) {
  const { campaign, loading, error, setDrawerOpen, role, pendingRequests, approvalBusy, onApprove, onReject } = props
  return (
    <>
      <button
        type="button"
        className="menu-toggle"
        onClick={() => setDrawerOpen((current) => !current)}
        aria-label="Open navigation"
      >
        <Menu size={18} strokeWidth={2.5} />
      </button>

      {loading ? (
        <section>
          <h2>Loading Campaign</h2>
          <p>Checking active campaign access...</p>
        </section>
      ) : error ? (
        <section>
          <h2>Access Error</h2>
          <p>{error}</p>
        </section>
      ) : !campaign ? (
        <section>
          <h2>No Active Campaign</h2>
          <p>This group does not have an active campaign yet.</p>
        </section>
      ) : (
        <CampaignLayout {...props} campaign={campaign} />
      )}
      <ApprovalPrompt role={role} pendingRequests={pendingRequests} busy={approvalBusy} onApprove={onApprove} onReject={onReject} />
      <CampaignOverlays {...props} />
    </>
  )
}

function CampaignLayout(props: CampaignWorkspaceProps & { campaign: Campaign }) {
  const { drawerOpen, setDrawerOpen, activeTab } = props
  return (
    <div className="shell-layout">
      <CampaignSideNav {...props} />

      {drawerOpen ? <button className="drawer-backdrop" onClick={() => setDrawerOpen(false)} /> : null}

      <section className={contentPanelClass(activeTab)}>
        <CampaignTabContent {...props} />
      </section>
    </div>
  )
}

function CampaignOverlays({
  campaign,
  user,
  role,
  characters,
  showTransferNotification,
  cliffhangerEnabled,
  settingsOpen,
  setSettingsOpen,
}: CampaignWorkspaceProps) {
  if (!campaign) return null
  return (
    <>
      {showTransferNotification ? (
        <TransferNotification
          campaignId={campaign.id}
          groupId={campaign.groupId}
          currentUserId={user.uid}
          role={role}
          characters={characters}
        />
      ) : null}
      <CliffhangerModal campaignId={campaign.id} groupId={campaign.groupId} userId={user.uid} enabled={cliffhangerEnabled} />
      {settingsOpen ? (
        <CampaignSettingsModal
          groupId={campaign.groupId}
          campaign={campaign}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </>
  )
}
