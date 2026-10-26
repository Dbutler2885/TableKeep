// The counts on an item's card, copied from the inventory prototype (B): a
// consumable's count and a holder's contents can always be changed by hand.
// Pure: gear in, the next gear out.

import type { LubecGear, LubecItem } from './gearRecord'
import { isUsedUp, stackFull, usedUp } from './stacks'

/** The next gear after a count changes, and whether the item was used up and left the sheet; or why not. */
export type LubecCountChange = { ok: true; gear: LubecGear; gone: boolean } | { ok: false; msg: string }

const withItem = (gear: LubecGear, next: LubecItem): LubecGear => ({ ...gear, items: gear.items.map((x) => (x.id === next.id ? next : x)) })

// Rule K4: a consumable at 0 is used up and leaves the sheet; anything else at 0 stays.
function settle(gear: LubecGear, next: LubecItem): LubecCountChange {
  if (isUsedUp(next)) return { ok: true, gear: usedUp(gear, next.id), gone: true }
  return { ok: true, gear: withItem(gear, next), gone: false }
}

/** The card's − and + on a count. Rule S3: a stack holds only what fits in its slot, so a full one refuses +. */
export function stepLubecQty(gear: LubecGear, item: LubecItem, d: number): LubecCountChange {
  const full = d > 0 ? stackFull(item) : null
  if (full) return { ok: false, msg: full }
  return settle(gear, { ...item, qty: Math.max(0, item.qty + d) })
}

/** Rule L10: "Use one" on a consumable that is not a loose supply. The last one is used up. */
export const lubecUseOne = (gear: LubecGear, item: LubecItem): LubecCountChange => stepLubecQty(gear, item, -1)

/** The card's − and + on a holder's contents, between empty and full. Rule K5: a holder at 0 stays. */
export function stepLubecLoaded(gear: LubecGear, item: LubecItem, d: number): LubecGear {
  const loaded = Math.max(0, Math.min(item.capacity ?? 0, (item.loaded ?? 0) + d))
  return withItem(gear, { ...item, loaded })
}
