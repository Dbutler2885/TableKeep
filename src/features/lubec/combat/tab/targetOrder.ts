import { lubecCombatantKey, type LubecCombatant } from '../../fight/lubecFightRequest'
import type { Combatant, CombatState } from '../engine/types'
import { declaredAt } from './declarationsModel'

/** The players and whoever fights with them, or everyone against them. */
const partySide = (combatant: Combatant): boolean => combatant.kind === 'character' || combatant.ally === true

/** Where a fighter falls in the order: 0 has declared at the attacker, 1 is on the other side, 2 on the attacker's own. */
function rankOf(state: CombatState, attacker: Combatant, atAttacker: (key: string) => boolean, key: string): number {
  if (atAttacker(key)) return 0
  const combatant = state.combatants.find((entry) => entry.key === key)
  return combatant && partySide(combatant) === partySide(attacker) ? 2 : 1
}

/** `items` sorted by their fighter's rank, each rank kept in the order it came. */
function byRank<T>(items: readonly T[], rank: (item: T) => number): T[] {
  return items.map((item, index) => ({ item, index, rank: rank(item) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item)
}

/**
 * The order the target tiles take: whoever has declared at the attacker first, then the other side, then the
 * attacker's own side, each kept in the order it came. In a big fight that puts the likely targets on the tiles.
 */
export const orderedTargets = (state: CombatState, attacker: Combatant, targets: readonly LubecCombatant[], atAttacker: (key: string) => boolean): LubecCombatant[] =>
  byRank(targets, (target) => rankOf(state, attacker, atAttacker, lubecCombatantKey(target)))

/** The attacker's opponents' keys in the tiles' order, so a fresh window starts on the first tile. */
export const orderedOpponentKeys = (state: CombatState, attacker: Combatant, keys: readonly string[]): string[] =>
  byRank(keys, (key) => rankOf(state, attacker, declaredAtAttacker(state, attacker), key))

/** Whether `key` has declared at the attacker: an attack, a Defense line or Full Defense against them. */
export const declaredAtAttacker = (state: CombatState, attacker: Combatant) => (key: string): boolean => {
  const declaration = state.combatants.find((entry) => entry.key === key)?.declaration
  return Boolean(declaration && declaredAt(declaration, [attacker.key]))
}
