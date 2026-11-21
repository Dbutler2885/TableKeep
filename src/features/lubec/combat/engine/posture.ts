import type { LubecCharacterSheet } from '../../../ruleSets/lubec/characterRecord'
import { downCards } from './down'
import type { CombatInputRound } from './inputModifiers'
import { combatantOf, combatSheetOf } from './attackParty'
import type { Combatant, CombatRecords, CombatState } from './types'

/** How a fighter is placed: on their feet, or on the ground (knocked down, until a Stand succeeds). */
export type CombatPosture = 'standing' | 'prone'

export const combatPosture = (sheet: LubecCharacterSheet, context: CombatInputRound | null): CombatPosture =>
  (downCards(sheet, context).length ? 'prone' : 'standing')

/**
 * Who may attack whom, by the attacker's posture then the target's.
 * Standing may attack anyone; prone cannot attack someone standing.
 * Prone against prone is closed until the grappling rules arrive; opening it is this one entry.
 */
const POSTURE_ATTACKS: Readonly<Record<CombatPosture, Readonly<Record<CombatPosture, boolean>>>> = {
  standing: { standing: true, prone: true },
  prone: { standing: false, prone: false },
}

export const postureAllowsAttack = (attacker: CombatPosture, target: CombatPosture): boolean => POSTURE_ATTACKS[attacker][target]

/** Why this attacker cannot attack this target from where each is, or null when they can. */
export function postureRefusal(attacker: { name: string; posture: CombatPosture }, target: { name: string; posture: CombatPosture }): string | null {
  if (postureAllowsAttack(attacker.posture, target.posture)) return null
  if (target.posture === 'standing') return `${attacker.name} is on the ground and cannot attack ${target.name}, who is standing.`
  return `${attacker.name} and ${target.name} are both on the ground: attacks on the ground wait for the grappling rules.`
}

/** Refuse an attack the two fighters' postures do not allow, read from their sheets as they are now. */
export function requirePostureAllows(records: CombatRecords, state: CombatState, attacker: Combatant, targetKey: string, context: CombatInputRound) {
  const target = combatantOf(state, targetKey)
  const attackerSheet = combatSheetOf(records, attacker)
  const targetSheet = combatSheetOf(records, target)
  if (!attackerSheet || !targetSheet) return
  const refusal = postureRefusal({ name: attacker.name, posture: combatPosture(attackerSheet.sheet, context) }, { name: target.name, posture: combatPosture(targetSheet.sheet, context) })
  if (refusal) throw new Error(refusal)
}
