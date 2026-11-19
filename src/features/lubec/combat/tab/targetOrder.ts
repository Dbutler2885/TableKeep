import { lubecCombatantKey, type LubecCombatant } from '../../fight/lubecFightRequest'
import type { Combatant, CombatState } from '../engine/types'
import { declaredAt } from './declarationsModel'

/** The players and whoever fights with them, or everyone against them. */
const partySide = (combatant: Combatant): boolean => combatant.kind === 'character' || combatant.ally === true

/**
 * The order the target tiles take: whoever has declared at the attacker first, then the other side, then the
 * attacker's own side, each kept in the order it came. In a big fight that puts the likely targets on the tiles.
 */
export function orderedTargets(state: CombatState, attacker: Combatant, targets: readonly LubecCombatant[], atAttacker: (key: string) => boolean): LubecCombatant[] {
  const rank = (target: LubecCombatant): number => {
    const key = lubecCombatantKey(target)
    if (atAttacker(key)) return 0
    const combatant = state.combatants.find((entry) => entry.key === key)
    return combatant && partySide(combatant) === partySide(attacker) ? 2 : 1
  }
  return targets.map((target, index) => ({ target, index, rank: rank(target) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.target)
}

/** Whether `key` has declared at the attacker: an attack, a Defense line or Full Defense against them. */
export const declaredAtAttacker = (state: CombatState, attacker: Combatant) => (key: string): boolean => {
  const declaration = state.combatants.find((entry) => entry.key === key)?.declaration
  return Boolean(declaration && declaredAt(declaration, [attacker.key]))
}
