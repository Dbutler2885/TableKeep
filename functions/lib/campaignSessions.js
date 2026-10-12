import { campaignPath } from './firestorePaths.js';
const DISCORD_SERVERS_COLLECTION = 'discordServers';
/** Removes everything the session recorder wrote under a campaign: sessions, transcripts, audio, numbering. */
export async function deleteCampaignSessions(db, deleteStoragePrefix, groupId, campaignId) {
    // A server that was in the middle of recording into this campaign is freed,
    // so that it is not left unable to start a session ever again.
    const recording = await db
        .collection(DISCORD_SERVERS_COLLECTION)
        .where('activeSession.campaignId', '==', campaignId)
        .get();
    await Promise.all(recording.docs
        .filter((server) => server.data().activeSession?.groupId === groupId)
        .map((server) => server.ref.update({ activeSession: null })));
    await db.recursiveDelete(db.collection(campaignPath(groupId, campaignId, 'sessions')));
    await db.recursiveDelete(db.collection(campaignPath(groupId, campaignId, 'sessionCounters')));
    // The trailing slash keeps this to the one campaign's sessions and nothing that merely begins the same way.
    await deleteStoragePrefix(`${campaignPath(groupId, campaignId, 'sessions')}/`);
}
