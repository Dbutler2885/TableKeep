import { Plus } from 'lucide-react'
import type { User } from 'firebase/auth'
import type { GroupRecord } from '../../types/app'
import { ActiveCampaignSection } from './ActiveCampaignSection'
import { CampaignDialogs } from './CampaignDialogs'
import { CampaignListSection } from './CampaignListSection'
import { DeleteGroupDialog } from './DeleteGroupDialog'
import { GroupHomeHeader } from './GroupHomeHeader'
import { InviteDialog } from './InviteDialog'
import { groupHasCampaigns } from './groupHomeCampaigns'
import { useBusyAction } from './useBusyAction'
import { useCampaignCandidate } from './useCampaignCandidate'
import { useDeleteGroupDialog } from './useDeleteGroupDialog'
import { useInviteDialog } from './useInviteDialog'
import { useNewDraftDialog } from './useNewDraftDialog'
import './GroupScreens.css'

type GroupHomeProps = {
  user: User
  username: string
  onCreateCampaign: (groupId: string, name: string, system: string) => Promise<void>
  onSetActiveCampaign: (groupId: string, campaignId: string) => Promise<void>
  onDeactivateCampaign: (groupId: string, campaignId: string) => Promise<void>
  onDeleteInactiveCampaign: (groupId: string, campaignId: string) => Promise<void>
  onDeleteDraftCampaign: (groupId: string, campaignId: string) => Promise<void>
  group: GroupRecord
  onDeleteGroup: (groupId: string) => Promise<void>
  onBackToGroups: () => void
  onOpenCampaign: (campaignId: string) => void
  onOpenActiveCampaign: () => void
  onSignOut: () => void
  /**
   * False for an anonymous demo visitor. They are the admin of their sandbox
   * group, so the invite affordance would otherwise be offered to them, and it
   * would mint a top-level `inviteCodes` document that outlives the sandbox the
   * expiry sweep deletes. `firestore.rules` refuses the write either way; this
   * keeps a button that cannot work off the screen.
   */
  canInvite?: boolean
}

export function GroupHome({
  user,
  username,
  group,
  onCreateCampaign,
  onSetActiveCampaign,
  onDeactivateCampaign,
  onDeleteInactiveCampaign,
  onDeleteDraftCampaign,
  onDeleteGroup,
  onBackToGroups,
  onOpenCampaign,
  onOpenActiveCampaign,
  onSignOut,
  canInvite: inviteAllowed = true,
}: GroupHomeProps) {
  const busyAction = useBusyAction()
  const { busy, error } = busyAction
  const newDraft = useNewDraftDialog(busyAction, (name, system) => onCreateCampaign(group.id, name, system))
  const setActive = useCampaignCandidate(busyAction, (id) => onSetActiveCampaign(group.id, id), 'Unable to set active campaign.')
  const deleteDraft = useCampaignCandidate(busyAction, (id) => onDeleteDraftCampaign(group.id, id), 'Unable to delete draft.')
  const deactivate = useCampaignCandidate(busyAction, (id) => onDeactivateCampaign(group.id, id), 'Unable to deactivate campaign.')
  const deleteInactive = useCampaignCandidate(busyAction, (id) => onDeleteInactiveCampaign(group.id, id), 'Unable to delete campaign.')
  const invite = useInviteDialog(user, group, username)
  const deleteGroup = useDeleteGroupDialog(busyAction, () => onDeleteGroup(group.id))
  const canDelete = group.memberRole === 'admin'
  const canInvite = inviteAllowed && group.memberRole === 'admin'

  return (
    <section className="group-screen">
      <div className="group-panel group-panel-wide">
        <GroupHomeHeader
          user={user}
          username={username}
          group={group}
          canInvite={canInvite}
          canDelete={canDelete}
          onBackToGroups={onBackToGroups}
          onSignOut={onSignOut}
          onInvite={invite.show}
          onDelete={deleteGroup.show}
        />

        <ActiveCampaignSection campaign={group.activeCampaign} onOpen={onOpenActiveCampaign} onDeactivate={deactivate.ask} />

        <div className="group-home-grid">
          <CampaignListSection
            title="My Drafts"
            headerAction={
              <button
                type="button"
                className="group-icon-button"
                aria-label="Create new draft"
                title="Create new draft"
                onClick={newDraft.show}
              >
                <Plus size={18} />
              </button>
            }
            campaigns={group.drafts}
            status="private draft"
            emptyText="No drafts yet."
            deleteLabel="Delete draft"
            onOpenCampaign={onOpenCampaign}
            onSetActive={setActive.ask}
            onDelete={deleteDraft.ask}
          />

          <CampaignListSection
            title="Inactive Campaigns"
            campaigns={group.inactiveCampaigns}
            status="inactive"
            emptyText="No inactive campaigns yet."
            deleteLabel="Delete"
            onOpenCampaign={onOpenCampaign}
            onSetActive={setActive.ask}
            onDelete={deleteInactive.ask}
          />
        </div>

      </div>

      <CampaignDialogs
        activeCampaign={group.activeCampaign}
        busy={busy}
        error={error}
        newDraft={newDraft}
        setActive={setActive}
        deactivate={deactivate}
        deleteInactive={deleteInactive}
        deleteDraft={deleteDraft}
      />

      {invite.open ? (
        <InviteDialog
          groupName={group.name}
          invites={invite.invites}
          now={Date.now()}
          busy={invite.busy}
          error={invite.error}
          copiedToken={invite.copiedToken}
          onGenerate={() => void invite.generate()}
          onCopy={(token) => void invite.copyLink(token)}
          onRevoke={(token) => void invite.revoke(token)}
          onClose={invite.close}
        />
      ) : null}

      {deleteGroup.open ? (
        <DeleteGroupDialog
          groupName={group.name}
          hasCampaigns={groupHasCampaigns(group)}
          confirming={deleteGroup.confirming}
          busy={busy}
          error={error}
          onCancel={deleteGroup.cancel}
          onAdvance={deleteGroup.advance}
          onBack={deleteGroup.back}
          onConfirm={() => void deleteGroup.confirm()}
        />
      ) : null}
    </section>
  )
}
