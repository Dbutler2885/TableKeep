// Where things go on you (Rules S4, W1 to W6 and C1), copied from the
// inventory prototype (B). Each is pure: gear in, result out. These are base
// rules of the game, so a refusal is a plain message with no override.
//
// B kept its built-in places as carriers with a kind. Here the backpack,
// hands, body and worn armor are never stored, so `carrierOf` builds them.
// B's `ground` carrier is gone: dropping is `lubecDropPlan`, not a place.

import {
  LUBEC_BACKPACK_POCKETS,
  LUBEC_ON_YOU,
  type LubecGear,
  type LubecItem,
  type LubecPocket,
} from './gearRecord'
import { layerProblem } from './armorLayers'
import type { LubecItemDraft, LubecPlacement } from './stacks'

type CarrierKind = 'pack' | 'hands' | 'body' | 'worn' | 'made'

/** A place a thing can go, as the placement rule reads it. */
export type LubecPlaceCarrier = { id: string; kind: CarrierKind; name: string; pockets: readonly LubecPocket[] }

const BUILT_IN: Readonly<Record<string, LubecPlaceCarrier>> = {
  backpack: { id: 'backpack', kind: 'pack', name: 'Backpack', pockets: LUBEC_BACKPACK_POCKETS },
  hands: { id: 'hands', kind: 'hands', name: 'Hands', pockets: [] },
  body: { id: 'body', kind: 'body', name: 'Body', pockets: [] },
  worn: { id: 'worn', kind: 'worn', name: 'Armor, worn', pockets: [] },
}

/** The place `id` names: one of the built-in places on you, or one of the gear's personal carriers. */
export function carrierOf(gear: LubecGear, id: string): LubecPlaceCarrier | undefined {
  if (Object.hasOwn(BUILT_IN, id)) return BUILT_IN[id]
  const made = gear.carriers.find((c) => c.id === id)
  return made && { id: made.id, kind: 'made', name: made.name, pockets: made.pockets }
}

export const itemsIn = (gear: LubecGear, id: string): LubecItem[] => gear.items.filter((i) => i.carrier === id)
/** The "on you" test: in the backpack, in hand, in a body slot or worn. Carriers are not on you. */
export const onYou = (i: Pick<LubecItem, 'carrier'>): boolean => (LUBEC_ON_YOU as readonly string[]).includes(i.carrier)
export const capacity = (pockets: readonly LubecPocket[]): number => pockets.reduce((n, p) => n + p.slots, 0)
export const pocketUsed = (gear: LubecGear, cid: string, k: number, ignoreId?: string | null): number =>
  itemsIn(gear, cid).filter((i) => i.pocket === k && i.id !== ignoreId).reduce((n, i) => n + i.size, 0)
export const used = (gear: LubecGear, cid: string): number => itemsIn(gear, cid).reduce((n, i) => n + i.size, 0)

// ---------- space ----------
// Rule W3: anything over 1 slot takes both hands, and so does anything heavy or extra heavy (captain, round 26).
// So does a 1-slot thing whose `hands` is 2, like the two-handed slingshot (spec D15).
export const bothHands = (i: Pick<LubecItem, 'size' | 'weight' | 'hands'>): boolean =>
  i.size > 1 || i.weight !== 'normal' || i.hands === 2

const slotsOf = (i: LubecItem): number[] => (i.slot === undefined ? [] : [i.slot])

/** The hands that are full: 0 is the left, 1 the right. An item with no readable slot fills neither. */
export function handsTaken(gear: LubecGear, ignoreId?: string | null): Set<number> {
  const t = new Set<number>()
  for (const i of itemsIn(gear, 'hands')) if (i.id !== ignoreId) (bothHands(i) ? [0, 1] : slotsOf(i)).forEach((k) => t.add(k))
  return t
}
/** The body slots that are full. */
export const bodyTaken = (gear: LubecGear, ignoreId?: string | null): Set<number> =>
  new Set(itemsIn(gear, 'body').filter((i) => i.id !== ignoreId).flatMap(slotsOf))

const no = (msg: string): LubecPlacement => ({ ok: false, msg })

const freeOf = (taken: Set<number>, want: number | null): number | undefined =>
  ([0, 1].includes(want as number) && !taken.has(want as number) ? want as number : [0, 1].find((k) => !taken.has(k)))

// B names the thing by size, then by weight; a 1-slot thing with `hands: 2` is named by that.
const bothHandsWhat = (it: LubecItemDraft): string => {
  if (it.size > 1) return `A ${it.size}-slot thing`
  if (it.weight === 'normal') return 'A two-handed thing'
  return it.weight === 'extra' ? 'An extra-heavy thing' : 'A heavy thing'
}

// Rule W3.
function placeInHands(gear: LubecGear, it: LubecItemDraft, want: number | null, ignoreId?: string | null): LubecPlacement {
  const taken = handsTaken(gear, ignoreId)
  if (bothHands(it)) return taken.size ? no(`${bothHandsWhat(it)} takes both hands. Empty both hands first.`) : { ok: true, carrier: 'hands', slot: 0 }
  const free = freeOf(taken, want)
  return free == null ? no('Both hands are full.') : { ok: true, carrier: 'hands', slot: free }
}

// Rule W4.
function placeOnBody(gear: LubecGear, it: LubecItemDraft, want: number | null, ignoreId?: string | null): LubecPlacement {
  if (it.size > 1) return no('Body slots take 1-slot things only. Try both hands, the backpack or a carrier.')
  const free = freeOf(bodyTaken(gear, ignoreId), want)
  return free == null ? no('Both body slots are full.') : { ok: true, carrier: 'body', slot: free }
}

// Rules A1 and A3, and W5: only armor is worn, and worn armor takes no slots.
function placeWorn(gear: LubecGear, it: LubecItemDraft, ignoreId?: string | null): LubecPlacement {
  if (it.kind !== 'armor') return no('Only armor is worn. Clothes and other things go in a body slot.')
  const msg = layerProblem(gear, it, ignoreId)
  return msg ? no(msg) : { ok: true, carrier: 'worn' }
}

const fitsPocket = (gear: LubecGear, c: LubecPlaceCarrier, k: number, size: number, ignoreId?: string | null): boolean =>
  size <= c.pockets[k].max && pocketUsed(gear, c.id, k, ignoreId) + size <= c.pockets[k].slots

function pocketRefusal(gear: LubecGear, c: LubecPlaceCarrier, it: LubecItemDraft, want: number | null, ignoreId?: string | null): LubecPlacement {
  if (want == null) return no(`No pocket in ${c.name} has room for a ${it.size}-slot thing.`)
  const p = c.pockets[want]
  if (it.size > p.max) return no(`${p.name} takes things up to ${p.max} slot${p.max > 1 ? 's' : ''}. This one is ${it.size}.`)
  return no(`${p.name} is full: ${p.slots - pocketUsed(gear, c.id, want, ignoreId)} of ${p.slots} free, and this needs ${it.size}.`)
}

// Rules S4, W1 and C1: a thing fits inside one pocket; a small thing takes no slot, in any pocket.
function placeInPockets(gear: LubecGear, c: LubecPlaceCarrier, it: LubecItemDraft, want: number | null, ignoreId?: string | null): LubecPlacement {
  if (it.size === 0) return { ok: true, carrier: c.id, pocket: null } // no slot, any pocket
  if (c.kind === 'pack' && it.size === 8) return no('An 8-slot thing never fits in a backpack. Hold it in both hands, or put it on a carrier such as a strap.')
  const order = want != null ? [want] : c.pockets.map((_, k) => k)
  const k = order.find((n) => fitsPocket(gear, c, n, it.size, ignoreId))
  return k != null ? { ok: true, carrier: c.id, pocket: k } : pocketRefusal(gear, c, it, want, ignoreId)
}

const GONE = 'That place is not on this sheet any more. Pick another.'

function placeAt(gear: LubecGear, c: LubecPlaceCarrier, it: LubecItemDraft, want: number | null, ignoreId?: string | null): LubecPlacement {
  if (c.kind === 'worn') return placeWorn(gear, it, ignoreId)
  if (c.kind === 'hands') return placeInHands(gear, it, want, ignoreId)
  if (c.kind === 'body') return placeOnBody(gear, it, want, ignoreId)
  if (want != null && !c.pockets[want]) return no(GONE)
  return placeInPockets(gear, c, it, want, ignoreId)
}

/**
 * Where would it go? `dest` is "carrier", "carrier#pocket", "carrier#small" or "hands#slot". Rules W1, W3, W4, A1, A3 and C1.
 * Returns where it goes, or why not. Base rules: no override. `ignoreId` is the item being moved, which leaves its own place.
 */
export function place(gear: LubecGear, dest: string, it: LubecItemDraft, ignoreId?: string | null): LubecPlacement {
  const [cid, sub] = dest.split('#')
  const c = carrierOf(gear, cid)
  if (!c) return no(GONE)
  if (sub === 'small' && it.size !== 0) return no('Only small things go in small stuff. Pick a pocket, or make it Small.')
  const want = sub != null && sub !== 'small' ? Number(sub) : null
  return placeAt(gear, c, it, want, ignoreId)
}

// ---------- the main pocket ----------
// Rule W2. The main pocket's five boxes: 0 1 / 2 3 is the 2x2 block, 4 is the box under it.
// Where a thing of each size can sit, in the order the sheet tries them. Single things fill the box under the
// block first, so a pair of boxes stays open for a 2-slot thing as long as possible.
export const FOOTPRINTS: Readonly<Record<number, readonly (readonly number[])[]>> = {
  1: [[4], [0], [1], [2], [3]],
  2: [[0, 1], [2, 3], [0, 2], [1, 3]],
  4: [[0, 1, 2, 3]],
}
const MAIN_CELLS = LUBEC_BACKPACK_POCKETS[0].slots
const sameCells = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((k, n) => k === b[n])
const footprintsOf = (i: LubecItem) => FOOTPRINTS[i.size] ?? []

export type LubecMainPocket = {
  /** The item in each of the five boxes, or null. */
  cells: (LubecItem | null)[]
  /** Each item and the boxes it sits in, biggest first. */
  placed: { item: LubecItem; at: readonly number[] }[]
  /** True when the player's arrangement left no room, so every item was packed fresh and its `cells` should be cleared. */
  fresh: boolean
}

type Packing = Omit<LubecMainPocket, 'fresh'>

const isFree = (cells: Packing['cells'], at: readonly number[]) => at.every((k) => !cells[k])

function putAt(pocket: Packing, item: LubecItem, at: readonly number[]): void {
  at.forEach((k) => { pocket.cells[k] = item })
  pocket.placed.push({ item, at })
}

/** The boxes the player arranged `i` in, when they are one of its footprints. */
const arrangedAt = (i: LubecItem): readonly number[] | undefined => footprintsOf(i).find((f) => sameCells(f, i.cells ?? []))

/** Puts `i` where the player arranged it, if those boxes are still free. */
function keepArranged(pocket: Packing, i: LubecItem): boolean {
  const at = arrangedAt(i)
  if (!at || !isFree(pocket.cells, at)) return false
  putAt(pocket, i, at)
  return true
}

function packCells(its: readonly LubecItem[], keep: boolean): Packing | null {
  const pocket: Packing = { cells: new Array(MAIN_CELLS).fill(null), placed: [] }
  const rest = keep ? its.filter((i) => !keepArranged(pocket, i)) : its
  for (const i of rest) {
    const at = footprintsOf(i).find((f) => isFree(pocket.cells, f))
    if (!at) return null
    putAt(pocket, i, at)
  }
  return pocket
}

// Things the player arranged (by dragging) keep their boxes; the rest are packed around them the way a kid would:
// the big thing first, then pairs, then singles. If the arrangement leaves no room for something, the whole pocket
// is packed fresh. Base rules guarantee that always fits: 5 slots, nothing over 4. Null only for stored gear
// that breaks them. Things of the same size keep the order they were added in.
export function packMain(gear: LubecGear): LubecMainPocket | null {
  const its = itemsIn(gear, 'backpack').filter((i) => i.pocket === 0 && i.size > 0).sort((a, b) => b.size - a.size)
  const arranged = packCells(its, true)
  if (arranged) return { ...arranged, fresh: false }
  const repacked = packCells(its, false)
  return repacked && { ...repacked, fresh: true }
}

// ---------- stats ----------
// Rule W6: a full inventory is a full backpack, full body slots and full hands (captain, round 20). Carriers don't count.
export function inventoryFull(gear: LubecGear): boolean {
  return used(gear, 'backpack') >= capacity(LUBEC_BACKPACK_POCKETS) && bodyTaken(gear).size >= 2 && handsTaken(gear).size >= 2
}
