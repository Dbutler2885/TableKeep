import { readSheetRevision } from '../../character/characterStore/sheetIntention'
import type { SheetEdit, SheetIntention, SheetValue } from '../../character/characterStore/sheetIntentionTypes'
import type { CombatWound, CombatWoundOrigin } from './woundTypes'

// The end of a round for one combatant, as a sheet change. It reads the sheet
// as it stands in the delivery transaction and ends what this fight's round
// windows say ends with this round: a brief "until the end of the next round"
// step from round R ends with round R+1. Every edit carries the value it read,
// so a concurrent manual edit is never overwritten, and the delivery receipt
// makes a retry return the first outcome instead of ending a step twice.

type Raw = Record<string, unknown>

const isRecord = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value)

const originOf = (effect: Raw): CombatWoundOrigin | null => (isRecord(effect.combatOrigin) ? effect.combatOrigin as unknown as CombatWoundOrigin : null)

/** The round a brief window from round `landed` ends with. */
export const lubecBriefWindowEnd = (landed: number): number => landed + 1

/** Whether this stored card's current step is a round window from this fight that has ended by the end of `round`. */
function windowEnded(effect: Raw, fightId: string, round: number): boolean {
  const origin = originOf(effect)
  const first = Array.isArray(effect.steps) && isRecord(effect.steps[0]) ? effect.steps[0] : null
  return origin?.fightId === fightId && first?.until === 'next-round-end' && lubecBriefWindowEnd(origin.originatingRound) <= round
}

/** The edit that ends a card's current step: the next step begins, or the card goes when it was the last. */
function stepDownEdit(effect: Raw): SheetEdit {
  const id = String(effect.id)
  const steps = effect.steps as SheetValue[]
  if (steps.length > 1) return { kind: 'set', path: ['lubec', 'effects', { recordId: id }, 'steps'], base: { exists: true, value: steps }, value: steps.slice(1) }
  return { kind: 'remove', path: ['lubec', 'effects', { recordId: id }], base: { exists: true, value: effect as SheetValue } }
}

/** What ends for this combatant at the end of the tick's round; empty when nothing does. */
export function roundTickEdits(raw: Raw, tick: CombatWound, fightId: string): SheetEdit[] {
  const lubec = isRecord(raw.lubec) ? raw.lubec : {}
  const effects = Array.isArray(lubec.effects) ? lubec.effects.filter(isRecord) : []
  return effects.filter((effect) => typeof effect.id === 'string' && windowEnded(effect, fightId, tick.tickRound!)).map(stepDownEdit)
}

/** The tick as a revision-checked intention, or null when nothing on the sheet ends with this round. */
export function roundTickIntention(raw: Raw, tick: CombatWound, fightId: string, operationId: string): SheetIntention | null {
  const edits = roundTickEdits(raw, tick, fightId)
  return edits.length ? { operationId, baseRevision: readSheetRevision(raw), edits } : null
}
