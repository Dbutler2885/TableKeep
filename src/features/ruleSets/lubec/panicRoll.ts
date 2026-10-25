import type { LubecCharacterSheet, LubecCounters, LubecStoredEntry } from './characterRecord'
import { LUBEC_ADVANTAGE_MODES, describeLubecDice, keptLubecRoll, rollLubecDice, type LubecAdvantage } from './checkRoll'
import { lubecStressLoweredBy } from './counters'
import { rollLubecDie, type LubecDice } from './dice'
import type { LubecEffect } from './effects'
import { lubecPanicRow, type LubecPanicChange, type LubecPanicRow } from './panicTable'
import { areFaces, isCount, isFace, isOneOf, readLubecRollFields, type LubecRollFieldChecks } from './rollFields'

// The Panic Check: a d20 that succeeds when it is greater than Stress as it
// stood before the roll. A failure adds no Stress by itself; the same d20 picks
// the Panic table row, and "Add effect" later adds that row as an ordinary
// effect and applies the row's own Stress and Minimum Stress changes to the
// counters as they then stand. "Add effect" lands once per failed check.
// The row shows until it is added or dismissed, and a reload keeps it gone.

export type LubecPanicRoll = {
  kind: 'panic'
  /** Stress as it stood before the roll. */
  target: number
  /** Every d20 rolled: one, or two under Advantage or Disadvantage. */
  dice: number[]
  /** The d20 kept, which also picks the row on a failure. */
  result: number
  advantage: LubecAdvantage
  outcome: 'success' | 'failure'
  /** Always 0: the Panic Check's only Stress changes are its row's. */
  stressAdded: number
  /**
   * Null until "Add effect" is pressed; then one entry per row change, in the
   * row's order: what its dice rolled, or null for a fixed change.
   */
  effectRolls: (number | null)[] | null
  /**
   * True once the row was dismissed without adding it. Every new roll writes
   * false, because the sheet is saved by merging and an absent field would keep
   * the last roll's true; only a roll stored before dismissing existed lacks it.
   */
  dismissed?: boolean
}

/** A Panic Check against the character's current Stress. */
export function rollLubecPanic(sheet: LubecCharacterSheet, advantage: LubecAdvantage, dice: LubecDice): LubecPanicRoll {
  const rolled = rollLubecDice(20, advantage, dice)
  const result = keptLubecRoll(rolled, advantage, true)
  const target = sheet.counters.stress
  return { kind: 'panic', target, dice: rolled, result, advantage, outcome: result > target ? 'success' : 'failure', stressAdded: 0, effectRolls: null, dismissed: false }
}

const isEffectRolls = (value: unknown): boolean =>
  value === null || (Array.isArray(value) && value.every((entry) => entry === null || isCount(entry)))

const PANIC_ROLL_FIELDS: LubecRollFieldChecks<LubecPanicRoll> = {
  kind: (value) => value === 'panic',
  target: isCount,
  dice: areFaces(20),
  result: isFace(20),
  advantage: isOneOf(LUBEC_ADVANTAGE_MODES),
  outcome: isOneOf(['success', 'failure']),
  stressAdded: isCount,
  effectRolls: isEffectRolls,
  dismissed: (value) => value === undefined || typeof value === 'boolean',
}

/** A stored last roll as a Panic Check, or null when it does not read as one. */
export const readLubecPanicRoll = (entry: LubecStoredEntry | null): LubecPanicRoll | null =>
  readLubecRollFields(entry, PANIC_ROLL_FIELDS)

/** The row a failed Panic Check picked; null for a success. */
export const lubecPanicResultRow = (roll: LubecPanicRoll): LubecPanicRow | null =>
  roll.outcome === 'failure' ? lubecPanicRow(roll.result) : null

/** The row a failed Panic Check picked while it is still waiting to be added or dismissed; null otherwise. */
export const lubecPanicPendingRow = (roll: LubecPanicRoll): LubecPanicRow | null =>
  roll.effectRolls === null && !roll.dismissed ? lubecPanicResultRow(roll) : null

const rollPanicChange = (change: LubecPanicChange, dice: LubecDice): number | null =>
  'dice' in change
    ? Array.from({ length: change.dice.count }, () => rollLubecDie(change.dice.sides, dice)).reduce((sum, die) => sum + die, 0)
    : null

const panicChangeAmount = (change: LubecPanicChange, rolled: number | null): number =>
  'dice' in change ? change.sign * (rolled ?? 0) : change.amount

function applyPanicChange(counters: LubecCounters, change: LubecPanicChange, rolled: number | null): LubecCounters {
  const amount = panicChangeAmount(change, rolled)
  if (change.counter === 'minimumStress') return { ...counters, minimumStress: Math.max(0, counters.minimumStress + amount) }
  const stress = amount < 0 ? lubecStressLoweredBy(counters, -amount) : counters.stress + amount
  return { ...counters, stress }
}

/**
 * The counters after a row's changes, given what each change's dice rolled.
 * Minimum Stress changes land before Stress changes, so a Stress reduction stops at the raised floor.
 */
export function applyLubecPanicChanges(counters: LubecCounters, row: LubecPanicRow, rolls: readonly (number | null)[]): LubecCounters {
  const changes = row.changes.map((change, index) => ({ change, rolled: rolls[index] ?? null }))
  const ordered = [...changes].sort((a, b) => Number(a.change.counter === 'stress') - Number(b.change.counter === 'stress'))
  return ordered.reduce((next, { change, rolled }) => applyPanicChange(next, change, rolled), counters)
}

const panicEffect = (row: LubecPanicRow, roll: LubecPanicRoll, id: string): LubecEffect => ({
  id,
  name: row.name,
  cause: `Panic Check (rolled ${roll.result})`,
  steps: [{ modifiers: [], labels: [row.text] }],
})

/**
 * The sheet after "Add effect" on its last roll's Panic row: the row added as
 * an effect, its changes applied, and the roll marked so they cannot land
 * twice. Null when the last roll is no failed Panic Check, or it was already added or dismissed.
 */
export function withLubecPanicEffect(sheet: LubecCharacterSheet, dice: LubecDice, id: string): LubecCharacterSheet | null {
  const roll = readLubecPanicRoll(sheet.lastRoll)
  const row = roll ? lubecPanicPendingRow(roll) : null
  if (!roll || !row) return null
  const effectRolls = row.changes.map((change) => rollPanicChange(change, dice))
  return {
    ...sheet,
    counters: applyLubecPanicChanges(sheet.counters, row, effectRolls),
    effects: [...sheet.effects, panicEffect(row, roll, id)],
    lastRoll: { ...roll, effectRolls },
  }
}

/**
 * The sheet after its last roll's Panic row is dismissed: only the roll marked,
 * with no effect and no counter changed. Null when there is no row waiting.
 */
export function withLubecPanicDismissed(sheet: LubecCharacterSheet): LubecCharacterSheet | null {
  const roll = readLubecPanicRoll(sheet.lastRoll)
  if (!roll || !lubecPanicPendingRow(roll)) return null
  return { ...sheet, lastRoll: { ...roll, dismissed: true } }
}

const PANIC_COUNTER_NAMES = { stress: 'Stress', minimumStress: 'Minimum Stress' } as const

/** "Increase Minimum Stress by 1", or "Reduce Stress by 1d5: rolled 3" once its dice have rolled. */
export function describeLubecPanicChange(change: LubecPanicChange, rolled: number | null): string {
  const lowers = panicChangeAmount(change, 1) < 0
  const by = 'dice' in change ? `${change.dice.count}d${change.dice.sides}` : `${Math.abs(change.amount)}`
  const text = `${lowers ? 'Reduce' : 'Increase'} ${PANIC_COUNTER_NAMES[change.counter]} by ${by}`
  return rolled === null ? text : `${text}: rolled ${rolled}`
}

/** "Rolled 4 vs Stress 5", or "Advantage: 3 and 9, kept 9 vs Stress 5". */
export const describeLubecPanicDice = (roll: LubecPanicRoll): string => describeLubecDice(roll, `Stress ${roll.target}`)
