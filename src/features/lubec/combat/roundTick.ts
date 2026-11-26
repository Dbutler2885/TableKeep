import { readSheetRevision } from '../../character/characterStore/sheetIntention'
import type { SheetBase, SheetEdit, SheetIntention, SheetValue } from '../../character/characterStore/sheetIntentionTypes'
import type { CombatWound } from './woundTypes'
import { lubecDeathReasons, lubecDeathReminder, lubecDeathReminderEdits, lubecStoredDeathThreshold, lubecStoredTrauma } from '../../ruleSets/lubec/deathReminders'
import { closeWoundLifetimes, tickWoundLifetimes, type CardChange, type SheetLifetimePlan } from '../../ruleSets/lubec/woundLifetime'

// The end of a round, or of the fight, for one combatant, as a sheet change.
// The wound lifetime reads the sheet's cards as they stand in the delivery
// transaction and says what changes; this turns each change into an edit that
// carries the value it read, so a concurrent manual edit is never overwritten,
// and the delivery receipt makes a retry return the first outcome instead of
// ending a step twice.

type Raw = Record<string, unknown>

const isRecord = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The stored effects exactly as read, never parsed: each edit's base must be the value on the sheet. */
const storedEffects = (raw: Raw): unknown => (isRecord(raw.lubec) ? raw.lubec.effects : undefined)

function editOf(change: CardChange): SheetEdit {
  const card = ['lubec', 'effects', { recordId: change.id }]
  if (change.kind === 'remove') return { kind: 'remove', path: card, base: { exists: true, value: change.before as unknown as SheetValue } }
  return { kind: 'set', path: [...card, change.field], base: change.before as SheetBase, value: change.value as SheetValue }
}

const lifetimeEdits = (plan: SheetLifetimePlan): SheetEdit[] => [
  ...plan.changes.map(editOf),
  ...(plan.traumaDelta ? [{ kind: 'delta' as const, path: ['lubec', 'counters', 'trauma'], base: 0, amount: plan.traumaDelta }] : []),
]

/**
 * The tick's Death Save reminders: firing bleeds that add Trauma at or past the threshold give one, and each Critical
 * countdown falling due gives its own; each is named by the tick's operation, so a redelivered tick finds its receipt.
 */
function tickDeathEdits(raw: Raw, plan: SheetLifetimePlan, round: number, operationId: string): SheetEdit[] {
  const threshold = lubecStoredDeathThreshold(raw.lubec)
  const bleeding = lubecDeathReasons({ threshold, before: lubecStoredTrauma(raw.lubec), added: plan.bleeding.length })
  return lubecDeathReminderEdits(raw.lubec, [
    ...lubecDeathReminder(`${operationId}_death`, bleeding, `Bleeding from ${plan.bleeding.map((card) => card.name).join(', ')} at the end of round ${round}`),
    ...plan.critical.flatMap((card) =>
      lubecDeathReminder(`${operationId}_critical_${card.id}`, ['A Critical countdown ran out: Death Save due'], `${card.name} at the end of round ${round}`)),
  ])
}

const intentionOf = (raw: Raw, operationId: string, edits: SheetEdit[]): SheetIntention | null =>
  (edits.length ? { operationId, baseRevision: readSheetRevision(raw), edits } : null)

/** The tick as a revision-checked intention, or null when nothing on the sheet ends with this round. */
export function roundTickIntention(raw: Raw, tick: CombatWound, fightId: string, operationId: string): SheetIntention | null {
  const round = tick.tickRound!
  const plan = tickWoundLifetimes({ effects: storedEffects(raw), fightId, round })
  return intentionOf(raw, operationId, [...lifetimeEdits(plan), ...tickDeathEdits(raw, plan, round, operationId)])
}

/** The closing as a revision-checked intention, or null when nothing on the sheet changes. */
export function closingIntention(raw: Raw, entry: CombatWound, fightId: string, operationId: string): SheetIntention | null {
  return intentionOf(raw, operationId, lifetimeEdits(closeWoundLifetimes({ effects: storedEffects(raw), fightId, round: entry.tickRound! })))
}
