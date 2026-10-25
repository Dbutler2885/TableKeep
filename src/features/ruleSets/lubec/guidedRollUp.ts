import type { LubecCharacterSheet, LubecStoredEntry } from './characterRecord'
import { rollLubecDie, type LubecDice } from './dice'
import { LUBEC_SAVE_FLAT, LUBEC_STAT_TENS } from './rollUp'
import {
  isLubecStat,
  LUBEC_SAVES,
  LUBEC_STATS,
  LUBEC_VALUE_NAMES,
  type LubecSave,
  type LubecStat,
  type LubecValueName,
} from './sheet'

// Guided roll-up: each Stat is dealt one of the tens still left and adds a d10,
// each Save is 2d10 + 10. Every die is kept under `lubec.rollUp` as it landed,
// and the base value it makes is stored as the base value. A value is rolled
// once; there is no re-roll. After the dice, the scores are kept or the lowest
// Stat is swapped, once.

/** The tens a Stat was dealt and the d10 it added. */
export type LubecStatDice = { tens: number; d10: number }

/** The dice one value was rolled with: a Stat's tens and d10, or a Save's two d10s. */
export type LubecValueDice = LubecStatDice | readonly [number, number]

/** Which two Stats traded scores: the lowest, and the one it traded with. */
export type LubecSwap = { lowest: LubecStat; other: LubecStat }

/** A guided character's roll-up as the sheet reads it; anything unreadable reads as not rolled or not decided. */
export type LubecRollUp = {
  stats: Partial<Record<LubecStat, LubecStatDice>>
  saves: Partial<Record<LubecSave, readonly [number, number]>>
  swap: LubecSwap | null
  kept: boolean
}

/** Where a roll-up stands: dice still to roll, the Swap still to decide, or both done. */
export type LubecRollUpStage = 'rolling' | 'deciding' | 'settled'

type RollUpChanges = Pick<LubecCharacterSheet, 'rollUp' | 'base'>

type Fields = Record<string, unknown>

const fieldsOf = (raw: unknown): Fields =>
  (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw as Fields : {})

const isWhole = (value: unknown): value is number => Number.isInteger(value)

const statDiceOf = (raw: unknown): LubecStatDice | null => {
  const { tens, d10 } = fieldsOf(raw)
  return isWhole(tens) && isWhole(d10) ? { tens, d10 } : null
}

const saveDiceOf = (raw: unknown): readonly [number, number] | null =>
  (Array.isArray(raw) && raw.length === 2 && raw.every(isWhole) ? [raw[0], raw[1]] : null)

function readDice<Name extends string, Dice>(raw: unknown, names: readonly Name[], read: (raw: unknown) => Dice | null) {
  const stored = fieldsOf(raw)
  return Object.fromEntries(names.flatMap((name) => {
    const dice = read(stored[name])
    return dice === null ? [] : [[name, dice]]
  })) as Partial<Record<Name, Dice>>
}

function swapOf(raw: unknown): LubecSwap | null {
  const { lowest, other } = fieldsOf(raw)
  return typeof lowest === 'string' && typeof other === 'string' && isLubecStat(lowest) && isLubecStat(other)
    ? { lowest, other }
    : null
}

/** A stored roll-up as the sheet reads it. */
export function readLubecRollUp(entry: LubecStoredEntry | null): LubecRollUp {
  const stored = fieldsOf(entry)
  return {
    stats: readDice(stored.stats, LUBEC_STATS, statDiceOf),
    saves: readDice(stored.saves, LUBEC_SAVES, saveDiceOf),
    swap: swapOf(stored.swap),
    kept: stored.kept === true,
  }
}

/** The dice a value was rolled with, or null while it is not rolled yet. */
export function lubecRolledDice(rollUp: LubecRollUp, name: LubecValueName): LubecValueDice | null {
  return (isLubecStat(name) ? rollUp.stats[name] : rollUp.saves[name]) ?? null
}

/** The values not rolled yet, in the sheet's order. */
export const lubecUnrolledValues = (rollUp: LubecRollUp): LubecValueName[] =>
  LUBEC_VALUE_NAMES.filter((name) => lubecRolledDice(rollUp, name) === null)

export function lubecRollUpStage(rollUp: LubecRollUp): LubecRollUpStage {
  if (lubecUnrolledValues(rollUp).length > 0) return 'rolling'
  return rollUp.swap === null && !rollUp.kept ? 'deciding' : 'settled'
}

/** The tens no Stat has been dealt yet. */
export function lubecTensLeft(rollUp: LubecRollUp): number[] {
  const left = [...LUBEC_STAT_TENS]
  Object.values(rollUp.stats).forEach(({ tens }) => {
    const index = left.indexOf(tens)
    if (index >= 0) left.splice(index, 1)
  })
  return left
}

/** A part of the stored roll-up with one entry changed, keeping everything stored beside it. */
const withStoredEntry = (sheet: LubecCharacterSheet, part: string, name: string, value: unknown): LubecStoredEntry => {
  const stored = fieldsOf(sheet.rollUp)
  return { ...stored, [part]: { ...fieldsOf(stored[part]), [name]: value } }
}

function rollStat(sheet: LubecCharacterSheet, name: LubecStat, dice: LubecDice): RollUpChanges {
  const left = lubecTensLeft(readLubecRollUp(sheet.rollUp))
  const tens = left[rollLubecDie(left.length, dice) - 1]
  const d10 = rollLubecDie(10, dice)
  return { rollUp: withStoredEntry(sheet, 'stats', name, { tens, d10 }), base: { ...sheet.base, [name]: tens + d10 } }
}

function rollSave(sheet: LubecCharacterSheet, name: LubecSave, dice: LubecDice): RollUpChanges {
  const pair = [rollLubecDie(10, dice), rollLubecDie(10, dice)]
  return { rollUp: withStoredEntry(sheet, 'saves', name, pair), base: { ...sheet.base, [name]: LUBEC_SAVE_FLAT + pair[0] + pair[1] } }
}

/** Rolls a value not rolled yet, recording its dice and its base value; null for a value already rolled. */
export function withLubecValueRolled(sheet: LubecCharacterSheet, name: LubecValueName, dice: LubecDice): RollUpChanges | null {
  if (lubecRolledDice(readLubecRollUp(sheet.rollUp), name) !== null) return null
  return isLubecStat(name) ? rollStat(sheet, name, dice) : rollSave(sheet, name, dice)
}

/**
 * Rolls every value not rolled yet in one go, in the sheet's order, each just
 * as its own roll would be: a Stat is dealt from the tens the ones before it
 * left. Null when every value is rolled already.
 */
export function withLubecRemainingRolled(sheet: LubecCharacterSheet, dice: LubecDice): RollUpChanges | null {
  const names = lubecUnrolledValues(readLubecRollUp(sheet.rollUp))
  if (names.length === 0) return null
  const rolled = names.reduce((current, name) => ({ ...current, ...withLubecValueRolled(current, name, dice) }), sheet)
  return { rollUp: rolled.rollUp, base: rolled.base }
}

const statScores = (sheet: Pick<LubecCharacterSheet, 'base'>) =>
  LUBEC_STATS.flatMap((name) => (isWhole(sheet.base[name]) ? [sheet.base[name] as number] : []))

const statsAt = (sheet: Pick<LubecCharacterSheet, 'base'>, score: number) =>
  LUBEC_STATS.filter((name) => sheet.base[name] === score)

/** The Stats tied for the lowest score; a tie lets the player pick which one moves. */
export function lubecSwapSources(sheet: Pick<LubecCharacterSheet, 'base'>): LubecStat[] {
  const scores = statScores(sheet)
  return scores.length === LUBEC_STATS.length ? statsAt(sheet, Math.min(...scores)) : []
}

/** The Stats the lowest may trade with: any but the highest, and none with the same score. */
export function lubecSwapTargets(sheet: Pick<LubecCharacterSheet, 'base'>, lowest: LubecStat): LubecStat[] {
  if (!lubecSwapSources(sheet).includes(lowest)) return []
  const highest = statsAt(sheet, Math.max(...statScores(sheet)))
  return LUBEC_STATS.filter((name) => !highest.includes(name) && sheet.base[name] !== sheet.base[lowest])
}

const withDecision = (sheet: LubecCharacterSheet, decision: Partial<Pick<LubecRollUp, 'swap' | 'kept'>>): LubecStoredEntry =>
  ({ ...fieldsOf(sheet.rollUp), ...decision })

/** The lowest Stat's score traded with another's, recorded on the roll-up; null when the Swap is not allowed. */
export function withLubecSwap(sheet: LubecCharacterSheet, swap: LubecSwap): RollUpChanges | null {
  if (lubecRollUpStage(readLubecRollUp(sheet.rollUp)) !== 'deciding') return null
  if (!lubecSwapTargets(sheet, swap.lowest).includes(swap.other)) return null
  const base = { ...sheet.base, [swap.lowest]: sheet.base[swap.other], [swap.other]: sheet.base[swap.lowest] }
  return { rollUp: withDecision(sheet, { swap }), base }
}

/** The scores kept as rolled, which closes the Swap. */
export const withLubecScoresKept = (sheet: LubecCharacterSheet): Pick<LubecCharacterSheet, 'rollUp'> =>
  ({ rollUp: withDecision(sheet, { kept: true }) })

/** What a guided roll-up still lacks before Finalize, for the dialog to warn about. */
export function lubecRollUpIncomplete(sheet: LubecCharacterSheet): string[] {
  if (sheet.door !== 'guided') return []
  const rollUp = readLubecRollUp(sheet.rollUp)
  const unrolled = lubecUnrolledValues(rollUp)
  if (unrolled.length > 0) return [`Not rolled yet: ${unrolled.join(', ')}.`]
  return lubecRollUpStage(rollUp) === 'deciding' ? ['The scores are neither kept nor swapped yet.'] : []
}
