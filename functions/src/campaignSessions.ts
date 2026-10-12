/**
 * Clearing a campaign's recorded sessions when the campaign is deleted.
 *
 * A campaign is deleted from the app, subcollection by subcollection. Sessions
 * are different from the rest: no client may write or delete a session, its
 * transcript or its audio, so the app cannot clear them. That is done here,
 * with the admin SDK, when the campaign document goes.
 *
 * Like the other modules in this package, it takes its Firestore handle and
 * its storage deleter as arguments so an emulator suite can drive it directly.
 */
import type { Firestore } from 'firebase-admin/firestore'
import { campaignPath } from './firestorePaths.js'

/** Deletes every Cloud Storage object under a prefix. */
export type DeleteStoragePrefix = (prefix: string) => Promise<void>

const DISCORD_SERVERS_COLLECTION = 'discordServers'

/** Removes everything the session recorder wrote under a campaign: sessions, transcripts, audio, numbering. */
export async function deleteCampaignSessions(
  db: Firestore,
  deleteStoragePrefix: DeleteStoragePrefix,
  groupId: string,
  campaignId: string,
): Promise<void> {
  // A server that was in the middle of recording into this campaign is freed,
  // so that it is not left unable to start a session ever again.
  const recording = await db
    .collection(DISCORD_SERVERS_COLLECTION)
    .where('activeSession.campaignId', '==', campaignId)
    .get()
  await Promise.all(
    recording.docs
      .filter((server) => server.data().activeSession?.groupId === groupId)
      .map((server) => server.ref.update({ activeSession: null })),
  )

  await db.recursiveDelete(db.collection(campaignPath(groupId, campaignId, 'sessions')))
  await db.recursiveDelete(db.collection(campaignPath(groupId, campaignId, 'sessionCounters')))
  // The trailing slash keeps this to the one campaign's sessions and nothing that merely begins the same way.
  await deleteStoragePrefix(`${campaignPath(groupId, campaignId, 'sessions')}/`)
}
