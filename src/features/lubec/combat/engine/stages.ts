import { combatSkipsStages, combatIncapacity } from './inputs'
import type { LubecWoundNow } from '../../../ruleSets/lubec/woundTables/outcome'
import { combatantsIn } from './attackParty'
import type { CombatDeclaration, CombatMovement, CombatState } from './types'

// Lost stages, resolved into round numbers the moment the wound lands, from
// the target's state at that moment. A combatant's Action Stage is resolved
// once their own attack turn has opened (or was passed); Full Defense, a Run
// and a declaration with no attack leave it unresolved all round, so losing the
// Action then takes the Defense too. Movement always resolves before anyone is
// wounded, so losing the next Movement Stage always means next round. Losses
// from several wounds combine as a union of rounds, never extending.

export type CombatLostStages = { movement: number[]; action: number[]; reason: string; wound?: string }

/** Whether this combatant's Action Stage this round has been taken: their own attack turn opened or passed. */
export const actionResolved = (state: CombatState, key: string): boolean => state.round >= 1 && (state.attacked ?? []).includes(key)

/** The next Action Stage not yet resolved: this round's if it is still open, otherwise the next round's. */
export const nextActionRound = (state: CombatState, key: string): number =>
  (state.round >= 1 && !actionResolved(state, key) ? state.round : state.round + 1)

const range = (from: number, count: number) => Array.from({ length: count }, (_, index) => from + index)

/** The rounds a stage-losing consequence takes, worked out now; null for one that takes none. */
export function lostRoundsOf(now: LubecWoundNow, state: CombatState, key: string, dazed: number): { movement: number[]; action: number[] } | null {
  const action = nextActionRound(state, key)
  switch (now.kind) {
    case 'lose-movement': return { movement: [state.round + 1], action: [] }
    case 'lose-action': return { movement: [], action: [action] }
    case 'dazed': {
      const turns = now.turns === 1 ? 1 : dazed
      return { movement: range(state.round + 1, turns), action: range(action, turns) }
    }
    default: return null
  }
}

const union = (a: readonly number[], b: readonly number[]) => [...new Set([...a, ...b])].sort((x, y) => x - y)

/** The stopped declaration a lost Action gives: no attack, no Defense. */
export const LOST_ACTION: CombatDeclaration = { ran: false, full: false, aim: null, frozen: null, total: 0, lines: [], sourceRevision: 0, stopped: true, lost: true }

/**
 * The fight with these losses added for `key`. An Action lost this round, still unresolved, stops the declaration
 * at once: no attack turn and no Defense lines from it. Rolls already made stay as they were.
 */
export function withLostStages(state: CombatState, key: string, lost: { movement: number[]; action: number[] }, reason: string, wound?: string): CombatState {
  const before = state.lost?.[key] ?? { movement: [], action: [], reason }
  const merged = { movement: union(before.movement, lost.movement), action: union(before.action, lost.action), reason, ...(wound ? { wound } : {}) }
  const stopsNow = state.round >= 1 && merged.action.includes(state.round)
  const combatants = stopsNow
    ? state.combatants.map((entry) => (entry.key === key && entry.declaration && !entry.declaration.stopped ? { ...entry, declaration: { ...entry.declaration, stopped: true, lost: true as const } } : entry))
    : state.combatants
  return { ...state, combatants, lost: { ...state.lost, [key]: merged } }
}

export const movementLost = (state: CombatState, key: string): boolean => state.lost?.[key]?.movement.includes(state.round) ?? false
export const actionLost = (state: CombatState, key: string): boolean => state.lost?.[key]?.action.includes(state.round) ?? false

/** The Movement a lost Movement Stage gives without asking: staying put. */
export const LOST_MOVEMENT: CombatMovement = { choice: 'stay', pickup: null, leave: null, lost: true }

/** Everyone whose Movement this round is lost has it filled in as staying, unasked. */
export const withLostMovements = (state: CombatState): CombatState => ({
  ...state,
  combatants: state.combatants.map((entry) => (!entry.movement && (movementLost(state, entry.key) || combatSkipsStages(entry)) && combatantsIn(state).includes(entry) ? { ...entry, movement: combatSkipsStages(entry) ? { ...LOST_MOVEMENT, unconscious: true as const } : LOST_MOVEMENT } : entry)),
})

/** Everyone whose Action this round is lost has a stopped declaration recorded, unasked. */
export const withLostActions = (state: CombatState): CombatState => ({
  ...state,
  combatants: state.combatants.map((entry) => (!entry.declaration && entry.outReason === null && (actionLost(state, entry.key) || combatSkipsStages(entry)) ? { ...entry, declaration: combatSkipsStages(entry) ? { ...LOST_ACTION, unconscious: true as const } : LOST_ACTION, proposedDeclaration: null } : entry)),
})

/** "Action + Defense lost - Dazed", "Movement lost - Dazed": what this round takes from a combatant, and why. */
export function lostStageWords(state: CombatState, key: string): string[] {
  const lost = state.lost?.[key]
  const combatant = state.combatants.find((entry) => entry.key === key)
  const reason = combatant && combatIncapacity(combatant)
  return [
    ...(reason ? [`Unresolved stages lost - ${reason}`] : []),
    ...(lost?.movement.includes(state.round) ? [`Movement lost - ${lost.reason}`] : []),
    ...(lost?.action.includes(state.round) ? [`Action + Defense lost - ${lost.reason}`] : []),
  ]
}


/** With nobody able to answer, the GM advances rounds explicitly instead of an unbounded automatic loop. */
export function allUnconscious(state: CombatState): boolean {
  const active = state.combatants.filter((entry) => entry.outReason === null)
  return active.length > 0 && active.every((entry) => combatSkipsStages(entry))
}
