import { useState } from 'react'
import type { User } from 'firebase/auth'
import type { GroupRecord } from '../../types/app'
import { useGroupInvites } from '../invites/useInvites'
import { errorMessage, runBusyAction } from './busyAction'
import { copyToClipboard, inviteUrl } from './inviteDisplay'

/** The invite dialog's own busy flag, error and copied mark, and the group's invites while it is open. */
export function useInviteDialog(user: User, group: GroupRecord, username: string) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const { invites, createInvite, revokeInvite } = useGroupInvites(user, open ? group.id : null)

  const copy = async (token: string) => {
    await copyToClipboard(inviteUrl(token))
    setCopiedToken(token)
  }

  return {
    open,
    busy,
    error,
    copiedToken,
    invites,
    show: () => {
      setError(null)
      setCopiedToken(null)
      setOpen(true)
    },
    close: () => {
      setOpen(false)
      setError(null)
      setCopiedToken(null)
    },
    generate: async () => {
      setBusy(true)
      setError(null)
      try {
        const token = await createInvite({ groupId: group.id, groupName: group.name, createdByName: username })
        try {
          await copy(token)
        } catch {
          // Clipboard may be unavailable; user can copy from the list manually.
        }
      } catch (err) {
        setError(errorMessage(err, 'Could not create invite.'))
      } finally {
        setBusy(false)
      }
    },
    copyLink: async (token: string) => {
      try {
        await copy(token)
      } catch {
        setError('Clipboard unavailable. Copy the link manually.')
      }
    },
    revoke: (token: string) =>
      runBusyAction({ setBusy, setError }, () => revokeInvite(token), { fallback: 'Could not revoke invite.' }),
  }
}
