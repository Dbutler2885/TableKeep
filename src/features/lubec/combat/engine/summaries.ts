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
  state.combatants.map((combatant) => refreshedCombatant(combatant, sheets, state.phase))

/** Whether any published summary differs from what the current sheets would publish. */
export const combatSummariesStale = (state: CombatState, sheets: readonly CombatSheet[]): boolean =>
  JSON.stringify(refreshedCombatants(state, sheets)) !== JSON.stringify(state.combatants)

/** The GM republishes changed public summaries; private sheet inputs stay in the transaction's reads. */
const refresh: CombatHandler = (command, records, authority) => {
  requireGm(authority)
  const fight = requireLiveContext(command, records, authority)
  if (!combatSummariesStale(fight.state, records.sheets)) throw new Error('Public summaries are current.')
  return { fight: { ...fight, state: { ...fight.state, combatants: refreshedCombatants(fight.state, records.sheets) } }, items: [], logs: [] }
}

export const combatSummaryHandlers: Readonly<Record<string, CombatHandler>> = { refresh }
