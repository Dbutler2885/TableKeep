// The words the item card, the stock picker and the form show, copied from
// the inventory prototype (B): the wound and table names, a stock entry's
// one line, the kinds' blurbs, the weight hint and the "Put it" choices.

import { bodyTaken, handsTaken, pocketUsed } from '../../ruleSets/lubec/gear/placement'
import { HOLD, KIND_NAMES, locSummary, RULES } from '../../ruleSets/lubec/gear/gearRules'
import { LUBEC_BACKPACK_POCKETS, type LubecGear, type LubecItem, type LubecItemKind, type LubecItemWeight, type LubecWoundKind } from '../../ruleSets/lubec/gear/gearRecord'
import type { LubecStockItem } from '../../ruleSets/lubec/gear/stock'
import type { LubecSupplyName } from './gearLabels'

// Rule A2. Armor is rated against each kind of wound, so a part has four numbers, never one.
export const WOUNDS: Readonly<Record<LubecWoundKind, string>> = { cut: 'Cutting', pierce: 'Piercing', blunt: 'Blunt', gun: 'Gunshot' }
export const WOUND_SHORT: Readonly<Record<LubecWoundKind, string>> = { cut: 'Cut', pierce: 'Pierce', blunt: 'Blunt', gun: 'Gun' }
export const WOUND_KINDS = Object.keys(WOUNDS) as LubecWoundKind[]

/** The ways a weapon wounds; one stored with none wounds as its mode does, a firearm by gunshot and anything else blunt. */
export const woundsOf = (x: Partial<LubecItem>): LubecWoundKind[] => (x.wounds?.length ? x.wounds : [x.mode === 'firearm' ? 'gun' : 'blunt'])

export const armorVs = (a: Pick<LubecItem, 'armor'>, w: LubecWoundKind): number => a.armor?.[w] ?? 0
export const armorText = (n: number): string => (n ? `−${n}` : '0')
/** The kinds a piece actually stops, for short labels: "Cut −1, Blunt −1". */
export const armorSome = (get: (w: LubecWoundKind) => number): string[] =>
  WOUND_KINDS.filter((w) => get(w)).map((w) => `${WOUND_SHORT[w]} ${armorText(get(w))}`)
/** Every kind's number, for the card: "Cutting −1, Piercing 0, ...". */
export const armorAll = (a: Pick<LubecItem, 'armor'>): string => WOUND_KINDS.map((w) => `${WOUNDS[w]} ${armorText(armorVs(a, w))}`).join(', ')

export const TABLES: Readonly<Record<string, string>> = { blunt: 'Blunt Force', gunshot: 'Gunshot', fisticuffs: 'Fisticuffs', none: 'No table yet' }
export const WEIGHT_NAMES: Readonly<Record<LubecItemWeight, string>> = { normal: 'Normal', heavy: 'Heavy', extra: 'Extra heavy' }

/** A signed number as B writes it in a sum: "+ 1", "− 1". */
export const sgn = (n: number): string => (n < 0 ? `− ${-n}` : `+ ${n}`)

/** The kind tiles' one line each. */
export const KIND_TILE: Readonly<Record<LubecItemKind, string>> = {
  thing: 'Clothes, keys, a map. Bookkeeping.',
  weapon: 'Melee or firearm, with Impact and a table.',
  armor: 'Worn. Covers parts and stops wounds.',
  consumable: 'Counts down, like food. Loose rounds too.',
  holder: 'Loaded or filled, and stays when empty.',
}

/** The stock picker's line beside each kind's heading. */
export const KIND_BLURB: Readonly<Record<LubecItemKind, string>> = {
  thing: 'Clothes, keys, a map', weapon: 'Melee or firearm', armor: 'Worn on the body', consumable: 'Counts down; loose rounds too', holder: 'Loaded or filled; stays when empty',
}

const sizeWord = (size: number) => (size === 0 ? 'Small' : `${size} slot${size > 1 ? 's' : ''}`)

// A weapon's table; one with none stored follows its wound (spec 5.7, D16), so its line says nothing of it.
const tableWord = (table: string | undefined) => {
  if (table === undefined) return ''
  return `${table === 'none' ? 'no table yet' : TABLES[table]} / `
}

const weaponLine = (x: LubecStockItem) => `${tableWord(x.table)}Impact ${sgn(x.impact ?? 0)}${x.mode === 'firearm' ? `, holds ${x.capacity}` : ' + Str'}`

const consumableLine = (x: LubecStockItem, supplyName: LubecSupplyName) =>
  `×${x.qty}${x.per ? `, ${x.per} fit in a slot` : ''}${x.fits ? `, ${supplyName(x.fits)}` : ''}`

const STOCK_LINES: Readonly<Record<LubecItemKind, (x: LubecStockItem, supplyName: LubecSupplyName) => string>> = {
  thing: (x) => sizeWord(x.size),
  weapon: (x) => `${sizeWord(x.size)} / ${weaponLine(x)}`,
  armor: (x) => `${armorSome((w) => armorVs(x, w)).join(', ') || 'No armor'} / ${locSummary(x.locs ?? [])}`,
  consumable: (x, supplyName) => `${sizeWord(x.size)} / ${consumableLine(x, supplyName)}`,
  holder: (x, supplyName) => `${sizeWord(x.size)} / ${HOLD[x.hold ?? 'load'].name}: ${supplyName(x.takes)}, holds ${x.capacity}`,
}

/** A stock entry's one line: its size and what makes it that kind. */
export const stockLine = (x: LubecStockItem, supplyName: LubecSupplyName): string => STOCK_LINES[x.kind](x, supplyName)

/** The line under the weight: what each weight does on you (Rules E1, E2 and W3). */
export function weightHint(w: LubecItemWeight): string {
  if (w === 'normal') return 'Normal: no effect.'
  if (w === 'heavy') return `Heavy: takes both hands to hold. Roll Strength when it comes onto you. Fail: Speed −${RULES.heavyFail}.`
  return `Extra heavy: takes both hands to hold. Roll Strength. Pass: Speed −${RULES.extraPass}, always. Fail: you can't carry it.`
}

/** A stock entry's kind and line, under its name in the suggestions. */
export const suggestLine = (x: LubecStockItem, supplyName: LubecSupplyName): string => `${KIND_NAMES[x.kind]} / ${stockLine(x, supplyName)}`

export type LubecDestination = { value: string; label: string }

const POCKET_SHORT = ['main pocket', 'front left', 'front right']

/** The places on you the form's "Put it" offers, with what is free in each; armor can be worn too (Rule W5). */
export function lubecDestinations(gear: LubecGear, kind: LubecItemKind): LubecDestination[] {
  const pockets = LUBEC_BACKPACK_POCKETS.map((p, k) => ({
    value: `backpack#${k}`,
    label: `Backpack: ${POCKET_SHORT[k]} (${p.slots - pocketUsed(gear, 'backpack', k)} of ${p.slots} free)`,
  }))
  return [
    ...(kind === 'armor' ? [{ value: 'worn', label: 'Wear it' }] : []),
    ...pockets,
    { value: 'backpack#small', label: 'Backpack: small stuff (no slot)' },
    { value: 'hands', label: `Hands (${2 - handsTaken(gear).size} free)` },
    { value: 'body', label: `Body (${2 - bodyTaken(gear).size} free)` },
  ]
}

/** The "Put it" choice a place reads as: "hands", not "hands#1". */
export const selectValue = (dest: string): string => {
  const [cid, sub] = dest.split('#')
  if (cid === 'backpack') return sub === undefined ? 'backpack#0' : dest
  return cid
}

/** Where an item is, as a place the form and the placement rule read: "backpack#small", "backpack#1", "hands#1". */
export function destOf(i: LubecItem): string {
  if (i.carrier === 'backpack') return i.pocket == null ? 'backpack#small' : `backpack#${i.pocket}`
  return i.slot === undefined ? i.carrier : `${i.carrier}#${i.slot}`
}
