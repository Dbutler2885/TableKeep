import type { LubecAdvantage } from '../../../ruleSets/lubec/checkRoll'
import { lubecModeReason, lubecRollMode, lubecTaskModifiers, type LubecModeSource, type LubecRollAction, type LubecRollRequest } from '../../../ruleSets/lubec/rollModes'
import type { LubecAttackChoice } from '../../../ruleSets/lubec/gear/weaponAttacks'
import type { CombatEntropy } from './commandEntropy'
import { combatActiveEffects, type CombatInputRound } from './inputModifiers'
import type { CombatAttackResult } from './attackMath'
import type { CombatInitiative, CombatSheet } from './types'

// Card-set modes in combat. Every combat roll asks the same reader the Core
// roller does, with no manual switch; a roll under a mode rolls two dice, keeps
// both on the record, and picks one by the roll's own rule. For attack,
// Defense, the Strength roll, initiative and Evasive Movement a success beats a
// failure and, between two successes, the better one is the one the roll
// already prizes (the higher roll); Advantage keeps the better and
// Disadvantage the worse. Core-style Checks and Saves keep `keptLubecRoll`.

/** The mode a combat roll takes and why, or normal with no reason when nothing sets one. */
export type CombatMode = { mode: LubecAdvantage; because: string | null }

const NORMAL: CombatMode = { mode: 'normal', because: null }

/**
 * The mode the roller's active cards set for this roll. A row's own fixed mode (a concussion Save at
 * Disadvantage) joins as one more source, so it cancels against an Advantage and never stacks.
 */
export function combatRollMode(record: CombatSheet | null, request: LubecRollRequest, context: CombatInputRound | null, fixed: LubecModeSource[] = []): CombatMode {
  if (!record && !fixed.length) return NORMAL
  const resolved = lubecRollMode(record ? combatActiveEffects(record.sheet, context) : [], request, fixed)
  const { mode, sources } = resolved
  return { mode, because: lubecModeReason({ mode, sources }) }
}

/** Task-only penalties on this roll's value ("-20 Handle on ranged actions"), from the roller's active cards. */
export const combatTaskPenalty = (record: CombatSheet | null, actions: readonly LubecRollAction[], context: CombatInputRound | null, stat: string): number =>
  (record ? lubecTaskModifiers(combatActiveEffects(record.sheet, context), { actions }) : []).filter((modifier) => modifier.target === stat).reduce((sum, modifier) => sum + modifier.amount, 0)

/** The actions an attack is, for task-scoped cards: a firearm or throw is ranged, a throw is a throw, an unarmed blow a punch. */
export function combatAttackActions(choice: LubecAttackChoice): LubecRollAction[] {
  if (choice.firearm) return ['ranged']
  if (choice.ranged) return ['ranged', 'throw']
  return choice.wound === 'fisticuffs' || /punch/i.test(choice.name) ? ['punch'] : []
}

/** One die, or two kept by the mode with `better` ranking them: Advantage keeps the better, Disadvantage the worse. */
export function rollWithMode<Roll>(entropy: CombatEntropy, purpose: string, mode: LubecAdvantage, evaluate: (die: number) => Roll, better: (a: Roll, b: Roll) => boolean): { kept: Roll; dice: number[] } {
  const first = entropy.die(purpose, 100)
  if (mode === 'normal') return { kept: evaluate(first), dice: [first] }
  const second = entropy.die(purpose, 100)
  const [a, b] = [evaluate(first), evaluate(second)]
  // Two rolls of equal worth keep the first.
  const kept = mode === 'advantage' ? (better(b, a) ? b : a) : (better(a, b) ? b : a)
  return { kept, dice: [first, second] }
}

/** Success beats failure, and between two successes the higher roll is better; between two failures, neither is. */
export const successThenHigher = <Roll extends { success: boolean; roll: number }>(a: Roll, b: Roll): boolean =>
  (a.success && !b.success) || (a.success && b.success && a.roll > b.roll)

/** A hit beats a miss; between two hits the higher quality, then the higher roll. On an attack at Disadvantage that is "fails if either fails, the lower roll if both succeed". */
export const betterAttack = (a: CombatAttackResult, b: CombatAttackResult): boolean => {
  if (a.hit !== b.hit) return a.hit
  if (!a.hit) return false
  if (a.quality === b.quality) return a.roll > b.roll
  return (a.quality ?? 0) > (b.quality ?? 0)
}

/** A better initiative roll by the order initiative already ranks: a success first, a higher success, a lower failure. */
export const betterInitiative = (a: CombatInitiative, b: CombatInitiative): boolean => {
  if (a.success !== b.success) return a.success
  return a.success ? a.roll > b.roll : a.roll < b.roll
}

/** "Disadvantage from Broken rib(s): 72 and 89", for a roll's card; null for a single die. */
const modeLabel = (mode: CombatMode) => mode.because ?? (mode.mode === 'advantage' ? 'Advantage' : 'Disadvantage')

export const modeWords = (mode: CombatMode, dice: readonly number[]): string | null =>
  (dice.length > 1 ? `${modeLabel(mode)}: ${dice.map((die) => String(die).padStart(2, '0')).join(' and ')}` : null)

/** What a roll record keeps of its mode: both dice and the reason, or nothing for a single die. */
export const modeRecord = (mode: CombatMode, dice: readonly number[]) =>
  (dice.length > 1 && mode.mode !== 'normal' ? { dice: [...dice], mode: mode.mode, because: mode.because } : {})
