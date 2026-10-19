import { useState } from 'react'
import type { User } from 'firebase/auth'
import { useDocumentVisibility } from '../common/useDocumentVisibility'
import { groupPickerPath } from '../navigation/tabs'
import { useCharacters } from '../character/hooks/useCharacters'
import { GroupPicker } from '../groups/GroupPicker'
import { GroupHome } from '../groups/GroupHome'
import { useGroupAccess } from '../groups/useGroupAccess'
import { DemoBanner } from '../demo/DemoBanner'
import { CampaignWorkspace } from './CampaignWorkspace'
import { characterTabPropsFor } from './characterTabProps'
import { campaignIds, campaignRole, campaignSystem, shellTheme } from './shellSelection'
import { useApprovalQueue } from './useApprovalQueue'
import { useCampaignLifecycle } from './useCampaignLifecycle'
import { useCampaignNav } from './useCampaignNav'
import { useDemoSession } from './useDemoSession'
import { useGroupNavigation } from './useGroupNavigation'
import { useRootRedirect } from './useRootRedirect'
import { useSelectedCampaign } from './useSelectedCampaign'
import { useShellRoute } from './useShellRoute'
import { listensForApprovals, listensForCharacters, showsCliffhangerModal, showsTransferNotification } from './workspaceListening'

// The signed-in app: the group picker, a group's home, or one of its campaigns,
// chosen by the route.
export function GroupShell({ user, username, isDemoVisitor }: { user: User, username: string, isDemoVisitor: boolean }) {
  const { pathname, navigate, activeTab, selectedGroupId, selectedCampaignId } = useShellRoute()
  const documentVisible = useDocumentVisibility()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const { groups, loading, error, createCampaign, createGroup, setActiveCampaign, deactivateCampaign, deleteInactiveCampaign, deleteDraftCampaign, deleteGroup, setError } = useGroupAccess(user)
  const { selectedGroup, campaign } = useSelectedCampaign(groups, selectedGroupId, selectedCampaignId)
  const ids = campaignIds(campaign)
  const role = campaignRole(campaign, user.uid)
  const gameSystem = campaignSystem(campaign)

  useRootRedirect(groups, loading, pathname, navigate)
  const { handleSignOut, demoExpiresAt } = useDemoSession(isDemoVisitor, user.uid)
  const { handleSelectGroup, handleCreateGroup, handleCreateCampaign, handleDeleteGroup, handleOpenCampaign, openActiveCampaign } = useGroupNavigation({
    groups,
    navigate,
    selectedGroupId,
    setDrawerOpen,
    createGroup,
    createCampaign,
    deleteGroup,
  })
  const { handleSetActiveCampaign, handleDeleteDraftCampaign, handleDeactivateCampaign, handleDeleteInactiveCampaign } = useCampaignLifecycle({
    navigate,
    selectedGroupId,
    selectedCampaignId,
    setActiveCampaign,
    deactivateCampaign,
    deleteDraftCampaign,
    deleteInactiveCampaign,
  })

  const characterState = useCharacters(ids.campaignId, ids.groupId, user.uid, username, role, ids.gmUserId, setError, listensForCharacters(gameSystem, documentVisible, activeTab))
  const characterTabProps = characterTabPropsFor(campaign, { userId: user.uid, username, role }, characterState)
  const { pendingRequests, approvalBusy, handleApprove, handleReject } = useApprovalQueue(
    ids.campaignId,
    ids.groupId,
    role,
    user.uid,
    listensForApprovals(documentVisible, role, activeTab),
  )
  const visibleTabs = useCampaignNav(campaign, gameSystem, role, activeTab, navigate)

  return (
    <main className="shell-root" data-theme={shellTheme(campaign, selectedCampaignId, gameSystem)}>
      {pathname === groupPickerPath || !selectedGroup ? (
        <GroupPicker
          username={username}
          groups={groups}
          onCreateGroup={handleCreateGroup}
          onSelectGroup={handleSelectGroup}
          onSignOut={handleSignOut}
          discordUserId={isDemoVisitor ? undefined : user.uid}
        />
      ) : !selectedCampaignId ? (
        <GroupHome
          user={user}
          username={username}
          onCreateCampaign={handleCreateCampaign}
          onSetActiveCampaign={handleSetActiveCampaign}
          onDeactivateCampaign={handleDeactivateCampaign}
          onDeleteInactiveCampaign={handleDeleteInactiveCampaign}
          onDeleteDraftCampaign={handleDeleteDraftCampaign}
          canInvite={!isDemoVisitor}
          group={selectedGroup}
          onDeleteGroup={handleDeleteGroup}
          onBackToGroups={() => { void navigate(groupPickerPath, { replace: true }) }}
          onOpenCampaign={handleOpenCampaign}
          onSignOut={handleSignOut}
          onOpenActiveCampaign={() => openActiveCampaign(selectedGroup)}
        />
      ) : (
        <CampaignWorkspace
          group={selectedGroup}
          campaign={campaign}
          loading={loading}
          error={error}
          user={user}
          username={username}
          role={role}
          isDemoVisitor={isDemoVisitor}
          gameSystem={gameSystem}
          activeTab={activeTab}
          visibleTabs={visibleTabs}
          drawerOpen={drawerOpen}
          setDrawerOpen={setDrawerOpen}
          settingsOpen={settingsOpen}
          setSettingsOpen={setSettingsOpen}
          navigate={navigate}
          onSignOut={handleSignOut}
          setError={setError}
          characters={characterState.characters}
          characterTabProps={characterTabProps}
          pendingRequests={pendingRequests}
          approvalBusy={approvalBusy}
          onApprove={handleApprove}
          onReject={handleReject}
          showTransferNotification={showsTransferNotification(documentVisible, activeTab)}
          cliffhangerEnabled={showsCliffhangerModal(documentVisible, activeTab)}
        />
      )}
      {isDemoVisitor ? <DemoBanner expiresAtMs={demoExpiresAt} onLeave={handleSignOut} /> : null}
    </main>
  )
}
