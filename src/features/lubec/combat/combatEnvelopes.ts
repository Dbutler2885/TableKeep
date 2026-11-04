import type { CampaignScope } from '../../campaign/firestorePaths'
import type { LubecLiveFight } from './combatWatch'
import type { CombatEnvelope } from './engine/types'

/** Start names a prospective fight that does not exist yet; its stage is the local setup it commits. */
export const startEnvelope = (scope: CampaignScope, id: string, fightId: string): CombatEnvelope => ({
  ...scope, id, fightId, round: 0, phase: 'setup', stageInstanceId: `setup:${id}`, actorKey: null, interactionSequence: 0,
})

/** A GM system command, bound to the live fight's current round, phase and stage instance. */
export const gmEnvelope = (scope: CampaignScope, id: string, { id: fightId, fight }: LubecLiveFight): CombatEnvelope => ({
  ...scope, id, fightId, round: fight.state.round, phase: fight.state.phase, stageInstanceId: fight.state.stageInstanceId, actorKey: null, interactionSequence: 0,
})

/** One logical action: the same live context and payload resend the same command until it is answered. */
export const gmCommandKey = ({ id, fight }: LubecLiveFight, payload: object): string =>
  JSON.stringify([id, fight.state.stageInstanceId, payload])
