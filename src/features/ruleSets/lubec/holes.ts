import { chosenStat, lubecClass } from './classes'
import { isWholeNumber } from './derivations'
import { LUBEC_VALUE_NAMES, type LubecSheet } from './sheet'

// The holes a character has, by the name the Finalize dialog lists them under:
// the class, its choice, and each base value nobody has given yet.

function classHoles(sheet: LubecSheet): string[] {
  const definition = lubecClass(sheet.class.key)
  if (definition === null) return ['Class']
  const choice = definition.choice
  return choice === null || chosenStat(choice, sheet.class.choices) !== null ? [] : [choice.label]
}

/** Every hole in a character's class and base values, class first, then the values in sheet order. */
export function lubecHoles(sheet: LubecSheet): string[] {
  return [...classHoles(sheet), ...LUBEC_VALUE_NAMES.filter((name) => !isWholeNumber(sheet.base[name]))]
}
