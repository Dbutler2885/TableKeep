import { lubecRestrictionWords, lubecStepRestrictions, type LubecEffect, type LubecRestriction } from './effects'

export type LubecRestrictionSource = { restriction: LubecRestriction; why: string }

const cardName = (effect: LubecEffect) =>
  (typeof effect.part === 'string' && effect.part && effect.part !== effect.name ? `${effect.name}, ${effect.part}` : effect.name)

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
