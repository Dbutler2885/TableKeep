// The words the On you view shows for an item and a place, copied from the
// inventory prototype (B's subLine, weightTag, qtyText and whereText).

import { bothHands } from '../../ruleSets/lubec/gear/placement'
import { holdWay } from '../../ruleSets/lubec/gear/gearRules'
import { LUBEC_BACKPACK_POCKETS, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { MAX_STACKS, slotsText, stacksOf } from '../../ruleSets/lubec/gear/stacks'

/** A supply's name from its id, or "no supply". */
export type LubecSupplyName = (id: string | undefined) => string

export const SLOT_NAMES: Readonly<Record<'hands' | 'body', readonly [string, string]>> = { hands: ['Left hand', 'Right hand'], body: ['Body', 'Body'] }

export const qtyText = (i: Pick<LubecItem, 'qty'>): string => (i.qty !== 1 ? `×${i.qty}` : '')

/** The class a heavy or extra heavy item's box takes. */
export const heavyClass = (i: Pick<LubecItem, 'weight'>): string => (i.weight !== 'normal' ? ' heavy' : '')

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

/** Where an item on you is, in words: "Backpack, main pocket", "Left hand", "Body slot". */
export function whereText(i: LubecItem): string {
  if (i.carrier === 'backpack') return backpackWhere(i)
  if (i.carrier === 'hands') return bothHands(i) ? 'Both hands' : SLOT_NAMES.hands[i.slot ?? 0]
  return 'Body slot'
}

/** B's toast after an add: where the item went, or how many stacks it made. */
export function addedToast(first: LubecItem, stacks: number): string {
  const where = whereText(first)
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
