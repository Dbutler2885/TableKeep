// The words the On you view shows for an item and a place, copied from the
// inventory prototype (B's subLine, weightTag, qtyText and whereText).

import { bothHands } from '../../ruleSets/lubec/gear/placement'
import { holdWay, locSummary } from '../../ruleSets/lubec/gear/gearRules'
import { emptyLubecGear, LUBEC_BACKPACK_POCKETS, lubecHasPlace, type LubecGear, type LubecItem, type LubecSupply } from '../../ruleSets/lubec/gear/gearRecord'
import { MAX_STACKS, slotsText, stacksOf } from '../../ruleSets/lubec/gear/stacks'
import { lubecCarrierWhere } from './carrierLabels'

/** A supply's name from its id, or "no supply". */
export type LubecSupplyName = (id: string | undefined) => string

/** A gun or holder names its supply by id (Rule L1): the name among `supplies` (the game's and the player's), or "no supply". */
export const supplyNameIn = (supplies: readonly LubecSupply[]): LubecSupplyName => (id) =>
  supplies.find((s) => s.id === id)?.name ?? 'no supply'

export const SLOT_NAMES: Readonly<Record<'hands' | 'body', readonly [string, string]>> = { hands: ['Left hand', 'Right hand'], body: ['Body', 'Body'] }

export const qtyText = (i: Pick<LubecItem, 'qty'>): string => (i.qty !== 1 ? `×${i.qty}` : '')

/** The class a heavy or extra heavy item's box takes. */
export const heavyClass = (i: Pick<LubecItem, 'weight'>): string => (i.weight !== 'normal' ? ' heavy' : '')

/** The class a 4-slot thing's box takes, which stacks its picture over its words. */
export const largeClass = (i: Pick<LubecItem, 'size'>): string => (i.size === 4 ? ' large' : '')

/** The class a 2-slot thing standing in two boxes one above the other takes (`at` is the boxes it sits in). */
export const uprightClass = (i: Pick<LubecItem, 'size'>, at: readonly number[]): string => (i.size === 2 && at[1] - at[0] === 2 ? ' upright' : '')

/** The weight's tag, or null for a normal one. */
export const weightTagText = (i: Pick<LubecItem, 'weight'>): string | null => {
  if (i.weight === 'heavy') return 'Heavy'
  return i.weight === 'extra' ? 'Extra heavy' : null
}

const loadedText = (i: LubecItem) => `${i.loaded ?? 0} of ${i.capacity ?? 0}`

function holderLine(i: LubecItem, supplyName: LubecSupplyName): string {
  const way = holdWay(i)
  if (way === 'load') return `${loadedText(i)} loaded`
  if (!i.loaded) return 'Empty'
  return way === 'fill' ? `${supplyName(i.takes)}, ${loadedText(i)}` : `${loadedText(i)} inside`
}

/** The line under an item's name: what is loaded, what is left, or how many. Empty when there is nothing to say. */
export function subLine(i: LubecItem, supplyName: LubecSupplyName): string {
  if (i.kind === 'weapon' && i.mode === 'firearm') return `${loadedText(i)} loaded`
  if (i.kind === 'holder') return holderLine(i, supplyName)
  if (i.kind === 'consumable') return `${i.qty} left`
  return qtyText(i)
}

function backpackWhere(i: LubecItem): string {
  if (i.pocket == null) return 'Backpack, small stuff'
  return `Backpack, ${(LUBEC_BACKPACK_POCKETS[i.pocket]?.name ?? '').toLowerCase()}`
}

/** Where an item is listed when its place cannot be read: no such carrier, or a slot or pocket out of range. */
export const LUBEC_NEEDS_A_PLACE = 'Needs a place'

const ON_YOU_WHERE: Readonly<Record<string, (i: LubecItem) => string>> = {
  backpack: backpackWhere,
  hands: (i) => (bothHands(i) ? 'Both hands' : SLOT_NAMES.hands[i.slot ?? 0]),
  worn: (i) => `Worn: ${locSummary(i.locs ?? []).toLowerCase()}`,
  body: () => 'Body slot',
}

// A thing on a sheet with no personal carriers can only be on you.
const NO_CARRIERS = emptyLubecGear()

/**
 * Where an item is, in words: "Backpack, main pocket", "Left hand", "Body slot", "Worn: head", or in one of
 * `gear`'s personal carriers, "Duffel bag". An item whose place cannot be read "Needs a place".
 */
export function whereText(i: LubecItem, gear: LubecGear = NO_CARRIERS): string {
  if (!lubecHasPlace(gear, i)) return LUBEC_NEEDS_A_PLACE
  if (Object.hasOwn(ON_YOU_WHERE, i.carrier)) return ON_YOU_WHERE[i.carrier](i)
  return lubecCarrierWhere(gear.carriers.find((c) => c.id === i.carrier) as LubecGear['carriers'][number], i.pocket)
}

/** B's toast after an add: where the item went, or how many stacks it made; `gear` is the gear it went into. */
export function addedToast(first: LubecItem, stacks: number, gear: LubecGear = NO_CARRIERS): string {
  const where = whereText(first, gear)
  return stacks > 1 ? `${first.name}: ${stacks} stacks, ${where.toLowerCase()}.` : `${first.name}: ${where}.`
}

/** The add form's line under the size: what each size means (B's SIZE_HINT). */
export const SIZE_HINT: Readonly<Record<number, string>> = {
  0: 'Small: takes no slot in a bag.',
  1: '1 slot: normal.',
  2: '2 slots: bulky, takes both hands.',
  4: '4 slots: large.',
  8: '8 slots: huge, never in the backpack.',
}

/** The count line: in plain words, how many stacks the count makes and how many slots they take (B's syncCount). */
export function countNote(qty: number, per: number, size: number): { text: string; warn: boolean } {
  if (size === 0) return { text: 'Small things take no slot in a bag, however many.', warn: false }
  const st = stacksOf(qty, per, size)
  if (st.length > MAX_STACKS) return { text: `That makes ${st.length} stacks. Keep it to ${MAX_STACKS} or fewer, or fit more in each slot.`, warn: true }
  if (st.length === 1) return { text: `One stack: ${slotsText(size)}.`, warn: false }
  const last = st[st.length - 1]
  const lastNote = last < per ? ` The last stack holds ${last}.` : ''
  return { text: `${qty} in all makes ${st.length} stacks, each taking ${slotsText(size)}: ${slotsText(st.length * size)} in all.${lastNote}`, warn: false }
}
