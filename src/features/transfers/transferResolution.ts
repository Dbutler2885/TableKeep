import type { CharacterInventoryItem, PendingTransfer, TransferableInventoryItem } from '../../types/app'

type AcceptedTransferParams = {
  senderInventory: CharacterInventoryItem[]
  receiverInventory: CharacterInventoryItem[]
  transfer: Pick<PendingTransfer, 'itemId' | 'itemSnapshot'>
  packedAllowed: number
}

type AcceptedTransferResult =
  | {
      ok: true
      senderInventory: CharacterInventoryItem[]
      receiverInventory: CharacterInventoryItem[]
    }
  | {
      ok: false
      reason: 'missing_item' | 'kind_mismatch' | 'qty_changed' | 'packed_slots'
    }

const normalizedQty = (item: { qty?: number }) => Math.max(1, item.qty ?? 1)

export function applyAcceptedTransfer({
  senderInventory,
  receiverInventory,
  transfer,
  packedAllowed,
}: AcceptedTransferParams): AcceptedTransferResult {
  const movedSnapshot = transfer.itemSnapshot as TransferableInventoryItem | null
  if (!movedSnapshot) {
    return { ok: false, reason: 'missing_item' }
  }

  const senderItem = senderInventory.find((item) => item.id === transfer.itemId)
  if (!senderItem || senderItem.kind === 'gold') {
    return { ok: false, reason: 'missing_item' }
  }
  if (senderItem.kind !== movedSnapshot.kind) {
    return { ok: false, reason: 'kind_mismatch' }
  }

  const senderQty = normalizedQty(senderItem)
  const movedQty = normalizedQty(movedSnapshot)
  if (senderQty < movedQty) {
    return { ok: false, reason: 'qty_changed' }
  }

  const movedItem = { ...movedSnapshot, equipped: false } as CharacterInventoryItem
  const nextReceiverInventory = [...receiverInventory, movedItem]
  const packedUsed = nextReceiverInventory.filter((item) => !item.equipped).length
  if (packedUsed > packedAllowed) {
    return { ok: false, reason: 'packed_slots' }
  }

  const nextSenderInventory = senderInventory.flatMap((item) => {
    if (item.id !== transfer.itemId) return [item]
    if (senderQty <= movedQty) return []
    return [{ ...item, qty: senderQty - movedQty } as CharacterInventoryItem]
  })

  return {
    ok: true,
    senderInventory: nextSenderInventory,
    receiverInventory: nextReceiverInventory,
  }
}
