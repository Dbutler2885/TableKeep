import type { LubecClass, LubecClassKey } from '../ruleSets/lubec/classes'
import { anyOf } from '../ruleSets/lubec/ruleChecks'
import { isLubecStat, LUBEC_SAVES, LUBEC_STATS } from '../ruleSets/lubec/sheet'

// A class card's lines as the combined prototype prints them.

const signed = (amount: number) => (amount > 0 ? `+${amount}` : `${amount}`)

type Entry = readonly [string, number]

// One amount on every value of a kind reads as "+5 all Stats"; otherwise each is named, in the class's own order.
function bars(entries: readonly Entry[], count: number, kind: string): string[] {
  const [first] = entries
  if (first && entries.length === count && entries.every(([, amount]) => amount === first[1])) return [`${signed(first[1])} all ${kind}`]
  return entries.map(([name, amount]) => `${signed(amount)} ${name}`)
}

/** The grey modifier bars: the Stats, the class's own choice, then the Saves, as "+20 Intellect", "-10 one other Stat", "+30 Sanity". */
export function lubecModifierBars(definition: LubecClass): string[] {
  const entries = Object.entries(definition.modifiers) as Entry[]
  const choice = definition.choice
  return [
    ...bars(entries.filter(([name]) => isLubecStat(name)), LUBEC_STATS.length, 'Stats'),
    ...(choice ? [`${signed(choice.amount)} one other Stat`] : []),
    ...bars(entries.filter(([name]) => !isLubecStat(name)), LUBEC_SAVES.length, 'Saves'),
  ]
}

// What each class picks beside its free skill, in the prototype's words. The
// Nerd's follows the grilling decision (1 Trained and 2 Expert) rather than the
// standalone sheet's 2 Expert.
const PACKAGE_PICKS: Readonly<Record<LubecClassKey, string>> = {
  working: '1 Trained and 1 Expert',
  nerd: '1 Trained and 2 Expert, each Expert with a Trained prerequisite',
  tough: '1 Expert or 2 Trained',
  scout: '1 Expert or 2 Trained',
  popular: '1 Expert or 2 Trained',
}

/** The tan skill line: "Free skill: Boatwork, Jury-Rigging or Tides & Flats + 1 Trained and 1 Expert". */
export const lubecFreeSkillLine = (definition: LubecClass): string =>
  `Free skill: ${anyOf(definition.skillPackage.free)} + ${PACKAGE_PICKS[definition.key]}`
