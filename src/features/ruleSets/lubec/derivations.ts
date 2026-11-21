import { chosenStat, lubecClass, type LubecClass } from './classes'
import type { LubecClassChoices, LubecSheet, LubecValueName } from './sheet'

// Every derived value is worked out when read, never stored, and `null` (a
// hole) wherever an input it needs is a hole.

/**
 * One change to a named Stat or Save: an active effect's, or one of gear's
 * Speed losses. A modifier that names no source is an effect's. A wound card's
 * fractional loss carries a `factor` and its "drops to" a `setTo`, each with
 * an amount of 0; both are worked out from the card when read, never stored.
 */
export type LubecModifier = { target: LubecValueName; amount: number; source?: 'effect' | 'gear'; factor?: number; setTo?: number }

/** The values the wound terms call core Stats: no penalty takes one below 10. Sanity and Fear keep a floor of 0. */
const STAT_FLOOR_NAMES: readonly LubecValueName[] = ['Strength', 'Speed', 'Handle', 'Intellect', 'Charm', 'Body']
export const LUBEC_STAT_FLOOR = 10

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

/** The lowest a penalty can take this value: 10 for a core Stat, unless it was already below 10, and 0 otherwise. */
const floorOf = (name: LubecValueName, final: number): number =>
  (STAT_FLOOR_NAMES.includes(name) ? Math.max(0, Math.min(LUBEC_STAT_FLOOR, final)) : 0)

/**
 * The final value with every modifier on it, in the order the wound terms set: every fraction of the
 * uninjured value multiplied together and rounded down, then the flat amounts from effects and gear,
 * then any "drops to", then the floor. Skill bonuses come later, from the rollers.
 */
export function lubecCurrentValue(sheet: LubecSheet, name: LubecValueName, modifiers: readonly LubecModifier[]): number | null {
  const final = lubecFinalValue(sheet, name)
  if (final === null) return null
  return Math.max(floorOf(name, final), valueBeforeFloor(final, name, modifiers))
}

function valueBeforeFloor(final: number, name: LubecValueName, modifiers: readonly LubecModifier[]): number {
  const mine = modifiers.filter((modifier) => modifier.target === name)
  const factor = mine.reduce((product, modifier) => product * (modifier.factor ?? 1), 1)
  const flat = mine.reduce((sum, modifier) => sum + modifier.amount, 0)
  const setTo = mine.flatMap((modifier) => (modifier.setTo === undefined ? [] : [modifier.setTo]))
  // "Drops to" never raises a value that is already lower.
  return Math.min(Math.floor(final * factor) + flat, ...setTo)
}

/** Whether the floor held the value up: the modifiers would have taken it lower than the floor lets them. */
export function lubecFloorHolds(sheet: LubecSheet, name: LubecValueName, modifiers: readonly LubecModifier[]): boolean {
  const final = lubecFinalValue(sheet, name)
  return final !== null && valueBeforeFloor(final, name, modifiers) < floorOf(name, final)
}

/** Current Handle capped at 100; a fighting or shooting skill's bonus belongs to the combat roller, not here. */
export function lubecEffectiveHandle(sheet: LubecSheet, modifiers: readonly LubecModifier[]): number | null {
  const handle = lubecCurrentValue(sheet, 'Handle', modifiers)
  return handle === null ? null : Math.min(LUBEC_EFFECTIVE_HANDLE_CAP, handle)
}

/** The Trauma at which the class calls for a Death Save; a hole when the class is. */
export function lubecDeathSaveTrauma(sheet: LubecSheet): number | null {
  return lubecClass(sheet.class.key)?.deathSaveTrauma ?? null
}

/** Whether Trauma has reached the class's Death Save threshold; never while the class is a hole. */
export function isLubecDeathSaveDue(sheet: LubecSheet, trauma: number): boolean {
  const threshold = lubecDeathSaveTrauma(sheet)
  return threshold !== null && trauma >= threshold
}
