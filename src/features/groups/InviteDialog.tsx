import { Copy } from 'lucide-react'
import type { InviteCode } from '../../types/app'
import { inviteState } from '../invites/useInvites'
import { DialogShell } from './GroupDialog'
import { inviteExpiresIn, inviteStateLabel, inviteUrl } from './inviteDisplay'

type InviteDialogProps = {
  groupName: string
  invites: InviteCode[]
  /** The time the expiry text counts down from, read once per render of the group home. */
  now: number
  busy: boolean
  error: string | null
  copiedToken: string | null
  onGenerate: () => void
  onCopy: (token: string) => void
  onRevoke: (token: string) => void
  onClose: () => void
}

export function InviteDialog({
  groupName,
  invites,
  now,
  busy,
  error,
  copiedToken,
  onGenerate,
  onCopy,
  onRevoke,
  onClose,
}: InviteDialogProps) {
  return (
    <DialogShell className="confirm-modal group-modal invite-modal">
      <h3>Invite to {groupName}</h3>
      <p>Generate a single-use link. Expires in 7 days. Share it however you like.</p>

      <div className="invite-modal-generate">
        <button type="button" className="primary" onClick={onGenerate} disabled={busy}>
          {busy ? 'Working…' : 'Generate invite link'}
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="invite-list">
        {invites.length === 0 ? (
          <p className="invite-list-empty">No invites yet.</p>
        ) : (
          invites.map((invite) => (
            <InviteRow
              key={invite.token}
              invite={invite}
              now={now}
              inviteUrl={inviteUrl(invite.token)}
              copied={copiedToken === invite.token}
              onCopy={() => onCopy(invite.token)}
              onRevoke={() => onRevoke(invite.token)}
            />
          ))
        )}
      </div>

      <div className="group-modal-actions">
        <button type="button" className="secondary" onClick={onClose}>
          Done
        </button>
      </div>
    </DialogShell>
  )
}

type InviteRowProps = {
  invite: InviteCode
  now: number
  inviteUrl: string
  copied: boolean
  onCopy: () => void
  onRevoke: () => void
}

function InviteRow({ invite, now, inviteUrl, copied, onCopy, onRevoke }: InviteRowProps) {
  const state = inviteState(invite)
  const expiresIn = inviteExpiresIn(invite.expiresAt, now)

  return (
    <div className={`invite-row invite-row-${state}`}>
      <div className="invite-row-main">
        <code className="invite-token">{invite.token.slice(0, 12)}…</code>
        <span className={`invite-state invite-state-${state}`}>{inviteStateLabel(state, copied)}</span>
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
