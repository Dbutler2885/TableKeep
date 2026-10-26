// A weapon's minimum Strength, from the carrying plan ("Weapons: base Impact
// and minimum Strength", decided 2026-10-18): 10 Handle off an attack with it
// for each step between the tens digit of its minimum and the tens digit of
// the wielder's Strength. It has no cap, and the table can override it. Gear
// works the penalty out; Core owns Strength and Handle (spec 5.2, row 12).

import { lubecCurrentValue, lubecEffectiveHandle } from '../derivations'
import { lubecActiveModifiers } from '../effects'
import type { LubecCharacterSheet } from '../characterRecord'
import type { LubecSheet } from '../sheet'
import type { LubecGear, LubecItem } from './gearRecord'

/** What a weapon card needs of the character: current Strength and Effective Handle, each null when it is a hole. */
export type LubecWielder = { strength: number | null; handle: number | null }

/** The wielder's Strength and Effective Handle, with the active effects' modifiers. */
export function lubecWielder(sheet: LubecSheet & Pick<LubecCharacterSheet, 'effects'>): LubecWielder {
  const modifiers = lubecActiveModifiers(sheet.effects)
  return { strength: lubecCurrentValue(sheet, 'Strength', modifiers), handle: lubecEffectiveHandle(sheet, modifiers) }
}

const tens = (n: number) => Math.floor(n / 10)

type Weapon = Pick<LubecItem, 'minStrength' | 'handlePenaltyOverride'>

/** The Handle the weapon's minimum Strength takes off, as worked out: 0 with no minimum, null when Strength is a hole. */
export function lubecComputedMinStrengthPenalty(item: Weapon, strength: number | null): number | null {
  if (item.minStrength === undefined) return 0
  if (strength === null) return null
  return 10 * Math.max(0, tens(item.minStrength) - tens(strength))
}

/** The Handle the weapon's minimum Strength takes off an attack with it: the table's number when it says one, else the worked-out one. */
export const lubecMinStrengthPenalty = (item: Weapon, strength: number | null): number | null =>
  item.handlePenaltyOverride ?? lubecComputedMinStrengthPenalty(item, strength)

/** The Handle an attack with the weapon rolls under: Effective Handle less the penalty; null when either is a hole. */
export const lubecWeaponHandle = (handle: number | null, penalty: number | null): number | null =>
  (handle === null || penalty === null ? null : handle - penalty)

/** "Cannot handle this": the penalty has taken the weapon's Handle to 0 or below. What a roll under it does is still open. */
export const lubecCannotHandle = (weaponHandle: number | null): boolean => weaponHandle !== null && weaponHandle <= 0

/** The gear with the table's own penalty on the weapon `itemId`; null clears it, and the worked-out one counts again. */
export const lubecWithTableSays = (gear: LubecGear, itemId: string, penalty: number | null): LubecGear =>
  ({ ...gear, items: gear.items.map((x) => (x.id === itemId ? { ...x, handlePenaltyOverride: penalty } : x)) })
