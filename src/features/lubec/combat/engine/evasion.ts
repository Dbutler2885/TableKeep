import type { LubecCharacterSheet } from '../../../ruleSets/lubec/characterRecord'
import { lubecCurrentValue } from '../../../ruleSets/lubec/derivations'
import type { LubecAttackChoice } from '../../../ruleSets/lubec/gear/weaponAttacks'
import type { CombatLog } from './combatFeedback'
import type { CombatEntropy } from './commandEntropy'
import { combatInputModifiers } from './inputModifiers'
import type { Combatant, CombatEvasion, CombatSheet, CombatState } from './types'

// Evasive Movement (settled rules, lubec-rules-compendium "Movement and ranged combat"): a Movement
// choice that uses the round's action. The evader rolls Speed; only a success counts, and anyone
// making a ranged attack at them that round takes a Handle penalty of 10 x half its tens digit,
// rounded down, so 0 to -40. Dodgeballs stay answered by Defense, not Evasive.

const NO_EVASIVE = /no evasive movement/i

/** A wound or effect that says No Evasive Movement stops its bearer choosing it while it lasts. */
export function evasionBlocked(sheet: LubecCharacterSheet): string | null {
  const effect = sheet.effects.find((entry) => entry.steps.some((step) => step.labels.some((label) => NO_EVASIVE.test(label))))
  return effect ? `${effect.name} says No Evasive Movement.` : null
}

/** 10 x half the successful roll's tens digit, rounded down; a failed roll gives nothing. */
export const evasionPenalty = (roll: number, success: boolean): number =>
  (success ? 10 * Math.floor(Math.floor((roll % 100) / 10) / 2) : 0)

/** Speed as the sheet stands this round, or the fight's own copy when the sheet cannot be read. */
function speedOf(combatant: Combatant, record: CombatSheet | null, context: { fightId: string; round: number }): number {
  if (!record) return combatant.speed
  return lubecCurrentValue(record.sheet, 'Speed', combatInputModifiers(record.sheet, context)) ?? combatant.speed
}

/** The evader's Speed roll, at or under Speed, as Movement settles. */
export function rollEvasion(combatant: Combatant, record: CombatSheet | null, context: { fightId: string; round: number }, entropy: CombatEntropy): CombatEvasion {
  const speed = speedOf(combatant, record, context)
  const roll = entropy.die('evasion', 100)
  const success = roll <= speed
  return { roll, speed, success, penalty: evasionPenalty(roll, success) }
}

const pad = (value: number): string => String(value).padStart(2, '0')

export function evasionLog(combatant: Combatant, evasion: CombatEvasion): CombatLog {
  return {
    event: `${combatant.name} moved evasively.`, actor: combatant.key,
    roll: {
      who: combatant.name, what: 'Evasive Movement · Speed', roll: pad(evasion.roll), target: `under ${evasion.speed}`,
      tone: evasion.success ? 'ok' : 'bad', result: evasion.success ? `Ranged attacks −${evasion.penalty}` : 'No penalty',
      extra: 'Uses the action: no attack this round.',
    },
  }
}

/** A ranged attack Evasive answers: anything thrown or shot but a Dodgeball, which Defense answers instead. */
const evadable = (choice: LubecAttackChoice | null | undefined): boolean => choice?.ranged === true && choice.wound !== 'dodgeball'

/** The target's Speed roll this round, if they moved evasively. */
const evasionOf = (state: CombatState, targetKey: string | null | undefined): CombatEvasion | null =>
  state.combatants.find((entry) => entry.key === targetKey)?.movement?.evasion ?? null

/** What a ranged attack at this target takes from its Evasive Movement this round: only a successful roll counts. */
export function evasionFor(state: CombatState, targetKey: string | null | undefined, choice: LubecAttackChoice | null | undefined): CombatEvasion | null {
  const evasion = evadable(choice) ? evasionOf(state, targetKey) : null
  return evasion?.success ? evasion : null
}
