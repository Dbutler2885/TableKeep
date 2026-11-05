import { lubecEffectiveHandle } from '../../../ruleSets/lubec/derivations'
import type { LubecArrival } from '../../../ruleSets/lubec/gear/arrival'
import { lubecPlaceDetached, type LubecDetachedItem } from '../../../ruleSets/lubec/gear/detachedItems'
import type { LubecItem } from '../../../ruleSets/lubec/gear/gearRecord'
import { place } from '../../../ruleSets/lubec/gear/placement'
import { repairPlan } from './attackAim'
import { closeAttack, pad, stepRequest, tens, toLocation } from './attackFlow'
import { attackAt, attackRepair, combatantOf, combatSheetOf, defenderOf } from './attackParty'
import { declaredLine, isRoundAttack } from './roundAttacks'
import type { CombatEntropy } from './commandEntropy'
import { requireLiveContext } from './context'
import { combatInputModifiers } from './inputModifiers'
import type { CombatAttack, CombatCommand, Combatant, CombatDefenseRoll, CombatFight, CombatHandler, CombatPlan, CombatSheet, CombatState } from './types'

type Split = { amount: number; full: boolean }

/** The defender's grant-local split: whole tens of their own Handle, or Full Defense's whole pool. */
const isSplitAmount = (amount: unknown, pool: number): amount is number =>
  Number.isSafeInteger(amount) && (amount as number) >= 0 && (amount as number) % 10 === 0 && (amount as number) <= pool

function readSplit(raw: unknown, pool: number): Split {
  const { amount, full } = (raw ?? {}) as Record<string, unknown>
  if (full === true) return { amount: pool, full: true }
  if (!isSplitAmount(amount, pool)) throw new Error('Keep Defense in tens, within your Handle.')
  return { amount, full: false }
}

/** Strictly under its number; a success takes off its tens digit plus 1, a failure nothing. Full Defense adds 10, capped at 100. */
function rollDefense(split: Split, entropy: CombatEntropy): CombatDefenseRoll {
  const value = split.full ? Math.min(100, split.amount + 10) : split.amount
  const roll = entropy.die('defense', 100)
  const success = roll < value
  return { ...split, value, roll, success, removes: success ? tens(roll) + 1 : 0 }
}

const caughtItem = (attack: CombatAttack): LubecItem | null => (attack.detached[0]?.item as LubecItem | undefined) ?? null

/** A catch needs a stopped throw, an item with a chance above 0 and a free hand for it; 10 more per point below 0, capped at 100. */
const catchable = (attack: CombatAttack): LubecItem | null => {
  const item = caughtItem(attack)
  return (item?.catchChance ?? 0) > 0 ? item : null
}

export function catchChance(attack: CombatAttack, sheet: CombatSheet, net: number): number {
  const item = catchable(attack)
  if (!item || !place(sheet.sheet.gear, 'hands', item).ok) return 0
  return Math.min(100, item.catchChance! + 10 * -net)
}

function defenseLog(defender: Combatant, attack: CombatAttack, defense: CombatDefenseRoll, net: number) {
  return {
    event: `${defender.name} defended.`, actor: defender.key,
    roll: {
      who: defender.name, what: 'Defense roll', roll: pad(defense.roll), target: `under ${defense.value}`, tone: defense.success ? 'bad' as const : 'ok' as const,
      result: defense.success ? `Holds · takes off ${defense.removes}` : 'Fails · takes off nothing', extra: `Quality ${attack.roll!.quality} − ${defense.removes} = ${net}`,
    },
  }
}

/** After Defense: a stopped catchable throw waits on the catch, any other stop is a dodge, and an unstopped hit lands. */
function afterDefense(state: CombatState, attack: CombatAttack, record: CombatSheet, net: number, entropy: CombatEntropy): CombatState {
  if (!attack.defense?.success || net > 0) return toLocation(state, attack, net, entropy)
  const chance = catchChance(attack, record, net)
  if (chance <= 0) return closeAttack(state, attack, 'dodged')
  const item = caughtItem(attack)!
  const catchItem = { name: item.name, chance: item.catchChance! }
  return { ...state, attack: { ...attack, step: 'catch', net, catchChance: chance, catchItem }, pendingActions: stepRequest(defenderOf(attack), 'catch') }
}

/** In a round the declared line rolls as declared; a Sneak Attack's defender splits now, grant-local. */
function defenseSplit(fight: CombatFight, attack: CombatAttack, record: CombatSheet, command: CombatCommand): Split {
  // A round's hit asks for Defense only when the target declared a line against this attacker, so it has one here.
  const line = isRoundAttack(fight.state, attack) ? declaredLine(fight.state, attack) : null
  if (line) return { amount: line.amount, full: line.full }
  return readSplit(command.payload.split, handlePool(fight, record, command))
}

const handlePool = (fight: CombatFight, record: CombatSheet, command: CombatCommand): number =>
  lubecEffectiveHandle(record.sheet, combatInputModifiers(record.sheet, { fightId: command.envelope.fightId, round: fight.state.round }))!

function defended(fight: CombatFight, attack: CombatAttack, record: CombatSheet, command: CombatCommand, entropy: CombatEntropy): CombatPlan {
  const defender = combatantOf(fight.state, defenderOf(attack))
  const split = defenseSplit(fight, attack, record, command)
  if (split.amount === 0) return { fight: { ...fight, state: toLocation(fight.state, { ...attack, defense: null }, attack.roll!.quality!, entropy) }, items: [], logs: [{ event: `${defender.name} kept no Defense.`, actor: defender.key }] }
  const defense = rollDefense(split, entropy)
  const net = attack.roll!.quality! - defense.removes
  const state = afterDefense(fight.state, { ...attack, defense, net, repair: null }, record, net, entropy)
  return { fight: { ...fight, state }, items: [], logs: [defenseLog(defender, attack, defense, net)] }
}

/**
 * The defender names this attacker with a grant-local split of their own Handle and rolls Defense, only after a hit.
 * The split expires with the attack: it is no declaration and spends nothing for round 1.
 */
const defend: CombatHandler = (command, records, authority, entropy) => {
  const fight = requireLiveContext(command, records, authority)
  const attack = attackAt(fight.state, command, 'defense', defenderOf)
  const defender = combatantOf(fight.state, defenderOf(attack))
  const record = combatSheetOf(records, defender)
  const repair = attackRepair(defender, record)
  if (repair) return repairPlan(fight, attack, defender, repair)
  return defended(fight, attack, record!, command, entropy)
}

function catchLog(defender: Combatant, attack: CombatAttack, chance: number, roll: number, success: boolean) {
  const below = -attack.net!
  return {
    event: success ? `${defender.name} caught it.` : `${defender.name} dropped it.`, actor: defender.key,
    roll: {
      who: defender.name, what: 'Catch roll', roll: pad(roll), target: `under ${chance}%`, tone: success ? 'bad' as const : 'neutral' as const,
      result: success ? 'Caught' : 'Dropped: still a dodge', extra: `${caughtItem(attack)!.catchChance}% + 10 × ${below} below 0`,
    },
  }
}

const outOnCatch = (state: CombatState, attack: CombatAttack, item: LubecItem) =>
  state.combatants.map((entry) => (entry.key === attack.attackerKey && item.catchPutsThrowerOut ? { ...entry, outReason: 'caught' } : entry))

/** A success puts the object in the catcher's first free hand, and the thrower Out when the item says so. */
function caught(fight: CombatFight, attack: CombatAttack, record: CombatSheet, detached: LubecDetachedItem, command: CombatCommand): CombatPlan {
  // The free hand was checked in this same transaction before the roll, so the placement succeeds.
  const arrival = lubecPlaceDetached(record.sheet.gear, detached, { commandId: command.envelope.id, role: 'catch' }, 'hands') as Extract<LubecArrival, { ok: true }>
  const item = detached.item as LubecItem
  const state = closeAttack({ ...fight.state, combatants: outOnCatch(fight.state, attack, item) }, { ...attack, detached: [] }, 'caught')
  return { fight: { ...fight, state }, items: [], logs: [], sheets: [{ selection: { kind: record.kind, sheetId: record.sheetId }, gear: arrival.gear }] }
}

/** A hand that filled since Defense cannot take it: no catch is rolled, and the object drops, still a dodge. */
function handsFull(fight: CombatFight, attack: CombatAttack, defender: Combatant): CombatPlan {
  const state = closeAttack(fight.state, { ...attack, repair: null }, 'dropped')
  return { fight: { ...fight, state }, items: [], logs: [{ event: `${defender.name} has no free hand to catch with any more. It drops: still a dodge.`, actor: defender.key }] }
}

function caughtOrDropped(fight: CombatFight, attack: CombatAttack, record: CombatSheet, command: CombatCommand, entropy: CombatEntropy): CombatPlan {
  const defender = combatantOf(fight.state, defenderOf(attack))
  if (!place(record.sheet.gear, 'hands', caughtItem(attack)!).ok) return handsFull(fight, attack, defender)
  const chance = attack.catchChance!
  const roll = entropy.die('catch', 100)
  const rolled = { ...attack, catch: { chance, roll, success: roll < chance }, repair: null }
  const log = catchLog(defender, attack, chance, roll, roll < chance)
  if (roll < chance) return { ...caught(fight, rolled, record, attack.detached[0], command), logs: [log] }
  return { fight: { ...fight, state: closeAttack(fight.state, rolled, 'dropped') }, items: [], logs: [log] }
}

/** The defender rolls the catch; failing it is still a dodge. */
const catchRoll: CombatHandler = (command, records, authority, entropy) => {
  const fight = requireLiveContext(command, records, authority)
  const attack = attackAt(fight.state, command, 'catch', defenderOf)
  const defender = combatantOf(fight.state, defenderOf(attack))
  const record = combatSheetOf(records, defender)
  const repair = attackRepair(defender, record)
  if (repair) return repairPlan(fight, attack, defender, repair)
  return caughtOrDropped(fight, attack, record!, command, entropy)
}

/** The defender shows the table the split they are choosing; it binds nothing until they roll. */
const split: CombatHandler = (command, records, authority) => {
  const fight = requireLiveContext(command, records, authority)
  const attack = attackAt(fight.state, command, 'defense', defenderOf)
  const defender = combatantOf(fight.state, defenderOf(attack))
  const record = combatSheetOf(records, defender)
  const repair = attackRepair(defender, record)
  if (repair) return repairPlan(fight, attack, defender, repair)
  const defenseSplit = readSplit(command.payload.split, handlePool(fight, record!, command))
  return { fight: { ...fight, state: { ...fight.state, attack: { ...attack, defenseSplit, repair: null } } }, items: [], logs: [] }
}

export const combatDefenseHandlers: Readonly<Record<string, CombatHandler>> = { split, defend, catch: catchRoll }
