import { validateSheetIntention } from './sheetIntentionValidation'
import type { PendingSheetEdit } from './sheetOptimistic'

const keyOf = (userId: string, path: string) => `tablekeep-sheet-edits:${userId}:${path}`

export function readSheetEditJournal(userId: string, path: string): PendingSheetEdit[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(keyOf(userId, path)) ?? '[]')
    return journalEntries(parsed)
  } catch {
    return []
  }
}

export function writeSheetEditJournal(userId: string, path: string, entries: PendingSheetEdit[]) {
  try {
    sessionStorage.setItem(keyOf(userId, path), JSON.stringify(entries))
  } catch {
    // In a non-browser or storage-disabled session the live queue still retains every edit.
  }
}

function journalEntries(raw: unknown): PendingSheetEdit[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(readJournalEntry)
}

function readJournalEntry(raw: unknown): PendingSheetEdit[] {
  try {
    const entry = raw as PendingSheetEdit
    validateSheetIntention(entry.intention)
    return [{ intention: entry.intention }]
  } catch {
    return []
  }
}
