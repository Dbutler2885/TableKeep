import { lubecEffectiveHandle } from '../../../ruleSets/lubec/derivations'
import { freeze, readCombatAim, readingFor, requireAimPeople } from './attackAim'
import { clampHandle } from './attackMath'
import { attackRepair, combatantOf, combatSheetOf, requireOpponent } from './attackParty'
import type { CombatLog } from './combatFeedback'
import type { CombatEntropy } from './commandEntropy'
import { requireGm, requireLiveContext } from './context'
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
  combatOrdered(state).filter((entry) => entry.outReason === null && entry.declaration?.aim && !entry.declaration.stopped)

const attackWords = (state: CombatState): string => {
  const names = combatAttackers(state).map((entry) => entry.name)
  return names.length ? `Fastest first: ${names.join(', then ')}.` : 'Nobody declared an attack.'
}

/** The current choice must be approved before the next declarer or Attack can begin. */
export function withDeclareRequests(state: CombatState, entropy: CombatEntropy): { state: CombatState; logs: CombatLog[] } {
  const next = combatDeclarers(state)[0]
  if (next) {
    const action = next.proposedDeclaration ? 'reviewDeclaration' : 'declare'
    return { state: { ...state, pendingActions: [{ combatantKey: next.key, action }] }, logs: [] }
  }
  const attack: CombatState = { ...state, phase: 'attack', stageInstanceId: entropy.id('stage', 1), pendingActions: [] }
  return { state: attack, logs: [{ event: `Round ${state.round}, Attack. ${attackWords(state)}`, actor: null }] }
}

function requireDeclarer(state: CombatState, command: CombatCommand): Combatant {
  if (state.phase !== 'declare') throw new Error('Declaring is not open.')
  const next = combatDeclarers(state)[0]
  if (!next) throw new Error('Nobody is waiting to declare.')
  if (next.key !== command.envelope.actorKey) throw new Error(`It is ${next.name}'s turn to declare.`)
  if (next.proposedDeclaration) throw new Error('Waiting for the GM to approve or reject this declaration.')
  return next
}

/** Every wound due by this round is on the sheet, and this transaction read that sheet at or after its delivery. */
export function requireDue(state: CombatState, declarer: Combatant, record: CombatSheet) {
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
  if (declarer.movement?.choice === 'evade') throw new Error(`${declarer.name} moved evasively, which uses the action: no attack this round. Declare Full Defense instead.`)
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

/** The GM's NPC choice is final; player choices keep their turn while awaiting approval. */
const declare: CombatHandler = (command, records, authority, entropy) => {
  const fight = requireLiveContext(command, records, authority)
  const declarer = requireDeclarer(fight.state, command)
  const record = canonicalSheet(fight.state, declarer, records)
  const declaration = command.payload.full === true ? fullDefense(fight, declarer, record, command) : attackDeclaration(fight, declarer, record, command)
  if (declarer.kind === 'npc') {
    requireGm(authority)
    return finishDeclaration(fight, declarer, declaration, entropy)
  }
  const combatants = fight.state.combatants.map((entry) => (entry.key === declarer.key ? { ...entry, proposedDeclaration: declaration, declarationRejected: false } : entry))
  const next = withDeclareRequests({ ...fight.state, combatants, stageInstanceId: entropy.id('declaration-stage', 0) }, entropy)
  return { fight: { ...fight, state: next.state }, items: [], logs: [{ event: `${declarer.name} submitted a declaration for GM approval.`, actor: declarer.key }] }
}

function requireProposal(state: CombatState, command: CombatCommand): Combatant {
  if (state.phase !== 'declare') throw new Error('Declaring is not open.')
  if (typeof command.payload.approve !== 'boolean') throw new Error('Approve or reject the declaration.')
  const declarer = combatDeclarers(state)[0]
  if (!declarer?.proposedDeclaration || declarer.key !== command.payload.combatantKey) throw new Error('That declaration is not waiting for approval.')
  return declarer
}

/** Accept the chosen action or return it to its owner, then ask whoever the order still waits on. */
function finishDeclaration(fight: CombatFight, declarer: Combatant, declaration: CombatDeclaration | null, entropy: CombatEntropy) {
  const combatants = fight.state.combatants.map((entry) => (entry.key === declarer.key
    ? { ...entry, declaration, proposedDeclaration: null, declarationRejected: declaration === null }
    : entry))
  const next = withDeclareRequests({ ...fight.state, combatants, stageInstanceId: entropy.id('declaration-stage', 0) }, entropy)
  const log = declaration ? declaredLog(fight.state, declarer, declaration) : { event: `The GM rejected ${declarer.name}'s declaration. Choose again.`, actor: declarer.key }
  return { fight: { ...fight, state: next.state }, items: [], logs: [log, ...next.logs] }
}

/** Only GM approval advances a player's turn; rejection returns that same choice. */
const answerDeclaration: CombatHandler = (command, records, authority, entropy) => {
  requireGm(authority)
  const fight = requireLiveContext(command, records, authority)
  const declarer = requireProposal(fight.state, command)
  return finishDeclaration(fight, declarer, command.payload.approve ? declarer.proposedDeclaration! : null, entropy)
}

export const combatDeclareHandlers: Readonly<Record<string, CombatHandler>> = { declare, answerDeclaration }
