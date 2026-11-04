import type { Combatant, CombatState } from '../engine/types'

export type CombatPhaseView = { round: string; stage: string; steps: readonly string[]; now: number }

const ROUND_STEPS = ['Movement', 'Declare', 'Attack'] as const

// Later slices add the round phases; until then a fight never leaves Before initiative.
const PHASE_VIEWS: Readonly<Record<string, (state: CombatState) => CombatPhaseView>> = {
  'before-initiative': () => ({ round: 'Before initiative', stage: 'attacks run at once', steps: ['Pre-initiative attacks', 'Roll Initiative'], now: 0 }),
}

const roundView = (state: CombatState): CombatPhaseView => ({ round: `Round ${state.round}`, stage: state.phase, steps: ROUND_STEPS, now: 0 })

/** The page head's round and stage, and the fight window's stepper, for the fight's phase. */
export const combatPhaseView = (state: CombatState): CombatPhaseView => (PHASE_VIEWS[state.phase] ?? roundView)(state)

/** Who a row is to this viewer: their own character, another player's, or an NPC. */
export const combatantRole = (combatant: Combatant, userId: string): string =>
  (combatant.kind === 'npc' ? 'NPC' : combatant.ownerUserId === userId ? 'You' : 'Player')
