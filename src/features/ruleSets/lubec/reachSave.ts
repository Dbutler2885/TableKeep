import type { SheetIntention, SheetValue } from '../../character/characterStore/sheetIntentionTypes'
import { readSheetRevision } from '../../character/characterStore/sheetIntention'
import { parseLubecSheet } from './characterParser'
import { rollLubecCheck, type LubecCheckRoll } from './checkRoll'
import type { LubecCharacterSheet } from './characterRecord'
import type { LubecDice } from './dice'
import type { LubecEffect, LubecEffectStep } from './effects'
import { lubecModeReason, lubecRollMode } from './rollModes'

// A delayed Save a card's step asks for when Step down reaches it: Cutting and
// Piercing Neck 5's "after 1 Long Rest: Body Save; failure: Speech damaged".
// Step down to that step rolls the Save once, against the sheet as it stands,
// with every active mode; it never repeats the hit, its Trauma or its landing
// charges, and every other card keeps its own schedule. Success clears the
// card; failure leaves the printed words as a lasting step with the
// situational Charm reminder, and the Save's ordinary Stress.

type ReachSave = { save: 'Body'; failure: string }

const reachOf = (step: LubecEffectStep | undefined): ReachSave | null => {
  const onReach = (step as { onReach?: unknown } | undefined)?.onReach as Partial<ReachSave> | undefined
  return onReach?.save === 'Body' && typeof onReach.failure === 'string' ? onReach as ReachSave : null
}

/** Whether stepping this card down reaches a step that asks for a Save: its next step names one. */
export const lubecReachSavePending = (effect: LubecEffect | undefined): boolean =>
  Boolean(effect && effect.steps.length > 1 && reachOf(effect.steps[1]))

/** The words the panel shows before the Save is rolled. */
export const lubecReachSaveWords = (effect: LubecEffect): string => {
  const reach = reachOf(effect.steps[1])!
  return `Stepping ${effect.name} down reaches its recovery point: roll a Body Save once. Failure leaves ${reach.failure}, and the GM may call for Disadvantage on a relevant Charm Check.`
}

/** The card after the Save: on success the steps after the Save, if any; on failure the failure as a lasting step first. */
function stepsAfter(effect: LubecEffect, reach: ReachSave, success: boolean): LubecEffectStep[] {
  const later = effect.steps.slice(2)
  if (success) return later
  return [{ modifiers: [], labels: [reach.failure], until: 'lasting', charmReminder: true } as LubecEffectStep, ...later]
}

function pendingReach(sheet: LubecCharacterSheet, id: string): { effect: LubecEffect; reach: ReachSave } {
  const effect = sheet.effects.find((entry) => entry.id === id)
  const reach = effect && lubecReachSavePending(effect) ? reachOf(effect.steps[1]) : null
  if (!effect || !reach) throw new Error('That card has no recovery Save pending.')
  return { effect, reach }
}

/** Record the reached Save on Core even when success removes the recovery card. */
function lastRecoveryRollEdit(raw: Record<string, unknown>, roll: LubecCheckRoll, because: string | null): SheetIntention['edits'][number] {
  const lastRoll = (raw.lubec as { lastRoll?: unknown }).lastRoll
  const shown = because ? { ...roll, because } : roll
  return { kind: 'set', path: ['lubec', 'lastRoll'], base: lastRoll === undefined ? { exists: false } : { exists: true, value: lastRoll as SheetValue }, value: JSON.parse(JSON.stringify(shown)) as SheetValue }
}

/** The reached step's Save, its card's next steps and its Stress, as one intention under a stable operation. */
export function lubecReachSaveIntention(raw: Record<string, unknown>, id: string, operationId: string, dice: LubecDice): SheetIntention {
  const sheet = parseLubecSheet(raw.lubec)
  const { effect, reach } = pendingReach(sheet, id)
  const mode = lubecRollMode(sheet.effects, { kind: 'save', stat: 'Body' })
  const roll = rollLubecCheck(sheet, { name: 'Body', advantage: mode.mode, skill: null }, dice)
  if (!roll) throw new Error('Fill in Body before the recovery Save.')
  const recorded = { ...roll, because: lubecModeReason(mode), purpose: `${effect.name} recovery` }
  const steps = stepsAfter(effect, reach, roll.outcome === 'success')
  const effects = (raw.lubec as { effects: { id: string }[] }).effects
  const before = effects.find((entry) => entry.id === id)!
  const edits: SheetIntention['edits'][number][] = [{ kind: 'remove', path: ['lubec', 'effects', { recordId: id }], base: { exists: true, value: before as unknown as SheetValue } }]
  if (steps.length) {
    const next = { ...effect, id: `${id}_recovered`, steps, recoveryRoll: recorded }
    edits.push({ kind: 'insert', path: ['lubec', 'effects'], record: JSON.parse(JSON.stringify(next)) as { id: string; [key: string]: SheetValue } })
  }
  edits.push(lastRecoveryRollEdit(raw, roll, recorded.because))
  if (roll.stressAdded) edits.push({ kind: 'delta', path: ['lubec', 'counters', 'stress'], base: 0, amount: roll.stressAdded })
  return { operationId, baseRevision: readSheetRevision(raw), edits }
}
