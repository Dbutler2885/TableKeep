// Lubec's carrying rule as the transfer callable applies it: the item leaves
// the sender's `lubec.gear` and lands in the receiver's where the arrival rule
// puts it. `lubecReceive` is the callable's copy of the app's arrival rule
// (`src/features/ruleSets/lubec/gear/arrival.ts`), which this package cannot
// import; one shared case list pins the two together.
//
// Gear is read as stored, and every field the rule does not model is written
// back as it was, so the merge write leaves the rest of the sheet alone.
// The app's copy of the rule refuses with the same words.
export const LUBEC_NO_ROOM_TO_ACCEPT = 'Not enough room to accept this item. Make room in your backpack or hands, then accept again.';
// The backpack is the same for everyone: a main pocket of 5 up to size 4, and two front pockets of 1.
const BACKPACK_POCKETS = [{ slots: 5, max: 4 }, { slots: 1, max: 1 }, { slots: 1, max: 1 }];
/** The fields that say where an item is on a sheet, which are the sender's and go. */
const PLACE_FIELDS = ['carrier', 'pocket', 'slot', 'cells', 'batch', 'check'];
const SIZES = [0, 1, 2, 4, 8];
const HEAVY_WEIGHTS = ['heavy', 'extra'];
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const recordsOf = (raw) => (Array.isArray(raw) ? raw.filter(isRecord) : []);
const isCount = (raw) => Number.isInteger(raw) && raw >= 0;
// Each read as the sheet reads it: an unreadable size is 1 slot, an unreadable weight normal, an unreadable quantity 1.
const sizeOf = (item) => (SIZES.includes(item.size) ? item.size : 1);
const qtyOf = (item) => (isCount(item.qty) ? item.qty : 1);
// Rule W3: anything over 1 slot, heavy or two-handed takes both hands. Any other thing in hand fills the hand its slot names.
const bothHands = (item) => sizeOf(item) > 1 || HEAVY_WEIGHTS.includes(item.weight) || item.hands === 2;
const handsEmpty = (gear) => !gear.items.some((item) => item.carrier === 'hands' && (bothHands(item) || isCount(item.slot)));
const pocketUsed = (gear, k) => gear.items.filter((item) => item.carrier === 'backpack' && item.pocket === k).reduce((n, item) => n + sizeOf(item), 0);
// Only the pocket check of the placement rule: the first backpack pocket that fits, and no pocket for small stuff.
function backpackPlace(gear, size) {
    if (size === 0)
        return { carrier: 'backpack', pocket: null };
    const k = BACKPACK_POCKETS.findIndex((p, n) => size <= p.max && pocketUsed(gear, n) + size <= p.slots);
    return k < 0 ? null : { carrier: 'backpack', pocket: k };
}
// An 8-slot thing never fits a backpack, so it goes into both hands when both are empty.
function arrivalPlace(gear, size) {
    if (size !== 8)
        return backpackPlace(gear, size);
    return handsEmpty(gear) ? { carrier: 'hands', slot: 0 } : null;
}
/** The made supplies the item names, as `offered` defines them, that the receiver does not have yet. */
function suppliesFor(item, own, offered) {
    const named = [item.takes, item.fits].filter((id) => typeof id === 'string' && id !== '');
    return offered.filter((supply) => named.includes(supply.id) && !own.some((mine) => mine.id === supply.id));
}
/**
 * Where `item` lands in `gear`, or why it cannot. Its place fields and `check`
 * are removed, so a heavy thing arrives with no Strength roll and its new owner
 * is asked. Its `id` and quantity stay. A made supply it names comes along from
 * `offered`, the sender's made supplies.
 */
export function lubecReceive(gear, item, offered = []) {
    const arriving = Object.fromEntries(Object.entries(item).filter(([key]) => !PLACE_FIELDS.includes(key)));
    const at = arrivalPlace(gear, sizeOf(arriving));
    if (!at)
        return { ok: false, msg: LUBEC_NO_ROOM_TO_ACCEPT };
    const landed = { ...arriving, ...at };
    return {
        ok: true,
        item: landed,
        gear: { ...gear, items: [...gear.items, landed], supplies: [...gear.supplies, ...suppliesFor(landed, gear.supplies, offered)] },
    };
}
/** A stored character's `lubec.gear`; a missing or unreadable one reads as empty. */
export function storedLubecGear(character) {
    const lubec = isRecord(character) && isRecord(character.lubec) ? character.lubec : {};
    const gear = isRecord(lubec.gear) ? lubec.gear : {};
    return { ...gear, items: recordsOf(gear.items), supplies: recordsOf(gear.supplies) };
}
/** The sender's items once the offered quantity has left them, or why the offer no longer matches what they hold. */
function takeOffered(items, offer) {
    const held = items.find((item) => item.id === offer.itemId);
    const offered = offer.itemSnapshot;
    if (!held || !isRecord(offered))
        return { ok: false, reason: 'missing_item' };
    if (held.kind !== offered.kind)
        return { ok: false, reason: 'kind_mismatch' };
    const left = qtyOf(held) - qtyOf(offered);
    if (left < 0)
        return { ok: false, reason: 'qty_changed' };
    const rest = left > 0 ? [{ ...held, qty: left }] : [];
    return { ok: true, items: items.flatMap((item) => (item === held ? rest : [item])) };
}
/**
 * Lubec's entry in the callable's carrying table: the fields to merge into the
 * sender and the receiver, `lubec.gear` alone on each, or why the offer is
 * refused. A receiver with no room refuses with the arrival rule's words.
 */
export function acceptLubecTransfer(sender, receiver, offer) {
    const from = storedLubecGear(sender);
    const taken = takeOffered(from.items, offer);
    if (!taken.ok)
        return taken;
    const arrival = lubecReceive(storedLubecGear(receiver), offer.itemSnapshot, from.supplies);
    if (!arrival.ok)
        return { ok: false, reason: 'no_room', message: arrival.msg };
    return {
        ok: true,
        sender: { lubec: { gear: { ...from, items: taken.items } } },
        receiver: { lubec: { gear: arrival.gear } },
    };
}
