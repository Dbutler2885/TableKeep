import type { LubecCharacterSheet } from '../../../ruleSets/lubec/characterRecord'
import type { LubecEffect } from '../../../ruleSets/lubec/effects'
import { lubecSheetModifiers } from '../../../ruleSets/lubec/modifiers'
import type { CombatWoundOrigin } from '../woundTypes'

export type CombatInputRound = { fightId: string; round: number }

function deferredEffect(effect: LubecEffect, context: CombatInputRound): boolean {
  const origin = effect.combatOrigin as CombatWoundOrigin | undefined
  return origin?.fightId === context.fightId && context.round < origin.effectiveRound
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
