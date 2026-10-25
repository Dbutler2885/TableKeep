// Adding a new item, copied from the add form's submit in the inventory
// prototype (B). Pure: gear in, the next gear out. The new items' ids come
// from the caller, so several clients never count up the same ids.

import type { LubecGear, LubecItem } from './gearRecord'
import { place } from './placement'
import { draftProblem, draftStacks, placeStacks, type LubecItemDraft } from './stacks'

/** The places on you the add form offers, as the placement rule reads them (B's "Put it" list, on you). */
export const LUBEC_ON_YOU_DESTINATIONS: readonly string[] = ['backpack#0', 'backpack#1', 'backpack#2', 'backpack#small', 'hands', 'body']

export type LubecAdded =
  | { ok: true; gear: LubecGear; first: LubecItem; stacks: number }
  | { ok: false; msg: string }

type Placed = { carrier: string; pocket?: number | null; slot?: number }

// A stored field is never undefined: Firestore refuses one, so an unused place field is left out.
const spotOf = ({ carrier, pocket, slot }: Placed): Partial<LubecItem> => ({
  carrier,
  ...(pocket === undefined ? {} : { pocket }),
  ...(slot === undefined ? {} : { slot }),
})

/**
 * Rules S3, S4 and W1 to W4: a new item from the add form, at `dest`, split into its stacks.
 * More stacks than one share a batch, so the card can say "2 of 6 stacks". Nothing is added unless every stack fits.
 */
export function addLubecItem(gear: LubecGear, dest: string, draft: LubecItemDraft, newId: () => string): LubecAdded {
  const problem = draftProblem(draft)
  if (problem) return { ok: false, msg: problem.msg }
  const qtys = draftStacks(draft)
  const spots = placeStacks(gear, dest, draft, qtys, { place, destinations: LUBEC_ON_YOU_DESTINATIONS })
  if (!spots.ok) return spots
  const batch = qtys.length > 1 ? { batch: newId() } : {}
  const added = spots.list.map((spot, k) => ({ ...draft, id: newId(), qty: qtys[k], ...batch, ...spotOf(spot) }) as LubecItem)
  return { ok: true, gear: { ...gear, items: [...gear.items, ...added] }, first: added[0], stacks: added.length }
}
