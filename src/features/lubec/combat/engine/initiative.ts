import { lubecCurrentValue } from '../../../ruleSets/lubec/derivations'
import { pad, stepRequest } from './attackFlow'
import { attackRepair, combatantOf, combatSheetOf } from './attackParty'
import type { CombatLog } from './combatFeedback'
import { withMovementRequests } from './movement'
import type { CombatEntropy } from './commandEntropy'
import { requireGm, requireLiveContext } from './context'
import { combatantKey } from './inputs'
import { combatInputModifiers } from './inputModifiers'
import type { Combatant, CombatCommand, CombatFight, CombatHandler, CombatInitiative, CombatPlan, CombatRecords, CombatSheet, CombatState } from './types'

const inFight = (state: CombatState): Combatant[] => state.combatants.filter((entry) => entry.outReason === null)
const unrolled = (state: CombatState): Combatant[] => inFight(state).filter((entry) => !entry.initiative)

/** Initiative waits until no granted attack, result or repair is open and every pre-initiative wound is on its sheet. */
function requireReadyForInitiative(state: CombatState) {
  if (state.phase !== 'before-initiative') throw new Error('Initiative has already been rolled.')
  if (state.attack && !state.attack.closed) throw new Error('Finish the granted attack first.')
  if (state.woundOutbox.length) throw new Error('Wounds must reach the sheet before initiative.')
}

/** The GM's Begin Combat - Roll Initiative: everyone not Out rolls once, on a new stage. */
const begin: CombatHandler = (command, records, authority, entropy) => {
  requireGm(authority)
  const fight = requireLiveContext(command, records, authority)
  requireReadyForInitiative(fight.state)
  const pendingActions = inFight(fight.state).flatMap((entry) => stepRequest(entry.key, 'initiative'))
  const state: CombatState = { ...fight.state, phase: 'initiative', stageInstanceId: entropy.id('stage', 0), pendingActions }
  return { fight: { ...fight, state }, items: [], logs: [{ event: 'The GM pressed Roll Initiative.', actor: null }] }
}

/** A sheet read below its newest wound delivery revision is an old copy: wait for the delivered one. */
export function requireDelivered(state: CombatState, record: CombatSheet) {
  const acknowledged = state.woundAcknowledgements.filter((ack) => combatantKey(ack.target) === combatantKey(record))
  const newest = Math.max(0, ...acknowledged.map((ack) => ack.targetRevision))
  if ((record.revision ?? 0) < newest) throw new Error('Waiting for wounds to reach the sheet')
}

/** Canonical Speed with this fight's pre-initiative wounds in, once their delivery revision is on the sheet. */
function speedOf(state: CombatState, record: CombatSheet, fightId: string): number {
  requireDelivered(state, record)
  return lubecCurrentValue(record.sheet, 'Speed', combatInputModifiers(record.sheet, { fightId, round: 1 }))!
}

/** d100 strictly under Speed, frozen with the sheet revision it was read from. */
function rollInitiative(speed: number, record: CombatSheet, entropy: CombatEntropy): CombatInitiative {
  const roll = entropy.die('initiative', 100)
  return { roll, speed, success: roll < speed, sourceRevision: record.revision ?? 0, ties: [] }
}

function initiativeLog(combatant: Combatant, rolled: CombatInitiative, by: string): CombatLog {
  return {
    event: `${combatant.name} rolled initiative.`, actor: combatant.key,
    roll: { who: combatant.name, what: by, roll: pad(rolled.roll), target: `under Speed ${rolled.speed}`, tone: rolled.success ? 'ok' : 'bad', result: rolled.success ? 'Success' : 'Failure' },
  }
}

/** Successes first, higher successes first, lower failures first, then higher Speed; each tie roll ranks the same way. */
const rankOf = (success: boolean, roll: number, speed: number): number[] => [success ? 0 : 1, success ? -roll : roll, -speed]
const rankKey = (entry: Combatant): number[] => {
  const { roll, speed, success, ties } = entry.initiative!
  return [...rankOf(success, roll, speed), ...ties.flatMap((tie) => rankOf(tie < speed, tie, speed))]
}

function compareRanks(a: number[], b: number[]): number {
  const index = a.findIndex((value, at) => value !== b[at])
  return index === -1 ? 0 : a[index] - b[index]
}

const sameRank = (a: Combatant, b: Combatant) => compareRanks(rankKey(a), rankKey(b)) === 0

/** Rolled combatants in the order their rolls so far give, as the table watches it build. */
export const byInitiative = (combatants: readonly Combatant[]): Combatant[] =>
  combatants.filter((entry) => entry.initiative).sort((a, b) => compareRanks(rankKey(a), rankKey(b)))

/** Everyone still tied with someone else rerolls; a reroll ranks after every earlier roll. */
function rerollTies(combatants: Combatant[], entropy: CombatEntropy): { combatants: Combatant[]; rerolled: Combatant[] } {
  const tied = combatants.filter((entry) => combatants.some((other) => other !== entry && sameRank(entry, other)))
  const rerolled = combatants.map((entry) => (tied.includes(entry) ? { ...entry, initiative: { ...entry.initiative!, ties: [...entry.initiative!.ties, entropy.die('tie', 100)] } } : entry))
  return { combatants: rerolled, rerolled: rerolled.filter((entry) => tied.some((tie) => tie.key === entry.key)) }
}

const MAX_TIE_ROUNDS = 20

/** The order, with every unresolved tie rerolled by the app and logged. */
export function settleInitiative(combatants: Combatant[], entropy: CombatEntropy): { combatants: Combatant[]; order: string[]; logs: CombatLog[] } {
  let current = combatants
  const logs: CombatLog[] = []
  for (let round = 0; round < MAX_TIE_ROUNDS; round++) {
    const { combatants: next, rerolled } = rerollTies(current, entropy)
    if (!rerolled.length) break
    logs.push({ event: `Tie rerolled: ${rerolled.map((entry) => `${entry.name} ${pad(entry.initiative!.ties.at(-1)!)}`).join(', ')}.`, actor: null })
    current = next
  }
  const order = [...current].sort((a, b) => compareRanks(rankKey(a), rankKey(b))).map((entry) => entry.key)
  return { combatants: current, order, logs }
}

/** With every roll in, the order is set and round 1's Movement begins by itself. */
function afterRoll(state: CombatState, entropy: CombatEntropy): { state: CombatState; logs: CombatLog[] } {
  if (unrolled(state).length) return { state, logs: [] }
  const rolled = inFight(state)
  const settled = settleInitiative(rolled, entropy)
  const combatants = state.combatants.map((entry) => settled.combatants.find((done) => done.key === entry.key) ?? entry)
  const next = withMovementRequests({ ...state, combatants, order: settled.order, phase: 'movement', round: 1, stageInstanceId: entropy.id('stage', 1) })
  return { state: next, logs: [...settled.logs, { event: 'Initiative is set. Round 1, Movement.', actor: null }] }
}

function withRoll(state: CombatState, combatant: Combatant, rolled: CombatInitiative): CombatState {
  const combatants = state.combatants.map((entry) => (entry.key === combatant.key ? { ...entry, speed: rolled.speed, initiative: rolled } : entry))
  // Begin set every request, so the list is there to take this roll's off.
  return { ...state, combatants, pendingActions: state.pendingActions!.filter((action) => action.combatantKey !== combatant.key) }
}

type Rolled = { state: CombatState; logs: CombatLog[] }

function rollFor(state: CombatState, combatant: Combatant, records: CombatRecords, command: CombatCommand, entropy: CombatEntropy, by: string): Rolled {
  const record = combatSheetOf(records, combatant)
  const repair = attackRepair(combatant, record)
  if (repair) throw new Error(repair)
  const rolled = rollInitiative(speedOf(state, record!, command.envelope.fightId), record!, entropy)
  return { state: withRoll(state, combatant, rolled), logs: [initiativeLog(combatant, rolled, by)] }
}

function requireRollable(state: CombatState, key: string | null): Combatant {
  if (state.phase !== 'initiative') throw new Error('Initiative is not being rolled.')
  const combatant = combatantOf(state, String(key))
  if (!unrolled(state).includes(combatant)) throw new Error(`${combatant.name} has already rolled or is Out.`)
  return combatant
}

function finish(fight: CombatFight, rolled: Rolled, entropy: CombatEntropy): CombatPlan {
  const after = afterRoll(rolled.state, entropy)
  return { fight: { ...fight, state: after.state }, items: [], logs: [...rolled.logs, ...after.logs] }
}

/** A player rolls their own combatant's initiative; the GM may roll it for an absent player. */
const initiative: CombatHandler = (command, records, authority, entropy) => {
  const fight = requireLiveContext(command, records, authority)
  const combatant = requireRollable(fight.state, command.envelope.actorKey)
  return finish(fight, rollFor(fight.state, combatant, records, command, entropy, 'Initiative'), entropy)
}

/** One GM action rolls every NPC still to roll. */
const npcInitiative: CombatHandler = (command, records, authority, entropy) => {
  requireGm(authority)
  const fight = requireLiveContext(command, records, authority)
  const npcs = unrolled(fight.state).filter((entry) => entry.kind === 'npc')
  if (fight.state.phase !== 'initiative' || !npcs.length) throw new Error('No NPC is waiting to roll initiative.')
  const rolled = npcs.reduce<Rolled>((done, npc) => {
    const next = rollFor(done.state, npc, records, command, entropy, 'Initiative (GM)')
    return { state: next.state, logs: [...done.logs, ...next.logs] }
  }, { state: fight.state, logs: [] })
  return finish(fight, rolled, entropy)
}

export const combatInitiativeHandlers: Readonly<Record<string, CombatHandler>> = { begin, initiative, npcInitiative }
