import { combatantKey, combatSetupIssues } from './inputs'
import type { CombatAttack, CombatCommand, Combatant, CombatRecords, CombatSheet, CombatState } from './types'

export function combatantOf(state: CombatState, key: string): Combatant {
  const combatant = state.combatants.find((entry) => entry.key === key)
  if (!combatant) throw new Error('That person is not in this fight.')
  return combatant
}

/** Players never target or defend against players; nobody targets themselves or someone Out. */
export function combatOpponent(attacker: Combatant, other: Combatant): boolean {
  if (other.key === attacker.key || other.outReason !== null) return false
  return attacker.kind === 'npc' || other.kind === 'npc'
}

export const combatOpponents = (state: CombatState, attacker: Combatant): Combatant[] =>
  state.combatants.filter((other) => combatOpponent(attacker, other))

export function requireOpponent(state: CombatState, attacker: Combatant, key: string): Combatant {
  const other = combatantOf(state, key)
  if (!combatOpponent(attacker, other)) throw new Error(`${attacker.name} cannot aim at ${other.name}.`)
  return other
}

const attackerOf = (attack: CombatAttack): string => attack.attackerKey

/** The defender answers Defense and the catch: the target the attack aimed at. */
export const defenderOf = (attack: CombatAttack): string => attack.aim!.targetKey

/** The open attack at `step`, answered by whoever owns that step (or the GM acting for them). */
export function attackAt(state: CombatState, command: CombatCommand, step: string, ownerOf = attackerOf): CombatAttack {
  const attack = state.attack
  if (!attack || attack.closed) throw new Error('There is no attack waiting.')
  if (attack.step !== step) throw new Error('That attack step is stale.')
  if (command.envelope.actorKey !== ownerOf(attack)) throw new Error('That attack step belongs to someone else.')
  return attack
}

export const combatSheetOf = (records: CombatRecords, combatant: Combatant): CombatSheet | null =>
  records.sheets.find((sheet) => combatantKey(sheet) === combatant.key) ?? null

/** What the GM must repair before this attacker's step can go on; null when the sheet and its inputs are readable. */
export function attackRepair(attacker: Combatant, record: CombatSheet | null, body = false): string | null {
  if (!record) return `${attacker.name}'s sheet is missing or unreadable; restore it, then try again.`
  const issues = combatSetupIssues([record], [record], body)
  return issues.length ? issues.join(' ') : null
}
