// The safe move between two records (spec 4.7), copied from the inventory
// prototype's `moveItem`, `place` and `copyOf` (B). B kept every carrier on
// one page; here an item can live in five records, and a move between two of
// them is one Firestore transaction (`lubecMoveBetween`). This is its pure
// part: given both records as the transaction read them, it checks the item is
// still where the player saw it, places it against the destination's own
// items, and returns both records as they are to be written. It writes
// nothing, and a refused move changes neither record.
//
// A Strength roll the move needs happens before it (Rule E5), so its result
// comes in as `check` rather than as a prompt.

import { lubecPlacedAt, lubecReceive, type LubecArrival } from './arrival'
import { lubecDropPlan, type LubecDropFrom, type LubecUnplacedItem } from './drop'
import type { LubecCarrierRecord, LubecGear, LubecItem } from './gearRecord'
import { LUBEC_GM_ITEM_FIELDS, type LubecGmItem } from './gmItem'
import { lubecPrunedOverrides } from '../modifiers'
import { onYou, place } from './placement'

export const LUBEC_STALE_MOVE = 'Someone moved that first. Nothing changed.'

// Everything an item copies from stock, or from a GM's library item when it is given (Rule T2).
// B's `img` is `picturePath` here, and a weapon's `minStrength` and `hands` come along too.
export const LUBEC_COPY_FIELDS = [
  'kind', 'name', 'size', 'weight', 'qty', 'note', 'mode', 'impact', 'table', 'reach', 'wounds', 'capacity', 'loaded', 'takes', 'hold',
  'locs', 'exclusive', 'armor', 'fits', 'per', 'art', 'picturePath', 'shape', 'minStrength', 'hands',
] as const

/** A copy of the fields an item copies, which never follows later changes to `src`. */
export const lubecCopyOf = (src: Partial<LubecItem>): Partial<LubecItem> =>
  JSON.parse(JSON.stringify(Object.fromEntries(LUBEC_COPY_FIELDS.filter((k) => src[k] !== undefined).map((k) => [k, src[k]]))))

/** The five records an item can live in. */
export type LubecRecordRef =
  | { kind: 'character'; characterId: string } // on you, and personal carriers
  | { kind: 'npc'; npcId: string } // an NPC's sheet, with its own gear
  | { kind: 'shared'; carrierId: string }
  | { kind: 'hidden'; characterId: string; carrierId: string }
  | { kind: 'gm-items' } // a drop, or a GM's give; the document is the item's id

/** A record as the transaction read it. One that does not exist reads as null. */
export type LubecMoveRecord =
  | { kind: 'character' | 'npc'; gear: LubecGear | null }
  | { kind: 'shared' | 'hidden'; carrier: LubecCarrierRecord | null }
  | { kind: 'gm-items'; item: LubecGmItem | null }

/** Where the page showed the item. */
export type LubecSeenPlace = Pick<LubecItem, 'carrier' | 'pocket' | 'slot'>

/** Who drops an item, for the GM. */
export type LubecDropper = { characterId: string; characterName: string; userId: string }

export type LubecMove = {
  itemId: string
  /** Where the player saw it. A GM item has no place, so it has none. */
  seen?: LubecSeenPlace
  /** Where it goes: "carrier", "carrier#pocket" or "hands#slot". Missing, it arrives by the arrival rule. A drop has none. */
  dest?: string
  /** The main-pocket boxes a dragged thing was dropped on (Rule W2). */
  cells?: number[]
  /** The Strength roll made for it before the move (Rule E5). */
  check?: 'pass' | 'fail'
  /** The id a copy of a library item gets, since the library item stays. */
  copyId?: string
  /** Who drops it, when it goes to the GM Items tab. */
  droppedBy?: LubecDropper
}

export type LubecMovePlan =
  | { ok: true; from: LubecMoveRecord; to: LubecMoveRecord; item: LubecItem }
  | { ok: false; msg: string }

/** What a move takes out of its first record. */
type Taken = { item: LubecItem; unplaced: LubecUnplacedItem; droppedFrom: string; rest: LubecMoveRecord }

/** What a move puts into its second record. */
type Put = { ok: true; to: LubecMoveRecord; item: LubecItem } | { ok: false; msg: string }

/** A record that holds gear: a sheet, or a carrier stored on its own. */
type GearRecord = Exclude<LubecMoveRecord, { kind: 'gm-items' }>

const isSheet = (record: GearRecord): record is Extract<LubecMoveRecord, { gear: unknown }> =>
  record.kind === 'character' || record.kind === 'npc'

// A carrier record read as gear: its items, and itself as the one carrier they are in.
const carrierGear = (carrier: LubecCarrierRecord): LubecGear => ({ items: carrier.items, carriers: [carrier], overrides: [], supplies: [] })

const gearOf = (record: GearRecord): LubecGear | null =>
  (isSheet(record) ? record.gear : record.carrier && carrierGear(record.carrier))

// Only ever given a record `gearOf` read gear from, so a carrier record has its carrier.
// A sheet drops any switched-off Speed loss the move ended (spec 5.3).
const withGear = (record: GearRecord, gear: LubecGear): GearRecord =>
  (isSheet(record) ? { ...record, gear: lubecPrunedOverrides(gear) } : { ...record, carrier: { ...record.carrier as LubecCarrierRecord, items: gear.items } })

const fieldsWithout = (item: Record<string, unknown>, keys: readonly string[]) =>
  Object.fromEntries(Object.entries(item).filter(([key]) => !keys.includes(key)))

const sameValue = (a: unknown, b: unknown) => (a ?? null) === (b ?? null)

const isWhereSeen = (from: LubecDropFrom, seen: LubecSeenPlace | undefined): boolean =>
  seen !== undefined && from.carrier === seen.carrier && sameValue(from.pocket, seen.pocket) && sameValue(from.slot, seen.slot)

function takeOutOfGear(record: GearRecord, move: LubecMove): Taken | null {
  const gear = gearOf(record)
  const plan = gear && lubecDropPlan(gear, move.itemId)
  if (!gear || !plan || !isWhereSeen(plan.from, move.seen)) return null
  const item = gear.items.find((i) => i.id === move.itemId) as LubecItem
  return { item, unplaced: plan.item, droppedFrom: plan.droppedFrom, rest: withGear(record, plan.gear) }
}

// A library item stays and the sheet gets a copy (Rule T2); a dropped item leaves the tab.
function takeOutOfGmItems(gmItem: LubecGmItem | null, move: LubecMove): Taken | null {
  if (!gmItem || gmItem.id !== move.itemId) return null
  const library = gmItem.status === 'library'
  if (library && !move.copyId) throw new Error('Giving a library item makes a copy, which needs a copyId.')
  const item = (library ? { ...lubecCopyOf(gmItem), id: move.copyId } : fieldsWithout(gmItem, LUBEC_GM_ITEM_FIELDS)) as LubecItem
  return { item, unplaced: item, droppedFrom: '', rest: { kind: 'gm-items', item: library ? gmItem : null } }
}

const takeOut = (record: LubecMoveRecord, move: LubecMove): Taken | null =>
  (record.kind === 'gm-items' ? takeOutOfGmItems(record.item, move) : takeOutOfGear(record, move))

// Rule W2: the boxes a dragged thing was dropped on are kept only in the main pocket.
const keptCells = (cells: number[] | undefined, at: LubecItem) =>
  (cells && at.carrier === 'backpack' && at.pocket === 0 ? { cells } : {})

// Rule E5: a Strength roll is kept only while the thing is on you.
const keptCheck = (check: LubecItem['check'], at: LubecItem) => (check && onYou(at) ? { check } : {})

// B's `moveItem`, less its prompt, log and toast: the thing takes the place `place` found.
function movedTo(gear: LubecGear, item: LubecItem, move: LubecMove & { dest: string }): LubecArrival {
  const pl = place(gear, move.dest, item, item.id)
  if (!pl.ok) return pl
  const at = lubecPlacedAt(fieldsWithout(item, ['carrier', 'pocket', 'slot', 'cells', 'check']) as LubecItem, pl)
  const moved: LubecItem = { ...at, ...keptCells(move.cells, at), ...keptCheck(move.check ?? item.check, at) }
  return { ok: true, item: moved, gear: { ...gear, items: [...gear.items, moved] } }
}

const dropperFields = (by: LubecDropper | undefined) =>
  by && { droppedByCharacterId: by.characterId, droppedByCharacterName: by.characterName, droppedByUserId: by.userId }

// Rule M8: a dropped thing becomes a dropped item in the GM Items tab, with who dropped it and where from.
const dropped = (taken: Taken, move: LubecMove): LubecGmItem =>
  ({ ...taken.unplaced, ...dropperFields(move.droppedBy), droppedFrom: taken.droppedFrom, status: 'dropped' }) as LubecGmItem

function putIn(record: LubecMoveRecord, taken: Taken, move: LubecMove): Put {
  if (record.kind === 'gm-items') {
    const item = dropped(taken, move)
    return { ok: true, to: { kind: 'gm-items', item }, item }
  }
  const gear = gearOf(record)
  if (!gear) return { ok: false, msg: LUBEC_STALE_MOVE }
  const put = move.dest === undefined ? lubecReceive(gear, taken.item) : movedTo(gear, taken.item, { ...move, dest: move.dest })
  return put.ok ? { ok: true, to: withGear(record, put.gear), item: put.item } : put
}

/**
 * The move of `move.itemId` from one record to another, planned against both
 * records as they were read, never the page's copy. Refused with the stale-move
 * text when the item is no longer where the player saw it, or either record is
 * gone; refused with the placement rule's own words when the destination has no
 * room for it now.
 */
export function lubecMovePlan(from: LubecMoveRecord, to: LubecMoveRecord, move: LubecMove): LubecMovePlan {
  const taken = takeOut(from, move)
  if (!taken) return { ok: false, msg: LUBEC_STALE_MOVE }
  const put = putIn(to, taken, move)
  return put.ok ? { ok: true, from: taken.rest, to: put.to, item: put.item } : put
}
