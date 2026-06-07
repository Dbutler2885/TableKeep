import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { groupHomePath, groupPickerPath } from '../navigation/tabs'
import type { InviteCode } from '../../types/app'
import { inviteState, lookupInvite, redeemInvite } from './useInvites'

type AcceptInviteProps = {
  user: User
}

type Status = 'loading' | 'ready' | 'redeeming' | 'error'

export function AcceptInvite({ user }: AcceptInviteProps) {
  const navigate = useNavigate()
  const { token } = useParams<{ token: string }>()
  const [invite, setInvite] = useState<InviteCode | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!token) {
      setStatus('error')
      setError('Missing invite token.')
      return
    }
    void (async () => {
      try {
        const result = await lookupInvite(token)
        if (cancelled) return
        if (!result) {
          setStatus('error')
          setError("This invite link doesn't work.")
          return
        }
        setInvite(result)
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Could not load invite.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const handleAccept = async () => {
    if (!invite || !token) return
    setStatus('redeeming')
    setError(null)
    try {
      const { groupId } = await redeemInvite(user, token)
      void navigate(groupHomePath(groupId), { replace: true })
    } catch (err) {
      setStatus('ready')
      setError(err instanceof Error ? err.message : 'Could not accept invite.')
    }
  }

  const handleDecline = () => {
    void navigate(groupPickerPath, { replace: true })
  }

  return (
    <section className="group-screen">
      <div className="group-panel invite-panel">
        <p className="group-eyebrow">Invitation</p>

        {status === 'loading' ? (
          <p className="invite-status">Loading invite…</p>
        ) : null}

        {status === 'error' ? (
          <>
            <h1>Invite unavailable</h1>
            <p className="group-subtitle">{error ?? 'This invite link doesn\'t work.'}</p>
            <div className="invite-actions">
              <button type="button" className="primary" onClick={handleDecline}>
                Back to your groups
              </button>
            </div>
          </>
        ) : null}

        {(status === 'ready' || status === 'redeeming') && invite ? (
          <InviteDetails
            invite={invite}
            error={error}
            busy={status === 'redeeming'}
            onAccept={handleAccept}
            onDecline={handleDecline}
          />
        ) : null}
      </div>
    </section>
  )
}

type InviteDetailsProps = {
  invite: InviteCode
  error: string | null
  busy: boolean
  onAccept: () => void
  onDecline: () => void
}

function InviteDetails({ invite, error, busy, onAccept, onDecline }: InviteDetailsProps) {
  const state = inviteState(invite)

  if (state !== 'active') {
    const messages: Record<typeof state, string> = {
      redeemed: 'This invite has already been used.',
      revoked: 'This invite was revoked.',
      expired: 'This invite has expired.',
    }
    return (
      <>
        <h1>{invite.groupName || 'Group'}</h1>
        <p className="group-subtitle">{messages[state]}</p>
        <div className="invite-actions">
          <button type="button" className="primary" onClick={onDecline}>
            Back to your groups
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <h1>Join {invite.groupName}?</h1>
      <p className="group-subtitle">
        Invited by <strong>{invite.createdByName || 'a member'}</strong>
      </p>
      <p className="invite-meta">
        You'll join as a player. The group's GM can adjust your role later.
      </p>
      {error ? <p className="invite-error">{error}</p> : null}
      <div className="invite-actions">
        <button type="button" className="secondary" onClick={onDecline} disabled={busy}>
          Decline
        </button>
        <button type="button" className="primary" onClick={onAccept} disabled={busy}>
          {busy ? 'Joining…' : 'Accept invite'}
        </button>
      </div>
    </>
  )
}
