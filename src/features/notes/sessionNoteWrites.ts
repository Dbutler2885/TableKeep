import { deleteDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { campaignDocRef, type CampaignScope } from '../campaign/firestorePaths'
import type { SessionNote } from '../../types/app'

export type PendingNoteWrites = Record<string, ReturnType<typeof setTimeout>>

const NOTE_SAVE_DELAY_MS = 500

const sessionNoteRef = (campaign: CampaignScope, noteId: string) =>
  campaignDocRef(db, campaign, 'sessionSummaries', noteId)

export function createSessionNoteDoc(campaign: CampaignScope, note: SessionNote) {
  if (!campaign.campaignId) return
  const { id, ...data } = note
  void setDoc(
    sessionNoteRef(campaign, id),
    { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
  ).catch((error) => {
    console.error('Failed to create session note', { noteId: id, error })
  })
}

function saveSessionNoteDoc(campaign: CampaignScope, note: SessionNote) {
  // createdAt is set once, when the note is made; an edit must not move it.
  const { id, createdAt: _createdAt, ...data } = note
  void setDoc(
    sessionNoteRef(campaign, id),
    { ...data, updatedAt: serverTimestamp() },
    { merge: true },
  ).catch((error) => {
    console.error('Failed to update session note', { noteId: id, error })
  })
}

export function saveSessionNumberDoc(campaign: CampaignScope, note: SessionNote) {
  void setDoc(
    sessionNoteRef(campaign, note.id),
    { sessionNumber: note.sessionNumber, title: note.title },
    { merge: true },
  ).catch((error) => {
    console.error('Failed to backfill session number', { noteId: note.id, error })
  })
}

export function deleteSessionNoteDoc(campaign: CampaignScope, noteId: string) {
  void deleteDoc(sessionNoteRef(campaign, noteId)).catch((error) => {
    console.error('Failed to delete session note', { noteId, error })
  })
}

export function cancelPendingNoteWrite(pending: PendingNoteWrites, noteId: string) {
  const existing = pending[noteId]
  if (!existing) return
  clearTimeout(existing)
  delete pending[noteId]
}

/**
 * Saves a note half a second after its last edit, reading it when the save
 * comes due so the save carries every edit made in between.
 */
export function scheduleSessionNoteSave(
  pending: PendingNoteWrites,
  campaign: CampaignScope,
  noteId: string,
  readNote: (noteId: string) => SessionNote | undefined,
) {
  if (!campaign.campaignId) return
  cancelPendingNoteWrite(pending, noteId)

  pending[noteId] = setTimeout(() => {
    delete pending[noteId]
    const note = readNote(noteId)
    if (note) saveSessionNoteDoc(campaign, note)
  }, NOTE_SAVE_DELAY_MS)
}
