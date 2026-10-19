import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { User } from 'firebase/auth'
import type { Campaign, GroupRecord } from '../../types/app'
import { useGroupInvites } from '../invites/useInvites'
import { ActiveCampaignSection } from './ActiveCampaignSection'
import { CampaignListSection } from './CampaignListSection'
import { DeleteGroupDialog } from './DeleteGroupDialog'
import { ConfirmDialog } from './GroupDialog'
import { GroupHomeHeader } from './GroupHomeHeader'
import { InviteDialog } from './InviteDialog'
import { NewDraftDialog } from './NewDraftDialog'
import { SetActiveDialog } from './SetActiveDialog'
import { errorMessage, runBusyAction } from './busyAction'
import { groupHasCampaigns } from './groupHomeCampaigns'
import { copyToClipboard, inviteUrl } from './inviteDisplay'
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
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [setActiveCandidate, setSetActiveCandidate] = useState<Campaign | null>(null)
  const [deleteDraftCandidate, setDeleteDraftCandidate] = useState<Campaign | null>(null)
  const [deactivateCandidate, setDeactivateCandidate] = useState<Campaign | null>(null)
  const [deleteInactiveCandidate, setDeleteInactiveCandidate] = useState<Campaign | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const { invites, createInvite, revokeInvite } = useGroupInvites(user, inviteOpen ? group.id : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const canDelete = group.memberRole === 'admin'
  const groupHasContents = groupHasCampaigns(group)
  const canInvite = inviteAllowed && group.memberRole === 'admin'
  const busySetters = { setBusy, setError }

  const handleGenerateInvite = async () => {
    setInviteBusy(true)
    setInviteError(null)
    try {
      const token = await createInvite({
        groupId: group.id,
        groupName: group.name,
        createdByName: username,
      })
      try {
        await copyToClipboard(inviteUrl(token))
        setCopiedToken(token)
      } catch {
        // Clipboard may be unavailable; user can copy from the list manually.
      }
    } catch (err) {
      setInviteError(errorMessage(err, 'Could not create invite.'))
    } finally {
      setInviteBusy(false)
    }
  }

  const handleCopyInvite = async (token: string) => {
    try {
      await copyToClipboard(inviteUrl(token))
      setCopiedToken(token)
    } catch {
      setInviteError('Clipboard unavailable. Copy the link manually.')
    }
  }

  const handleRevokeInvite = (token: string) =>
    runBusyAction({ setBusy: setInviteBusy, setError: setInviteError }, () => revokeInvite(token), {
      fallback: 'Could not revoke invite.',
    })

  const handleDelete = () =>
    runBusyAction(busySetters, () => onDeleteGroup(group.id), { fallback: 'Unable to delete group.', staysBusy: true })

  const handleCreateCampaign = (name: string, system: string) =>
    runBusyAction(busySetters, () => onCreateCampaign(group.id, name, system), {
      fallback: 'Unable to create campaign.',
      onSuccess: () => setCreateOpen(false),
    })

  const handleSetActiveCampaign = async () => {
    if (!setActiveCandidate) return
    await runBusyAction(busySetters, () => onSetActiveCampaign(group.id, setActiveCandidate.id), {
      fallback: 'Unable to set active campaign.',
      onSuccess: () => setSetActiveCandidate(null),
    })
  }

  const handleDeleteDraftCampaign = async () => {
    if (!deleteDraftCandidate) return
    await runBusyAction(busySetters, () => onDeleteDraftCampaign(group.id, deleteDraftCandidate.id), {
      fallback: 'Unable to delete draft.',
      onSuccess: () => setDeleteDraftCandidate(null),
    })
  }

  const handleDeactivateCampaign = async () => {
    if (!deactivateCandidate) return
    await runBusyAction(busySetters, () => onDeactivateCampaign(group.id, deactivateCandidate.id), {
      fallback: 'Unable to deactivate campaign.',
      onSuccess: () => setDeactivateCandidate(null),
    })
  }

  const handleDeleteInactiveCampaign = async () => {
    if (!deleteInactiveCandidate) return
    await runBusyAction(busySetters, () => onDeleteInactiveCampaign(group.id, deleteInactiveCandidate.id), {
      fallback: 'Unable to delete campaign.',
      onSuccess: () => setDeleteInactiveCandidate(null),
    })
  }

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
          onInvite={() => {
            setInviteError(null)
            setCopiedToken(null)
            setInviteOpen(true)
          }}
          onDelete={() => {
            setDeleteConfirm(false)
            setError(null)
            setDeleteOpen(true)
          }}
        />

        <ActiveCampaignSection
          campaign={group.activeCampaign}
          onOpen={onOpenActiveCampaign}
          onDeactivate={(campaign) => {
            setError(null)
            setDeactivateCandidate(campaign)
          }}
        />

        <div className="group-home-grid">
          <CampaignListSection
            title="My Drafts"
            headerAction={
              <button
                type="button"
                className="group-icon-button"
                aria-label="Create new draft"
                title="Create new draft"
                onClick={() => setCreateOpen(true)}
              >
                <Plus size={18} />
              </button>
            }
            campaigns={group.drafts}
            status="private draft"
            emptyText="No drafts yet."
            deleteLabel="Delete draft"
            onOpenCampaign={onOpenCampaign}
            onSetActive={(campaign) => {
              setError(null)
              setSetActiveCandidate(campaign)
            }}
            onDelete={(campaign) => {
              setError(null)
              setDeleteDraftCandidate(campaign)
            }}
          />

          <CampaignListSection
            title="Inactive Campaigns"
            campaigns={group.inactiveCampaigns}
            status="inactive"
            emptyText="No inactive campaigns yet."
            deleteLabel="Delete"
            onOpenCampaign={onOpenCampaign}
            onSetActive={(campaign) => {
              setError(null)
              setSetActiveCandidate(campaign)
            }}
            onDelete={(campaign) => {
              setError(null)
              setDeleteInactiveCandidate(campaign)
            }}
          />
        </div>

      </div>

      {createOpen ? (
        <NewDraftDialog
          busy={busy}
          error={error}
          onCancel={() => {
            if (busy) return
            setCreateOpen(false)
            setError(null)
          }}
          onCreate={(name, system) => void handleCreateCampaign(name, system)}
        />
      ) : null}

      {setActiveCandidate ? (
        <SetActiveDialog
          campaign={setActiveCandidate}
          activeCampaign={group.activeCampaign}
          busy={busy}
          error={error}
          onCancel={() => {
            if (busy) return
            setSetActiveCandidate(null)
            setError(null)
          }}
          onConfirm={() => void handleSetActiveCampaign()}
        />
      ) : null}

      {deactivateCandidate ? (
        <ConfirmDialog
          title="Deactivate"
          error={error}
          busy={busy}
          onCancel={() => {
            if (busy) return
            setDeactivateCandidate(null)
            setError(null)
          }}
          confirmLabel="Deactivate"
          busyLabel="Deactivating…"
          confirmClassName="primary"
          confirmDisabled={busy}
          onConfirm={() => void handleDeactivateCampaign()}
        >
          <p>Deactivate <strong>{deactivateCandidate.name}</strong>?</p>
        </ConfirmDialog>
      ) : null}

      {deleteInactiveCandidate ? (
        <ConfirmDialog
          title="Delete campaign"
          error={error}
          busy={busy}
          onCancel={() => {
            if (busy) return
            setDeleteInactiveCandidate(null)
            setError(null)
          }}
          confirmLabel="Delete"
          busyLabel="Deleting…"
          confirmClassName="danger"
          confirmDisabled={busy}
          onConfirm={() => void handleDeleteInactiveCampaign()}
        >
          <p>Delete <strong>{deleteInactiveCandidate.name}</strong> and all its data?</p>
        </ConfirmDialog>
      ) : null}

      {deleteDraftCandidate ? (
        <ConfirmDialog
          title="Delete draft"
          error={error}
          busy={busy}
          onCancel={() => {
            if (busy) return
            setDeleteDraftCandidate(null)
            setError(null)
          }}
          confirmLabel="Delete"
          busyLabel="Deleting…"
          confirmClassName="danger"
          confirmDisabled={busy}
          onConfirm={() => void handleDeleteDraftCampaign()}
        >
          <p>Delete <strong>{deleteDraftCandidate.name}</strong>?</p>
        </ConfirmDialog>
      ) : null}

      {inviteOpen ? (
        <InviteDialog
          groupName={group.name}
          invites={invites}
          now={Date.now()}
          busy={inviteBusy}
          error={inviteError}
          copiedToken={copiedToken}
          onGenerate={() => void handleGenerateInvite()}
          onCopy={(token) => void handleCopyInvite(token)}
          onRevoke={(token) => void handleRevokeInvite(token)}
          onClose={() => {
            setInviteOpen(false)
            setInviteError(null)
            setCopiedToken(null)
          }}
        />
      ) : null}

      {deleteOpen ? (
        <DeleteGroupDialog
          groupName={group.name}
          hasCampaigns={groupHasContents}
          confirming={deleteConfirm}
          busy={busy}
          error={error}
          onCancel={() => {
            if (busy) return
            setDeleteOpen(false)
            setError(null)
          }}
          onAdvance={() => {
            setError(null)
            setDeleteConfirm(true)
          }}
          onBack={() => {
            if (busy) return
            setDeleteConfirm(false)
            setError(null)
          }}
          onConfirm={() => void handleDelete()}
        />
      ) : null}
    </section>
  )
}
