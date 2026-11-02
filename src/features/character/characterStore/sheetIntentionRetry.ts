import { FirebaseError } from 'firebase/app'
import { getDocFromServer, type DocumentReference } from 'firebase/firestore'
import { readSheetRevision } from './sheetIntention'

function canCheckRevision(error: unknown, nextRevision: number | undefined, retries: number): nextRevision is number {
  return retries > 0 && nextRevision !== undefined
    && error instanceof FirebaseError && error.code === 'permission-denied'
}

async function revisionAdvanced(sheetRef: DocumentReference, nextRevision: number) {
  const current = await getDocFromServer(sheetRef.withConverter(null))
  return current.exists() && readSheetRevision(current.data()) >= nextRevision
}

/** Rules may reject a stale revision before Firestore reports transaction contention. */
export async function withSheetRevisionRetry<T>(sheetRef: DocumentReference, write: () => Promise<T>, attemptedRevision: () => number | undefined, retries = 2): Promise<T> {
  try {
    return await write()
  } catch (error) {
    const nextRevision = attemptedRevision()
    if (!canCheckRevision(error, nextRevision, retries)) throw error
    if (!await revisionAdvanced(sheetRef, nextRevision)) throw error
    return withSheetRevisionRetry(sheetRef, write, attemptedRevision, retries - 1)
  }
}
