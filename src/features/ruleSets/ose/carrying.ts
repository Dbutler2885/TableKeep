import { computeOverflow } from '../../character/inventoryOverflow'
import type { CarryingRule } from '../carrying'
import { packedSlotsOf } from './packedSlots'

// The transfer callable refuses with the same words.
export const PACKED_SLOTS_MESSAGE = 'Not enough packed slots to accept this item.'

// OSE's carrying: equipped items take no packed slot. An add or a grant that
// overflows spills the newest non-gold items and then the gold, and a
// transfer that would overflow is refused instead.
export const oseCarrying: CarryingRule = {
  packedSlots: packedSlotsOf,
  decide(character, operation, inventory) {
    const packedSlots = packedSlotsOf(character.details)
    if (inventory.filter((item) => !item.equipped).length <= packedSlots) return { outcome: 'fits' }
    if (operation === 'transfer') return { outcome: 'refused', reason: 'packed_slots', message: PACKED_SLOTS_MESSAGE }
    return { outcome: 'overflow', ...computeOverflow(inventory, packedSlots, character.id, character.name) }
  },
}
