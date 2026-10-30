// The words of a move, copied from the inventory prototype (B): the card's
// Move list with its "Swap places" group (`destinationOptions` and
// `swapOptions`), its cost line (`updateMoveCost`), and the toasts after a
// move, a swap, arranging and a drop. A drop now goes to the GM's Items tab,
// so its toast is B's first one, restored (spec 8.3).

import { lubecCostText, lubecCostWord, lubecMoveCost } from '../../ruleSets/lubec/gear/moveCost'
import type { LubecGear, LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecSwapCandidates, lubecSwapCost, lubecSwapItems, lubecSwapWord, type LubecSwapCost } from '../../ruleSets/lubec/gear/swap'
import { lubecCarrierDestinations } from './carrierLabels'
import { whereText } from './gearLabels'
import { destOf, lubecDestinations, selectValue, type LubecDestination } from './itemLabels'

/** The thing by name in a sentence: "the flashlight", but "Grandpa's revolver" and "D batteries" as they are. */
export const theName = (i: Pick<LubecItem, 'name'>): string =>
  (/^[A-Z][a-z]+'s /.test(i.name) ? i.name : `the ${/^[A-Z][a-z]/.test(i.name) ? i.name[0].toLowerCase() + i.name.slice(1) : i.name}`)

export const cap1 = (t: string): string => t[0].toUpperCase() + t.slice(1)

/** The Move list's value for dropping the thing, B's `ground`. */
export const LUBEC_DROP_DEST = 'drop'

const SWAP = 'swap:'

export type LubecMoveOption = LubecDestination & { disabled: boolean }
export type LubecMoveGroup = { label: string; options: LubecMoveOption[] }

// The places a thing can go, less the one it is in.
const awayFrom = (i: LubecItem, places: readonly LubecDestination[]): LubecMoveOption[] => {
  const here = selectValue(destOf(i))
  return places.map((p) => ({ ...p, disabled: p.value === here }))
}

// The card's Move list offers every thing a swap would work with; the ones it wouldn't are greyed out.
const swapOptions = (gear: LubecGear, i: LubecItem): LubecMoveOption[] =>
  lubecSwapCandidates(gear, i).map((o) => ({
    value: `${SWAP}${o.id}`,
    label: `Swap with ${o.name} (${whereText(o, gear).toLowerCase()})`,
    disabled: !lubecSwapItems(gear, i, o).ok,
  }))

/** The card's Move list: the places on you, the personal carriers, dropping it, and the things it can swap with. */
export function lubecMoveGroups(gear: LubecGear, i: LubecItem): LubecMoveGroup[] {
  const swaps = swapOptions(gear, i)
  return [
    { label: 'On you', options: awayFrom(i, lubecDestinations(gear, i.kind)) },
    ...(gear.carriers.length ? [{ label: 'Carriers', options: awayFrom(i, lubecCarrierDestinations(gear)) }] : []),
    { label: 'Elsewhere', options: [{ value: LUBEC_DROP_DEST, label: 'Drop it', disabled: false }] },
    ...(swaps.length ? [{ label: 'Swap places', options: swaps }] : []),
  ]
}

/** The first choice that can be picked, as B's list starts on it. */
export const lubecFirstMove = (groups: readonly LubecMoveGroup[]): string =>
  groups.flatMap((g) => g.options).find((o) => !o.disabled)?.value ?? LUBEC_DROP_DEST

/** The thing a "Swap with" choice names, or null for a place. */
export const lubecSwapOf = (gear: LubecGear, value: string): LubecItem | null =>
  (value.startsWith(SWAP) ? gear.items.find((x) => x.id === value.slice(SWAP.length)) ?? null : null)

/** The line under the Move list: what the move or the swap costs. */
export function lubecMoveCostLine(gear: LubecGear, i: LubecItem, value: string): string {
  const o = lubecSwapOf(gear, value)
  return o ? `Swapping with ${theName(o)}: ${lubecSwapWord(lubecSwapCost(i, o))}.` : lubecCostText(i.carrier, value)
}

/** A refused move, with the way out when the thing could swap instead (Rule M9). */
export const lubecRefusal = (gear: LubecGear, i: LubecItem, msg: string): string =>
  (lubecSwapCandidates(gear, i).length ? `${msg} Or swap it: pick "Swap with" a thing in this list, or drag it onto one.` : msg)

/** The toast after a move: where it is now, in `gear` after the move, and what it cost. */
export function lubecMovedToast(moved: LubecItem, from: string, dest: string, gear?: LubecGear): string {
  const c = lubecMoveCost(from, dest)
  return `${moved.name}: ${whereText(moved, gear)}.${c ? ` ${cap1(lubecCostWord(c))}.` : ''}`
}

/** The toast after a swap: where each is now, in `gear` after the swap, and what it cost. */
export function lubecSwappedToast(a: LubecItem, b: LubecItem, cost: LubecSwapCost | null, gear?: LubecGear): string {
  const w = lubecSwapWord(cost)
  return `${a.name}: ${whereText(a, gear)}. ${b.name}: ${whereText(b, gear)}.${w ? ` ${cap1(w)}.` : ''}`
}

/** The toast after arranging inside the main pocket. */
export const lubecArrangedToast = (i: LubecItem): string => `${i.name}: arranged. Free.`

/** The toast after a drop: it goes to the GM's Items tab (B 2966, restored). */
export const lubecDroppedToast = (i: LubecItem): string => `Dropped ${theName(i)}. It goes to the GM.`
