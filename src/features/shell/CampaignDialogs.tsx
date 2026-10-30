import type { User } from 'firebase/auth'
import { CliffhangerModal } from '../notes/CliffhangerModal'
import { TransferNotification } from '../transfers/TransferNotification'
import type { GameSystem } from '../navigation/tabs'
import { ruleSets } from '../ruleSets/registry'
import type { Campaign, CharacterRecord, ItemApprovalRequest, Role } from '../../types/app'
import { ApprovalPrompt } from './ApprovalPrompt'
import { hasApprovals } from './workspaceListening'

type CampaignDialogsProps = {
  campaign: Campaign
  user: User
  role: Role | null
  gameSystem: GameSystem
  characters: CharacterRecord[]
  pendingRequests: ItemApprovalRequest[]
  approvalBusy: boolean
  onApprove: (request: ItemApprovalRequest) => Promise<void>
  onReject: (request: ItemApprovalRequest) => Promise<void>
  showTransferNotification: boolean
  cliffhangerEnabled: boolean
}

// The campaign dialog region: the dialogs that can appear over any tab of an
// open campaign. Approvals show only for a rule set that has them; the
// cliffhanger dialog shows for every rule set.
export function CampaignDialogs(props: CampaignDialogsProps) {
  const { campaign, user, role, gameSystem, characters, showTransferNotification, cliffhangerEnabled } = props
  return (
    <>
      {hasApprovals(gameSystem) ? (
        <ApprovalPrompt role={role} pendingRequests={props.pendingRequests} busy={props.approvalBusy} onApprove={props.onApprove} onReject={props.onReject} />
      ) : null}
      {showTransferNotification ? (
        <TransferNotification
          campaignId={campaign.id}
          groupId={campaign.groupId}
          currentUserId={user.uid}
          role={role}
          characters={characters}
          carrying={ruleSets[gameSystem].carrying}
        />
      ) : null}
      <CliffhangerModal campaignId={campaign.id} groupId={campaign.groupId} userId={user.uid} enabled={cliffhangerEnabled} />
    </>
  )
}
