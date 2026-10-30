// The words and boxes of the Carriers view, copied from the inventory
// prototype (B's `meter`, `pocketsText`, `renderCarriers`, `renderDetail`,
// `renderCarryingAndGround` and the Carriers group of `destinationOptions`).
// B wrote them as HTML; here they are the values the view draws.

import { LUBEC_LIST_MODE_OVER } from '../../ruleSets/lubec/gear/carriers'
import type { LubecCarrier, LubecGear, LubecPocket } from '../../ruleSets/lubec/gear/gearRecord'
import { capacity, itemsIn, pocketUsed, used } from '../../ruleSets/lubec/gear/placement'

/** All a label may say about a hidden carrier (spec 14.1, R4). */
export const LUBEC_HIDDEN_NOTE = 'Only you and the GM can see this'

/** A carrier as the view reads it: the built-in backpack, or a personal carrier. */
export type LubecCarrierShown = { id: string; pockets: readonly LubecPocket[] }

/** One box of the meter: empty, taken, taken by something heavy, or the gap between two pockets. */
export type LubecMeterCell = 'off' | 'on' | 'heavy' | 'gap'

/** Rule C4: whether a carrier is too big for boxes, and so has "plenty of room". */
export const lubecPlentyOfRoom = (pockets: readonly LubecPocket[]): boolean => capacity(pockets) > LUBEC_LIST_MODE_OVER

// One pocket's boxes: a box for each slot its things take, then the empty ones.
function pocketCells(gear: LubecGear, c: LubecCarrierShown, k: number): LubecMeterCell[] {
  const taken = itemsIn(gear, c.id).filter((i) => i.pocket === k)
    .flatMap((i) => new Array<LubecMeterCell>(i.size).fill(i.weight !== 'normal' ? 'heavy' : 'on'))
  const empty = Math.max(0, c.pockets[k].slots - taken.length)
  return [...taken, ...new Array<LubecMeterCell>(empty).fill('off')]
}

/** B's `meter`: every pocket's boxes, with a gap between pockets; null over 24 slots, which has "plenty of room" instead. */
export function lubecMeterCells(gear: LubecGear, c: LubecCarrierShown): LubecMeterCell[] | null {
  if (lubecPlentyOfRoom(c.pockets)) return null
  return c.pockets.flatMap((_, k) => [...(k ? ['gap' as const] : []), ...pocketCells(gear, c, k)])
}

/** B's `pocketsText`: "Main 4 (up to 4); Outside pocket 1 (up to 1)". */
export const lubecPocketsText = (pockets: readonly LubecPocket[]): string =>
  pockets.map((p) => `${p.name} ${p.slots} (up to ${p.max})`).join('; ')

/** How much of a carrier is used, and its size, for "<b>3</b> of 8 used". */
export const lubecCarrierUse = (gear: LubecGear, c: LubecCarrierShown): { used: number; capacity: number } =>
  ({ used: used(gear, c.id), capacity: capacity(c.pockets) })

/** The rest of the detail's count after "<b>3</b> of 8 used": what is free, or "plenty of room". */
export function lubecDetailCountRest(gear: LubecGear, c: LubecCarrierShown): string {
  const u = lubecCarrierUse(gear, c)
  return lubecPlentyOfRoom(c.pockets) ? ' / plenty of room' : ` / ${u.capacity - u.used} free`
}

/** The rest of a pocket's count after "<b>2</b>": "of 4 / things up to 4 slots". */
export const lubecPocketCountRest = (p: LubecPocket): string => ` of ${p.slots} / things up to ${p.max} slot${p.max > 1 ? 's' : ''}`

/** Whether a pocket has room for one more slot, which offers "+ Put something in". */
export const lubecPocketHasRoom = (gear: LubecGear, c: LubecCarrierShown, k: number): boolean => pocketUsed(gear, c.id, k) < c.pockets[k].slots

const room = (cap: number, u: number) => (cap > LUBEC_LIST_MODE_OVER ? 'plenty of room' : `${cap - u} free`)

/** A personal carrier's places in the Move list and "Put it": the carrier, or each of its pockets, with what is free. */
function carrierPlaces(gear: LubecGear, c: LubecCarrier): { value: string; label: string }[] {
  if (c.pockets.length === 1) return [{ value: `${c.id}#0`, label: `${c.name} (${room(capacity(c.pockets), used(gear, c.id))})` }]
  return c.pockets.map((p, k) => ({ value: `${c.id}#${k}`, label: `${c.name}: ${p.name.toLowerCase()} (${room(p.slots, pocketUsed(gear, c.id, k))})` }))
}

/** The Carriers group of B's `destinationOptions`: every personal carrier's places. */
export const lubecCarrierDestinations = (gear: LubecGear): { value: string; label: string }[] =>
  gear.carriers.flatMap((c) => carrierPlaces(gear, c))

/** Where a thing in a personal carrier is, in words: "Duffel bag", "School bag, outside pocket", "Locker, small stuff". */
export function lubecCarrierWhere(c: LubecCarrier, pocket: number | null | undefined): string {
  if (pocket == null) return `${c.name}, small stuff`
  return c.pockets.length > 1 ? `${c.name}, ${(c.pockets[pocket]?.name ?? '').toLowerCase()}` : c.name
}

/** The toast after a carrier is added (B: "Duffel bag added to your carriers."). */
export const lubecCarrierAddedToast = (c: Pick<LubecCarrier, 'name'>): string => `${c.name} added to your carriers.`

/** The toast after a carrier is carried (B's `carryPrompt`). */
export const lubecCarryingToast = (c: Pick<LubecCarrier, 'name'>): string => `Carrying ${c.name}.`
