import { lubecRestrictionWords, lubecStepRestrictions, type LubecEffect, type LubecRestriction } from './effects'
import { readWoundLifetime } from './woundLifetime'

export type LubecRestrictionSource = { restriction: LubecRestriction; why: string }

/** A card goes by its wound's name from the table, or a hand-made effect's own name. */
const cardName = (effect: LubecEffect) => effect.name

/** Physical restrictions come only from current steps, never from converted after-combat cards. */
export function lubecRestrictionSources(effects: readonly LubecEffect[]): LubecRestrictionSource[] {
  return effects.flatMap((effect) => {
    if (!readWoundLifetime({ effect, at: null }).physicalRestrictionsActive) return []
    return lubecStepRestrictions(effect.steps[0]).map((restriction) => ({
      restriction, why: `${lubecRestrictionWords(restriction)} (${cardName(effect)})`,
    }))
  })
}
