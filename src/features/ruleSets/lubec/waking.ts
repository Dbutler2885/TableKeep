import type { SheetIntention, SheetValue } from '../../character/characterStore/sheetIntentionTypes'
import { readSheetRevision } from '../../character/characterStore/sheetIntention'
import { parseLubecSheet } from './characterParser'
import { rollLubecCheck } from './checkRoll'
import type { LubecDice } from './dice'
import { lubecUnconsciousCards } from './stageRestrictions'
import { lubecModeReason, lubecRollMode } from './rollModes'
import { lubecConcussionOutcome } from './woundTables/concussion'
import type { LubecEffect } from './effects'
import type { LubecCheckRoll } from './checkRoll'

function concussionAftermath(effect: LubecEffect, id: string, roll: LubecCheckRoll, because: string | null) {
  const spec = lubecConcussionOutcome({ kind: 'severe' }, roll.outcome === 'success').cards[0]
  const source = { ...effect }
  delete source.wakeSave
  return {
    ...source, id: `${id}_aftermath`, cardKey: 'concussion', part: 'Concussion',
    steps: spec.steps.map((step) => ({ ...step, modifiers: step.modifiers ?? [], labels: [...(step.labels ?? []), 'Long Rests count from the original injury.'] })),
    recoveryRoll: { ...roll, because, purpose: 'Severe Concussion on waking' },
  }
}

/** Head 9's waking Save only: original Trauma, Minimum Stress, wound source and sibling cards stay fixed. */
export function lubecWakingIntention(raw: Record<string, unknown>, id: string, operationId: string, dice: LubecDice): SheetIntention {
  const sheet = parseLubecSheet(raw.lubec)
  const effect = sheet.effects.find((entry) => entry.id === id)
  if (effect?.wakeSave !== 'severe-concussion' || !lubecUnconsciousCards(sheet.effects).some((entry) => entry.id === id)) throw new Error('That card has no waking Save pending.')
  const mode = lubecRollMode(sheet.effects, { kind: 'save', stat: 'Body' }, [{ id: 'waking', name: 'Severe Concussion on waking', mode: 'disadvantage' }])
  const roll = rollLubecCheck(sheet, { name: 'Body', advantage: mode.mode, skill: null }, dice)
  if (!roll) throw new Error('Fill in Body before the waking Save.')
  const aftermath = concussionAftermath(effect, id, roll, lubecModeReason(mode))
  const effects = (raw.lubec as { effects: { id: string }[] }).effects
  const before = effects.find((entry) => entry.id === id)!
  const edits: SheetIntention['edits'][number][] = [
    { kind: 'remove', path: ['lubec', 'effects', { recordId: id }], base: { exists: true, value: before as unknown as SheetValue } },
    { kind: 'insert', path: ['lubec', 'effects'], record: aftermath as unknown as { id: string; [key: string]: SheetValue } },
  ]
  if (roll.stressAdded) edits.push({ kind: 'delta', path: ['lubec', 'counters', 'stress'], base: 0, amount: roll.stressAdded })
  return { operationId, baseRevision: readSheetRevision(raw), edits }
}
