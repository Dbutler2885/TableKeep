import { combatSkipsStages, combatIncapacity } from './inputs'
import { combatantsIn } from './attackParty'
import type { Combatant, CombatDeclaration, CombatMovement, CombatState } from './types'

// Lost stages in the fight. The rounds a wound takes are worked out when it
// lands, by the wound lifetime (`ruleSets/lubec/woundLifetime`); here they are
// applied. Losses from several wounds combine as a union of rounds, never
// extending, and a lost Action still to come this round stops the declaration.

export type CombatLostStages = { movement: number[]; action: number[]; reason: string; wound?: string }

const union = (a: readonly number[], b: readonly number[]) => [...new Set([...a, ...b])].sort((x, y) => x - y)

/** The stopped declaration a lost Action gives: no attack, no Defense. */
export const LOST_ACTION: CombatDeclaration = { ran: false, full: false, aim: null, frozen: null, total: 0, lines: [], sourceRevision: 0, stopped: true, lost: true }

const stopDeclaration = (entry: Combatant, key: string): Combatant =>
  entry.key === key && entry.declaration && !entry.declaration.stopped ? { ...entry, declaration: { ...entry.declaration, stopped: true, lost: true as const } } : entry

/**
 * The fight with these losses added for `key`. An Action lost this round, still unresolved, stops the declaration
 * at once: no attack turn and no Defense lines from it. Rolls already made stay as they were.
 */
export function withLostStages(state: CombatState, key: string, lost: { movement: number[]; action: number[] }, reason: string, wound?: string): CombatState {
  const before = state.lost?.[key] ?? { movement: [], action: [], reason }
  const merged = { movement: union(before.movement, lost.movement), action: union(before.action, lost.action), reason, ...(wound ? { wound } : {}) }
  const stopsNow = state.round >= 1 && merged.action.includes(state.round)
  const combatants = stopsNow
    ? state.combatants.map((entry) => stopDeclaration(entry, key))
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
/** "Movement lost - Dazed"; a reason that only repeats the loss ("Movement lost") is left out. */
const lossWords = (what: string, reason: string): string => (what.split(' ')[0] === reason.split(' ')[0] ? what : `${what} - ${reason}`)

export function lostStageWords(state: CombatState, key: string): string[] {
  const lost = state.lost?.[key]
  const combatant = state.combatants.find((entry) => entry.key === key)
  const reason = combatant ? combatIncapacity(combatant) : null
  return [
    ...(reason ? [`Unresolved stages lost - ${reason}`] : []),
    ...(movementLost(state, key) ? [lossWords('Movement lost', lost!.reason)] : []),
    ...(actionLost(state, key) ? [lossWords('Action + Defense lost', lost!.reason)] : []),
  ]
}


/** With nobody able to answer, the GM advances rounds explicitly instead of an unbounded automatic loop. */
export function allUnconscious(state: CombatState): boolean {
  const active = state.combatants.filter((entry) => entry.outReason === null)
  return active.length > 0 && active.every((entry) => combatSkipsStages(entry))
}
