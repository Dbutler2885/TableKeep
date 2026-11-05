import { lubecSettleDetached } from '../../../ruleSets/lubec/gear/detachedItems'
import { assertLubecItemOwnership } from '../../../ruleSets/lubec/gear/itemIdentity'
import type { CombatState } from './types'

/** Shared by End, attacker-Out interruption and a completed miss; committed catches have no detached object. */
export function settleCombatAttack(state: CombatState): CombatState {
  const detached = state.attack?.detached ?? []
  const floor = detached.reduce((floor, inFlight) => lubecSettleDetached({ floor, inFlight }).floor, state.floor)
  assertLubecItemOwnership(floor.map((record) => record.item))
  return { ...state, floor, attack: state.attack && { ...state.attack, detached: [], closed: true } }
}
