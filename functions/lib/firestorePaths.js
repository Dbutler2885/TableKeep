/**
 * Firestore path builders for the group-scoped data model.
 *
 * These mirror `src/features/campaign/firestorePaths.ts` on the client: every
 * campaign document lives under `groups/{groupId}/campaigns/{campaignId}`, and
 * active membership is held by the group rather than by the campaign.
 *
 * The segments live here, rather than inline in `index.ts`, so a test can
 * assert that both sides resolve to the same location without importing the
 * Cloud Functions entrypoint, which builds an admin SDK app at import time.
 */
export function campaignPath(groupId, campaignId, ...segments) {
    return ['groups', groupId, 'campaigns', campaignId, ...segments].join('/');
}
export function groupMemberPath(groupId, userId) {
    return ['groups', groupId, 'members', userId].join('/');
}
