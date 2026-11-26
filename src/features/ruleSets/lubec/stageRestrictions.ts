import { lubecStepRestrictions, type LubecEffect } from './effects'
import { readWoundLifetime } from './woundLifetime'

/** Unconsciousness comes only from current explicit restrictions; its minutes are deliberately manual. */
export const lubecUnconsciousCards = (effects: readonly LubecEffect[]) => effects.filter((effect) =>
  readWoundLifetime({ effect, at: null }).physicalRestrictionsActive && lubecStepRestrictions(effect.steps[0]).some((restriction) => restriction.kind === 'unconscious'))
