// Gloves (Rule E6) and the attack's Handle (spec 5.4). Armor on a hand takes
// 10 Handle a layer off an attack made with that hand; exclusive armor counts
// every layer of the hand (B marks this a guess). A two-handed weapon, or
// Fisticuffs with both hands, takes the worse hand, never the sum. The
// attack's Handle is a list of terms so the fight modal can show what it
// added: Effective Handle, less the weapon's minimum Strength penalty, less
// the gloves, with zero terms left out. Pure: gear in.

import { layersUsed } from './armorLayers'
import type { LubecGear, LubecItem } from './gearRecord'
import { RULES } from './gearRules'
import type { LubecHands } from './held'
import { lubecCannotHandle, lubecMinStrengthPenalty, type LubecWielder } from './minStrength'

/** Hand slot 0 is the body map's left hand and slot 1 its right, as B names them both "Left hand" and "Right hand". */
export const LUBEC_HAND_LOCS = ['hand-L', 'hand-R'] as const

const handPenaltyAt = (gear: LubecGear, slot: 0 | 1): number => RULES.handArmorHandle * layersUsed(gear, LUBEC_HAND_LOCS[slot])

/** The Handle the gloves take off an attack made with `hands`: 10 a layer, the worse hand for both. */
export function lubecHandPenalty(gear: LubecGear, hands: LubecHands): number {
  if (hands === 'both') return Math.max(handPenaltyAt(gear, 0), handPenaltyAt(gear, 1))
  return handPenaltyAt(gear, hands === 'left' ? 0 : 1)
}

/** One term of an attack's Handle; null when it is worked out from a hole. */
export type LubecHandleTerm = { term: 'handle' | 'min-strength' | 'gloves'; value: number | null }

/** An attack's Handle: its terms in order, what they come to (null while one is a hole), and whether it is 0 or less. */
export type LubecAttackHandle = { terms: LubecHandleTerm[]; total: number | null; cannotHandle: boolean }

/** What an attack is made with: the weapon (none for Fisticuffs) and the hands that hold it. */
export type LubecAttackWith = { weapon: Pick<LubecItem, 'minStrength' | 'handlePenaltyOverride'> | null; hands: LubecHands }

const totalOf = ([first, ...penalties]: readonly LubecHandleTerm[]): number | null =>
  penalties.reduce<number | null>((n, t) => (n === null || t.value === null ? null : n - t.value), first.value)

/** The attack's Handle as terms: Effective Handle, less the minimum Strength penalty and the gloves, a zero penalty left out. */
export function lubecAttackHandle(wielder: LubecWielder, gear: LubecGear, using: LubecAttackWith): LubecAttackHandle {
  const penalties: LubecHandleTerm[] = [
    { term: 'min-strength', value: using.weapon ? lubecMinStrengthPenalty(using.weapon, wielder.strength) : 0 },
    { term: 'gloves', value: lubecHandPenalty(gear, using.hands) },
  ]
  const terms = [{ term: 'handle' as const, value: wielder.handle }, ...penalties.filter((t) => t.value !== 0)]
  const total = totalOf(terms)
  return { terms, total, cannotHandle: lubecCannotHandle(total) }
}
