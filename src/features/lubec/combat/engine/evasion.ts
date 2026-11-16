import { lubecCurrentValue } from '../../../ruleSets/lubec/derivations'
import type { LubecAttackChoice } from '../../../ruleSets/lubec/gear/weaponAttacks'
import type { CombatLog } from './combatFeedback'
import type { CombatEntropy } from './commandEntropy'
import { combatRollMode, modeRecord, modeWords, rollWithMode, successThenHigher } from './combatModes'
import { combatInputModifiers } from './inputModifiers'
import type { Combatant, CombatEvasion, CombatSheet, CombatState } from './types'

// Evasive Movement (settled rules, lubec-rules-compendium "Movement and ranged combat"): a Movement
// choice that uses the round's action. The evader rolls Speed; only a success counts, and anyone
// making a ranged attack at them that round takes a Handle penalty of 10 x half its tens digit,
// rounded down, so 0 to -40. Dodgeballs stay answered by Defense, not Evasive.

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
  // A Speed Check: a card's Speed or Physical mode rolls two dice, a success beating a failure and the higher success taking off more.
  const mode = combatRollMode(record, { kind: 'evasion', stat: 'Speed' }, context)
  const evaluate = (roll: number) => {
    const success = roll <= speed
    return { roll, speed, success, penalty: evasionPenalty(roll, success) }
  }
  const rolled = rollWithMode(entropy, 'evasion', mode.mode, evaluate, successThenHigher)
  return { ...rolled.kept, ...modeRecord(mode, rolled.dice) }
}

const pad = (value: number): string => String(value).padStart(2, '0')

export function evasionLog(combatant: Combatant, evasion: CombatEvasion): CombatLog {
  return {
    event: `${combatant.name} moved evasively.`, actor: combatant.key,
    roll: {
      who: combatant.name, what: 'Evasive Movement · Speed', roll: pad(evasion.roll), target: `under ${evasion.speed}`,
      tone: evasion.success ? 'ok' : 'bad', result: evasion.success ? `Ranged attacks −${evasion.penalty}` : 'No penalty',
      extra: [evasion.dice ? modeWords({ mode: evasion.mode!, because: evasion.because ?? null }, evasion.dice) : null, 'Uses the action: no attack this round.'].filter(Boolean).join(' '),
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
