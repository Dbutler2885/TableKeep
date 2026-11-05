import type { Combatant, CombatState } from '../engine/types'

/** `pips` is the round's stage in the page head, once rounds begin. */
export type CombatPhaseView = { round: string; stage: string; steps: readonly string[]; now: number; pips: number | null }

export const ROUND_STEPS = ['Movement', 'Declare', 'Attack'] as const

const PHASE_VIEWS: Readonly<Record<string, (state: CombatState) => CombatPhaseView>> = {
  'before-initiative': () => ({ round: 'Before initiative', stage: 'attacks run at once', steps: ['Pre-initiative attacks', 'Roll Initiative'], now: 0, pips: null }),
  initiative: () => ({ round: 'Initiative', stage: 'once per fight', steps: ['Roll', 'Order'], now: 0, pips: null }),
}

/** The mock-up's stage line for each round phase, and its place in the pips. */
const ROUND_STAGES: Readonly<Record<string, readonly [string, number]>> = {
  movement: ['Stage 1 · Movement', 0],
  declare: ['Stage 2 · Declare · slowest first', 1],
  attack: ['Stage 3 · Attack · fastest first', 2],
}

function roundView(state: CombatState): CombatPhaseView {
  const [stage, now] = ROUND_STAGES[state.phase] ?? [state.phase, 0]
  return { round: `Round ${state.round}`, stage, steps: ROUND_STEPS, now, pips: now }
}

/** The page head's round and stage, and the fight window's stepper, for the fight's phase. */
export const combatPhaseView = (state: CombatState): CombatPhaseView => (PHASE_VIEWS[state.phase] ?? roundView)(state)

/** Who a row is to this viewer: their own character, another player's, or an NPC. */
export const combatantRole = (combatant: Combatant, userId: string): string =>
  (combatant.kind === 'npc' ? 'NPC' : combatant.ownerUserId === userId ? 'You' : 'Player')

/** Why initiative cannot begin yet, or null when it can. */
export function beginBlocked(state: CombatState): string | null {
  if (state.attack && !state.attack.closed) return 'Finish the granted attack first.'
  return state.woundOutbox.length ? 'Wounds must reach the sheet first.' : null
}
