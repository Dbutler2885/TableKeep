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

type SenderCheck =
  | { ok: false; reason: 'missing_item' | 'kind_mismatch' | 'qty_changed' }
  | { ok: true; senderQty: number; movedQty: number }

// Gold never moves by transfer, so a gold row counts as no item at all.
const isTransferable = (item: InventoryItem | null | undefined): item is InventoryItem =>
  !!item && item.kind !== 'gold'

const stackQty = (item: InventoryItem) => Math.max(1, item.qty ?? 1)

function checkSender(senderItem: InventoryItem | undefined, movedSnapshot: InventoryItem | null | undefined): SenderCheck {
  if (!isTransferable(movedSnapshot) || !isTransferable(senderItem)) {
    return { ok: false, reason: 'missing_item' }
  }
  if (senderItem.kind !== movedSnapshot.kind) {
    return { ok: false, reason: 'kind_mismatch' }
  }
  const senderQty = stackQty(senderItem)
  const movedQty = stackQty(movedSnapshot)
  if (senderQty < movedQty) {
    return { ok: false, reason: 'qty_changed' }
  }
  return { ok: true, senderQty, movedQty }
}

const packedCount = (inventory: InventoryItem[]) => inventory.filter((item) => !item.equipped).length

function senderInventoryAfter(senderInventory: InventoryItem[], itemId: string, senderQty: number, movedQty: number) {
  return senderInventory.flatMap((item) => {
    if (item.id !== itemId) return [item]
    if (senderQty <= movedQty) return []
    return [{ ...item, qty: senderQty - movedQty }]
  })
}

export function applyAcceptedTransfer(
  senderInventory: InventoryItem[],
  receiverInventory: InventoryItem[],
  transfer: AcceptedTransfer,
  packedAllowed: number,
) {
  const senderItem = senderInventory.find((item) => item.id === transfer.itemId)
  const sender = checkSender(senderItem, transfer.itemSnapshot)
  if (!sender.ok) return sender

  const nextReceiverInventory = [...receiverInventory, { ...transfer.itemSnapshot, equipped: false }]
  if (packedCount(nextReceiverInventory) > packedAllowed) {
    return { ok: false as const, reason: 'packed_slots' as const }
  }

  return {
    ok: true as const,
    senderInventory: senderInventoryAfter(senderInventory, transfer.itemId, sender.senderQty, sender.movedQty),
    receiverInventory: nextReceiverInventory,
  }
}
