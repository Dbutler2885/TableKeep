// Adding a new item, copied from the add form's submit in the inventory
// prototype (B). Pure: gear in, the next gear out. The new items' ids come
// from the caller, so several clients never count up the same ids.

import type { LubecGear, LubecItem } from './gearRecord'
import { onYou, place } from './placement'
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

export type LubecEdited =
  | { ok: true; gear: LubecGear; item: LubecItem; extra: number }
  | { ok: false; msg: string }

// What the form sets, which an edit clears before it writes the draft back; and where it was, which the placement replaces.
const FORM_FIELDS = [
  'mode', 'impact', 'table', 'reach', 'wounds', 'minStrength', 'hands', 'capacity', 'loaded', 'takes', 'hold', 'locs', 'exclusive', 'armor', 'fits', 'per',
  'art', 'picturePath', 'shape', 'stock', 'batch', 'cells', 'carrier', 'pocket', 'slot',
] as const

const without = (i: LubecItem, keys: readonly string[]): Partial<LubecItem> =>
  Object.fromEntries(Object.entries(i).filter(([key]) => !keys.includes(key)))

// A recorded Strength roll counts only for a heavy or extra heavy thing on you.
const settleCheck = (i: LubecItem): LubecItem =>
  (i.check === undefined || (onYou(i) && i.weight !== 'normal') ? i : without(i, ['check']) as LubecItem)

/**
 * The edit form's save: the item becomes the draft at `dest`, keeping its id and anything the form does not set.
 * A count that now makes more stacks adds the rest as new items of its batch (Rule S3). Nothing changes unless every stack fits.
 */
export function editLubecItem(gear: LubecGear, editing: LubecItem, dest: string, draft: LubecItemDraft, newId: () => string): LubecEdited {
  const problem = draftProblem(draft)
  if (problem) return { ok: false, msg: problem.msg }
  const qtys = draftStacks(draft)
  const spots = placeStacks(gear, dest, draft, qtys, { place, destinations: LUBEC_ON_YOU_DESTINATIONS, editingId: editing.id })
  if (!spots.ok) return spots
  const batchId = qtys.length > 1 ? editing.batch || newId() : editing.batch
  const batch = batchId ? { batch: batchId } : {}
  const item = settleCheck({ ...without(editing, FORM_FIELDS), ...draft, id: editing.id, qty: qtys[0], ...batch, ...spotOf(spots.list[0]) } as LubecItem)
  const extra = spots.list.slice(1).map((spot, k) => ({ ...draft, id: newId(), qty: qtys[k + 1], ...batch, ...spotOf(spot) }) as LubecItem)
  return { ok: true, gear: { ...gear, items: [...gear.items.map((x) => (x.id === item.id ? item : x)), ...extra] }, item, extra: extra.length }
}
