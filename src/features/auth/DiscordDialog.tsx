import { useEffect } from 'react'
import { DialogShell } from '../groups/GroupDialog'
import { DiscordConnection } from './DiscordConnection'
import { DiscordReturnNotice } from './DiscordReturnNotice'

/**
 * A person's Discord connection, opened from the Discord button in a
 * campaign's sidebar: who they are connected as, the way to connect or
 * disconnect, and what happened on Discord when they have just come back.
 */
export function DiscordDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <DialogShell className="confirm-modal group-modal discord-dialog">
      <h3>Discord</h3>
      <div className="discord-dialog-body">
        <DiscordConnection userId={userId} variant="panel" />
        <DiscordReturnNotice variant="panel" />
      </div>
      <div className="group-modal-actions">
        <button type="button" className="secondary" onClick={onClose} autoFocus>
          Close
        </button>
      </div>
    </DialogShell>
  )
}
