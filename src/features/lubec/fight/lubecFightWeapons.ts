// The Weapon step, from Gear (spec 10.6), copied from the attack prototype's
// renderStep0: a cell for each hand or one for both, Fisticuffs after them, and
// each card's line (B's weaponLine). Trained fighters may Kick with full hands;
// otherwise Fisticuffs needs a free hand. Dropping a held thing is free.

import { lubecCatchLine } from '../gear/catchLabels'
import type { LubecGear, LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecAttackHandle, type LubecAttackHandle } from '../../ruleSets/lubec/gear/handPenalty'
import { lubecFisticuffsHands, lubecFreeHands, lubecHeld, lubecHeldUnusable, type LubecHands, type LubecHeld } from '../../ruleSets/lubec/gear/held'
import { LUBEC_FREE_HANDS, lubecHandUnusable, type LubecHandLimits } from '../../ruleSets/lubec/handLimits'
import type { LubecWielder } from '../../ruleSets/lubec/gear/minStrength'
import { lubecWeaponAttacks, type LubecAttackChoice } from '../../ruleSets/lubec/gear/weaponAttacks'
import { HAND_NAMES } from '../lubecHandChips'
import { LUBEC_FISTICUFFS_ID } from './lubecFightRequest'

/** One cell of the picks: what a hand holds, or that it is free. */
export type LubecFightCell =
  | { kind: 'held'; where: string; held: LubecHeld; item: LubecItem; line: string; attack: LubecAttackHandle | null; droppable: boolean; unusable: string | null }
  | { kind: 'free'; where: string; unusable: string | null }

/** The Fisticuffs card: offered with what it comes to, or greyed with why. */
export type LubecFightFists = { offered: true; attack: LubecAttackHandle; line: string } | { offered: false }

const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`)

const minimumLine = (item: LubecItem): string[] => item.minStrength ? [`min Str ${item.minStrength}`] : []

const roundsLine = (item: LubecItem): string[] =>
  item.mode === 'firearm' ? [`${item.loaded ?? 0} of ${item.capacity ?? 0} loaded`] : []

/** B's weaponLine: "Impact +1 · min Str 40 · 3 of 6 loaded", and "Not a weapon" for anything else. */
export function lubecWeaponLine(item: LubecItem): string {
  if (item.kind !== 'weapon') return 'Not a weapon'
  return [`Impact ${signed(item.impact ?? 0)}`, ...minimumLine(item), ...roundsLine(item), ...thrownLine(item)].join(' · ')
}

const thrownLine = (item: LubecItem): string[] => item.mode === 'thrown' ? ['Thrown', ...lubecCatchLine(item)] : lubecCatchLine(item)

type Reading = { gear: LubecGear; wielder: LubecWielder; droppable: boolean; limits: LubecHandLimits }

function heldCell({ gear, wielder, droppable, limits }: Reading, held: LubecHeld, item: LubecItem): LubecFightCell {
  const unusable = lubecHeldUnusable(held, limits)
  const attack = held.weapon && !unusable ? lubecAttackHandle(wielder, gear, { weapon: item, hands: held.hands }) : null
  return { kind: 'held', where: HAND_NAMES[held.hands], held, item, line: lubecWeaponLine(item), attack, droppable, unusable }
}

function handCell(r: Reading, held: LubecHeld | undefined, hands: LubecHands): LubecFightCell {
  const item = held && r.gear.items.find((i) => i.id === held.itemId)
  return held && item ? heldCell(r, held, item) : { kind: 'free', where: HAND_NAMES[hands], unusable: lubecHandUnusable(r.limits, hands === 'left' ? 0 : 1) }
}

/** The picks, left hand first, or one cell for a thing in both hands; a hand an active card takes out says why. */
export function lubecFightCells(gear: LubecGear, wielder: LubecWielder, limits: LubecHandLimits = LUBEC_FREE_HANDS): LubecFightCell[] {
  const r = { gear, wielder, droppable: lubecFreeHands(gear, limits) === 0, limits }
  const held = lubecHeld(gear)
  const both = held.find((h) => h.hands === 'both')
  if (both) return [handCell(r, both, 'both')]
  return (['left', 'right'] as const).map((hands) => handCell(r, held.find((h) => h.hands === hands), hands))
}

/** The same legal uses drive the card, attack choices and selected-weapon validation: a weapon in a hand out of use has none. */
export function lubecFightAttacks(gear: LubecGear, weaponId: string | null, trained = false, limits: LubecHandLimits = LUBEC_FREE_HANDS): LubecAttackChoice[] {
  if (weaponId === LUBEC_FISTICUFFS_ID) return fisticuffsAttacks(gear, trained, limits)
  const held = lubecHeld(gear).find((entry) => entry.itemId === weaponId)
  const item = gear.items.find((item) => item.id === held?.itemId)
  return item && !lubecHeldUnusable(held!, limits) ? lubecWeaponAttacks(item) : []
}

function fisticuffsAttacks(gear: LubecGear, trained: boolean, limits: LubecHandLimits): LubecAttackChoice[] {
  const attacks = lubecWeaponAttacks(null)
  if (lubecFreeHands(gear, limits) > 0) return attacks
  return trained ? attacks.filter((attack) => attack.feet) : []
}

export function lubecFightFists(gear: LubecGear, wielder: LubecWielder, trained = false, limits: LubecHandLimits = LUBEC_FREE_HANDS): LubecFightFists {
  const attacks = fisticuffsAttacks(gear, trained, limits)
  if (!attacks.length) return { offered: false }
  const hands = lubecFisticuffsHands(gear, limits) ?? 'both'
  return { offered: true, attack: lubecAttackHandle(wielder, gear, { weapon: null, hands }), line: fistsLine(attacks) }
}

/** Resolve an explicit use without silently replacing a now-illegal Punch with Kick. */
export function lubecFightAttack(gear: LubecGear, weaponId: string | null, trained = false, attackId: string | null = null, limits: LubecHandLimits = LUBEC_FREE_HANDS): LubecAttackChoice | null {
  const attacks = lubecFightAttacks(gear, weaponId, trained, limits)
  return attackId === null ? attacks[0] ?? null : attacks.find((attack) => attack.id === attackId) ?? null
}

/** The selected weapon remains valid only while it has a legal use. */
export function lubecChosenWeaponName(gear: LubecGear, weaponId: string | null, trained = false, attackId: string | null = null, limits: LubecHandLimits = LUBEC_FREE_HANDS): string | null {
  if (!lubecFightAttack(gear, weaponId, trained, attackId, limits)) return null
  if (weaponId === LUBEC_FISTICUFFS_ID) return 'Fisticuffs'
  return lubecHeld(gear).find((held) => held.itemId === weaponId)?.name ?? null
}

const fistsLine = (attacks: readonly LubecAttackChoice[]): string => attacks.length === 1 ? 'Kick' : 'Punch or kick'
