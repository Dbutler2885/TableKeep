// Moving a thing inside the character's own record (Rules M1 to M7, W2),
// copied from the inventory prototype's `moveItem` and its drag handler (B).
// B moved the item in place and redrew; here each is pure: gear in, the next
// gear out, and the page commits it once. The cost is `lubecMoveCost`, and a
// move that leaves the record (a drop) is `lubecMoveBetween`.

import type { LubecGear, LubecItem } from './gearRecord'
import { onYou, place } from './placement'
import type { LubecPlacement } from './stacks'

export type LubecMoved = { ok: true; gear: LubecGear; item: LubecItem } | { ok: false; msg: string }

type Placed = Extract<LubecPlacement, { ok: true }>

const PLACE_KEYS: readonly string[] = ['carrier', 'pocket', 'slot', 'cells']

/** `i` with its place taken away, every other field kept. */
const lubecUnplaced = (i: LubecItem): LubecItem =>
  Object.fromEntries(Object.entries(i).filter(([key]) => !PLACE_KEYS.includes(key))) as LubecItem

/** `i` at the place the placement rule found, with its other fields kept. */
export const lubecAt = (i: LubecItem, pl: Placed): LubecItem => ({
  ...lubecUnplaced(i),
  carrier: pl.carrier,
  ...(pl.pocket !== undefined && { pocket: pl.pocket }),
  ...(pl.slot !== undefined && { slot: pl.slot }),
})

/** The main pocket: the one place whose boxes the player arranges (Rule W2). */
export const lubecInMain = (i: Pick<LubecItem, 'carrier' | 'pocket'>): boolean => i.carrier === 'backpack' && i.pocket === 0

/** The gear with `next` where each item of the same id was, so the order things were added in stays. */
export const lubecWithItems = (gear: LubecGear, ...next: LubecItem[]): LubecGear =>
  ({ ...gear, items: gear.items.map((x) => next.find((n) => n.id === x.id) ?? x) })

const findItem = (gear: LubecGear, id: string) => gear.items.find((x) => x.id === id)

const GONE = 'That is not on this sheet any more.'

const without = (i: LubecItem, key: 'check' | 'cells'): LubecItem =>
  Object.fromEntries(Object.entries(i).filter(([k]) => k !== key)) as LubecItem

// Rule E5: a recorded Strength roll is kept only while the thing is on you.
const keptCheck = (moved: LubecItem): LubecItem => (onYou(moved) ? moved : without(moved, 'check'))

/**
 * B's `moveItem`, less its prompt, log and toast: `itemId` goes to `dest`
 * ("backpack#0", "hands", "body#1", a carrier), or the placement rule's words
 * say why not. `cells` are the main-pocket boxes a dragged thing was dropped
 * on (Rule W2); a thing moved any other way is packed by the sheet.
 */
export function lubecMoveItem(gear: LubecGear, itemId: string, dest: string, cells: readonly number[] | null = null): LubecMoved {
  const i = findItem(gear, itemId)
  if (!i) return { ok: false, msg: GONE }
  const pl = place(gear, dest, i, i.id)
  if (!pl.ok) return pl
  const at = lubecAt(i, pl)
  const moved = keptCheck(cells && lubecInMain(at) ? { ...at, cells: [...cells] } : at)
  return { ok: true, gear: lubecWithItems(gear, moved), item: moved }
}

/** Arranging inside the main pocket (Rule W2): the thing takes the boxes it was dropped on. Free, and only arranging (Rule M2). */
export function lubecArrangeItem(gear: LubecGear, itemId: string, cells: readonly number[]): LubecGear {
  const i = findItem(gear, itemId)
  return i ? lubecWithItems(gear, { ...i, cells: [...cells] }) : gear
}

/** Room in the main pocket, but not in one piece: every arrangement there is let go, so the sheet packs it afresh. */
export function lubecRepackMain(gear: LubecGear): LubecGear {
  return { ...gear, items: gear.items.map((x) => (lubecInMain(x) ? without(x, 'cells') : x)) }
}
