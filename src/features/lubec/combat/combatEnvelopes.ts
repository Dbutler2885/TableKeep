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

/** A combatant's own act on the open attack: bound to its interaction sequence and the attack's id and step. */
export function actorEnvelope(scope: CampaignScope, id: string, live: LubecLiveFight, actorKey: string): CombatEnvelope {
  const { state } = live.fight
  const actor = state.combatants.find((combatant) => combatant.key === actorKey)
  const attack = state.attack ? { attackId: state.attack.id, step: state.attack.step } : {}
  return { ...gmEnvelope(scope, id, live), actorKey, interactionSequence: actor?.interactionSequence ?? 0, ...attack }
}

/** One logical act on the open attack; a later attack or step is a new action even with the same payload. */
export const attackCommandKey = ({ id, fight }: LubecLiveFight, actorKey: string | null, payload: object): string =>
  JSON.stringify([id, fight.state.stageInstanceId, fight.state.attack?.id ?? null, fight.state.attack?.step ?? null, actorKey, payload])
