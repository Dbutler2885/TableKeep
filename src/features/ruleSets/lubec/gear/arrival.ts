// Where an item lands when it arrives on a sheet from somewhere else: given by
// the GM from the GM Items tab, or accepted from another player (spec 11.3).
// The arrival has no place of its own to ask about, so the sheet picks one:
// the first backpack pocket that fits, or both hands for a thing too big for
// any backpack. Pure: gear in, result out. `functions/src` keeps a copy for
// the transfer callable, pinned to this one by a shared case list.

import { LUBEC_PLACE_FIELDS } from './drop'
import type { LubecGear, LubecItem, LubecSupply } from './gearRecord'
import { place } from './placement'
import type { LubecPlacement } from './stacks'

export const LUBEC_NO_ROOM_TO_ACCEPT = 'Not enough room to accept this item. Make room in your backpack or hands, then accept again.'

export type LubecArrival = { ok: true; item: LubecItem; gear: LubecGear } | { ok: false; msg: string }

const placeFields: readonly string[] = LUBEC_PLACE_FIELDS

/** The item as it arrives: where it was, its batch and its recorded Strength roll are the sender's, and go. */
const unplaced = (item: LubecItem): LubecItem =>
  Object.fromEntries(Object.entries(item).filter(([key]) => !placeFields.includes(key))) as LubecItem

// Only the pocket check of `place`: the cells are laid out by the sheet when it draws.
// An 8-slot thing never fits a backpack, so it goes into both hands when both are empty.
const arrivalPlace = (gear: LubecGear, item: LubecItem): LubecPlacement =>
  place(gear, item.size === 8 ? 'hands' : 'backpack', item)

/** `item` at the place the placement rule found for it. */
export const lubecPlacedAt = (item: LubecItem, at: Extract<LubecPlacement, { ok: true }>): LubecItem => ({
  ...item,
  carrier: at.carrier,
  ...(at.pocket !== undefined && { pocket: at.pocket }),
  ...(at.slot !== undefined && { slot: at.slot }),
})

/** The made supplies the item names, as `offered` defines them, that the receiver does not have yet. */
function suppliesFor(item: LubecItem, own: readonly LubecSupply[], offered: readonly LubecSupply[]): LubecSupply[] {
  const named = [item.takes, item.fits].filter(Boolean)
  return offered.filter((supply) => named.includes(supply.id) && !own.some((mine) => mine.id === supply.id))
}

/**
 * Where `item` lands in `gear`, or why it cannot. Its place fields and `check`
 * are removed, so a heavy thing arrives with no Strength roll and its new owner
 * is asked. Its `id` and quantity stay. A made supply it names comes along from
 * `offered`, the sender's made supplies.
 */
export function lubecReceive(gear: LubecGear, item: LubecItem, offered: readonly LubecSupply[] = []): LubecArrival {
  const arriving = unplaced(item)
  const at = arrivalPlace(gear, arriving)
  if (!at.ok) return { ok: false, msg: LUBEC_NO_ROOM_TO_ACCEPT }
  const landed = lubecPlacedAt(arriving, at)
  return {
    ok: true,
    item: landed,
    gear: { ...gear, items: [...gear.items, landed], supplies: [...gear.supplies, ...suppliesFor(landed, gear.supplies, offered)] },
  }
}
