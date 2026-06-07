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

export function sortSessionNotes(notes: SessionNote[]): SessionNote[] {
  return [...notes].sort((a, b) => {
    const sessionDelta = (getResolvedSessionNumber(b) ?? -1) - (getResolvedSessionNumber(a) ?? -1)
    if (sessionDelta !== 0) return sessionDelta

    const updatedDelta = timestampToMillis(b.updatedAt) - timestampToMillis(a.updatedAt)
    if (updatedDelta !== 0) return updatedDelta

    const createdDelta = timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt)
    if (createdDelta !== 0) return createdDelta

    return b.title.localeCompare(a.title, undefined, { numeric: true, sensitivity: 'base' })
  })
}
