import type { LubecAdvantage } from '../../../ruleSets/lubec/checkRoll'
import { lubecCurrentValue } from '../../../ruleSets/lubec/derivations'
import { lubecSheetModifiers } from '../../../ruleSets/lubec/modifiers'
import type { LubecValueName } from '../../../ruleSets/lubec/sheet'
import { lubecValueParts, type LubecTargetPart } from '../../../ruleSets/lubec/valueParts'
import type { CombatRoll } from './combatFeedback'
import { combatActiveEffects, type CombatInputRound } from './inputModifiers'
import type { CombatSheet } from './types'

// What a combat roll's card shows beside its result: both dice under a mode,
// and how the number it was made under was reached, read from the sheet the
// roll read, with this fight's cards that were not effective yet left out.

type ModeRecord = { dice?: readonly number[]; mode?: LubecAdvantage | 'normal'; because?: string | null }

/** The two dice a roll under a mode kept one of; nothing for one die. */
export function rollDiceOf(rolled: ModeRecord): Pick<CombatRoll, 'dice'> {
  const { dice, mode } = rolled
  if (!dice || dice.length < 2 || (mode !== 'advantage' && mode !== 'disadvantage')) return {}
  return { dice: { values: [...dice], mode, because: rolled.because ?? null } }
}

/** A cap that held the value down, as Handle's 100 does, said as its own part. */
const capParts = (current: number | null, target: number): LubecTargetPart[] =>
  (current !== null && target < current ? [{ label: 'Cap', value: `no higher than ${target}` }] : [])

/** How a Stat or Save the roll was made under was reached; nothing without the sheet. */
export function valueBreakdownOf(record: CombatSheet | null | undefined, name: LubecValueName, target: number, context: CombatInputRound): Pick<CombatRoll, 'breakdown'> {
  if (!record) return {}
  const sheet = { ...record.sheet, effects: combatActiveEffects(record.sheet, context) }
  const parts = lubecValueParts(sheet, name)
  if (!parts) return {}
  return { breakdown: { name, target, parts: [...parts, ...capParts(lubecCurrentValue(sheet, name, lubecSheetModifiers(sheet)), target)] } }
}
