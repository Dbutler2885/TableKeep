// Dropping a thing (Rules M4 and M8, as the captain changed M8). A dropped
// thing is never lost: it leaves the sheet and becomes a dropped item in the
// GM's Items tab, in the same move. This is the pure plan for that move; it
// writes nothing. The two-record transaction that carries it out is
// `lubecMoveBetween`.

import { MOVE_COST, type LubecMovePlace } from './gearRules'
import { LUBEC_ON_YOU, type LubecGear, type LubecItem } from './gearRecord'

/** The fields that say where an item is on a sheet. A dropped item is written without them. */
export const LUBEC_PLACE_FIELDS = ['carrier', 'pocket', 'slot', 'cells', 'batch', 'check'] as const

/** An item with its place taken away, as it is written to the GM's Items tab: every other field is kept. */
export type LubecUnplacedItem = Record<string, unknown> & Pick<LubecItem, 'id' | 'kind' | 'name' | 'note' | 'size' | 'weight' | 'qty'>

/** Where a dropped item was: its place fields as they were stored. */
export type LubecDropFrom = Pick<LubecItem, 'carrier' | 'pocket' | 'slot' | 'cells'>

export type LubecDropPlan = {
  item: LubecUnplacedItem
  from: LubecDropFrom
  /** Where it was, in words, for the GM: "backpack", "hands", or a carrier's name. */
  droppedFrom: string
  /** Rule M4, in actions. Null for a carrier, whose moves aren't counted (Rule M6). */
  cost: number | null
  /** The gear without the item. */
  gear: LubecGear
}

const placeFields: readonly string[] = LUBEC_PLACE_FIELDS
const fromFields: readonly string[] = ['carrier', 'pocket', 'slot', 'cells']

const isOnYou = (carrier: string): carrier is LubecMovePlace => (LUBEC_ON_YOU as readonly string[]).includes(carrier)

const fieldsWhere = (item: LubecItem, keep: (key: string) => boolean) =>
  Object.fromEntries(Object.entries(item).filter(([key]) => keep(key)))

/** `item` with its place taken away: every other field is kept. */
export const lubecUnplaced = (item: LubecItem) => fieldsWhere(item, (key) => !placeFields.includes(key)) as LubecUnplacedItem

const droppedFromText = (gear: LubecGear, carrier: string): string =>
  (isOnYou(carrier) ? carrier : gear.carriers.find((c) => c.id === carrier)?.name || carrier)

/** The plan for dropping `itemId` from `gear`, or null when the gear holds no such item. */
export function lubecDropPlan(gear: LubecGear, itemId: string): LubecDropPlan | null {
  const item = gear.items.find((x) => x.id === itemId)
  if (!item) return null
  return {
    item: lubecUnplaced(item),
    from: fieldsWhere(item, (key) => fromFields.includes(key)) as LubecDropFrom,
    droppedFrom: droppedFromText(gear, item.carrier),
    // Rule M4: dropping from a hand or the body is free, from the backpack 2.
    cost: isOnYou(item.carrier) ? MOVE_COST[item.carrier].drop : null,
    gear: { ...gear, items: gear.items.filter((x) => x !== item) },
  }
}
