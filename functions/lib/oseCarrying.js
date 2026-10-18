// OSE's carrying rule as the transfer callable applies it: packed-slot capacity
// from STR, and whether a transferred item fits. The server never spills an item
// it cannot fit; a transfer that does not fit is refused.
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
export function applyAcceptedTransfer(senderInventory, receiverInventory, transfer, packedAllowed) {
    const movedSnapshot = transfer.itemSnapshot;
    if (!movedSnapshot || movedSnapshot.kind === 'gold') {
        return { ok: false, reason: 'missing_item' };
    }
    const senderItem = senderInventory.find((item) => item.id === transfer.itemId);
    if (!senderItem || senderItem.kind === 'gold') {
        return { ok: false, reason: 'missing_item' };
    }
    if (senderItem.kind !== movedSnapshot.kind) {
        return { ok: false, reason: 'kind_mismatch' };
    }
    const senderQty = Math.max(1, senderItem.qty ?? 1);
    const movedQty = Math.max(1, movedSnapshot.qty ?? 1);
    if (senderQty < movedQty) {
        return { ok: false, reason: 'qty_changed' };
    }
    const nextReceiverInventory = [...receiverInventory, { ...movedSnapshot, equipped: false }];
    const packedUsed = nextReceiverInventory.filter((item) => !item.equipped).length;
    if (packedUsed > packedAllowed) {
        return { ok: false, reason: 'packed_slots' };
    }
    const nextSenderInventory = senderInventory.flatMap((item) => {
        if (item.id !== transfer.itemId)
            return [item];
        if (senderQty <= movedQty)
            return [];
        return [{ ...item, qty: senderQty - movedQty }];
    });
    return {
        ok: true,
        senderInventory: nextSenderInventory,
        receiverInventory: nextReceiverInventory,
    };
}
