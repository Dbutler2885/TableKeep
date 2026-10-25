import type { LubecCharacterSheet, LubecStoredEntry } from './characterRecord'
import { LUBEC_ADVANTAGE_MODES, describeLubecDice, keptLubecRoll, rollLubecDice, type LubecAdvantage } from './checkRoll'
import { lubecStressLoweredBy } from './counters'
import { lubecCurrentValue } from './derivations'
import type { LubecDice } from './dice'
import { lubecActiveModifiers } from './effects'
import { areFaces, isCount, isFace, isOneOf, readLubecRollFields, type LubecRollFieldChecks } from './rollFields'
import { LUBEC_SAVES, type LubecSave } from './sheet'

// The Recovery Save: a d100 at or under the lowest current Save. A success
// lowers Stress by the ones digit of the roll, never below Minimum Stress; a
// failure adds 1 Stress, like any other failed roll. It cannot be rolled while
// any Save is a hole, because the lowest Save cannot be known.

export type LubecRecoveryRoll = {
  kind: 'recovery'
  /** The lowest current Save, the first of a tie. */
  against: LubecSave
  target: number
  /** Every d100 rolled: one, or two under Advantage or Disadvantage. */
  dice: number[]
  result: number
  advantage: LubecAdvantage
  outcome: 'success' | 'failure'
  stressAdded: number
  /** How far a success lowered Stress. */
  stressRemoved: number
}

type LubecLowestSave = { name: LubecSave; value: number }

/** The lowest current Save, the first of a tie; null while any Save is a hole. */
export function lubecLowestSave(sheet: LubecCharacterSheet): LubecLowestSave | null {
  const modifiers = lubecActiveModifiers(sheet.effects)
  const saves = LUBEC_SAVES.map((name) => ({ name, value: lubecCurrentValue(sheet, name, modifiers) }))
  if (saves.some((save) => save.value === null)) return null
  return (saves as LubecLowestSave[]).reduce((lowest, save) => (save.value < lowest.value ? save : lowest))
}

/** A Recovery Save rolled with the dice; null while any Save is a hole. */
export function rollLubecRecovery(sheet: LubecCharacterSheet, advantage: LubecAdvantage, dice: LubecDice): LubecRecoveryRoll | null {
  const lowest = lubecLowestSave(sheet)
  if (!lowest) return null
  const rolled = rollLubecDice(100, advantage, dice)
  const result = keptLubecRoll(rolled, advantage)
  const success = result <= lowest.value
  const stressRemoved = success ? sheet.counters.stress - lubecStressLoweredBy(sheet.counters, result % 10) : 0
  return {
    kind: 'recovery',
    against: lowest.name,
    target: lowest.value,
    dice: rolled,
    result,
    advantage,
    outcome: success ? 'success' : 'failure',
    stressAdded: success ? 0 : 1,
    stressRemoved,
  }
}

const RECOVERY_ROLL_FIELDS: LubecRollFieldChecks<LubecRecoveryRoll> = {
  kind: (value) => value === 'recovery',
  against: isOneOf(LUBEC_SAVES),
  target: isCount,
  dice: areFaces(100),
  result: isFace(100),
  advantage: isOneOf(LUBEC_ADVANTAGE_MODES),
  outcome: isOneOf(['success', 'failure']),
  stressAdded: isCount,
  stressRemoved: isCount,
}

/** A stored last roll as a Recovery Save, or null when it does not read as one. */
export const readLubecRecoveryRoll = (entry: LubecStoredEntry | null): LubecRecoveryRoll | null =>
  readLubecRollFields(entry, RECOVERY_ROLL_FIELDS)

/** "Rolled 13 vs 20". */
export const describeLubecRecoveryDice = (roll: LubecRecoveryRoll): string => describeLubecDice(roll, `${roll.target}`)
