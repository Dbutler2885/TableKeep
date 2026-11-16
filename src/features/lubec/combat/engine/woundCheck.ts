import { keptLubecRoll, lubecFailedCheckStress, type LubecAdvantage, type LubecCheckKind } from '../../../ruleSets/lubec/checkRoll'
import { lubecCurrentValue, lubecEffectiveHandle } from '../../../ruleSets/lubec/derivations'
import { pad } from './attackFlow'
import type { CombatLog } from './combatFeedback'
import type { CombatEntropy } from './commandEntropy'
import { combatInputModifiers } from './inputModifiers'
import type { CombatCheckRoll, Combatant, CombatSheet, CombatWoundRow } from './types'

/** An ordinary core roll's number: Handle as the sheet caps it, Body as it stands. */
export function checkTarget(record: CombatSheet, against: 'Handle' | 'Body', modifiers: ReturnType<typeof combatInputModifiers>): number {
  return against === 'Handle' ? lubecEffectiveHandle(record.sheet, modifiers)! : lubecCurrentValue(record.sheet, against, modifiers)!
}

const failureStress = (record: CombatSheet, kind: LubecCheckKind): number => (kind === 'save' ? 1 : lubecFailedCheckStress(record.sheet))

/** At or under its number, one die, or two kept by Advantage or Disadvantage. */
export function rollCheck(record: CombatSheet, check: NonNullable<CombatWoundRow['check']>, target: number, entropy: CombatEntropy): CombatCheckRoll {
  const count = check.advantage === 'normal' ? 1 : 2
  const dice = Array.from({ length: count }, () => entropy.die('check', 100))
  const result = keptLubecRoll(dice, check.advantage as LubecAdvantage)
  const success = result <= target
  return { ...check, target, dice, result, success, stress: success ? 0 : failureStress(record, check.kind) }
}

const CHECK_NAMES = { 'stat-check': 'Check', save: 'Save' } as const

export function checkLog(target: Combatant, row: CombatWoundRow, rolled: CombatCheckRoll): CombatLog {
  return {
    event: `${target.name} rolled a ${rolled.against} ${CHECK_NAMES[rolled.kind]}.`, actor: target.key,
    roll: { who: target.name, what: `${rolled.against} ${CHECK_NAMES[rolled.kind]}`, roll: pad(rolled.result), target: `under ${rolled.target}`, tone: rolled.success ? 'ok' : 'bad', result: rolled.success ? 'Success' : 'Failure', extra: row.name },
  }
}

/** The target rolls the row's Check or Save against their own sheet as it stands this round. */
export function rollRowCheck(record: CombatSheet, row: CombatWoundRow, fightId: string, round: number, entropy: CombatEntropy): CombatCheckRoll {
  const modifiers = combatInputModifiers(record.sheet, { fightId, round })
  return rollCheck(record, row.check!, checkTarget(record, row.check!.against, modifiers), entropy)
}
