import type { LubecCharacterSheet } from '../../../ruleSets/lubec/characterRecord'
import type { LubecEffect } from '../../../ruleSets/lubec/effects'
import { lubecSheetModifiers } from '../../../ruleSets/lubec/modifiers'
import { lubecHandLimits, type LubecHandLimits } from '../../../ruleSets/lubec/handLimits'
import { lubecMovementLimits, type LubecMovementLimits } from '../../../ruleSets/lubec/movementLimits'
import { readWoundLifetime } from '../../../ruleSets/lubec/woundLifetime'

export type CombatInputRound = { fightId: string; round: number }

/**
 * Whether this fight's round reads the card yet: a wound from this fight waits for its effective round, a passed
 * round window stops counting before the tick's write removes it, and an after-combat card counts in Core Checks
 * until it is cleared, never in a fight.
 */
const activeInFight = (effect: LubecEffect, context: CombatInputRound) => readWoundLifetime({ effect, at: context }).activeInFight

/** Labels and counters remain immediate; only this fight's premature numeric modifiers are filtered. */
export function combatInputModifiers(sheet: LubecCharacterSheet, context: CombatInputRound | null) {
  if (!context) return lubecSheetModifiers(sheet)
  // A deferred card counts for nothing yet: its flat amounts, fractions and "drops to" all wait together.
  const effects = sheet.effects.filter((effect) => activeInFight(effect, context))
  return lubecSheetModifiers({ ...sheet, effects })
}

/** The cards a combat roll reads this round: every card but this fight's wounds that are not effective yet. */
export function combatActiveEffects(sheet: LubecCharacterSheet, context: CombatInputRound | null): LubecEffect[] {
  return context ? sheet.effects.filter((effect) => activeInFight(effect, context)) : [...sheet.effects]
}

/** The hands the sheet can use in this round of this fight, by the one hand reader Gear also asks. */
export const combatHands = (sheet: LubecCharacterSheet, context: CombatInputRound | null): LubecHandLimits =>
  lubecHandLimits(combatActiveEffects(sheet, context))

/** The Movement choices the sheet's cards forbid in this round of this fight, by the one reader the Movement window also asks. */
export const combatMovementLimits = (sheet: LubecCharacterSheet, context: CombatInputRound | null): LubecMovementLimits =>
  lubecMovementLimits(combatActiveEffects(sheet, context))
