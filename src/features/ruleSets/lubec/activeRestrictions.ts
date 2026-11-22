import { lubecRestrictionWords, lubecStepRestrictions, type LubecEffect, type LubecRestriction } from './effects'

export type LubecRestrictionSource = { restriction: LubecRestriction; why: string }

/** A card goes by its wound's name from the table, or a hand-made effect's own name. */
const cardName = (effect: LubecEffect) => effect.name

/** Physical restrictions come only from current steps, never from converted after-combat cards. */
export function lubecRestrictionSources(effects: readonly LubecEffect[]): LubecRestrictionSource[] {
  return effects.flatMap((effect) => {
    const step = effect.steps[0]
    if (effect.afterCombat !== undefined || !step) return []
    return lubecStepRestrictions(step).map((restriction) => ({
      restriction, why: `${lubecRestrictionWords(restriction)} (${cardName(effect)})`,
    }))
  })
}
