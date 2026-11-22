import { stopAttack } from './outReturn'
import { withDeclareRequests } from './declare'
import { withMovementRequests } from './movement'
import { actionLost, movementLost } from './stages'
import { requireGm, requireLiveContext } from './context'
import { combatantKey, combatPublicSummary, combatSkipsStages } from './inputs'
import type { CombatEntropy } from './commandEntropy'
import type { Combatant, CombatHandler, CombatSheet, CombatState } from './types'

// Speed is shown live until initiative; a later ticket freezes it there.
const speedOf = (combatant: Combatant, speed: number | null, phase: string) =>
  (phase === 'before-initiative' && speed !== null ? speed : combatant.speed)

/** A combatant with its sheet's current public summary; an unreadable sheet keeps the last one published. */
export function refreshedCombatant(combatant: Combatant, sheets: readonly CombatSheet[], phase: string): Combatant {
  const record = sheets.find((sheet) => combatantKey(sheet) === combatant.key)
  if (!record) return combatant
  const { speed, ...summary } = combatPublicSummary(record)
  // A cleared condition or a successful Stand leaves the summary; it must leave the combatant too.
  const rest = { ...combatant }
  delete rest.condition
  delete rest.prone
  return { ...rest, ...summary, speed: speedOf(combatant, speed, phase) }
}

const unconsciousPending = (state: CombatState, key: string) =>
  state.woundOutbox.some((wound) => combatantKey(wound.target) === key && wound.effects?.some((card) => card.cardKey === 'unconscious'))

function resumeMovement(state: CombatState, before: Combatant, refreshed: Combatant): Combatant {
  return before.movement?.unconscious && !movementLost(state, before.key) ? { ...refreshed, movement: null } : refreshed
}

function resumeDeclaration(state: CombatState, before: Combatant, refreshed: Combatant): Combatant {
  return before.declaration?.unconscious && !actionLost(state, before.key) ? { ...refreshed, declaration: null } : refreshed
}

/** Clearing incapacity reopens only the stages that it had filled automatically, subject to independent stage losses. */
function resumeEligibleStages(state: CombatState, before: Combatant, refreshed: Combatant): Combatant {
  if (!combatSkipsStages(before) || combatSkipsStages(refreshed)) return refreshed
  if (state.phase === 'movement') return resumeMovement(state, before, refreshed)
  if (state.phase === 'declare') return resumeDeclaration(state, before, refreshed)
  return refreshed
}

const refreshedCombatants = (state: CombatState, sheets: readonly CombatSheet[]) =>
  state.combatants.map((combatant) => {
    const refreshed = refreshedCombatant(combatant, sheets, state.phase)
    // Landing eligibility cannot be cleared by a refresh that precedes its sheet delivery.
    if (unconsciousPending(state, combatant.key)) return { ...refreshed, unconscious: true }
    return resumeEligibleStages(state, combatant, refreshed)
  })

/** Whether any published summary differs from what the current sheets would publish. */
export const combatSummariesStale = (state: CombatState, sheets: readonly CombatSheet[]): boolean =>
  JSON.stringify(refreshedCombatants(state, sheets)) !== JSON.stringify(state.combatants)

function stopNewlyIncapacitated(before: CombatState, current: CombatState, entropy: CombatEntropy): CombatState {
  let state = current
  for (const combatant of state.combatants) {
    const previous = before.combatants.find((entry) => entry.key === combatant.key)
    if (combatSkipsStages(combatant) && !(previous && combatSkipsStages(previous))) state = stopAttack(state, combatant.key, entropy)
  }
  return state
}

/** The GM republishes changed public summaries; private sheet inputs stay in the transaction's reads. */
const refresh: CombatHandler = (command, records, authority, entropy) => {
  requireGm(authority)
  const fight = requireLiveContext(command, records, authority)
  if (!combatSummariesStale(fight.state, records.sheets)) throw new Error('Public summaries are current.')
  let state = stopNewlyIncapacitated(fight.state, { ...fight.state, combatants: refreshedCombatants(fight.state, records.sheets) }, entropy)
  if (state.phase === 'movement') state = withMovementRequests(state)
  const next = state.phase === 'declare' ? withDeclareRequests(state, entropy) : { state, logs: [] }
  return { fight: { ...fight, state: next.state }, items: [], logs: next.logs }
}

export const combatSummaryHandlers: Readonly<Record<string, CombatHandler>> = { refresh }
