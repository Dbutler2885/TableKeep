import { chosenStat, lubecClass, type LubecClass } from './classes'
import type { LubecClassChoices, LubecSheet, LubecValueName } from './sheet'

// Every derived value is worked out when read, never stored, and `null` (a
// hole) wherever an input it needs is a hole.

/** One active effect's change to a named Stat or Save. */
export type LubecModifier = { target: LubecValueName; amount: number }

export const LUBEC_EFFECTIVE_HANDLE_CAP = 100

export const isWholeNumber = (value: number | null): value is number => Number.isInteger(value)

// A choice that is missing or off the class's list is a hole for every value it
// could have touched, and touches nothing else.
function choiceModifier(definition: LubecClass, choices: LubecClassChoices, name: LubecValueName): number | null {
  const choice = definition.choice
  if (choice === null || !(choice.options as readonly string[]).includes(name)) return 0
  const stat = chosenStat(choice, choices)
  if (stat === null) return null
  return stat === name ? choice.amount : 0
}

/** Base + class modifier + class choice modifier. */
export function lubecFinalValue(sheet: LubecSheet, name: LubecValueName): number | null {
  const base = sheet.base[name]
  const definition = lubecClass(sheet.class.key)
  if (!isWholeNumber(base) || definition === null) return null
  const fromChoice = choiceModifier(definition, sheet.class.choices, name)
  if (fromChoice === null) return null
  return base + (definition.modifiers[name] ?? 0) + fromChoice
}

/** The final value plus every modifier on it, never below 0. */
export function lubecCurrentValue(sheet: LubecSheet, name: LubecValueName, modifiers: readonly LubecModifier[]): number | null {
  const final = lubecFinalValue(sheet, name)
  if (final === null) return null
  const fromEffects = modifiers.reduce((sum, modifier) => sum + (modifier.target === name ? modifier.amount : 0), 0)
  return Math.max(0, final + fromEffects)
}

/** Current Handle capped at 100; a fighting or shooting skill's bonus belongs to the combat roller, not here. */
export function lubecEffectiveHandle(sheet: LubecSheet, modifiers: readonly LubecModifier[]): number | null {
  const handle = lubecCurrentValue(sheet, 'Handle', modifiers)
  return handle === null ? null : Math.min(LUBEC_EFFECTIVE_HANDLE_CAP, handle)
}
