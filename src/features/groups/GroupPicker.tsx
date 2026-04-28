import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { GroupRecord } from '../../types/app'

type GroupPickerProps = {
  username: string
  groups: GroupRecord[]
  onCreateGroup: (name: string) => Promise<void>
  onSelectGroup: (groupId: string) => void
}

export function GroupPicker({ username, groups, onCreateGroup, onSelectGroup }: GroupPickerProps) {
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
        <h1>Home Boys House</h1>
        <p className="group-subtitle">Signed in as <strong>{username}</strong></p>

        {groups.length === 0 ? (
          <div className="group-empty-state">
            <h2>No groups yet</h2>
            <p>Your account is ready. Create a group or wait for an invite to arrive here.</p>
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
          <div className="confirm-overlay" role="dialog" aria-modal="true">
            <div className="confirm-modal group-modal">
              <h3>New group</h3>
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
