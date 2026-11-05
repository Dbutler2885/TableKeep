import { sheetPayload } from '../../../character/characterStore/sheetIntentionEdits'
import { lubecSpendRound } from '../../../ruleSets/lubec/gear/attack'
import { lubecDetachFromGear, type LubecDetachedItem } from '../../../ruleSets/lubec/gear/detachedItems'
import type { LubecGear } from '../../../ruleSets/lubec/gear/gearRecord'
import type { LubecAttackChoice } from '../../../ruleSets/lubec/gear/weaponAttacks'
import { lubecFightAttack } from '../../fight/lubecFightWeapons'
import { readCombatAim, repairPlan } from './attackAim'
import { combatAttackResult, combatFightingTraining, type CombatAttackResult } from './attackMath'
import { attackAt, attackRepair, combatantOf, combatSheetOf, requireOpponent } from './attackParty'
import type { CombatLog, CombatPendingAction } from './combatFeedback'
import type { CombatEntropy } from './commandEntropy'
import { requireLiveContext } from './context'
import { settleCombatAttack } from './settlement'
import type { CombatAttack, CombatCommand, Combatant, CombatFight, CombatFrozenAim, CombatHandler, CombatPlan, CombatSheet, CombatState } from './types'

type Spent = { gear: LubecGear | null; detached: LubecDetachedItem[] }

const SPEND_REFUSALS = { gone: 'That weapon is no longer in hand. Choose again.', 'not-in-hand': 'That weapon is no longer in hand. Choose again.', empty: 'No round is loaded. Choose again.' } as const

function fire(gear: LubecGear, weaponItemId: string): Spent {
  const spent = lubecSpendRound(gear, weaponItemId)
  if (!spent.ok) throw new Error(SPEND_REFUSALS[spent.why])
  return { gear: spent.gear, detached: [] }
}

/** The Roll's one cost: a thrown unit leaves the hand, a firearm spends its round, a blow up close spends nothing. */
function spend(gear: LubecGear, weaponItemId: string, choice: LubecAttackChoice, commandId: string): Spent {
  if (choice.firearm) return fire(gear, weaponItemId)
  if (!choice.ranged) return { gear: null, detached: [] }
  const thrown = lubecDetachFromGear(gear, weaponItemId, 1, { commandId, role: 'throw' })
  return { gear: thrown.gear, detached: [thrown.detached] }
}

function requireStillLegal(record: CombatSheet, attack: CombatAttack) {
  const aim = attack.aim!
  const legal = lubecFightAttack(record.sheet.gear, aim.weaponItemId, combatFightingTraining(record.sheet), aim.attackId)
  if (!legal) throw new Error('That weapon is no longer in hand. Choose again.')
}

function requireAimed(attack: CombatAttack): CombatFrozenAim {
  if (!attack.aim || !attack.frozen) throw new Error('Pick a target, a weapon and an attack first.')
  return attack.frozen
}

function requireReady(attack: CombatAttack, raw: unknown): CombatFrozenAim {
  const frozen = requireAimed(attack)
  if (sheetPayload(readCombatAim(raw)) !== sheetPayload(attack.aim)) throw new Error('Your choices changed. Press Roll again.')
  if (frozen.choice.ranged && !attack.range) throw new Error('Waiting for the GM to declare the range.')
  return frozen
}

const pad = (value: number): string => String(value).padStart(2, '0')

function resultWords(result: CombatAttackResult): string {
  if (!result.hit) return 'Miss'
  return `Hit · Quality ${result.quality}${result.critical ? ' (critical)' : ''}`
}

function rollLog(state: CombatState, attacker: Combatant, target: Combatant, frozen: CombatFrozenAim, result: CombatAttackResult): CombatLog {
  const thrown = frozen.choice.ranged && !frozen.choice.firearm
  return {
    event: `${attacker.name} attacked ${target.name}.`, actor: attacker.key,
    roll: {
      who: attacker.name, what: state.round === 0 ? 'Attack roll (before initiative)' : 'Attack roll',
      roll: pad(result.roll), target: `against ${result.attackNumber}`, tone: result.hit ? 'ok' : 'bad', result: resultWords(result),
      ...(thrown ? { extra: `${frozen.weaponName} thrown at ${target.name}; it has left ${attacker.name}'s hand.` } : {}),
    },
  }
}

/** What follows a hit: Defense against melee and thrown attacks, the location against a firearm. */
const hitStep = (frozen: CombatFrozenAim): 'defense' | 'location' => (frozen.choice.firearm ? 'location' : 'defense')

function nextRequests(attack: CombatAttack, frozen: CombatFrozenAim, result: CombatAttackResult): CombatPendingAction[] {
  if (!result.hit) return []
  const step = hitStep(frozen)
  return [{ combatantKey: step === 'defense' ? attack.aim!.targetKey : attack.attackerKey, action: step }]
}

const spentOnce = (state: CombatState, key: string) =>
  state.combatants.map((entry) => (entry.key === key ? { ...entry, interactionSequence: entry.interactionSequence + 1 } : entry))

function rolledState(state: CombatState, attack: CombatAttack, frozen: CombatFrozenAim, result: CombatAttackResult, detached: LubecDetachedItem[]): CombatState {
  const step = result.hit ? hitStep(frozen) : 'done'
  const next: CombatState = {
    ...state, combatants: spentOnce(state, attack.attackerKey), pendingActions: nextRequests(attack, frozen, result),
    attack: { ...attack, step, roll: result, detached, repair: null },
  }
  // A miss completes the attack: its thrown object lands on the Floor.
  return result.hit ? next : settleCombatAttack(next)
}

function rollPlan(fight: CombatFight, attack: CombatAttack, record: CombatSheet, command: CombatCommand, entropy: CombatEntropy): CombatPlan {
  const { state } = fight
  const frozen = attack.frozen!
  const attacker = combatantOf(state, attack.attackerKey)
  const target = requireOpponent(state, attacker, attack.aim!.targetKey)
  requireStillLegal(record, attack)
  const spent = spend(record.sheet.gear, attack.aim!.weaponItemId, frozen.choice, command.envelope.id)
  const result = combatAttackResult(entropy.die('attack', 100), frozen.attack + (attack.range?.modifier ?? 0))
  return {
    fight: { ...fight, state: rolledState(state, attack, frozen, result, spent.detached) }, items: [],
    logs: [rollLog(state, attacker, target, frozen, result)],
    sheets: spent.gear ? [{ selection: { kind: attacker.kind, sheetId: attacker.sheetId }, gear: spent.gear }] : [],
  }
}

/** Roll once: check the sheet first, spend once, roll a shared d100 strictly under the attack, and persist the next step. */
const roll: CombatHandler = (command, records, authority, entropy) => {
  const fight = requireLiveContext(command, records, authority)
  const attack = attackAt(fight.state, command, 'aim')
  requireReady(attack, command.payload.aim)
  const attacker = combatantOf(fight.state, attack.attackerKey)
  const record = combatSheetOf(records, attacker)
  const repair = attackRepair(attacker, record)
  if (repair) return repairPlan(fight, attack, attacker, repair)
  return rollPlan(fight, attack, record!, command, entropy)
}

export const combatRollHandlers: Readonly<Record<string, CombatHandler>> = { roll }
