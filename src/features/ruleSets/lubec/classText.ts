import type { LubecClass } from './classes'
import { anyOf } from './ruleChecks'
import { LUBEC_SAVES, LUBEC_STATS, type LubecValueName } from './sheet'

// A class's modifiers in words, for choosing between the classes.

const signed = (amount: number) => (amount > 0 ? `+${amount}` : `${amount}`)

// One amount on every value of a kind reads as "every Stat"; otherwise each value is named.
function groupText(names: readonly LubecValueName[], kind: string, modifiers: LubecClass['modifiers']): string[] {
  const amounts = names.map((name) => modifiers[name])
  const shared = amounts[0]
  if (shared !== undefined && amounts.every((amount) => amount === shared)) return [`${signed(shared)} every ${kind}`]
  return names.flatMap((name) => {
    const amount = modifiers[name]
    return amount === undefined ? [] : [`${signed(amount)} ${name}`]
  })
}

/** The class's modifiers, its choice last, as "+10 Intellect, +60 Fear, +5 to one of Strength, Speed, Handle or Charm". */
export function lubecClassModifierText(definition: LubecClass): string {
  const choice = definition.choice
  return [
    ...groupText(LUBEC_STATS, 'Stat', definition.modifiers),
    ...groupText(LUBEC_SAVES, 'Save', definition.modifiers),
    ...(choice ? [`${signed(choice.amount)} to one of ${anyOf(choice.options)}`] : []),
  ].join(', ')
}
