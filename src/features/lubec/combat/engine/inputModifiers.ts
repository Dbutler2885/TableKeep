import type { LubecCharacterSheet } from '../../../ruleSets/lubec/characterRecord'
import type { LubecEffect } from '../../../ruleSets/lubec/effects'
import { lubecSheetModifiers } from '../../../ruleSets/lubec/modifiers'
import { lubecBriefWindowEnd } from '../roundTick'
import type { CombatWoundOrigin } from '../woundTypes'

export type CombatInputRound = { fightId: string; round: number }

/** A card from this fight whose round window has passed: inactive to every reader at once, before the tick's write removes it. */
function expiredWindow(effect: LubecEffect, context: CombatInputRound, origin: CombatWoundOrigin | undefined): boolean {
  return origin?.fightId === context.fightId && effect.steps[0]?.until === 'next-round-end' && context.round > lubecBriefWindowEnd(origin.originatingRound)
}

function deferredEffect(effect: LubecEffect, context: CombatInputRound): boolean {
  const origin = effect.combatOrigin as CombatWoundOrigin | undefined
  // An after-combat card is the table's to resolve: Core Checks still read it until it is cleared, no fight does.
  if (effect.afterCombat !== undefined) return true
  return (origin?.fightId === context.fightId && context.round < origin.effectiveRound) || expiredWindow(effect, context, origin)
}

/** Labels and counters remain immediate; only this fight's premature numeric modifiers are filtered. */
export function combatInputModifiers(sheet: LubecCharacterSheet, context: CombatInputRound | null) {
  if (!context) return lubecSheetModifiers(sheet)
  // A deferred card counts for nothing yet: its flat amounts, fractions and "drops to" all wait together.
  const effects = sheet.effects.filter((effect) => !deferredEffect(effect, context))
  return lubecSheetModifiers({ ...sheet, effects })
}

/** The cards a combat roll reads this round: every card but this fight's wounds that are not effective yet. */
export function combatActiveEffects(sheet: LubecCharacterSheet, context: CombatInputRound | null): LubecEffect[] {
  return context ? sheet.effects.filter((effect) => !deferredEffect(effect, context)) : [...sheet.effects]
}
