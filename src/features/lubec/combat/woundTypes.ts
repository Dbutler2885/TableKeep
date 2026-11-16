import type { CampaignScope } from '../../campaign/firestorePaths'
import type { LubecEffect } from '../../ruleSets/lubec/effects'
import type { CombatantSelection } from './engine/types'

export type CombatWoundScope = CampaignScope & { fightId: string }
export type CombatWoundOrigin = { fightId: string; woundId: string; originatingRound: number; effectiveRound: number }
export type CombatWound = {
  /**
   * A wound landing, or a round tick: the end of `tickRound` for one combatant, which expires their round windows
   * from this fight. Absent on a wound queued before ticks existed, which is a wound.
   */
  kind?: 'wound' | 'tick' | 'close'
  /** A tick's round, or the round the fight closed in. */
  tickRound?: number
  id: string
  target: CombatantSelection
  originatingRound: number
  effectiveRound: number
  traumaDelta: number
  stressDelta: number
  /** Minimum Stress the wound rolled when it landed ("Increase minimum Stress by 1d5"); absent when none. */
  minimumStressDelta?: number
  /** The wound's first card, or the whole of an older text wound; kept so a wound queued before cards still reads. Absent when a final wound leaves no card. */
  effect?: LubecEffect
  /** Every card a final row's wound makes, each with a key unique within the wound; absent on an older text wound. */
  effects?: LubecEffect[]
}
export type CombatWoundAcknowledgement = {
  id: string
  target: CombatantSelection
  targetRevision: number
  originatingRound: number
  effectiveRound: number
  operationId: string
}

export const WOUND_WAIT = 'Waiting for wounds to reach the sheet'
