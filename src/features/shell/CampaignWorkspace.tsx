import type { Dispatch, SetStateAction } from 'react'
import type { User } from 'firebase/auth'
import type { NavigateFunction } from 'react-router-dom'
import { CampaignSettingsModal } from '../campaign/CampaignSettingsModal'
import type { GameSystem } from '../navigation/tabs'
import { ruleSets } from '../ruleSets/registry'
import type { AppTab, Campaign, CharacterRecord, GroupRecord, ItemApprovalRequest, Role } from '../../types/app'
import { CampaignDialogs } from './CampaignDialogs'
import { CampaignSideNav } from './CampaignSideNav'
import { CampaignStrip } from './CampaignStrip'
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
  clockAlertsEnabled: boolean
}

// A group's campaign route: the campaign beside its sidebar (or why there is
// none), and the overlays that sit above it.
export function CampaignWorkspace(props: CampaignWorkspaceProps) {
  const { campaign, loading, error } = props
  return (
    <>
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
      <CampaignOverlays {...props} />
    </>
  )
}

function CampaignLayout(props: CampaignWorkspaceProps & { campaign: Campaign }) {
  const { activeTab, gameSystem } = props
  return (
    <div className="shell-layout">
      <CampaignSideNav {...props} />

      <section className={contentPanelClass(activeTab)}>
        {ruleSets[gameSystem].shell.campaignStrip ? <CampaignStrip /> : null}
        <CampaignTabContent {...props} />
      </section>
    </div>
  )
}

function CampaignOverlays(props: CampaignWorkspaceProps) {
  const { campaign, settingsOpen, setSettingsOpen } = props
  if (!campaign) return null
  return (
    <>
      <CampaignDialogs {...props} campaign={campaign} />
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
