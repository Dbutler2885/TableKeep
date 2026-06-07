import { useMemo, useState } from 'react'
import type { CharacterRecord, Role } from '../../types/app'
import { usePendingTransfers } from './usePendingTransfers'
import { computeAvailablePackedSlots } from '../character/inventoryOverflow'

type TransferNotificationProps = {
  campaignId: string
  groupId: string
  currentUserId: string
  role: Role | null
  characters: CharacterRecord[]
}

export function TransferNotification({
  campaignId,
  groupId,
  currentUserId,
  role,
  characters,
}: TransferNotificationProps) {
  const { incomingTransfers, acceptTransfer, declineTransfer } = usePendingTransfers(campaignId, groupId, role, currentUserId)
  const [busyTransferId, setBusyTransferId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const activeTransfer = incomingTransfers[0] ?? null
  const receiver = useMemo(
    () => characters.find((character) => character.id === activeTransfer?.toCharacterId) ?? null,
    [activeTransfer?.toCharacterId, characters],
  )

  if (!activeTransfer) return null

  const details = receiver?.details ?? null
  const inventory = Array.isArray(details?.inventory) ? details.inventory : []
  const packedUsed = inventory.filter((item) => !item.equipped).length
  const strScore = Number.parseInt(details?.abilityScores?.STR ?? '', 10)
  const packedAvailable = computeAvailablePackedSlots(strScore)

  const handleAccept = async () => {
    setBusyTransferId(activeTransfer.id)
    setError(null)
    try {
      await acceptTransfer(activeTransfer.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept transfer.')
    } finally {
      setBusyTransferId('')
    }
  }

  const handleDecline = async () => {
    setBusyTransferId(activeTransfer.id)
    setError(null)
    try {
      await declineTransfer(activeTransfer.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decline transfer.')
    } finally {
      setBusyTransferId('')
    }
  }

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true">
      <div className="confirm-modal">
        <h3>Incoming Transfer</h3>
        <p>
          <strong>{activeTransfer.fromCharacterName}</strong> wants to give{' '}
          <strong>{activeTransfer.itemName}</strong> to <strong>{activeTransfer.toCharacterName}</strong>.
        </p>
        <p style={{ fontSize: '0.92em' }}>Type: {activeTransfer.itemKind}</p>
        <p style={{ fontSize: '0.92em' }}>
          Packed slots: {packedUsed}/{packedAvailable}
        </p>
        {error ? <p className="error">{error}</p> : null}
        <div className="confirm-actions">
          <button
            type="button"
            className="confirm-danger"
            onClick={() => void handleDecline()}
            disabled={busyTransferId === activeTransfer.id}
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => void handleAccept()}
            disabled={busyTransferId === activeTransfer.id}
          >
            Accept
          </button>
        </div>
        {incomingTransfers.length > 1 ? (
          <p style={{ marginTop: 8, fontSize: '0.85em', opacity: 0.7 }}>
            +{incomingTransfers.length - 1} more pending
          </p>
        ) : null}
      </div>
    </div>
  )
}
