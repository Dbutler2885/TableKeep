import type { CombatAttack, CombatAuthority, CombatCommand, CombatFight, CombatRecords } from './types'

export function requireGm(authority: CombatAuthority): void {
  if (!authority.isGm) throw new Error('Only the GM can do that.')
}

function currentActor(command: CombatCommand, fight: CombatFight) {
  const actor = fight.state.combatants.find((entry) => entry.key === command.envelope.actorKey)
  if (!actor) throw new Error('That interaction is stale.')
  if (actor.interactionSequence !== command.envelope.interactionSequence) throw new Error('That interaction is stale.')
  return actor
}

function requireOwner(ownerUserId: string, authority: CombatAuthority) {
  if (authority.isGm) return
  if (ownerUserId !== authority.userId) throw new Error('That combatant belongs to someone else.')
}

function requireActor(command: CombatCommand, fight: CombatFight, authority: CombatAuthority): void {
  const { actorKey } = command.envelope
  if (actorKey === null) {
    requireGm(authority)
    return
  }
  requireOwner(currentActor(command, fight).ownerUserId, authority)
}

function requireAttackContext(command: CombatCommand, fight: CombatFight): void {
  const expected = command.envelope
  const attack: Partial<CombatAttack> = fight.state.attack ?? {}
  const current = { attackId: attack.id, grantId: attack.grantId, step: attack.step }
  for (const key of ['attackId', 'grantId', 'step'] as const) {
    if (expected[key] !== undefined && expected[key] !== current[key]) throw new Error('That attack step is stale.')
  }
}

export function requireLiveContext(command: CombatCommand, records: CombatRecords, authority: CombatAuthority): CombatFight {
  const fight = records.fight
  if (!fight || fight.status !== 'live') throw new Error('That fight is not live.')
  if (records.activeFightId !== command.envelope.fightId) throw new Error('The active fight control does not match.')
  const expected = command.envelope
  const state = fight.state
  if ([expected.round !== state.round, expected.phase !== state.phase, expected.stageInstanceId !== state.stageInstanceId].some(Boolean)) {
    throw new Error('That fight stage is stale.')
  }
  requireActor(command, fight, authority)
  requireAttackContext(command, fight)
  return fight
}
