import type { SessionNote } from '../../types/app'
import { getResolvedSessionNumber } from './sessionNoteUtils'

export function timestampToMillis(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value instanceof Date) return value.getTime()

  if (value && typeof value === 'object') {
    const maybeTimestamp = value as { toMillis?: () => number; seconds?: number }
    if (typeof maybeTimestamp.toMillis === 'function') return maybeTimestamp.toMillis()
    if (typeof maybeTimestamp.seconds === 'number') return maybeTimestamp.seconds * 1000
  }

  return 0
}

/**
 * Newest note first, by when it was generated.
 *
 * `createdAt` is the one date every writer sets once and nothing changes
 * afterwards: the recap writer, the old drop-folder endpoint, and the Notes
 * tab's own import all stamp it, and the legacy migration copied it verbatim.
 * The session number is not a date - a recorded session can carry a number
 * lower than the recaps before it - and `updatedAt` moves on every edit.
 * A note without a date sorts below every dated one.
 */
export function sortSessionNotes(notes: SessionNote[]): SessionNote[] {
  return [...notes].sort((a, b) => {
    const createdDelta = timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt)
    if (createdDelta !== 0) return createdDelta

    const sessionDelta = (getResolvedSessionNumber(b) ?? -1) - (getResolvedSessionNumber(a) ?? -1)
    if (sessionDelta !== 0) return sessionDelta

    return b.title.localeCompare(a.title, undefined, { numeric: true, sensitivity: 'base' })
  })
}
