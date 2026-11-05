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
  const effects = sheet.effects.map((effect) => deferredEffect(effect, context)
    ? { ...effect, steps: effect.steps.map((step) => ({ ...step, modifiers: [] })) } : effect)
  return lubecSheetModifiers({ ...sheet, effects })
}
