import { lubecExportDetached } from '../../../ruleSets/lubec/gear/detachedItems'
import { assertLubecItemOwnership } from '../../../ruleSets/lubec/gear/itemIdentity'
import { combatEntropy } from './commandEntropy'
import { requireGm, requireLiveContext } from './context'
import { placeCombatFloor } from './floor'
import { combatantKey, combatSetupIssues, publicCombatant } from './inputs'
import { combatSummaryHandlers } from './summaries'
import { settleCombatAttack } from './settlement'
import { combatDeclareHandlers } from './declare'
import { combatInitiativeHandlers } from './initiative'
import { combatMovementHandlers } from './movement'
import { combatMovementSettleHandlers } from './movementSettle'
import { combatSneakAttackHandlers } from './sneakAttack'
import { combatChooseAgainHandlers } from './chooseAgain'
import { combatOutHandlers } from './outReturn'
import { withRoundFlow } from './roundAttacks'
import type { CombatCommand, CombatHandler, CombatPlan, CombatRecords, CombatState, StartPayload } from './types'

function requireStartInputs(payload: StartPayload, records: CombatRecords): void {
  if (payload.combatants.length === 0) throw new Error('Select at least one combatant.')
  const keys = payload.combatants.map(combatantKey)
  if (new Set(keys).size !== keys.length) throw new Error('A combatant was selected twice.')
  const issues = combatSetupIssues(payload.combatants, records.sheets, payload.dodgeball)
  if (issues.length) throw new Error(issues.join('\n'))
}

const start: CombatHandler = (command, records, authority, entropy) => {
  requireGm(authority)
  if (records.activeFightId !== null) throw new Error('A fight is already active.')
  if (records.fight) throw new Error('That prospective fight id already exists.')
  const payload = command.payload as StartPayload
  requireStartInputs(payload, records)
  const placed = placeCombatFloor(payload.floor, records.items, command.envelope.id)
  assertLubecItemOwnership(placed.floor.map((record) => record.item))
  const combatants = records.sheets.map(publicCombatant)
  const state: CombatState = {
    round: 0, phase: 'before-initiative', stageInstanceId: entropy.id('stage', 0),
    combatants, floor: placed.floor, attack: null, woundOutbox: [], woundAcknowledgements: [],
  }
  const participantUserIds = [...new Set(combatants.filter((actor) => actor.kind === 'character').map((actor) => actor.ownerUserId))]
  return {
    fight: { status: 'live', participantUserIds, state },
    control: command.envelope.fightId, items: placed.writes, logs: [{ event: 'Combat started. Before initiative.', actor: null }],
  }
}

export { settleCombatAttack }

const end: CombatHandler = (command, records, authority) => {
  requireGm(authority)
  const fight = requireLiveContext(command, records, authority)
  if (fight.state.woundOutbox.length) throw new Error('Wounds must be delivered before combat can end.')
  const state = settleCombatAttack(fight.state)
  const exported = lubecExportDetached(state.floor, records.items)
  return {
    fight: { ...fight, status: 'ended', state: { ...state, floor: exported.floor } },
    control: null, items: exported.drops.map((value) => ({ id: value.id, value })),
    logs: [{ event: 'Combat ended. Floor returned to GM Items.', actor: null }],
  }
}

const place: CombatHandler = (command, records, authority) => {
  requireGm(authority)
  const fight = requireLiveContext(command, records, authority)
  const placed = placeCombatFloor(command.payload.floor as StartPayload['floor'], records.items, command.envelope.id)
  const floor = [...fight.state.floor, ...placed.floor]
  assertLubecItemOwnership([...floor, ...(fight.state.attack?.detached ?? [])].map((record) => record.item))
  return { fight: { ...fight, state: { ...fight.state, floor } }, items: placed.writes, logs: [{ event: 'Items placed on Floor.', actor: null }] }
}

const interrupt: CombatHandler = (command, records, authority) => {
  requireGm(authority)
  const fight = requireLiveContext(command, records, authority)
  const attacker = fight.state.combatants.find((actor) => actor.key === fight.state.attack?.attackerKey)
  if (!attacker?.outReason) throw new Error('The attacker has not gone Out.')
  return { fight: { ...fight, state: settleCombatAttack(fight.state) }, items: [], logs: [{ event: 'Attack interrupted: attacker Out.', actor: attacker.key }] }
}

export const combatLifecycleHandlers: Readonly<Record<string, CombatHandler>> = { start, end, place, interrupt, ...combatSummaryHandlers, ...combatSneakAttackHandlers, ...combatInitiativeHandlers, ...combatMovementHandlers, ...combatMovementSettleHandlers, ...combatDeclareHandlers, ...combatChooseAgainHandlers, ...combatOutHandlers }

export function planCombatCommand(command: CombatCommand, records: CombatRecords, authority: Parameters<CombatHandler>[2], handlers = combatLifecycleHandlers, entropy = combatEntropy(command)): CombatPlan {
  const handler = handlers[command.payload.type]
  if (!handler) throw new Error('Unknown combat command.')
  return withRoundFlow(handler(command, records, authority, entropy), entropy)
}
