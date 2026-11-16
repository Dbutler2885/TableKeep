import { lubecEffectiveHandle } from '../../../ruleSets/lubec/derivations'
import { readingFor } from './attackAim'
import { clampHandle } from './attackMath'
import { attackRepair, combatantOf, combatSheetOf } from './attackParty'
import type { CombatLog } from './combatFeedback'
import { requireLiveContext } from './context'
import { combatInputModifiers } from './inputModifiers'
import type { CombatAttack, Combatant, CombatDeclaration, CombatFight, CombatHandler, CombatSheet, CombatState } from './types'

// A declaration's numbers stay frozen while they still fit. When the sheet
// changes under them so that the Handle pool is now smaller than the attack
// and Defense declared from it, the declaration is repaired before its owner's
// next unresolved roll: before either part is used the owner chooses a legal
// Defense and the attack takes the rest; once one part is used it is locked
// and the other is what remains, or 0. The weapon, the use and the target stay;
// nothing is rerolled and there is no Check or penalty.

/** The split a repair waits on: whose it is, the pool now and before, and the Defense line it guards with. */
export type CombatSplitRepair = { combatantKey: string; pool: number; was: number; against: string; attackSpent: boolean }

/** The Handle pool the declaration draws on now: the declared use's sum, or Handle for Full Defense. */
function poolNow(fight: CombatFight, declaration: CombatDeclaration, record: CombatSheet, fightId: string): number {
  if (declaration.aim && !declaration.full) return readingFor(record, declaration.aim, fight, fightId).total
  return clampHandle(lubecEffectiveHandle(record.sheet, combatInputModifiers(record.sheet, { fightId, round: fight.state.round }))!)
}

const lineOf = (declaration: CombatDeclaration) => declaration.lines[0] ?? null

/** Whether this combatant's own attack has been rolled this round. */
export const attackSpent = (state: CombatState, key: string): boolean =>
  (state.attacked ?? []).includes(key) && !(state.attack?.attackerKey === key && !state.attack.roll)

/** The declaration with a new split: Defense on its one line, the attack the rest of the pool, or a spent attack kept as it was. */
function withSplit(declaration: CombatDeclaration, pool: number, defense: number, spentAttack: number | null = null): CombatDeclaration {
  const line = lineOf(declaration)
  // A Defense of 0 is no line at all: nothing is left to guard with.
  const lines = line && defense > 0 ? [{ against: line.against, amount: defense }] : []
  const frozen = declaration.frozen ? { ...declaration.frozen, total: pool, attack: spentAttack ?? Math.max(0, pool - defense) } : null
  const aimDefense = declaration.aim?.defense && defense > 0 ? { ...declaration.aim.defense, amount: defense } : null
  const aim = declaration.aim ? { ...declaration.aim, defense: aimDefense } : null
  return { ...declaration, aim, total: pool, frozen, lines, repaired: true }
}

type Broken = { declaration: CombatDeclaration; pool: number }

/** The declaration of `combatant` when its frozen split no longer fits the pool, with the pool now; null while it fits. */
function broken(fight: CombatFight, combatant: Combatant, record: CombatSheet | null, fightId: string): Broken | null {
  const declaration = combatant.declaration
  if (!record || !declaration || declaration.ran || declaration.stopped || fight.state.round < 1) return null
  const pool = poolNow(fight, declaration, record, fightId)
  return pool < declaration.total ? { declaration, pool } : null
}

/**
 * The repaired declaration when nothing is left to choose, or null when the owner must choose: Full Defense guards
 * with the whole new pool; with no Defense line the attack takes it all; with one part used, the other takes what is left.
 */
function automatic(state: CombatState, key: string, { declaration, pool }: Broken): CombatDeclaration | null {
  const line = lineOf(declaration)
  if (declaration.full) return withSplit(declaration, pool, pool)
  if (!line) return withSplit(declaration, pool, 0)
  const spentAttack = attackSpent(state, key)
  if (spentAttack) return withSplit(declaration, pool, Math.max(0, pool - declaration.frozen!.attack), declaration.frozen!.attack)
  if (declaration.defenseRolled) return withSplit(declaration, pool, line.amount, Math.max(0, pool - line.amount))
  return null
}

const replaced = (state: CombatState, key: string, declaration: CombatDeclaration): CombatState => ({
  ...state,
  combatants: state.combatants.map((entry) => (entry.key === key ? { ...entry, declaration } : entry)),
  attack: state.attack && state.attack.attackerKey === key && !state.attack.roll && declaration.frozen
    ? { ...state.attack, frozen: declaration.frozen, aim: declaration.aim }
    : state.attack,
})

const repairLog = (combatant: Combatant, declaration: CombatDeclaration, was: number): CombatLog => {
  const line = lineOf(declaration)
  const defense = line ? `Defense ${line.amount}` : 'no Defense'
  const attack = declaration.frozen ? `, ATK ${declaration.frozen.attack}` : ''
  return { event: `${combatant.name}'s Handle pool fell from ${was} to ${declaration.total}: the split is now ${defense}${attack}.`, actor: combatant.key }
}

export type SplitCheck =
  | { kind: 'fits' }
  | { kind: 'repaired'; state: CombatState; log: CombatLog }
  | { kind: 'choose'; state: CombatState; log: CombatLog }

/**
 * Before `key`'s next unresolved roll: their split still fits, was repaired with nothing to choose, or now waits on the
 * owner's choice of Defense, with the attack held and the owner asked.
 */
export function checkSplit(fight: CombatFight, key: string, records: Parameters<CombatHandler>[1], fightId: string): SplitCheck {
  const combatant = combatantOf(fight.state, key)
  const record = combatSheetOf(records, combatant)
  if (attackRepair(combatant, record)) return { kind: 'fits' }
  const found = broken(fight, combatant, record, fightId)
  if (!found) return { kind: 'fits' }
  const was = found.declaration.total
  const done = automatic(fight.state, key, found)
  if (done) return { kind: 'repaired', state: replaced(fight.state, key, done), log: repairLog(combatant, done, was) }
  const splitRepair: CombatSplitRepair = { combatantKey: key, pool: found.pool, was, against: lineOf(found.declaration)!.against, attackSpent: false }
  const attack: CombatAttack = { ...fight.state.attack!, splitRepair }
  const state = { ...fight.state, attack, pendingActions: [{ combatantKey: key, action: 'repairSplit' as const }] }
  return { kind: 'choose', state, log: { event: `${combatant.name}'s Handle pool fell from ${was} to ${found.pool}. They choose a new Defense before the next roll.`, actor: key } }
}

/** A Defense amount the owner may choose: tens from 0, leaving at least 10 for the attack. */
function readDefense(raw: unknown, pool: number): number {
  if (!Number.isSafeInteger(raw) || (raw as number) < 0 || (raw as number) % 10 !== 0 || (raw as number) >= pool) {
    throw new Error(`Keep Defense in tens, below ${pool}, so the attack keeps some of the pool.`)
  }
  return raw as number
}

/** The owner (the GM for an NPC) chooses the new Defense; the attack takes the rest, and the held roll may go on. */
const repairSplit: CombatHandler = (command, records, authority) => {
  const fight = requireLiveContext(command, records, authority)
  const repair = fight.state.attack?.splitRepair
  if (!repair || repair.combatantKey !== command.envelope.actorKey) throw new Error('No split is waiting for that repair.')
  const combatant = combatantOf(fight.state, repair.combatantKey)
  const found = broken(fight, combatant, combatSheetOf(records, combatant), command.envelope.fightId)
  const pool = found?.pool ?? repair.pool
  const declaration = withSplit(combatant.declaration!, pool, readDefense(command.payload.defense, pool))
  const repaired = replaced(fight.state, combatant.key, declaration)
  const combatants = repaired.combatants.map((entry) => (entry.key === combatant.key ? { ...entry, interactionSequence: entry.interactionSequence + 1 } : entry))
  const attack = { ...repaired.attack!, splitRepair: null }
  const pendingActions = attack.step === 'aim'
    ? [{ combatantKey: attack.attackerKey, action: 'attack' as const }]
    : [{ combatantKey: combatant.key, action: 'defense' as const }]
  return { fight: { ...fight, state: { ...repaired, combatants, attack, pendingActions } }, items: [], logs: [repairLog(combatant, declaration, repair.was)] }
}

export const combatSplitRepairHandlers: Readonly<Record<string, CombatHandler>> = { repairSplit }
