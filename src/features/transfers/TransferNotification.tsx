import type { CharacterRecord, PendingTransfer, Role } from '../../types/app'
import type { CarryingRule } from '../ruleSets/carrying'
import { usePendingTransfers } from './usePendingTransfers'
import { receiverPackedSlots } from './receiverPackedSlots'
import { useTransferResponse } from './useTransferResponse'

type TransferNotificationProps = {
  campaignId: string
  groupId: string
  currentUserId: string
  role: Role | null
  characters: CharacterRecord[]
  // The rule set's packed-slot carrying rule, or null for one without packed
  // slots, whose modal prints no packed-slots line.
  carrying: CarryingRule | null
}

export function TransferNotification({
  campaignId,
  groupId,
  currentUserId,
  role,
  characters,
  carrying,
}: TransferNotificationProps) {
  const { incomingTransfers, acceptTransfer, declineTransfer } = usePendingTransfers(campaignId, groupId, role, currentUserId)
  const response = useTransferResponse(acceptTransfer, declineTransfer)

  const activeTransfer = incomingTransfers[0]
  if (!activeTransfer) return null

  return (
    <TransferOfferDialog
      transfer={activeTransfer}
      characters={characters}
      carrying={carrying}
      response={response}
      morePending={incomingTransfers.length - 1}
    />
  )
}

type TransferOfferDialogProps = {
  transfer: PendingTransfer
  characters: CharacterRecord[]
  carrying: CarryingRule | null
  response: ReturnType<typeof useTransferResponse>
  morePending: number
}

// The receiver's packed slots, as the rule set counts them.
function PackedSlotsLine({ carrying, characters, toCharacterId }: { carrying: CarryingRule; characters: CharacterRecord[]; toCharacterId: string }) {
  const packedSlots = receiverPackedSlots(carrying, characters, toCharacterId)
  return (
    <p style={{ fontSize: '0.92em' }}>
      Packed slots: {packedSlots.used}/{packedSlots.available}
    </p>
  )
}

function TransferOfferDialog({ transfer, characters, carrying, response, morePending }: TransferOfferDialogProps) {
  const busy = response.busyTransferId === transfer.id

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true">
      <div className="confirm-modal">
        <h3>Incoming Transfer</h3>
        <p>
          <strong>{transfer.fromCharacterName}</strong> wants to give{' '}
          <strong>{transfer.itemName}</strong> to <strong>{transfer.toCharacterName}</strong>.
        </p>
        <p style={{ fontSize: '0.92em' }}>Type: {transfer.itemKind}</p>
        {carrying ? <PackedSlotsLine carrying={carrying} characters={characters} toCharacterId={transfer.toCharacterId} /> : null}
        {response.error ? <p className="error">{response.error}</p> : null}
        <div className="confirm-actions">
          <button
            type="button"
            className="confirm-danger"
            onClick={() => void response.decline(transfer.id)}
            disabled={busy}
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => void response.accept(transfer.id)}
            disabled={busy}
          >
            Accept
          </button>
        </div>
        {morePending > 0 ? (
          <p style={{ marginTop: 8, fontSize: '0.85em', opacity: 0.7 }}>
            +{morePending} more pending
          </p>
        ) : null}
      </div>
    </div>
  )
}
