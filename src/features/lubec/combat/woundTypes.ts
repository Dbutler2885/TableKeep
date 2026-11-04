import type { CampaignScope } from '../../campaign/firestorePaths'
import type { LubecEffect } from '../../ruleSets/lubec/effects'
import type { CombatantSelection } from './engine/types'

export type CombatWoundScope = CampaignScope & { fightId: string }
export type CombatWoundOrigin = { fightId: string; woundId: string; originatingRound: number; effectiveRound: number }
export type CombatWound = {
  id: string
  target: CombatantSelection
  originatingRound: number
  effectiveRound: number
  traumaDelta: number
  stressDelta: number
  effect: LubecEffect
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
