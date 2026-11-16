import { sheetPayload } from '../../../character/characterStore/sheetIntentionEdits'
import { lubecSpendRound } from '../../../ruleSets/lubec/gear/attack'
import { lubecDetachFromGear, type LubecDetachedItem } from '../../../ruleSets/lubec/gear/detachedItems'
import type { LubecGear } from '../../../ruleSets/lubec/gear/gearRecord'
import type { LubecAttackChoice } from '../../../ruleSets/lubec/gear/weaponAttacks'
import { readCombatAim, repairPlan } from './attackAim'
import { combatAttackResult, type CombatAttackResult } from './attackMath'
import { attackAt, attackRepair, combatantOf, combatSheetOf, requireOpponent } from './attackParty'
import type { CombatLog } from './combatFeedback'
import type { CombatEntropy } from './commandEntropy'
import { requireLiveContext } from './context'
import { requireDue } from './declare'
import { closeAttack, stepRequest, toLocation } from './attackFlow'
import { declaredLine, isRoundAttack } from './roundAttacks'
import { weaponInHand } from './chooseAgain'
import { evasionFor } from './evasion'
import { checkSplit } from './splitRepair'
import { combatAttackActions, combatRollMode, combatTaskPenalty, modeRecord, modeWords, rollWithMode } from './combatModes'
import type { CombatAttack, CombatCommand, Combatant, CombatEvasion, CombatFight, CombatFrozenAim, CombatHandler, CombatPlan, CombatSheet, CombatState } from './types'

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

function requireStillLegal(record: CombatSheet, attack: CombatAttack, context: { fightId: string; round: number }) {
  if (!weaponInHand(record, attack.aim!, context)) throw new Error('That weapon is no longer in hand. Choose again.')
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

/** What the roll card adds under the result: a thrown object leaving the hand, and the target's Evasive Movement. */
function rollExtra(attacker: Combatant, target: Combatant, frozen: CombatFrozenAim, evasion: CombatEvasion | null): string | null {
  const thrown = frozen.choice.ranged && !frozen.choice.firearm ? `${frozen.weaponName} thrown at ${target.name}; it has left ${attacker.name}'s hand.` : null
  const evaded = evasion ? `${target.name} is moving evasively: −${evasion.penalty} to hit.` : null
  return [thrown, evaded].filter(Boolean).join(' ') || null
}

function rollLog(state: CombatState, attacker: Combatant, target: Combatant, frozen: CombatFrozenAim, result: CombatAttackResult, evasion: CombatEvasion | null): CombatLog {
  const both = result.dice ? modeWords({ mode: result.mode!, because: result.because ?? null }, result.dice) : null
  const extra = [both, rollExtra(attacker, target, frozen, evasion)].filter(Boolean).join(' ') || null
  return {
    event: `${attacker.name} attacked ${target.name}.`, actor: attacker.key,
    roll: {
      who: attacker.name, what: state.round === 0 ? 'Attack roll (before initiative)' : 'Attack roll',
      roll: pad(result.roll), target: `against ${result.attackNumber}`, tone: result.hit ? 'ok' : 'bad', result: resultWords(result),
      ...(extra ? { extra } : {}),
    },
  }
}

const spentOnce = (state: CombatState, key: string) =>
  state.combatants.map((entry) => (entry.key === key ? { ...entry, interactionSequence: entry.interactionSequence + 1 } : entry))

/**
 * Whether the target rolls Defense against this hit (the Roll has already refused a target who is Out): in a round
 * only on a declared line naming this attacker, so a runner, whose Run cost their Defense, and anyone guarding elsewhere take it undefended.
 */
const defends = (state: CombatState, attack: CombatAttack): boolean => !isRoundAttack(state, attack) || declaredLine(state, attack) !== null

/** Defense never answers a firearm. */
const skipsDefense = (state: CombatState, attack: CombatAttack): boolean => attack.frozen!.choice.firearm === true || state.combatants.find((entry) => entry.key === attack.aim!.targetKey)?.unconscious === true || !defends(state, attack)

/**
 * What follows the roll: a miss completes the attack and its object lands on the Floor; a hit asks the
 * target for Defense against melee and thrown attacks, and lands a firearm's hit, or a hit on a runner, at once.
 */
function rolledState(state: CombatState, attack: CombatAttack, result: CombatAttackResult, detached: LubecDetachedItem[], entropy: CombatEntropy): CombatState {
  const spent = { ...state, combatants: spentOnce(state, attack.attackerKey) }
  const rolled = { ...attack, roll: result, detached, repair: null }
  if (!result.hit) return closeAttack(spent, rolled, 'miss')
  if (skipsDefense(state, attack)) return toLocation(spent, rolled, result.quality!, entropy)
  return { ...spent, attack: { ...rolled, step: 'defense' }, pendingActions: stepRequest(attack.aim!.targetKey, 'defense') }
}

/** A hit beats a miss; between two hits the higher quality, then the higher roll. On an attack at Disadvantage that is "fails if either fails, the lower roll if both succeed". */
const betterAttack = (a: CombatAttackResult, b: CombatAttackResult): boolean =>
  (a.hit && !b.hit) || (a.hit && b.hit && ((a.quality ?? 0) > (b.quality ?? 0) || (a.quality === b.quality && a.roll > b.roll)))

function rollPlan(fight: CombatFight, attack: CombatAttack, record: CombatSheet, command: CombatCommand, entropy: CombatEntropy): CombatPlan {
  if (fight.state.combatants.find((entry) => entry.key === attack.attackerKey)?.unconscious) throw new Error('An unconscious combatant cannot attack.')
  const { state } = fight
  const frozen = attack.frozen!
  const attacker = combatantOf(state, attack.attackerKey)
  const target = requireOpponent(state, attacker, attack.aim!.targetKey)
  requireStillLegal(record, attack, { fightId: command.envelope.fightId, round: state.round })
  const spent = spend(record.sheet.gear, attack.aim!.weaponItemId, frozen.choice, command.envelope.id)
  // A ranged attack at an evader takes the evasion penalty off the attack number, beside the GM's range.
  const evasion = evasionFor(state, target.key, frozen.choice)
  const context = { fightId: command.envelope.fightId, round: state.round }
  const actions = combatAttackActions(frozen.choice)
  // A task-only Handle penalty ("-20 Handle on ranged actions") comes off the attack number for an attack that is that action.
  const attackNumber = frozen.attack + (attack.range?.modifier ?? 0) - (evasion?.penalty ?? 0) + combatTaskPenalty(record, actions, context, 'Handle')
  const mode = combatRollMode(record, { kind: 'attack', stat: 'Handle', actions }, context)
  const rolled = rollWithMode(entropy, 'attack', mode.mode, (die) => combatAttackResult(die, attackNumber), betterAttack)
  const result: CombatAttackResult = { ...rolled.kept, ...modeRecord(mode, rolled.dice) }
  return {
    fight: { ...fight, state: rolledState(state, { ...attack, evasion }, result, spent.detached, entropy) }, items: [],
    logs: [rollLog(state, attacker, target, frozen, result, evasion)],
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
  // A wound that landed on the attacker this round must be on their sheet before they roll.
  requireDue(fight.state, attacker, record!)
  if (attack.splitRepair) throw new Error('Waiting for the split to be repaired.')
  if (!isRoundAttack(fight.state, attack)) return rollPlan(fight, attack, record!, command, entropy)
  // A declared attack rolls only once its split still fits the pool, or has been split again.
  const split = checkSplit(fight, attacker.key, records, command.envelope.fightId)
  if (split.kind === 'choose') return { fight: { ...fight, state: split.state }, items: [], logs: [split.log] }
  if (split.kind === 'fits') return rollPlan(fight, attack, record!, command, entropy)
  const current = { ...fight, state: split.state }
  const plan = rollPlan(current, current.state.attack!, record!, command, entropy)
  return { ...plan, logs: [split.log, ...plan.logs] }
}

export const combatRollHandlers: Readonly<Record<string, CombatHandler>> = { roll }
