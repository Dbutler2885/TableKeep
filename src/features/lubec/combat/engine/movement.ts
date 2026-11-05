import type { LubecItem } from '../../../ruleSets/lubec/gear/gearRecord'
import { place } from '../../../ruleSets/lubec/gear/placement'
import { attackRepair, combatantOf, combatantsIn as inRound, combatSheetOf } from './attackParty'
import type { CombatPendingAction } from './combatFeedback'
import { requireGm, requireLiveContext } from './context'
import type { Combatant, CombatFight, CombatHandler, CombatMovement, CombatMovementChoice, CombatPickupClaim, CombatPlan, CombatRecords, CombatState } from './types'

const CHOICES: readonly CombatMovementChoice[] = ['stay', 'run', 'pickup', 'leave']

function requireChoosing(state: CombatState) {
  if (state.phase !== 'movement') throw new Error('Movement is not open.')
  if (state.movementComplete) throw new Error('Movement is set; the GM is settling it.')
}

function readChoice(raw: unknown): CombatMovementChoice {
  if (!CHOICES.includes(raw as CombatMovementChoice)) throw new Error('Choose Move or stay, Run, Pick up or Leave the fight.')
  return raw as CombatMovementChoice
}

const claimQty = (qty: unknown, available: number): number | null =>
  (Number.isSafeInteger(qty) && (qty as number) >= 1 && (qty as number) <= available ? qty as number : null)

/** The exact Floor record a pickup claims, still there in that quantity. */
function readClaim(state: CombatState, raw: unknown): { claim: CombatPickupClaim; item: LubecItem } {
  const { itemId, qty } = (raw ?? {}) as Record<string, unknown>
  const record = state.floor.find((entry) => entry.item.id === itemId)
  const taken = record ? claimQty(qty, record.item.qty) : null
  if (taken === null) throw new Error('That item is no longer on the Floor.')
  return { claim: { itemId: record!.item.id, qty: taken }, item: { ...record!.item, qty: taken } as LubecItem }
}

/** A pickup needs a free hand for the item now; settlement checks the hands again. */
function requireFreeHand(combatant: Combatant, records: CombatRecords, item: LubecItem) {
  const record = combatSheetOf(records, combatant)
  const repair = attackRepair(combatant, record)
  if (repair) throw new Error(repair)
  if (!place(record!.sheet.gear, 'hands', item).ok) throw new Error(`${combatant.name} has no free hand for the ${item.name}.`)
}

/** A player's Leave waits for the GM; the GM's own choice for an NPC needs no answer. */
const leaveOf = (combatant: Combatant, choice: CombatMovementChoice): CombatMovement['leave'] => {
  if (choice !== 'leave') return null
  return combatant.kind === 'npc' ? 'confirmed' : 'asked'
}

function chosen(state: CombatState, combatant: Combatant, raw: Record<string, unknown>, records: CombatRecords): CombatMovement {
  if (combatant.outReason !== null) throw new Error(`${combatant.name} is Out.`)
  if (combatant.movement) throw new Error(`${combatant.name} has already confirmed Movement.`)
  const choice = readChoice(raw.choice)
  if (choice !== 'pickup') return { choice, pickup: null, leave: leaveOf(combatant, choice) }
  const { claim, item } = readClaim(state, raw.pickup)
  requireFreeHand(combatant, records, item)
  return { choice, pickup: claim, leave: null }
}

/** Who Movement still waits on: an unconfirmed choice, or a Leave the GM has not answered. */
function movementRequests(state: CombatState): CombatPendingAction[] {
  const choosing = inRound(state).filter((entry) => !entry.movement).map((entry) => ({ combatantKey: entry.key, action: 'movement' as const }))
  const asking = inRound(state).filter((entry) => entry.movement?.leave === 'asked').map((entry) => ({ combatantKey: entry.key, action: 'leave' as const }))
  return [...choosing, ...asking]
}

/** The requests that remain; with none, and someone still in the fight, the stage is complete and waits for the GM to settle it. */
export function withMovementRequests(state: CombatState): CombatState {
  const pendingActions = movementRequests(state)
  return { ...state, pendingActions, movementComplete: pendingActions.length === 0 && inRound(state).length > 0 }
}

function withMovement(fight: CombatFight, moved: ReadonlyMap<string, CombatMovement>): CombatFight {
  const combatants = fight.state.combatants.map((entry) => (moved.has(entry.key) ? { ...entry, movement: moved.get(entry.key)! } : entry))
  return { ...fight, state: withMovementRequests({ ...fight.state, combatants }) }
}

const confirmedLog = (combatant: Combatant) => ({ event: `${combatant.name} confirmed Movement.`, actor: combatant.key })

/** A player confirms their own combatant's choice; the GM may confirm it for an absent player. Others see only that it is in. */
const move: CombatHandler = (command, records, authority) => {
  const fight = requireLiveContext(command, records, authority)
  requireChoosing(fight.state)
  const combatant = combatantOf(fight.state, String(command.envelope.actorKey))
  const movement = chosen(fight.state, combatant, command.payload, records)
  return { fight: withMovement(fight, new Map([[combatant.key, movement]])), items: [], logs: [confirmedLog(combatant)] }
}

const npcsChoosing = (state: CombatState): Combatant[] => inRound(state).filter((entry) => entry.kind === 'npc' && !entry.movement)

/** The GM confirms every NPC's choice at once. */
const npcMovement: CombatHandler = (command, records, authority) => {
  requireGm(authority)
  const fight = requireLiveContext(command, records, authority)
  requireChoosing(fight.state)
  const npcs = npcsChoosing(fight.state)
  if (!npcs.length) throw new Error('No NPC is waiting to choose Movement.')
  const choices = (command.payload.choices ?? {}) as Record<string, Record<string, unknown>>
  const moved = new Map(npcs.map((npc) => [npc.key, chosen(fight.state, npc, choices[npc.key] ?? {}, records)]))
  return { fight: withMovement(fight, moved), items: [], logs: npcs.map(confirmedLog) }
}

function asking(state: CombatState, key: unknown): Combatant {
  const combatant = combatantOf(state, String(key))
  if (combatant.movement?.leave !== 'asked') throw new Error(`${combatant.name} has not asked to Leave.`)
  return combatant
}

/** The GM confirms a Leave, which puts the player Out when the stage closes, or refuses it and the player chooses again. */
const answerLeave: CombatHandler = (command, records, authority): CombatPlan => {
  requireGm(authority)
  const fight = requireLiveContext(command, records, authority)
  requireChoosing(fight.state)
  const combatant = asking(fight.state, command.payload.combatantKey)
  const confirmed = command.payload.confirm === true
  const movement = confirmed ? { ...combatant.movement!, leave: 'confirmed' as const } : null
  const combatants = fight.state.combatants.map((entry) => (entry.key === combatant.key ? { ...entry, movement } : entry))
  const event = `The GM ${confirmed ? 'confirmed' : 'refused'} ${combatant.name}'s Leave.`
  return { fight: { ...fight, state: withMovementRequests({ ...fight.state, combatants }) }, items: [], logs: [{ event, actor: null }] }
}

export const combatMovementHandlers: Readonly<Record<string, CombatHandler>> = { move, npcMovement, answerLeave }
