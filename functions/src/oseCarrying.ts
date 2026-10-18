// OSE's carrying rule as the transfer callable applies it: packed-slot capacity
// from STR, and whether a transferred item fits. The server never spills an item
// it cannot fit; a transfer that does not fit is refused.

export type InventoryItem = {
  id: string
  kind: 'weapon' | 'armour' | 'ammunition' | 'consumable' | 'general' | 'gold' | 'treasure'
  equipped: boolean
  qty?: number
}

export type AcceptedTransfer = {
  itemId: string
  itemSnapshot: InventoryItem
}

export function availablePackedSlots(details: unknown): number {
  const packedSlotThresholds = [18, 16, 13, 9, 6, 4]
  const packedMovementSlotCount = 13
  if (!details || typeof details !== 'object') return packedMovementSlotCount
  const abilityScores = (details as { abilityScores?: Record<string, string> }).abilityScores
  const str = Number.parseInt(abilityScores?.STR ?? '', 10)
  let unlocked = 0
  for (let i = 0; i < packedSlotThresholds.length; i += 1) {
    if (str >= packedSlotThresholds[i]) unlocked += 1
  }
  return unlocked + packedMovementSlotCount
}

export function applyAcceptedTransfer(
  senderInventory: InventoryItem[],
  receiverInventory: InventoryItem[],
  transfer: AcceptedTransfer,
  packedAllowed: number,
) {
  const movedSnapshot = transfer.itemSnapshot
  if (!movedSnapshot || movedSnapshot.kind === 'gold') {
    return { ok: false as const, reason: 'missing_item' as const }
  }

  const senderItem = senderInventory.find((item) => item.id === transfer.itemId)
  if (!senderItem || senderItem.kind === 'gold') {
    return { ok: false as const, reason: 'missing_item' as const }
  }
  if (senderItem.kind !== movedSnapshot.kind) {
    return { ok: false as const, reason: 'kind_mismatch' as const }
  }

  const senderQty = Math.max(1, senderItem.qty ?? 1)
  const movedQty = Math.max(1, movedSnapshot.qty ?? 1)
  if (senderQty < movedQty) {
    return { ok: false as const, reason: 'qty_changed' as const }
  }

  const nextReceiverInventory = [...receiverInventory, { ...movedSnapshot, equipped: false }]
  const packedUsed = nextReceiverInventory.filter((item) => !item.equipped).length
  if (packedUsed > packedAllowed) {
    return { ok: false as const, reason: 'packed_slots' as const }
  }

  const nextSenderInventory = senderInventory.flatMap((item) => {
    if (item.id !== transfer.itemId) return [item]
    if (senderQty <= movedQty) return []
    return [{ ...item, qty: senderQty - movedQty }]
  })

  return {
    ok: true as const,
    senderInventory: nextSenderInventory,
    receiverInventory: nextReceiverInventory,
  }
}
