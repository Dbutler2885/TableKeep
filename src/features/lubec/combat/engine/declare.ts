import { lubecEffectiveHandle } from '../../../ruleSets/lubec/derivations'
import { freeze, readCombatAim, readingFor, requireAimPeople } from './attackAim'
import { clampHandle } from './attackMath'
import { attackRepair, combatantOf, combatSheetOf, requireOpponent } from './attackParty'
import type { CombatLog } from './combatFeedback'
import type { CombatEntropy } from './commandEntropy'
import { requireLiveContext } from './context'
import { requireDelivered } from './initiative'
import { combatantKey } from './inputs'
import { combatInputModifiers } from './inputModifiers'
import type { CombatCommand, Combatant, CombatDeclaration, CombatFight, CombatHandler, CombatSheet, CombatState } from './types'

/** Run's settled cost: the engine records an empty declaration, with no attack and no Defense. */
export const RAN: CombatDeclaration = { ran: true, full: false, aim: null, frozen: null, total: 0, lines: [], sourceRevision: 0 }

/** Everyone fastest first. Rounds begin only once initiative has set the order. */
export const combatOrdered = (state: CombatState): Combatant[] => state.order!.map((key) => combatantOf(state, key))

/** Declare runs slowest first: whoever is still in the fight with nothing declared yet. */
export const combatDeclarers = (state: CombatState): Combatant[] =>
  combatOrdered(state).reverse().filter((entry) => entry.outReason === null && !entry.declaration)

/** Attack runs fastest first, for everyone in the fight whose declaration has an attack. */
export const combatAttackers = (state: CombatState): Combatant[] =>
  combatOrdered(state).filter((entry) => entry.outReason === null && entry.declaration?.aim)

const attackWords = (state: CombatState): string => {
  const names = combatAttackers(state).map((entry) => entry.name)
  return names.length ? `Fastest first: ${names.join(', then ')}.` : 'Nobody declared an attack.'
}

/** The next declarer's request; with nobody left to declare, the round moves on to Attack by itself. */
export function withDeclareRequests(state: CombatState, entropy: CombatEntropy): { state: CombatState; logs: CombatLog[] } {
  const next = combatDeclarers(state)[0]
  if (next) return { state: { ...state, pendingActions: [{ combatantKey: next.key, action: 'declare' }] }, logs: [] }
  const attack: CombatState = { ...state, phase: 'attack', stageInstanceId: entropy.id('stage', 1), pendingActions: [] }
  return { state: attack, logs: [{ event: `Round ${state.round}, Attack. ${attackWords(state)}`, actor: null }] }
}

function requireDeclarer(state: CombatState, command: CombatCommand): Combatant {
  if (state.phase !== 'declare') throw new Error('Declaring is not open.')
  // Declare stays open only while someone has yet to declare; the last declaration moves the round on.
  const next = combatDeclarers(state)[0]
  if (next.key !== command.envelope.actorKey) throw new Error(`It is ${next.name}'s turn to declare.`)
  return next
}

/** Every wound due by this round is on the sheet, and this transaction read that sheet at or after its delivery. */
function requireDue(state: CombatState, declarer: Combatant, record: CombatSheet) {
  const due = state.woundOutbox.some((wound) => combatantKey(wound.target) === declarer.key && wound.effectiveRound <= state.round)
  if (due) throw new Error('Waiting for wounds to reach the sheet')
  requireDelivered(state, record)
}

function canonicalSheet(state: CombatState, declarer: Combatant, records: Parameters<CombatHandler>[1]): CombatSheet {
  const record = combatSheetOf(records, declarer)
  const repair = attackRepair(declarer, record)
  if (repair) throw new Error(repair)
  requireDue(state, declarer, record!)
  return record!
}

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0

/** The pool Full Defense puts on its one line: the chosen weapon's attack Handle, as the window sums it, otherwise Handle itself. */
function fullPool(fight: CombatFight, record: CombatSheet, raw: unknown, fightId: string): number {
  const { weaponItemId, attackId } = (raw ?? {}) as Record<string, unknown>
  if (isText(weaponItemId) && isText(attackId)) return readingFor(record, { targetKey: '', weaponItemId, attackId, defense: null }, fight, fightId).total
  return clampHandle(lubecEffectiveHandle(record.sheet, combatInputModifiers(record.sheet, { fightId, round: fight.state.round }))!)
}

/** Full Defense: no attack, and the whole pool on one line naming one person. Its +10 belongs to the roll, not the pool. */
function fullDefense(fight: CombatFight, declarer: Combatant, record: CombatSheet, command: CombatCommand): CombatDeclaration {
  const against = command.payload.against
  if (!isText(against)) throw new Error('Full Defense names the one person you guard against.')
  requireOpponent(fight.state, declarer, against)
  const total = fullPool(fight, record, command.payload.aim, command.envelope.fightId)
  return { ran: false, full: true, aim: null, frozen: null, total, lines: [{ against, amount: total }], sourceRevision: record.revision ?? 0 }
}

/** An attack and at most one named Defense line, split from the same pool in tens and frozen now. */
function attackDeclaration(fight: CombatFight, declarer: Combatant, record: CombatSheet, command: CombatCommand): CombatDeclaration {
  const aim = readCombatAim(command.payload.aim)
  requireAimPeople(fight.state, declarer, aim)
  const frozen = freeze(record, aim, readingFor(record, aim, fight, command.envelope.fightId))
  return { ran: false, full: false, aim, frozen, total: frozen.total, lines: aim.defense ? [aim.defense] : [], sourceRevision: frozen.sourceRevision }
}

const nameOf = (state: CombatState, key: string): string => combatantOf(state, key).name

function declaredLog(state: CombatState, declarer: Combatant, declaration: CombatDeclaration): CombatLog {
  const line = declaration.lines[0]
  const defense = line ? `Defense ${line.amount} against ${nameOf(state, line.against)}` : 'no Defense'
  if (declaration.full) return { event: `${declarer.name} declared Full Defense, no attack: ${defense}.`, actor: declarer.key }
  const { aim, frozen } = declaration
  return { event: `${declarer.name} declared: ${frozen!.choice.name} at ${nameOf(state, aim!.targetKey)}, ATK ${frozen!.attack}, ${defense}.`, actor: declarer.key }
}

/** The declarer's turn: everyone sees the declaration, and the next slower-to-faster declarer is asked. */
const declare: CombatHandler = (command, records, authority, entropy) => {
  const fight = requireLiveContext(command, records, authority)
  const declarer = requireDeclarer(fight.state, command)
  const record = canonicalSheet(fight.state, declarer, records)
  const declaration = command.payload.full === true ? fullDefense(fight, declarer, record, command) : attackDeclaration(fight, declarer, record, command)
  const combatants = fight.state.combatants.map((entry) => (entry.key === declarer.key ? { ...entry, declaration } : entry))
  const next = withDeclareRequests({ ...fight.state, combatants }, entropy)
  return { fight: { ...fight, state: next.state }, items: [], logs: [declaredLog(fight.state, declarer, declaration), ...next.logs] }
}

export const combatDeclareHandlers: Readonly<Record<string, CombatHandler>> = { declare }
