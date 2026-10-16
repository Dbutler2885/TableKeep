import type { SessionNote } from '../../types/app'
import { sortSessionNotes } from './sessionNoteSort'
import { getResolvedSessionNumber, sanitizeSessionTitle } from './sessionNoteUtils'

type NotePatch = Partial<SessionNote>

function patchedTitleSource(currentNote: SessionNote | undefined, patch: NotePatch): string {
  return patch.title ?? currentNote?.title ?? ''
}

function patchedSessionNumber(currentNote: SessionNote | undefined, patch: NotePatch): number | null {
  return patch.sessionNumber
    ?? currentNote?.sessionNumber
    ?? getResolvedSessionNumber({ title: patchedTitleSource(currentNote, patch), sessionNumber: null })
}

function patchedTitle(currentNote: SessionNote | undefined, patch: NotePatch, sessionNumber: number | null): string {
  return patch.title == null ? currentNote?.title ?? '' : sanitizeSessionTitle(patch.title, sessionNumber)
}

/**
 * Applies an edit to one note, keeping its title free of the default session
 * label and its session number resolved, and returns the list re-sorted.
 */
export function applySessionNotePatch(notes: SessionNote[], noteId: string, patch: NotePatch): SessionNote[] {
  const currentNote = notes.find((note) => note.id === noteId)
  const sessionNumber = patchedSessionNumber(currentNote, patch)
  const normalizedPatch = {
    ...patch,
    title: patchedTitle(currentNote, patch, sessionNumber),
    sessionNumber,
  }

  return sortSessionNotes(notes.map((note) => (note.id === noteId ? { ...note, ...normalizedPatch } : note)))
}

function gainedSessionNumber(stored: SessionNote | undefined, numbered: SessionNote): boolean {
  return stored !== undefined && stored.sessionNumber == null && numbered.sessionNumber != null
}

/** The notes that numbering gave a session number they were not stored with. */
export function sessionNumberBackfills(stored: SessionNote[], numbered: SessionNote[]): SessionNote[] {
  return numbered.filter((note) => gainedSessionNumber(stored.find((entry) => entry.id === note.id), note))
}
