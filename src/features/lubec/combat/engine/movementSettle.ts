import { lubecPlaceDetached, lubecTakeDetached, type LubecDetachedItem } from '../../../ruleSets/lubec/gear/detachedItems'
import { combatSheetOf } from './attackParty'
import type { CombatLog } from './combatFeedback'
import { requireGm, requireLiveContext } from './context'
import { combatOrdered, RAN, withDeclareRequests } from './declare'
import type { CombatCommand, Combatant, CombatHandler, CombatPlan, CombatRecords, CombatState } from './types'

type Settling = { floor: LubecDetachedItem[]; sheets: NonNullable<CombatPlan['sheets']>; logs: CombatLog[] }

const lost = (settling: Settling, claimant: Combatant, event: string): Settling =>
  ({ ...settling, logs: [...settling.logs, { event, actor: claimant.key }] })

/** One claim against the Floor and hands as they stand now: an earlier claimant may have taken it, and hands may have filled. */
function pickUp(settling: Settling, claimant: Combatant, item: string, records: CombatRecords, command: CombatCommand): Settling {
  const claim = claimant.movement!.pickup!
  const record = combatSheetOf(records, claimant)
  if (!record) return lost(settling, claimant, `${claimant.name} could not pick up the ${item}: the sheet could not be read.`)
  const source = settling.floor.find((entry) => entry.item.id === claim.itemId)
  if (!source || source.item.qty < claim.qty) return lost(settling, claimant, `${claimant.name} reached for the ${item}, but someone faster took it.`)
  const itemCommand = { commandId: command.envelope.id, role: `pickup:${claimant.key}` }
  const taken = lubecTakeDetached(settling.floor, claim.itemId, claim.qty, itemCommand)
  const arrival = lubecPlaceDetached(record.sheet.gear, taken.detached, itemCommand, 'hands')
  if (!arrival.ok) return lost(settling, claimant, `${claimant.name} could not pick up the ${item}: no free hand.`)
  const sheets = [...settling.sheets, { selection: { kind: claimant.kind, sheetId: claimant.sheetId }, gear: arrival.gear }]
  return { floor: taken.records, sheets, logs: [...settling.logs, { event: `${claimant.name} picked up the ${item}.`, actor: claimant.key }] }
}

const REVEALED: Readonly<Record<string, (name: string) => string>> = {
  stay: (name) => `${name} moved or stayed.`,
  run: (name) => `${name} ran.`,
  leave: (name) => `${name} left the fight.`,
}

/** Each choice is revealed in initiative order; a pickup is settled against what is left when its turn comes. */
function settleOne(settling: Settling, combatant: Combatant, state: CombatState, records: CombatRecords, command: CombatCommand): Settling {
  const { choice, pickup } = combatant.movement!
  if (!pickup) return { ...settling, logs: [...settling.logs, { event: REVEALED[choice](combatant.name), actor: combatant.key }] }
  // A claim names a record that was on the Floor when it was confirmed, and nothing but settlement takes from the Floor during Movement.
  const item = state.floor.find((entry) => entry.item.id === pickup.itemId)!.item.name
  return pickUp(settling, combatant, item, records, command)
}

/** A confirmed Leave goes Out as the stage closes, and a runner's empty declaration is recorded. */
function closed(combatant: Combatant): Combatant {
  if (combatant.outReason !== null) return combatant
  // Movement completes only once everyone still in the fight has confirmed a choice.
  const { leave, choice } = combatant.movement!
  if (leave === 'confirmed') return { ...combatant, outReason: 'left' }
  return choice === 'run' ? { ...combatant, declaration: RAN } : combatant
}

function requireSettleable(state: CombatState) {
  if (state.phase !== 'movement' || !state.movementComplete) throw new Error('Movement is not ready to settle.')
}

const moversInOrder = (state: CombatState): Combatant[] => combatOrdered(state).filter((entry) => entry.outReason === null)

/** The GM's workspace settles Movement by itself once every choice is in: pickups, Leaves and Runs, then Declare begins. */
const settleMovement: CombatHandler = (command, records, authority, entropy) => {
  requireGm(authority)
  const fight = requireLiveContext(command, records, authority)
  requireSettleable(fight.state)
  const start: Settling = { floor: fight.state.floor, sheets: [], logs: [] }
  const settled = moversInOrder(fight.state).reduce((settling, combatant) => settleOne(settling, combatant, fight.state, records, command), start)
  const combatants = fight.state.combatants.map(closed)
  const declaring: CombatState = { ...fight.state, combatants, floor: settled.floor, phase: 'declare', stageInstanceId: entropy.id('stage', 0), movementComplete: false, lastAttack: null }
  const next = withDeclareRequests(declaring, entropy)
  return { fight: { ...fight, state: next.state }, items: [], logs: [...settled.logs, { event: `Round ${fight.state.round}, Declare. Slowest first.`, actor: null }, ...next.logs], sheets: settled.sheets }
}

export const combatMovementSettleHandlers: Readonly<Record<string, CombatHandler>> = { settleMovement }
