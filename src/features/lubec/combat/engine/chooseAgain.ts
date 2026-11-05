import { lubecPlaceDetached, lubecTakeDetached } from '../../../ruleSets/lubec/gear/detachedItems'
import { lubecFightAttack } from '../../fight/lubecFightWeapons'
import { closeAttack } from './attackFlow'
import { combatFightingTraining } from './attackMath'
import { attackAt, attackRepair, combatantOf, combatSheetOf } from './attackParty'
import { requireLiveContext } from './context'
import { isRoundAttack } from './roundAttacks'
import type { CombatAim, CombatAttack, CombatCommand, CombatFight, CombatHandler, CombatPlan, CombatRecords, CombatSheet, CombatState } from './types'

/** The weapon and its use are still in hand and still legal for this sheet. */
export const weaponInHand = (record: CombatSheet, aim: Pick<CombatAim, 'weaponItemId' | 'attackId'>): boolean =>
  Boolean(lubecFightAttack(record.sheet.gear, aim.weaponItemId, combatFightingTraining(record.sheet), aim.attackId))

/** What has gone since Declare: the target Out, or the weapon out of hand. */
export const goneSinceDeclare = (state: CombatState, attack: CombatAttack, record: CombatSheet) =>
  ({ target: combatantOf(state, attack.aim!.targetKey).outReason !== null, weapon: !weaponInHand(record, attack.aim!) })

const changedWeapon = (before: CombatAim, after: CombatAim): boolean =>
  before.weaponItemId !== after.weaponItemId || before.attackId !== after.attackId

/** Before the Roll a round's attacker chooses again only what has gone; the declared split stays. */
export function requireChooseAgain(state: CombatState, attack: CombatAttack, record: CombatSheet, next: CombatAim) {
  const gone = goneSinceDeclare(state, attack, record)
  if (next.targetKey !== attack.aim!.targetKey && !gone.target) throw new Error('Your declared target is still in the fight.')
  if (changedWeapon(attack.aim!, next) && !gone.weapon) throw new Error('Your declared weapon is still in hand.')
}

/** The open round attack on its aim step, and the attacker's sheet, ready for a choose-again act. */
function chooseAgainContext(command: CombatCommand, records: CombatRecords, authority: Parameters<CombatHandler>[2]) {
  const fight = requireLiveContext(command, records, authority)
  const attack = attackAt(fight.state, command, 'aim')
  if (!isRoundAttack(fight.state, attack)) throw new Error('Choosing again is for a declared attack.')
  const attacker = combatantOf(fight.state, attack.attackerKey)
  const record = combatSheetOf(records, attacker)
  const repair = attackRepair(attacker, record)
  if (repair) throw new Error(repair)
  return { fight, attack, attacker, record: record!, gone: goneSinceDeclare(fight.state, attack, record!) }
}

/** The turn is used: the attacker's interaction moves on and the attack closes without a roll. */
function usedTurn(fight: CombatFight, attack: CombatAttack, outcome: 'passed' | 'picked-up', state: Partial<CombatState> = {}): CombatFight {
  const combatants = fight.state.combatants.map((entry) => (entry.key === attack.attackerKey ? { ...entry, interactionSequence: entry.interactionSequence + 1 } : entry))
  return { ...fight, state: closeAttack({ ...fight.state, ...state, combatants }, attack, outcome) }
}

/** With nothing left to choose, the attacker gives up the turn. */
const pass: CombatHandler = (command, records, authority) => {
  const { fight, attack, attacker, gone } = chooseAgainContext(command, records, authority)
  if (!gone.target && !gone.weapon) throw new Error('Pass is only for a target or a weapon that has gone.')
  return { fight: usedTurn(fight, attack, 'passed'), items: [], logs: [{ event: `${attacker.name} passes.`, actor: attacker.key }] }
}

/** With the weapon gone, taking one from the Floor uses the action: it goes into a free hand and the turn ends. */
const floorPickup: CombatHandler = (command, records, authority): CombatPlan => {
  const { fight, attack, attacker, record, gone } = chooseAgainContext(command, records, authority)
  if (!gone.weapon) throw new Error('Your declared weapon is still in hand.')
  const itemCommand = { commandId: command.envelope.id, role: 'pickup' }
  const taken = lubecTakeDetached(fight.state.floor, String(command.payload.itemId), 1, itemCommand)
  const arrival = lubecPlaceDetached(record.sheet.gear, taken.detached, itemCommand, 'hands')
  if (!arrival.ok) throw new Error(`${attacker.name} has no free hand for the ${taken.detached.item.name}.`)
  const event = `${attacker.name} picked up the ${taken.detached.item.name}, using the action.`
  return { fight: usedTurn(fight, attack, 'picked-up', { floor: taken.records }), items: [], logs: [{ event, actor: attacker.key }], sheets: [{ selection: { kind: attacker.kind, sheetId: attacker.sheetId }, gear: arrival.gear }] }
}

export const combatChooseAgainHandlers: Readonly<Record<string, CombatHandler>> = { pass, floorPickup }
