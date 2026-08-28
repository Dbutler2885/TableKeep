/**
 * The pure half of "clone the demo template into a visitor's own sandbox".
 *
 * Nothing in this module touches Firestore, the admin SDK, or the clock. It
 * describes *what* a clone is - which collections come across, and how each
 * document is rewritten on the way - so the shape can be tested by the plain
 * `npm test` job, which does not install the Cloud Functions package's runtime
 * dependencies. `demoSessions.ts` does the reading and writing.
 */
import { DEMO_SESSION_TTL_MS } from './demoConstants.js';
/**
 * The campaign subcollections a clone copies.
 *
 * This mirrors `CAMPAIGN_SUBCOLLECTIONS` in
 * `src/features/campaign/deleteCampaignDeep.ts`, minus the three that hold
 * nothing worth carrying into a fresh sandbox:
 *
 * - `userState` is per-user UI scratch (which character you had selected, which
 *   cliffhanger you have seen). The template's belongs to accounts the visitor
 *   is not.
 * - `itemApprovals` and `pendingTransfers` are in-flight requests between two
 *   players. A pristine template has none, and a copied one would address users
 *   who are not at this table.
 *
 * Everything else - characters, maps and their tokens/annotations/fog chunks,
 * NPCs (public and private), items, monsters, tables and their roll history,
 * notes, session summaries, reference docs and revealed images - comes across,
 * because that is the campaign the visitor came to look at.
 *
 * Every document is copied verbatim, under its original id. That is the whole
 * trick behind sharing images rather than duplicating them: only the group id
 * and the campaign id differ between the template and a clone, and a map's
 * `imagePath` is an absolute Cloud Storage path stored on the map document
 * itself (`handleMapUpload` in `src/features/maps/hooks/useMapData.ts`), as are
 * character and NPC `portraitPath` / `tokenIcon.customImagePath`
 * (`entityMediaStoragePath` in `src/features/common/mediaStorage.ts`). Carrying
 * those strings across unchanged leaves every clone pointing at the template's
 * single copy of each image instead of writing roughly 10 MB per visitor.
 * `storage.rules` grants that read; nothing about how a map records where its
 * image lives had to change.
 *
 * The direction that is *not* shared falls out of the same property. Fog and
 * vision overlays are uploaded to a path built from the campaign the visitor is
 * currently in - `groups/{groupId}/campaigns/{campaignId}/maps/{mapId}/fog/{ts}.png`
 * in `uploadMapOverlayImage` (`src/features/maps/hooks/useFogTools.ts`) - so the
 * moment a visitor paints, their overlay lands under their own group prefix and
 * the map document stops pointing at the template's. A visitor can only ever
 * create objects under `groups/{their sandbox}/`, which is exactly the prefix
 * the expiry sweep deletes.
 */
export const DEMO_CLONED_SUBCOLLECTIONS = [
    { name: 'characters' },
    { name: 'maps', children: [{ name: 'tokens' }, { name: 'annotations' }, { name: 'fogChunks' }] },
    { name: 'tokenAssets' },
    { name: 'monsters' },
    { name: 'npcs' },
    { name: 'npcPrivate' },
    { name: 'items' },
    { name: 'tables', children: [{ name: 'history' }] },
    { name: 'images' },
    { name: 'referenceDocs' },
    { name: 'sessionSummaries' },
    { name: 'sharedNotes' },
];
/** Root Cloud Storage prefix that belongs to one group. */
export function demoStoragePrefix(groupId) {
    return `groups/${groupId}/`;
}
/** When a sandbox created at `nowMs` falls out of scope. */
export function demoSessionExpiresAtMs(nowMs) {
    return nowMs + DEMO_SESSION_TTL_MS;
}
/**
 * The visitor's copy of the group document.
 *
 * The visitor is the group's `admin`, which is what makes them the GM of every
 * campaign inside it (`isGroupAdmin` short-circuits `isCampaignGm` in
 * `firestore.rules`). `isDemoSandbox` and `demoOwnerUid` are what the expiry
 * sweep and a human reading the console recognise the group by; the
 * authoritative expiry record is the `demoSessions/{uid}` document, because a
 * sweep that trusted a field on the group it is about to delete could not find
 * a group whose document write failed halfway.
 */
export function demoSandboxGroupDoc(params) {
    const name = typeof params.templateGroup.name === 'string' ? params.templateGroup.name : 'Demo table';
    return {
        name,
        slug: `demo-${params.visitorUid}`,
        activeCampaignId: params.campaignId,
        currentCampaignId: params.campaignId,
        createdBy: params.visitorUid,
        isDemoSandbox: true,
        demoOwnerUid: params.visitorUid,
        demoExpiresAt: params.expiresAt,
        createdAt: params.createdAt,
        updatedAt: params.createdAt,
    };
}
/** The visitor's own `groups/{groupId}/members/{uid}` document. */
export function demoSandboxMemberDoc(params) {
    return {
        userId: params.visitorUid,
        role: 'admin',
        status: 'active',
        joinedAt: params.joinedAt,
        updatedAt: params.joinedAt,
    };
}
/**
 * The visitor's copy of the campaign document.
 *
 * Three fields move and the rest is carried through unchanged: the visitor
 * becomes `gmUserId` and `createdBy`, and the campaign is `active` so the group
 * shell opens straight into it rather than into an empty "no active campaign"
 * screen. `groupId` is a denormalised copy the campaign document carries, so it
 * has to follow the clone.
 */
export function demoSandboxCampaignDoc(params) {
    return {
        ...params.templateCampaign,
        groupId: params.groupId,
        status: 'active',
        gmUserId: params.visitorUid,
        createdBy: params.visitorUid,
        isDemoSandbox: true,
        demoOwnerUid: params.visitorUid,
        updatedAt: params.updatedAt,
    };
}
