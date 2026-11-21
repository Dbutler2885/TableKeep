import type { LubecCharacterSheet } from '../../../ruleSets/lubec/characterRecord'
import { keptLubecRoll, lubecFailedCheckStress } from '../../../ruleSets/lubec/checkRoll'
import { lubecCurrentValue } from '../../../ruleSets/lubec/derivations'
import { lubecStepRestrictions } from '../../../ruleSets/lubec/effects'
import { combatRollMode } from './combatModes'
import { combatActiveEffects, combatInputModifiers, type CombatInputRound } from './inputModifiers'
import type { CombatEntropy } from './commandEntropy'
import type { CombatSheet, CombatStand } from './types'

/** Only current, active down steps block running and offer standing. */
export const downCards = (sheet: LubecCharacterSheet, context: CombatInputRound | null) =>
  combatActiveEffects(sheet, context).filter((effect) => effect.afterCombat === undefined && effect.steps[0] && lubecStepRestrictions(effect.steps[0]).some((restriction) => restriction.kind === 'down'))

/** Standing uses a core-style Speed Check, with all previous Speed and Physical modes. */
export function rollStand(record: CombatSheet, context: CombatInputRound, entropy: CombatEntropy): CombatStand {
  const target = lubecCurrentValue(record.sheet, 'Speed', combatInputModifiers(record.sheet, context))
  if (target === null) throw new Error('Fill in Speed before standing.')
  const mode = combatRollMode(record, { kind: 'stand', stat: 'Speed' }, context)
  const dice = Array.from({ length: mode.mode === 'normal' ? 1 : 2 }, () => entropy.die(`stand:${record.kind}:${record.sheetId}`, 100))
  const result = keptLubecRoll(dice, mode.mode)
  const success = result <= target
  return { target, dice, result, success, stress: success ? 0 : lubecFailedCheckStress(record.sheet), ...mode }
}
