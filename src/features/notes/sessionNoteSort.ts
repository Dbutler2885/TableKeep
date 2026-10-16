import type { SessionNote } from '../../types/app'
import { getResolvedSessionNumber } from './sessionNoteUtils'

function timestampToMillis(value: unknown): number {
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
 * When a note was generated.
 *
 * `createdAt` is the one date every writer sets once: the recap writer, the old
 * drop-folder endpoint, and the Notes tab's own import all stamp it, and the
 * legacy migration copied it verbatim. A note whose `createdAt` is missing falls
 * back to `updatedAt`, and one with neither is taken to be the note just made,
 * whose server timestamp has not arrived yet.
 */
function generatedAtMillis(note: SessionNote): number {
  return timestampToMillis(note.createdAt) || timestampToMillis(note.updatedAt) || Number.MAX_SAFE_INTEGER
}

/**
 * Newest note first, by when it was generated.
 *
 * The session number is not a date - a recorded session can carry a number
 * lower than the recaps before it - so it only breaks a tie.
 */
export function sortSessionNotes(notes: SessionNote[]): SessionNote[] {
  return [...notes].sort((a, b) => {
    const generatedDelta = generatedAtMillis(b) - generatedAtMillis(a)
    if (generatedDelta !== 0) return generatedDelta

    const sessionDelta = (getResolvedSessionNumber(b) ?? -1) - (getResolvedSessionNumber(a) ?? -1)
    if (sessionDelta !== 0) return sessionDelta

    return b.title.localeCompare(a.title, undefined, { numeric: true, sensitivity: 'base' })
  })
}
