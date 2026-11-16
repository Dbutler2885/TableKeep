import { stopAttack } from './outReturn'
import { withDeclareRequests } from './declare'
import { withMovementRequests } from './movement'
import { actionLost, movementLost } from './stages'
import { requireGm, requireLiveContext } from './context'
import { combatantKey, combatPublicSummary } from './inputs'
import type { Combatant, CombatHandler, CombatSheet, CombatState } from './types'

// Speed is shown live until initiative; a later ticket freezes it there.
const speedOf = (combatant: Combatant, speed: number | null, phase: string) =>
  (phase === 'before-initiative' && speed !== null ? speed : combatant.speed)

/** A combatant with its sheet's current public summary; an unreadable sheet keeps the last one published. */
export function refreshedCombatant(combatant: Combatant, sheets: readonly CombatSheet[], phase: string): Combatant {
  const record = sheets.find((sheet) => combatantKey(sheet) === combatant.key)
  if (!record) return combatant
  const { speed, ...summary } = combatPublicSummary(record)
  return { ...combatant, ...summary, speed: speedOf(combatant, speed, phase) }
}

const refreshedCombatants = (state: CombatState, sheets: readonly CombatSheet[]) =>
  state.combatants.map((combatant) => {
    const refreshed = refreshedCombatant(combatant, sheets, state.phase)
    // Landing eligibility cannot be cleared by a refresh that precedes its sheet delivery.
    if (state.woundOutbox.some((wound) => combatantKey(wound.target) === combatant.key && wound.effects?.some((card) => card.cardKey === 'unconscious'))) return { ...refreshed, unconscious: true }
    if (combatant.unconscious && !refreshed.unconscious) {
      if (state.phase === 'movement' && combatant.movement?.unconscious && !movementLost(state, combatant.key)) return { ...refreshed, movement: null }
      if (state.phase === 'declare' && combatant.declaration?.unconscious && !actionLost(state, combatant.key)) return { ...refreshed, declaration: null }
    }
    return refreshed
  })

/** Whether any published summary differs from what the current sheets would publish. */
export const combatSummariesStale = (state: CombatState, sheets: readonly CombatSheet[]): boolean =>
  JSON.stringify(refreshedCombatants(state, sheets)) !== JSON.stringify(state.combatants)

/** The GM republishes changed public summaries; private sheet inputs stay in the transaction's reads. */
const refresh: CombatHandler = (command, records, authority, entropy) => {
  requireGm(authority)
  const fight = requireLiveContext(command, records, authority)
  if (!combatSummariesStale(fight.state, records.sheets)) throw new Error('Public summaries are current.')
  let state = { ...fight.state, combatants: refreshedCombatants(fight.state, records.sheets) }
  for (const combatant of state.combatants) {
    if (combatant.unconscious && !fight.state.combatants.find((entry) => entry.key === combatant.key)?.unconscious) state = stopAttack(state, combatant.key, entropy)
  }
  if (state.phase === 'movement') state = withMovementRequests(state)
  const next = state.phase === 'declare' ? withDeclareRequests(state, entropy) : { state, logs: [] }
  return { fight: { ...fight, state: next.state }, items: [], logs: next.logs }
}

export const combatSummaryHandlers: Readonly<Record<string, CombatHandler>> = { refresh }
