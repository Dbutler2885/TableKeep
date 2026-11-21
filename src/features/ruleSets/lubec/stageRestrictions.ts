import { lubecStepRestrictions, type LubecEffect } from './effects'

/** Unconsciousness comes only from current explicit restrictions; its minutes are deliberately manual. */
export const lubecUnconsciousCards = (effects: readonly LubecEffect[]) => effects.filter((effect) =>
  effect.afterCombat === undefined && effect.steps[0] && lubecStepRestrictions(effect.steps[0]).some((restriction) => restriction.kind === 'unconscious'))
