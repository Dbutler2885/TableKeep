import { useState } from 'react'
import { ChevronLeft, Copy, LogOut, Plus, Trash2, UserPlus } from 'lucide-react'
import type { User } from 'firebase/auth'
import type { Campaign, GroupRecord, InviteCode } from '../../types/app'
import { inviteState, useGroupInvites } from '../invites/useInvites'
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
  const [campaignName, setCampaignName] = useState('')
  const [campaignSystem, setCampaignSystem] = useState('ose')
  const [error, setError] = useState<string | null>(null)
  const canDelete = group.memberRole === 'admin'
  const canInvite = group.memberRole === 'admin'

  const inviteUrl = (token: string) => `${window.location.origin}/join/${token}`

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
        await navigator.clipboard?.writeText(inviteUrl(token))
        setCopiedToken(token)
      } catch {
        // Clipboard may be unavailable; user can copy from the list manually.
      }
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Could not create invite.')
    } finally {
      setInviteBusy(false)
    }
  }

  const handleCopyInvite = async (token: string) => {
    try {
      await navigator.clipboard?.writeText(inviteUrl(token))
      setCopiedToken(token)
    } catch {
      setInviteError('Clipboard unavailable. Copy the link manually.')
    }
  }

  const handleRevokeInvite = async (token: string) => {
    setInviteBusy(true)
    setInviteError(null)
    try {
      await revokeInvite(token)
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Could not revoke invite.')
    } finally {
      setInviteBusy(false)
    }
  }

  const handleDelete = async () => {
    setBusy(true)
    setError(null)
    try {
      await onDeleteGroup(group.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete group.')
      setBusy(false)
    }
  }

  const handleCreateCampaign = async () => {
    setBusy(true)
    setError(null)
    try {
      await onCreateCampaign(group.id, campaignName, campaignSystem)
      setBusy(false)
      setCreateOpen(false)
      setCampaignName('')
      setCampaignSystem('ose')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create campaign.')
      setBusy(false)
    }
  }

  const handleSetActiveCampaign = async () => {
    if (!setActiveCandidate) return
    setBusy(true)
    setError(null)
    try {
      await onSetActiveCampaign(group.id, setActiveCandidate.id)
      setBusy(false)
      setSetActiveCandidate(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to set active campaign.')
      setBusy(false)
    }
  }

  const handleDeleteDraftCampaign = async () => {
    if (!deleteDraftCandidate) return
    setBusy(true)
    setError(null)
    try {
      await onDeleteDraftCampaign(group.id, deleteDraftCandidate.id)
      setBusy(false)
      setDeleteDraftCandidate(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete draft.')
      setBusy(false)
    }
  }

  const handleDeactivateCampaign = async () => {
    if (!deactivateCandidate) return
    setBusy(true)
    setError(null)
    try {
      await onDeactivateCampaign(group.id, deactivateCandidate.id)
      setBusy(false)
      setDeactivateCandidate(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to deactivate campaign.')
      setBusy(false)
    }
  }

  const handleDeleteInactiveCampaign = async () => {
    if (!deleteInactiveCandidate) return
    setBusy(true)
    setError(null)
    try {
      await onDeleteInactiveCampaign(group.id, deleteInactiveCandidate.id)
      setBusy(false)
      setDeleteInactiveCandidate(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete campaign.')
      setBusy(false)
    }
  }

  return (
    <section className="group-screen">
      <div className="group-panel group-panel-wide">
        <div className="group-home-header">
          <button type="button" className="group-icon-button" onClick={onBackToGroups} aria-label="Back to groups" title="Back to groups">
            <ChevronLeft size={16} />
          </button>
          <div className="group-home-title">
            <p className="group-eyebrow">Group</p>
            <h1>{group.name}</h1>
            <p className="group-subtitle">
              Signed in as <strong>{username}</strong>
              {' · '}
              <button
                type="button"
                className="group-link-button"
                onClick={onSignOut}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}
              >
                <LogOut size={13} /> Sign out
              </button>
            </p>
          </div>
          <div className="group-home-header-actions">
            {canInvite ? (
              <button
                type="button"
                className="group-icon-button"
                onClick={() => {
                  setInviteError(null)
                  setCopiedToken(null)
                  setInviteOpen(true)
                }}
                aria-label="Invite to group"
                title="Invite to group"
              >
                <UserPlus size={16} />
              </button>
            ) : null}
            {canDelete ? (
              <button type="button" className="group-icon-button" onClick={() => setDeleteOpen(true)} aria-label="Delete group" title="Delete group">
                <Trash2 size={16} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="group-home-section is-active">
          <h2>Active Campaign</h2>
          {group.activeCampaign ? (
            <div
              className="group-home-card group-home-card-interactive"
              role="button"
              tabIndex={0}
              onClick={onOpenActiveCampaign}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onOpenActiveCampaign()
                }
              }}
            >
              <strong>{group.activeCampaign.name}</strong>
              <p>{(group.activeCampaign.system ?? '').toUpperCase()} · active</p>
              <div className="group-actions group-card-actions">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setError(null)
                    setDeactivateCandidate(group.activeCampaign)
                  }}
                >
                  Deactivate
                </button>
              </div>
            </div>
          ) : (
            <div className="group-home-card group-home-card-muted">
              <p>No active campaign.</p>
            </div>
          )}
        </div>

        <div className="group-home-grid">
          <div className="group-home-section">
            <div className="group-section-header">
              <h2>My Drafts</h2>
              <button
                type="button"
                className="group-icon-button"
                aria-label="Create new draft"
                title="Create new draft"
                onClick={() => setCreateOpen(true)}
              >
                <Plus size={18} />
              </button>
            </div>
            {group.drafts.length > 0 ? (
              <div className="group-card-list">
                {group.drafts.map((campaign) => (
                  <div
                    key={campaign.id}
                    className="group-home-card group-home-card-interactive"
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenCampaign(campaign.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onOpenCampaign(campaign.id)
                      }
                    }}
                  >
                    <strong>{campaign.name}</strong>
                    <p>{(campaign.system ?? '').toUpperCase()} · private draft</p>
                    <div className="group-actions group-card-actions">
                      <button type="button" onClick={(event) => {
                        event.stopPropagation()
                        setError(null)
                        setSetActiveCandidate(campaign)
                      }}
                      >
                        Set active
                      </button>
                      <button
                        type="button"
                        className="group-icon-button"
                        aria-label={`Delete draft ${campaign.name}`}
                        title={`Delete draft ${campaign.name}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          setError(null)
                          setDeleteDraftCandidate(campaign)
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="group-home-card group-home-card-muted">
                <p>No drafts yet.</p>
              </div>
            )}
          </div>

          <div className="group-home-section">
            <div className="group-section-header">
              <h2>Inactive Campaigns</h2>
            </div>
            {group.inactiveCampaigns.length > 0 ? (
              <div className="group-card-list">
                {group.inactiveCampaigns.map((campaign) => (
                  <div
                    key={campaign.id}
                    className="group-home-card group-home-card-interactive"
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenCampaign(campaign.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onOpenCampaign(campaign.id)
                      }
                    }}
                  >
                    <strong>{campaign.name}</strong>
                    <p>{(campaign.system ?? '').toUpperCase()} · inactive</p>
                    <div className="group-actions group-card-actions">
                      <button type="button" onClick={(event) => {
                        event.stopPropagation()
                        setError(null)
                        setSetActiveCandidate(campaign)
                      }}
                      >
                        Set active
                      </button>
                      <button
                        type="button"
                        className="group-icon-button"
                        aria-label={`Delete ${campaign.name}`}
                        title={`Delete ${campaign.name}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          setError(null)
                          setDeleteInactiveCandidate(campaign)
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="group-home-card group-home-card-muted">
                <p>No inactive campaigns yet.</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {createOpen ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-modal group-modal">
            <h3>New draft campaign</h3>
            <label>
              Name
              <input
                type="text"
                value={campaignName}
                onChange={(event) => setCampaignName(event.target.value)}
                disabled={busy}
                autoFocus
              />
            </label>
            <label>
              System
              <select value={campaignSystem} onChange={(event) => setCampaignSystem(event.target.value)} disabled={busy}>
                <option value="ose">OSE</option>
                <option value="vtm">VTM</option>
              </select>
            </label>
            {error ? <p className="error">{error}</p> : null}
            <div className="group-modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (busy) return
                  setCreateOpen(false)
                  setCampaignName('')
                  setCampaignSystem('ose')
                  setError(null)
                }}
              >
                Cancel
              </button>
              <button type="button" className="primary" onClick={() => void handleCreateCampaign()} disabled={busy || !campaignName.trim()}>
                {busy ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {setActiveCandidate ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-modal group-modal">
            <h3>Set active</h3>
            <p>
              Make <strong>{setActiveCandidate.name}</strong> the active campaign?
            </p>
            {group.activeCampaign ? (
              <p><strong>{group.activeCampaign.name}</strong> will be deactivated.</p>
            ) : null}
            {error ? <p className="error">{error}</p> : null}
            <div className="group-modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (busy) return
                  setSetActiveCandidate(null)
                  setError(null)
                }}
              >
                Cancel
              </button>
              <button type="button" className="primary" onClick={() => void handleSetActiveCampaign()} disabled={busy}>
                {busy ? 'Setting…' : 'Set active'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deactivateCandidate ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-modal group-modal">
            <h3>Deactivate</h3>
            <p>Deactivate <strong>{deactivateCandidate.name}</strong>?</p>
            {error ? <p className="error">{error}</p> : null}
            <div className="group-modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (busy) return
                  setDeactivateCandidate(null)
                  setError(null)
                }}
              >
                Cancel
              </button>
              <button type="button" className="primary" onClick={() => void handleDeactivateCampaign()} disabled={busy}>
                {busy ? 'Deactivating…' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteInactiveCandidate ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-modal group-modal">
            <h3>Delete campaign</h3>
            <p>Delete <strong>{deleteInactiveCandidate.name}</strong> and all its data?</p>
            {error ? <p className="error">{error}</p> : null}
            <div className="group-modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (busy) return
                  setDeleteInactiveCandidate(null)
                  setError(null)
                }}
              >
                Cancel
              </button>
              <button type="button" className="danger" onClick={() => void handleDeleteInactiveCampaign()} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteDraftCandidate ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-modal group-modal">
            <h3>Delete draft</h3>
            <p>Delete <strong>{deleteDraftCandidate.name}</strong>?</p>
            {error ? <p className="error">{error}</p> : null}
            <div className="group-modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (busy) return
                  setDeleteDraftCandidate(null)
                  setError(null)
                }}
              >
                Cancel
              </button>
              <button type="button" className="danger" onClick={() => void handleDeleteDraftCampaign()} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {inviteOpen ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-modal group-modal invite-modal">
            <h3>Invite to {group.name}</h3>
            <p>Generate a single-use link. Expires in 7 days. Share it however you like.</p>

            <div className="invite-modal-generate">
              <button
                type="button"
                className="primary"
                onClick={() => void handleGenerateInvite()}
                disabled={inviteBusy}
              >
                {inviteBusy ? 'Working…' : 'Generate invite link'}
              </button>
            </div>

            {inviteError ? <p className="error">{inviteError}</p> : null}

            <div className="invite-list">
              {invites.length === 0 ? (
                <p className="invite-list-empty">No invites yet.</p>
              ) : (
                invites.map((invite) => (
                  <InviteRow
                    key={invite.token}
                    invite={invite}
                    inviteUrl={inviteUrl(invite.token)}
                    copied={copiedToken === invite.token}
                    onCopy={() => void handleCopyInvite(invite.token)}
                    onRevoke={() => void handleRevokeInvite(invite.token)}
                  />
                ))
              )}
            </div>

            <div className="group-modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setInviteOpen(false)
                  setInviteError(null)
                  setCopiedToken(null)
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteOpen ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-modal group-modal">
            <h3>Delete group</h3>
            <p>Delete <strong>{group.name}</strong>?</p>
            {group.activeCampaign || group.drafts.length > 0 || group.inactiveCampaigns.length > 0 ? (
              <p>Remove all campaigns first.</p>
            ) : null}
            {error ? <p className="error">{error}</p> : null}
            <div className="group-modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (busy) return
                  setDeleteOpen(false)
                  setError(null)
                }}
              >
                Cancel
              </button>
              <button type="button" className="danger" onClick={() => void handleDelete()} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

type InviteRowProps = {
  invite: InviteCode
  inviteUrl: string
  copied: boolean
  onCopy: () => void
  onRevoke: () => void
}

function InviteRow({ invite, inviteUrl, copied, onCopy, onRevoke }: InviteRowProps) {
  const state = inviteState(invite)
  const stateLabel: Record<typeof state, string> = {
    active: copied ? 'Copied' : 'Active',
    redeemed: 'Redeemed',
    revoked: 'Revoked',
    expired: 'Expired',
  }
  const expiresIn = (() => {
    if (!invite.expiresAt) return ''
    const ms = invite.expiresAt - Date.now()
    if (ms <= 0) return ''
    const days = Math.floor(ms / (24 * 60 * 60 * 1000))
    if (days >= 1) return `${days}d left`
    const hours = Math.max(1, Math.floor(ms / (60 * 60 * 1000)))
    return `${hours}h left`
  })()

  return (
    <div className={`invite-row invite-row-${state}`}>
      <div className="invite-row-main">
        <code className="invite-token">{invite.token.slice(0, 12)}…</code>
        <span className={`invite-state invite-state-${state}`}>{stateLabel[state]}</span>
        {state === 'active' && expiresIn ? <span className="invite-expires">{expiresIn}</span> : null}
      </div>
      <div className="invite-row-actions">
        {state === 'active' ? (
          <>
            <button type="button" className="invite-row-copy" onClick={onCopy} aria-label="Copy invite link" title="Copy invite link">
              <Copy size={14} />
              <span>{copied ? 'Copied' : 'Copy link'}</span>
            </button>
            <button type="button" className="invite-row-revoke" onClick={onRevoke} aria-label="Revoke invite" title="Revoke invite">
              Revoke
            </button>
          </>
        ) : null}
      </div>
      <input className="invite-row-url" readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} />
    </div>
  )
}
