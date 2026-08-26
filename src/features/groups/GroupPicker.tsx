import { useState } from 'react'
import { LogOut, Plus } from 'lucide-react'
import type { GroupRecord } from '../../types/app'
import { BrandWordmark } from '../common/BrandWordmark'
import './GroupScreens.css'

type GroupPickerProps = {
  username: string
  groups: GroupRecord[]
  onCreateGroup: (name: string) => Promise<void>
  onSelectGroup: (groupId: string) => void
  onSignOut: () => void
}

export function GroupPicker({ username, groups, onCreateGroup, onSelectGroup, onSignOut }: GroupPickerProps) {
  const [createOpen, setCreateOpen] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!groupName.trim()) {
      setError('Group name is required.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await onCreateGroup(groupName)
      setGroupName('')
      setCreateOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create group.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="group-screen">
      <div className="group-panel">
        <p className="group-eyebrow">Group Picker</p>
        <h1><BrandWordmark className="brand-wordmark-group-picker" logoPosition="after" /></h1>
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

        {groups.length === 0 ? (
          <div className="group-empty-state">
            <h2>No groups yet</h2>
            <p>You don&rsquo;t belong to any groups yet. Create one, or ask a friend to send you an invite link.</p>
            <button
              type="button"
              className="group-empty-action"
              onClick={() => setCreateOpen(true)}
            >
              + Create a group
            </button>
          </div>
        ) : (
          <>
            <div className="group-section-header">
              <h2>Your Groups</h2>
              <button
                type="button"
                className="group-icon-button"
                aria-label="Create a group"
                title="Create a group"
                onClick={() => setCreateOpen(true)}
              >
                <Plus size={18} />
              </button>
            </div>
            <div className="group-card-list">
              {groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className="group-card"
                  onClick={() => onSelectGroup(group.id)}
                >
                  <div className="group-card-header">
                    <strong>{group.name}</strong>
                    <span className="group-badge">{group.memberRole}</span>
                  </div>
                  <p className="group-card-meta">
                    {group.activeCampaign
                      ? `Active campaign: ${group.activeCampaign.name}`
                      : 'No active campaign'}
                  </p>
                </button>
              ))}
            </div>
          </>
        )}

        {createOpen ? (
          <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="new-group-title">
            <div className="confirm-modal group-modal">
              <h3 id="new-group-title">New group</h3>
              <label>
                Name
                <input
                  type="text"
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  disabled={busy}
                  autoFocus
                />
              </label>
              {error ? <p className="error">{error}</p> : null}
              <div className="group-modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    if (busy) return
                    setCreateOpen(false)
                    setGroupName('')
                    setError(null)
                  }}
                >
                  Cancel
                </button>
                <button type="button" className="primary" onClick={handleCreate} disabled={busy || !groupName.trim()}>
                  {busy ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
