// The Strength prompt's words, from the inventory prototype's `strengthPrompt`
// and its call sites (B). B asked the table to roll; the Core roller rolls it
// now, so the text names the target with no "at the table", and says what a
// failure adds in Stress (spec 5.5).

import { RULES } from '../../ruleSets/lubec/gear/gearRules'
import type { LubecItem } from '../../ruleSets/lubec/gear/gearRecord'

type Heavy = Pick<LubecItem, 'name' | 'weight'>

export const LUBEC_STRENGTH_EYEBROW = 'Strength check'

/** "Small anvil is heavy", "Mushroom anchor is extra heavy". */
export const lubecStrengthTitle = ({ name, weight }: Heavy): string => `${name} is ${weight === 'extra' ? 'extra heavy' : 'heavy'}`

/**
 * The text around the target, which the prompt shows as a number or the
 * sheet's missing mark: "Roll Strength (" and "). Passed: ...". `stress` is
 * what a failure adds.
 */
export function lubecStrengthText({ weight }: Pick<LubecItem, 'weight'>, stress: number): [string, string] {
  if (weight === 'extra') return ['Roll Strength (', `). Passed: you carry it, Speed −${RULES.extraPass} the whole time. Failed: you can't carry it, and +${stress} Stress.`]
  return ['Roll Strength (', `). Passed: no penalty. Failed: Speed −${RULES.heavyFail} while you carry it, and +${stress} Stress.`]
}

/** The whole text with the target written in. */
export const lubecStrengthPromptText = (item: Pick<LubecItem, 'weight'>, target: number, stress: number): string =>
  lubecStrengthText(item, stress).join(String(target))

/** An extra heavy thing that failed on a move stays where it was. */
export const lubecTooHeavyToMove = ({ name }: Pick<LubecItem, 'name'>): string => `Too heavy. ${name} stays where it is.`

/** An extra heavy thing that failed on the add form: the form stays open, and the ground is no longer a place to add to. */
export const lubecTooHeavyToAdd = ({ name }: Pick<LubecItem, 'name'>): string => `Strength failed: you can't carry ${name}. Pick a carrier.`

/** An extra heavy thing switched to Failed on its card, or failed when it arrived, is dropped; it goes to the GM's Items tab. */
export const lubecTooHeavyDropped = ({ name }: Pick<LubecItem, 'name'>): string => `Too heavy to carry. ${name} is dropped where you are.`
