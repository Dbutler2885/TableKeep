/**
 * Writing a session's recap when the session ends, once.
 *
 * The bot marks an ended session's recap as pending. That mark is the request:
 * whatever notices it claims the session, writes the recap, and records how it
 * went on the session, where the app shows it. Nothing is said in Discord.
 *
 * A session's recap status is one of:
 *
 *   pending   asked for, and waiting or being written
 *   delayed   held back, because the transcript is not complete yet (set by the bot)
 *   ready     written; `recapSummaryId` names the session summary
 *   failed    could not be written; `recapError` says why, and a GM can ask again
 *
 * The request can be noticed more than once, and a run can die partway. So a
 * session is claimed before any work is done, the model's answer is kept as
 * soon as it arrives, and the summary is saved under a name fixed by the
 * session. A second run finds what the first left and finishes the same recap.
 * A summary that already exists is never written over, whoever has edited it.
 */
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { campaignPath } from '../firestorePaths.js'
import { saveGeneratedSummary } from './sessionSummaries.js'
import { draftSessionRecap, type RecapDependencies, type RecapDraft, type SessionRef } from './writeRecap.js'

/** How long a claim holds. Longer than a run is allowed to take, so a live run is never joined by a second. */
export const RECAP_CLAIM_MS = 10 * 60 * 1000

export type RecapRunOutcome =
  | 'written'
  /** The session already had its recap; it was left as it is. */
  | 'already-written'
  /** No recap is being asked for: the session has not ended, its transcript is incomplete, or its recap is settled. */
  | 'not-due'
  /** Another run has the session. */
  | 'in-progress'
  | 'failed'

/** The session summary that is a session's recap. Fixed by the session, so writing it twice leaves one. */
export function sessionRecapSummaryId(sessionId: string): string {
  return `session-${sessionId}`
}

const sessionDoc = (db: Firestore, session: SessionRef) =>
  db.doc(campaignPath(session.groupId, session.campaignId, 'sessions', session.sessionId))
/** Where the model's answer is kept between getting it and saving the summary. */
const draftDoc = (db: Firestore, session: SessionRef) => sessionDoc(db, session).collection('recapRuns').doc('main')

/** Whether a session document is asking for its recap to be written. */
export function recapIsDue(data: Record<string, unknown> | undefined): boolean {
  return data?.state === 'ended' && data.transcriptComplete === true && data.recapStatus === 'pending'
}

export async function runSessionRecap(db: Firestore, session: SessionRef, dependencies: RecapDependencies): Promise<RecapRunOutcome> {
  const now = dependencies.nowMs ?? Date.now
  const sessionRef = sessionDoc(db, session)

  const claim = await db.runTransaction(async (tx): Promise<'claimed' | 'not-due' | 'in-progress'> => {
    const data = (await tx.get(sessionRef)).data()
    if (!recapIsDue(data)) return 'not-due'
    const claimedAt = (data?.recapClaimedAt as Timestamp | null | undefined)?.toMillis() ?? null
    if (claimedAt !== null && now() - claimedAt < RECAP_CLAIM_MS) return 'in-progress'
    tx.update(sessionRef, { recapClaimedAt: Timestamp.fromMillis(now()) })
    return 'claimed'
  })
  if (claim !== 'claimed') return claim

  const summaryId = sessionRecapSummaryId(session.sessionId)
  const settle = (fields: Record<string, unknown>) =>
    sessionRef.update({ recapClaimedAt: null, recapUpdatedAt: Timestamp.fromMillis(now()), ...fields })
  try {
    const summaryRef = db.doc(campaignPath(session.groupId, session.campaignId, 'sessionSummaries', summaryId))
    const alreadyWritten = (await summaryRef.get()).exists
    if (!alreadyWritten) {
      const draftRef = draftDoc(db, session)
      let draft = (await draftRef.get()).data() as RecapDraft | undefined
      if (!draft) {
        draft = await draftSessionRecap(db, session, dependencies)
        // Kept before anything is done with it, so that a run cut short here does not ask the model again.
        await draftRef.set(draft)
      }
      await saveGeneratedSummary(db, session.groupId, session.campaignId, draft.summary, { summaryId, extra: draft.extra })
    }
    await settle({ recapStatus: 'ready', recapSummaryId: summaryId, recapError: null })
    return alreadyWritten ? 'already-written' : 'written'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // If even this cannot be recorded, the claim lapses on its own and the session can be claimed again.
    await settle({ recapStatus: 'failed', recapError: message.slice(0, 500) }).catch(() => undefined)
    return 'failed'
  }
}

export type RecapRerunResult = 'requested' | 'not-found' | 'not-failed'

/**
 * Asks for a session's recap to be tried again, after it failed.
 *
 * It only marks the session; the recap is written by whatever watches for the
 * mark, as it was the first time. The model is asked afresh.
 */
export async function requestRecapRerun(db: Firestore, session: SessionRef): Promise<RecapRerunResult> {
  const sessionRef = sessionDoc(db, session)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(sessionRef)
    if (!snap.exists) return 'not-found'
    if (snap.data()?.recapStatus !== 'failed') return 'not-failed'
    tx.delete(draftDoc(db, session))
    tx.update(sessionRef, { recapStatus: 'pending', recapError: null, recapClaimedAt: null })
    return 'requested'
  })
}
