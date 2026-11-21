import type { SheetEdit, SheetValue } from '../../character/characterStore/sheetIntentionTypes'
import { lubecClass } from './classes'

// Death Save reminders: private prompts for the GM that a Death Save is due.
// The app never rolls a Death Save, never applies a Death table result and
// never shows one to a player; it only remembers that one is due, why, and
// whether the GM has handled it. Each reminder is a record on the sheet with
// an identity taken from the event that caused it, so a retried delivery, a
// reload or a second device never makes another.

/** A reminder: its identity, every reason the event gave, the event in words, and whether the GM has handled it. */
export type LubecDeathReminder = { id: string; reasons: string[]; event: string; handled?: true }

/** The adapted Death table, as the Lubec rules print it: Mothership's, with 1d5 Minimum Stress for result 0's lost Health. */
export const LUBEC_DEATH_TABLE: readonly { roll: string; result: string }[] = [
  { roll: '0', result: 'You are unconscious. You wake up in 2d10 minutes. Add 1d5 to your Minimum Stress.' },
  { roll: '1-2', result: 'You are unconscious and dying. You die in 1d5 rounds without intervention.' },
  { roll: '3-4', result: 'You are comatose. Only extraordinary measures can return you to the waking world.' },
  { roll: '5-9', result: 'You have died. Roll up a new character.' },
]

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The stored reminders as the sheet reads them; anything unreadable is left out. */
export function parseLubecDeathReminders(raw: unknown): LubecDeathReminder[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(isRecord).flatMap((entry) => {
    if (typeof entry.id !== 'string' || typeof entry.event !== 'string' || !Array.isArray(entry.reasons)) return []
    const reasons = entry.reasons.filter((reason): reason is string => typeof reason === 'string')
    return [{ id: entry.id, reasons, event: entry.event, ...(entry.handled === true ? { handled: true as const } : {}) }]
  })
}

/** The reminders the GM has not handled yet. */
export const lubecPendingDeathReminders = (reminders: readonly LubecDeathReminder[] | undefined): LubecDeathReminder[] =>
  (reminders ?? []).filter((reminder) => !reminder.handled)

/** The class's Death Save threshold from a stored sheet: 4, 5 for a Tough; null while the class is a hole. */
export function lubecStoredDeathThreshold(lubec: unknown): number | null {
  const key = isRecord(lubec) && isRecord(lubec.class) ? lubec.class.key : null
  return typeof key === 'string' ? lubecClass(key)?.deathSaveTrauma ?? null : null
}

/** The stored Trauma, 0 when unreadable. */
export function lubecStoredTrauma(lubec: unknown): number {
  const trauma = isRecord(lubec) && isRecord(lubec.counters) ? lubec.counters.trauma : 0
  return typeof trauma === 'number' && Number.isFinite(trauma) ? trauma : 0
}

export type LubecTraumaEvent = { threshold: number | null; before: number; added: number; immediate?: string | null }

/**
 * Why an event calls for a Death Save: an Immediate Death Save from a wound, whatever the Trauma (a Tough does not delay it);
 * the first time Trauma reaches the threshold; or any later event that adds Trauma while at or above it. A rise that stays
 * below the threshold, and any fall, gives none.
 */
export function lubecDeathReasons({ threshold, before, added, immediate = null }: LubecTraumaEvent): string[] {
  const reasons = immediate ? [`Immediate Death Save: ${immediate}`] : []
  const after = before + added
  if (added > 0 && threshold !== null && after >= threshold) {
    reasons.push(before < threshold ? `Trauma reached ${after}, the Death Save threshold of ${threshold}` : `Trauma rose to ${after}, at or above the threshold of ${threshold}`)
  }
  return reasons
}

/** A reminder for an event, or none when the event gives no reason. */
export const lubecDeathReminder = (id: string, reasons: readonly string[], event: string): LubecDeathReminder[] =>
  (reasons.length ? [{ id, reasons: [...reasons], event }] : [])

/** Adding reminders to a stored sheet: inserted beside any already there, or the list itself on a sheet that has none yet. */
export function lubecDeathReminderEdits(lubec: unknown, reminders: readonly LubecDeathReminder[]): SheetEdit[] {
  if (!reminders.length) return []
  if (isRecord(lubec) && Array.isArray(lubec.deathReminders)) {
    return reminders.map((reminder) => ({ kind: 'insert', path: ['lubec', 'deathReminders'], record: reminder as unknown as { id: string; [key: string]: SheetValue } }))
  }
  return [{ kind: 'set', path: ['lubec', 'deathReminders'], base: { exists: false }, value: reminders as unknown as SheetValue }]
}

/** Marking a reminder handled: nothing is rolled and nothing is applied. */
export function lubecDeathAcknowledgementEdits(lubec: unknown, id: string): SheetEdit[] {
  const stored = isRecord(lubec) && Array.isArray(lubec.deathReminders) ? lubec.deathReminders.filter(isRecord) : []
  const reminder = stored.find((entry) => entry.id === id)
  if (!reminder) throw new Error('That Death Save reminder is not on the sheet.')
  if (reminder.handled === true) return []
  return [{ kind: 'set', path: ['lubec', 'deathReminders', { recordId: id }, 'handled'], base: { exists: false }, value: true }]
}

/**
 * A Trauma counter change made by hand, as one event: the sheet with the new counters and, when the change adds Trauma at
 * or past the threshold, one reminder named by `eventId`. Lowering Trauma never clears a reminder.
 */
export function lubecWithTraumaEvent<T extends LubecSheetWithReminders>(sheet: T, counters: T['counters'], eventId: string): T {
  const threshold = lubecClass(sheet.class.key)?.deathSaveTrauma ?? null
  const reasons = lubecDeathReasons({ threshold, before: sheet.counters.trauma, added: counters.trauma - sheet.counters.trauma })
  if (!reasons.length) return { ...sheet, counters }
  const reminder: LubecDeathReminder = { id: `manual_${eventId}`, reasons, event: 'Trauma raised by hand' }
  return { ...sheet, counters, deathReminders: [...(sheet.deathReminders ?? []), reminder] }
}

type LubecSheetWithReminders = { class: { key: string | null }; counters: { trauma: number }; deathReminders?: readonly LubecDeathReminder[] }
