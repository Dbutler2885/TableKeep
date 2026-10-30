// Offering an item to another player's character (spec 11.3, 11.4). The item
// stays on the sender's sheet until the offer is accepted; what the offer
// carries is a snapshot of it, which every member of the group can read, so it
// says nothing about where the item is. Pure: item in, snapshot out.

import { lubecUnplaced, type LubecUnplacedItem } from './drop'
import type { LubecItem } from './gearRecord'

/** How many of the stack an offer gives: what was typed, from 1 to all of it. Anything unreadable is 1, as in OSE. */
export const lubecOfferQty = (item: Pick<LubecItem, 'qty'>, typed: string): number =>
  Math.max(1, Math.min(item.qty, Number.parseInt(typed, 10) || 1))

// A stored document cannot hold an undefined field.
const defined = (item: LubecUnplacedItem) =>
  Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined)) as LubecUnplacedItem

/**
 * What an offer of `qty` of `item` carries: the item without its place. A whole
 * stack keeps its id, as in OSE; part of one is a new item, with a new id.
 */
export function lubecOfferSnapshot(item: LubecItem, qty: number, newId: () => string): LubecUnplacedItem {
  const unplaced = defined(lubecUnplaced(item))
  return qty >= item.qty ? unplaced : { ...unplaced, id: newId(), qty }
}
