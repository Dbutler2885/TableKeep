import { ChevronLeft, LogOut, Trash2, UserPlus } from 'lucide-react'
import type { User } from 'firebase/auth'
import type { GroupRecord } from '../../types/app'
import { DiscordConnection } from '../auth/DiscordConnection'
import { DiscordReturnNotice } from '../auth/DiscordReturnNotice'
import { DiscordServerLink } from './DiscordServerLink'

type GroupHomeHeaderProps = {
  user: User
  username: string
  group: GroupRecord
  canInvite: boolean
  canDelete: boolean
  onBackToGroups: () => void
  onSignOut: () => void
  onInvite: () => void
  onDelete: () => void
}

export function GroupHomeHeader({
  user,
  username,
  group,
  canInvite,
  canDelete,
  onBackToGroups,
  onSignOut,
  onInvite,
  onDelete,
}: GroupHomeHeaderProps) {
  return (
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
        {user.isAnonymous ? null : (
          <>
            <DiscordConnection userId={user.uid} variant="subtitle" />
            <DiscordServerLink groupId={group.id} canManage={group.memberRole === 'admin'} />
            <DiscordReturnNotice variant="subtitle" />
          </>
        )}
      </div>
      <div className="group-home-header-actions">
        {canInvite ? (
          <button type="button" className="group-icon-button" onClick={onInvite} aria-label="Invite to group" title="Invite to group">
            <UserPlus size={16} />
          </button>
        ) : null}
        {canDelete ? (
          <button type="button" className="group-icon-button" onClick={onDelete} aria-label="Delete group" title="Delete group">
            <Trash2 size={16} />
          </button>
        ) : null}
      </div>
    </div>
  )
}
