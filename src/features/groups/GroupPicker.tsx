import { useState } from 'react'
import { LogOut, Plus } from 'lucide-react'
import type { GroupRecord } from '../../types/app'
import { DiscordConnection } from '../auth/DiscordConnection'
import { DiscordReturnNotice } from '../auth/DiscordReturnNotice'
import { BrandWordmark } from '../common/BrandWordmark'
import './GroupScreens.css'

type GroupPickerProps = {
  username: string
  groups: GroupRecord[]
  onCreateGroup: (name: string) => Promise<void>
  onSelectGroup: (groupId: string) => void
  onSignOut: () => void
  /** The signed-in account, or undefined for a demo visitor, who has no Discord connection to manage. */
  discordUserId?: string
  /** The groups have not arrived yet, so an empty list is not "no groups". */
  loading?: boolean
}

type ListingProps = Pick<GroupPickerProps, 'groups' | 'onSelectGroup'> & { loading: boolean; onCreate: () => void }

function GroupCard({ group, onSelectGroup }: { group: GroupRecord; onSelectGroup: (groupId: string) => void }) {
  return (
    <button type="button" className="group-card" onClick={() => onSelectGroup(group.id)}>
      <div className="group-card-header">
        <strong>{group.name}</strong>
        <span className="group-badge">{group.memberRole}</span>
      </div>
      <p className="group-card-meta">
        {group.activeCampaign ? `Active campaign: ${group.activeCampaign.name}` : 'No active campaign'}
      </p>
    </button>
  )
}

/** The groups, or while they load that they are opening, or once they have arrived that there are none. */
function GroupListing({ groups, loading, onSelectGroup, onCreate }: ListingProps) {
  if (groups.length === 0 && loading) {
    return (
      <div className="group-empty-state" role="status">
        <h2>Opening your groups&hellip;</h2>
      </div>
    )
  }
  if (groups.length === 0) {
    return (
      <div className="group-empty-state">
        <h2>No groups yet</h2>
        <p>You don&rsquo;t belong to any groups yet. Create one, or ask a friend to send you an invite link.</p>
        <button type="button" className="group-empty-action" onClick={onCreate}>
          + Create a group
        </button>
      </div>
    )
  }
  return (
    <>
      <div className="group-section-header">
        <h2>Your Groups</h2>
        <button type="button" className="group-icon-button" aria-label="Create a group" title="Create a group" onClick={onCreate}>
          <Plus size={18} />
        </button>
      </div>
      <div className="group-card-list">
        {groups.map((group) => <GroupCard key={group.id} group={group} onSelectGroup={onSelectGroup} />)}
      </div>
    </>
  )
}

/** Creating a group: the name, and Create or Cancel; a failure stays in the dialog. */
function CreateGroupDialog({ onCreateGroup, onClose }: { onCreateGroup: (name: string) => Promise<void>; onClose: () => void }) {
  const [groupName, setGroupName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Create is disabled until the name has more than spaces in it.
  const handleCreate = async () => {
    setBusy(true)
    setError(null)
    try {
      await onCreateGroup(groupName)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create group.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="new-group-title">
      <div className="confirm-modal group-modal">
        <h3 id="new-group-title">New group</h3>
        <label>
          Name
          <input type="text" value={groupName} onChange={(event) => setGroupName(event.target.value)} disabled={busy} autoFocus />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <div className="group-modal-actions">
          <button type="button" className="secondary" onClick={() => { if (!busy) onClose() }}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={handleCreate} disabled={busy || !groupName.trim()}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SignedInLine({ username, onSignOut }: Pick<GroupPickerProps, 'username' | 'onSignOut'>) {
  return (
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
  )
}

export function GroupPicker({ username, groups, onCreateGroup, onSelectGroup, onSignOut, discordUserId, loading = false }: GroupPickerProps) {
  const [createOpen, setCreateOpen] = useState(false)
  return (
    <section className="group-screen">
      <div className="group-panel">
        <p className="group-eyebrow">Group Picker</p>
        <h1><BrandWordmark className="brand-wordmark-group-picker" logoPosition="after" /></h1>
        <SignedInLine username={username} onSignOut={onSignOut} />
        {discordUserId ? (
          <>
            <DiscordConnection userId={discordUserId} variant="subtitle" />
            <DiscordReturnNotice variant="subtitle" />
          </>
        ) : null}
        <GroupListing groups={groups} loading={loading} onSelectGroup={onSelectGroup} onCreate={() => setCreateOpen(true)} />
        {createOpen ? <CreateGroupDialog onCreateGroup={onCreateGroup} onClose={() => setCreateOpen(false)} /> : null}
      </div>
    </section>
  )
}
