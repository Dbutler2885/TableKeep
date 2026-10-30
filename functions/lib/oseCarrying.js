// OSE's carrying rule as the transfer callable applies it: packed-slot capacity
// from STR, and whether a transferred item fits. The server never spills an item
// it cannot fit; a transfer that does not fit is refused.
// The app's copy of the rule refuses with the same words.
export const PACKED_SLOTS_MESSAGE = 'Not enough packed slots to accept this item.';
export function availablePackedSlots(details) {
    const packedSlotThresholds = [18, 16, 13, 9, 6, 4];
    const packedMovementSlotCount = 13;
    if (!details || typeof details !== 'object')
        return packedMovementSlotCount;
    const abilityScores = details.abilityScores;
    const str = Number.parseInt(abilityScores?.STR ?? '', 10);
    let unlocked = 0;
    for (let i = 0; i < packedSlotThresholds.length; i += 1) {
        if (str >= packedSlotThresholds[i])
            unlocked += 1;
    }
    return unlocked + packedMovementSlotCount;
}
// Gold never moves by transfer, so a gold row counts as no item at all.
const isTransferable = (item) => !!item && item.kind !== 'gold';
const stackQty = (item) => Math.max(1, item.qty ?? 1);
function checkSender(senderItem, movedSnapshot) {
    if (!isTransferable(movedSnapshot) || !isTransferable(senderItem)) {
        return { ok: false, reason: 'missing_item' };
    }
    if (senderItem.kind !== movedSnapshot.kind) {
        return { ok: false, reason: 'kind_mismatch' };
    }
    const senderQty = stackQty(senderItem);
    const movedQty = stackQty(movedSnapshot);
    if (senderQty < movedQty) {
        return { ok: false, reason: 'qty_changed' };
    }
    return { ok: true, senderQty, movedQty };
}
const packedCount = (inventory) => inventory.filter((item) => !item.equipped).length;
function senderInventoryAfter(senderInventory, itemId, senderQty, movedQty) {
    return senderInventory.flatMap((item) => {
        if (item.id !== itemId)
            return [item];
        if (senderQty <= movedQty)
            return [];
        return [{ ...item, qty: senderQty - movedQty }];
    });
}
export function applyAcceptedTransfer(senderInventory, receiverInventory, transfer, packedAllowed) {
    const senderItem = senderInventory.find((item) => item.id === transfer.itemId);
    const sender = checkSender(senderItem, transfer.itemSnapshot);
    if (!sender.ok)
        return sender;
    const nextReceiverInventory = [...receiverInventory, { ...transfer.itemSnapshot, equipped: false }];
    if (packedCount(nextReceiverInventory) > packedAllowed) {
        return { ok: false, reason: 'packed_slots' };
    }
    return {
        ok: true,
        senderInventory: senderInventoryAfter(senderInventory, transfer.itemId, sender.senderQty, sender.movedQty),
        receiverInventory: nextReceiverInventory,
    };
}
/** A stored character's `details`; a missing or unreadable one reads as empty. */
function detailsOf(character) {
    const details = character?.details;
    return details && typeof details === 'object' ? details : {};
}
function asInventory(details) {
    const inventory = details.inventory;
    return Array.isArray(inventory) ? inventory : [];
}
/**
 * OSE's entry in the callable's carrying table: `applyAcceptedTransfer` over
 * the two stored characters, writing each one's `details` whole with its new
 * inventory, and refusing a receiver with no free packed slot.
 */
export function acceptOseTransfer(sender, receiver, offer) {
    const senderDetails = detailsOf(sender);
    const receiverDetails = detailsOf(receiver);
    const result = applyAcceptedTransfer(asInventory(senderDetails), asInventory(receiverDetails), offer, availablePackedSlots(receiverDetails));
    if (!result.ok)
        return result.reason === 'packed_slots' ? { ok: false, reason: 'no_room', message: PACKED_SLOTS_MESSAGE } : result;
    return {
        ok: true,
        sender: { details: { ...senderDetails, inventory: result.senderInventory } },
        receiver: { details: { ...receiverDetails, inventory: result.receiverInventory } },
    };
}
