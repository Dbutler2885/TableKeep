// The Weapon step, from Gear (spec 10.6), copied from the attack prototype's
// renderStep0: a cell for each hand or one for both, Fisticuffs after them, and
// each card's line (B's weaponLine). Fisticuffs needs a free hand. With both
// hands full it is greyed and each thing held can be dropped, which is free.

import type { LubecGear, LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecAttackHandle, type LubecAttackHandle } from '../../ruleSets/lubec/gear/handPenalty'
import { lubecFisticuffsHands, lubecFreeHands, lubecHeld, type LubecHands, type LubecHeld } from '../../ruleSets/lubec/gear/held'
import type { LubecWielder } from '../../ruleSets/lubec/gear/minStrength'
import { HAND_NAMES } from '../lubecHandChips'
import { LUBEC_FISTICUFFS_ID } from './lubecFightRequest'

/** One cell of the picks: what a hand holds, or that it is free. */
export type LubecFightCell =
  | { kind: 'held'; where: string; held: LubecHeld; item: LubecItem; line: string; attack: LubecAttackHandle | null; droppable: boolean }
  | { kind: 'free'; where: string }

/** The Fisticuffs card: offered with what it comes to, or greyed with why. */
export type LubecFightFists = { offered: true; attack: LubecAttackHandle } | { offered: false }

const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`)

/** B's weaponLine: "Impact +1 · min Str 40 · 3 of 6 loaded", and "Not a weapon" for anything else. */
export function lubecWeaponLine(item: LubecItem): string {
  if (item.kind !== 'weapon') return 'Not a weapon'
  const bits = [`Impact ${signed(item.impact ?? 0)}`]
  if (item.minStrength) bits.push(`min Str ${item.minStrength}`)
  if (item.mode === 'firearm') bits.push(`${item.loaded ?? 0} of ${item.capacity ?? 0} loaded`)
  return bits.join(' · ')
}

type Reading = { gear: LubecGear; wielder: LubecWielder; droppable: boolean }

function heldCell({ gear, wielder, droppable }: Reading, held: LubecHeld, item: LubecItem): LubecFightCell {
  const attack = held.weapon ? lubecAttackHandle(wielder, gear, { weapon: item, hands: held.hands }) : null
  return { kind: 'held', where: HAND_NAMES[held.hands], held, item, line: lubecWeaponLine(item), attack, droppable }
}

function handCell(r: Reading, held: LubecHeld | undefined, hands: LubecHands): LubecFightCell {
  const item = held && r.gear.items.find((i) => i.id === held.itemId)
  return held && item ? heldCell(r, held, item) : { kind: 'free', where: HAND_NAMES[hands] }
}

/** The picks, left hand first, or one cell for a thing in both hands. */
export function lubecFightCells(gear: LubecGear, wielder: LubecWielder): LubecFightCell[] {
  const r = { gear, wielder, droppable: lubecFreeHands(gear) === 0 }
  const held = lubecHeld(gear)
  const both = held.find((h) => h.hands === 'both')
  if (both) return [handCell(r, both, 'both')]
  return (['left', 'right'] as const).map((hands) => handCell(r, held.find((h) => h.hands === hands), hands))
}

export function lubecFightFists(gear: LubecGear, wielder: LubecWielder): LubecFightFists {
  const hands = lubecFisticuffsHands(gear)
  return hands ? { offered: true, attack: lubecAttackHandle(wielder, gear, { weapon: null, hands }) } : { offered: false }
}

/** The weapon chosen, as the trail names it, while it can still be fought with; null once it has left the hands or the hands fill up. */
export function lubecChosenWeaponName(gear: LubecGear, weaponId: string | null): string | null {
  if (weaponId === LUBEC_FISTICUFFS_ID) return lubecFreeHands(gear) > 0 ? 'Fisticuffs' : null
  return lubecHeld(gear).find((h) => h.itemId === weaponId && h.weapon)?.name ?? null
}
