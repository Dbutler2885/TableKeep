import { LUBEC_RANGE_BANDS, type LubecRangeBand } from '../../../ruleSets/lubec/gear/gearRecord'
import { combatAttackReading, type CombatAttackReading } from './attackMath'
import { attackAt, attackRepair, combatantOf, combatSheetOf, requireOpponent } from './attackParty'
import type { CombatPendingAction } from './combatFeedback'
import { requireGm, requireLiveContext } from './context'
import { combatInputModifiers } from './inputModifiers'
import { requireChooseAgain } from './chooseAgain'
import { isRoundAttack } from './roundAttacks'
import type { CombatAim, CombatAttack, CombatCommand, Combatant, CombatFight, CombatFrozenAim, CombatHandler, CombatPlan, CombatSheet, CombatState } from './types'

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0

const isTens = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0 && (value as number) % 10 === 0

function readDefense(raw: unknown): CombatAim['defense'] {
  if (raw === null || raw === undefined) return null
  const { against, amount } = raw as Record<string, unknown>
  if (!isText(against) || !isTens(amount)) throw new Error('A Defense line names one person and splits Handle in tens.')
  return { against, amount }
}

/** The aim a command carries, in its stored shape. */
export function readCombatAim(raw: unknown): CombatAim {
  const { targetKey, weaponItemId, attackId, defense } = (raw ?? {}) as Record<string, unknown>
  if (![targetKey, weaponItemId, attackId].every(isText)) throw new Error('Pick a target, a weapon and an attack.')
  return { targetKey: targetKey as string, weaponItemId: weaponItemId as string, attackId: attackId as string, defense: readDefense(defense) }
}

/** The pending requests while an attack is aimed: the attacker's Roll, and the GM's range for a ranged use. */
export function aimRequests(attack: CombatAttack): CombatPendingAction[] {
  const attackRequest: CombatPendingAction = { combatantKey: attack.attackerKey, action: 'attack' }
  const ranged = attack.frozen?.choice.ranged === true && !attack.range
  return ranged ? [attackRequest, { combatantKey: attack.attackerKey, action: 'range' }] : [attackRequest]
}

const withAttack = (fight: CombatFight, attack: CombatAttack, state: Partial<CombatState> = {}): CombatFight =>
  ({ ...fight, state: { ...fight.state, ...state, attack, pendingActions: aimRequests(attack) } })

/** A pending step that cannot go on: the same attack and step, waiting on the named repair. */
export function repairPlan(fight: CombatFight, attack: CombatAttack, attacker: Combatant, repair: string): CombatPlan {
  const logs = attack.repair === repair ? [] : [{ event: `${attacker.name}'s attack waits for a repair. ${repair}`, actor: attacker.key }]
  return { fight: { ...fight, state: { ...fight.state, attack: { ...attack, repair } } }, items: [], logs }
}

export const aimDefense = (aim: Pick<CombatAim, 'defense'>): number => aim.defense?.amount ?? 0

/** The weapon's name and its own range bands; Fisticuffs is no item, so it is named by its use and has none. */
function weaponOf(record: CombatSheet, aim: CombatAim, reading: CombatAttackReading) {
  const weapon = record.sheet.gear.items.find((item) => item.id === aim.weaponItemId)
  return weapon ? { weaponName: weapon.name, ranges: weapon.ranges ?? [] } : { weaponName: reading.choice.name, ranges: [] }
}

export function freeze(record: CombatSheet, aim: CombatAim, reading: CombatAttackReading): CombatFrozenAim {
  const defense = aimDefense(aim)
  if (defense >= reading.total) throw new Error('Leave some of your Handle for the attack.')
  return {
    choice: reading.choice, ...weaponOf(record, aim, reading),
    handle: reading.handle, skill: reading.skill, total: reading.total, attack: reading.total - defense, sourceRevision: record.revision ?? 0,
  }
}

const sameUse = (before: CombatAim | null | undefined, after: CombatAim) =>
  before?.targetKey === after.targetKey && before.weaponItemId === after.weaponItemId && before.attackId === after.attackId

export function readingFor(record: CombatSheet, aim: CombatAim, fight: CombatFight, fightId: string): CombatAttackReading {
  const modifiers = combatInputModifiers(record.sheet, { fightId, round: fight.state.round })
  const reading = combatAttackReading(record.sheet, modifiers, aim.weaponItemId, aim.attackId)
  if (!reading) throw new Error('That weapon cannot make that attack now. Choose again.')
  return reading
}

export function requireAimPeople(state: CombatState, attacker: Combatant, aim: CombatAim) {
  requireOpponent(state, attacker, aim.targetKey)
  if (aim.defense) requireOpponent(state, attacker, aim.defense.against)
}

/** The aim a command asks for. A round's Defense line was declared and stands, so only its target is checked now. */
function requestedAim(state: CombatState, attack: CombatAttack, attacker: Combatant, raw: unknown): CombatAim {
  const next = readCombatAim(raw)
  if (!isRoundAttack(state, attack)) {
    requireAimPeople(state, attacker, next)
    return next
  }
  requireOpponent(state, attacker, next.targetKey)
  return { ...next, defense: attack.aim!.defense }
}

/** Fresh numbers from the sheet; in a round only what has gone may change, and the declared split stays with the new use. */
function frozenAim(fight: CombatFight, attack: CombatAttack, record: CombatSheet, next: CombatAim, fightId: string): CombatFrozenAim {
  const round = isRoundAttack(fight.state, attack)
  if (round) requireChooseAgain(fight.state, attack, record, next)
  const fresh = freeze(record, next, readingFor(record, next, fight, fightId))
  return round ? { ...attack.frozen!, choice: fresh.choice, weaponName: fresh.weaponName, ranges: fresh.ranges } : fresh
}

/** Pick target, weapon, use and split; the numbers freeze from the current sheet, and a changed use clears the range. */
const aim: CombatHandler = (command, records, authority) => {
  const fight = requireLiveContext(command, records, authority)
  const attack = attackAt(fight.state, command, 'aim')
  const attacker = combatantOf(fight.state, attack.attackerKey)
  const next = requestedAim(fight.state, attack, attacker, command.payload.aim)
  const record = combatSheetOf(records, attacker)
  const repair = attackRepair(attacker, record)
  if (repair) return repairPlan(fight, attack, attacker, repair)
  const frozen = frozenAim(fight, attack, record!, next, command.envelope.fightId)
  const range = sameUse(attack.aim, next) ? attack.range ?? null : null
  return { fight: withAttack(fight, { ...attack, aim: next, frozen, range, repair: null }), items: [], logs: [] }
}

function readBand(raw: unknown): LubecRangeBand {
  if (!LUBEC_RANGE_BANDS.includes(raw as LubecRangeBand)) throw new Error('Choose Short, Medium, Long or Extreme.')
  return raw as LubecRangeBand
}

/** A band the weapon numbers takes its own modifier; otherwise the GM's typed one. */
function bandModifier(frozen: CombatFrozenAim, band: LubecRangeBand, typed: unknown): number {
  const own = frozen.ranges.find((entry) => entry.band === band)?.modifier
  if (own !== undefined) return own
  if (!Number.isSafeInteger(typed)) throw new Error('Type the Handle modifier for that range.')
  return typed as number
}

const BAND_NAMES: Readonly<Record<LubecRangeBand, string>> = { short: 'Short', medium: 'Medium', long: 'Long', extreme: 'Extreme' }
export const combatBandName = (band: LubecRangeBand): string => BAND_NAMES[band]
export const combatSigned = (value: number): string => (value < 0 ? `−${-value}` : `+${value}`)

const aiming = (attack: CombatAttack | null): attack is CombatAttack => attack !== null && !attack.closed && attack.step === 'aim'

function rangedFrozen(attack: CombatAttack | null): { attack: CombatAttack; frozen: CombatFrozenAim } {
  const frozen = aiming(attack) ? attack.frozen : null
  if (!frozen?.choice.ranged) throw new Error('No ranged attack is waiting for a range.')
  return { attack: attack!, frozen }
}

/** The GM declares the range from this weapon's own bands; it changes only the attack number, until the Roll. */
const range: CombatHandler = (command: CombatCommand, records, authority) => {
  requireGm(authority)
  const fight = requireLiveContext(command, records, authority)
  const { attack, frozen } = rangedFrozen(fight.state.attack)
  const band = readBand(command.payload.band)
  const declared = { band, modifier: bandModifier(frozen, band, command.payload.modifier) }
  const lastRanges = { ...fight.state.lastRanges, [attack.attackerKey]: band }
  const attacker = combatantOf(fight.state, attack.attackerKey)
  const event = `The GM declared ${combatBandName(band)} range for ${attacker.name}: ${combatSigned(declared.modifier)} to the attack.`
  return { fight: withAttack(fight, { ...attack, range: declared }, { lastRanges }), items: [], logs: [{ event, actor: null }] }
}

export const combatAimHandlers: Readonly<Record<string, CombatHandler>> = { aim, range }
