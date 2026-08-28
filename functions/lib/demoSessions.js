/**
 * Creating and expiring a visitor's demo sandbox.
 *
 * Everything here takes its Firestore handle and its clock as arguments, and
 * takes storage deletion as an injected callback, so the whole lifecycle can be
 * driven from an emulator suite without going through `index.ts` (which
 * registers HTTP triggers and pulls in `firebase-functions`). `index.ts` is the
 * thin wiring: it decides who may call, and supplies the real bucket.
 */
import { Timestamp } from 'firebase-admin/firestore';
import { DEMO_MAX_LIVE_SANDBOXES, DEMO_SESSIONS_COLLECTION, DEMO_TEMPLATE_CAMPAIGN_ID, DEMO_TEMPLATE_GROUP_ID, } from './demoConstants.js';
import { DEMO_CLONED_SUBCOLLECTIONS, demoSandboxCampaignDoc, demoSandboxGroupDoc, demoSandboxMemberDoc, demoSessionExpiresAtMs, demoStoragePrefix, } from './demoClone.js';
/** Firestore caps a batch at 500 writes; leave headroom for the parent docs. */
const BATCH_LIMIT = 400;
function sessionsCollection(db) {
    return db.collection(DEMO_SESSIONS_COLLECTION);
}
function templateCampaignRef(db) {
    return db
        .collection('groups')
        .doc(DEMO_TEMPLATE_GROUP_ID)
        .collection('campaigns')
        .doc(DEMO_TEMPLATE_CAMPAIGN_ID);
}
class BatchWriter {
    db;
    batch;
    pending = 0;
    commits = [];
    constructor(db) {
        this.db = db;
        this.batch = db.batch();
    }
    set(ref, data) {
        this.batch.set(ref, data);
        this.pending += 1;
        if (this.pending >= BATCH_LIMIT) {
            this.commits.push(this.batch.commit());
            this.batch = this.db.batch();
            this.pending = 0;
        }
    }
    async flush() {
        if (this.pending > 0)
            this.commits.push(this.batch.commit());
        await Promise.all(this.commits);
    }
}
async function copySubcollections(writer, source, target, specs) {
    let copied = 0;
    for (const spec of specs) {
        const snap = await source.collection(spec.name).get();
        for (const docSnap of snap.docs) {
            const childTarget = target.collection(spec.name).doc(docSnap.id);
            // Verbatim, under the same id. See DEMO_CLONED_SUBCOLLECTIONS for why
            // that is what makes the images shared rather than duplicated.
            writer.set(childTarget, docSnap.data());
            copied += 1;
            if (spec.children?.length) {
                copied += await copySubcollections(writer, docSnap.ref, childTarget, spec.children);
            }
        }
    }
    return copied;
}
/**
 * Gives `uid` a private, writable copy of the demo campaign.
 *
 * One live sandbox per visitor: the registry document is keyed by uid, so a
 * refresh, a second tab, or a retry after a dropped response all resolve back to
 * the sandbox the visitor already has rather than minting another.
 *
 * The ceiling is checked against sandboxes that have not yet expired, not
 * against the row count, so a visitor is never turned away because the sweep has
 * not run yet. It is deliberately a soft limit: two calls arriving in the same
 * instant can both observe `limit - 1` and both proceed. Overshooting the cap by
 * a handful is cheaper than serialising every arrival through one counter
 * document, and the sweep collects the overshoot within the hour.
 */
export async function createDemoSandbox(db, uid, nowMs) {
    const sessionRef = sessionsCollection(db).doc(uid);
    const existing = await sessionRef.get();
    if (existing.exists) {
        const data = existing.data() ?? {};
        const expiresAt = data.expiresAt instanceof Timestamp ? data.expiresAt.toMillis() : 0;
        const groupId = typeof data.groupId === 'string' ? data.groupId : '';
        const campaignId = typeof data.campaignId === 'string' ? data.campaignId : '';
        // A sandbox whose group has already been swept leaves the registry row
        // behind only if the sweep failed partway; treat it as gone either way.
        const stillThere = groupId ? (await db.collection('groups').doc(groupId).get()).exists : false;
        if (expiresAt > nowMs && groupId && campaignId && stillThere) {
            return { status: 'resumed', sandbox: { groupId, campaignId, expiresAtMs: expiresAt } };
        }
        await sessionRef.delete();
    }
    const live = await sessionsCollection(db)
        .where('expiresAt', '>', Timestamp.fromMillis(nowMs))
        .count()
        .get();
    const liveSandboxes = live.data().count;
    if (liveSandboxes >= DEMO_MAX_LIVE_SANDBOXES) {
        return { status: 'full', liveSandboxes, limit: DEMO_MAX_LIVE_SANDBOXES };
    }
    const templateGroupRef = db.collection('groups').doc(DEMO_TEMPLATE_GROUP_ID);
    const [templateGroupSnap, templateCampaignSnap] = await Promise.all([
        templateGroupRef.get(),
        templateCampaignRef(db).get(),
    ]);
    if (!templateGroupSnap.exists || !templateCampaignSnap.exists) {
        return { status: 'template-missing' };
    }
    const groupRef = db.collection('groups').doc();
    const campaignRef = groupRef.collection('campaigns').doc();
    const createdAt = Timestamp.fromMillis(nowMs);
    const expiresAtMs = demoSessionExpiresAtMs(nowMs);
    const expiresAt = Timestamp.fromMillis(expiresAtMs);
    // The registry row is written first and is what the sweep reads, so a clone
    // that dies halfway still gets collected rather than leaking a group nobody
    // is tracking.
    await sessionRef.set({
        uid,
        groupId: groupRef.id,
        campaignId: campaignRef.id,
        createdAt,
        expiresAt,
    });
    try {
        const writer = new BatchWriter(db);
        writer.set(groupRef, demoSandboxGroupDoc({
            templateGroup: templateGroupSnap.data() ?? {},
            visitorUid: uid,
            campaignId: campaignRef.id,
            createdAt,
            expiresAt,
        }));
        writer.set(groupRef.collection('members').doc(uid), demoSandboxMemberDoc({ visitorUid: uid, joinedAt: createdAt }));
        writer.set(campaignRef, demoSandboxCampaignDoc({
            templateCampaign: templateCampaignSnap.data() ?? {},
            visitorUid: uid,
            groupId: groupRef.id,
            updatedAt: createdAt,
        }));
        await copySubcollections(writer, templateCampaignRef(db), campaignRef, DEMO_CLONED_SUBCOLLECTIONS);
        await writer.flush();
    }
    catch (error) {
        await sessionRef.delete().catch(() => undefined);
        await db.recursiveDelete(groupRef).catch(() => undefined);
        throw error;
    }
    return {
        status: 'created',
        sandbox: { groupId: groupRef.id, campaignId: campaignRef.id, expiresAtMs },
    };
}
/**
 * Deletes every sandbox whose time is up, and nothing else.
 *
 * The registry is the only input: the sweep never scans `groups`, so it cannot
 * reach a real user's group even if one somehow carried a demo-looking field.
 * Storage goes first - a deleted registry row with objects still behind it would
 * be unreachable garbage, whereas a deleted object with the row still present is
 * retried on the next pass.
 */
export async function sweepExpiredDemoSandboxes(db, deleteStoragePrefix, nowMs) {
    const expired = await sessionsCollection(db)
        .where('expiresAt', '<=', Timestamp.fromMillis(nowMs))
        .get();
    const removedGroupIds = [];
    for (const sessionSnap of expired.docs) {
        const groupId = typeof sessionSnap.data().groupId === 'string' ? sessionSnap.data().groupId : '';
        if (groupId) {
            await deleteStoragePrefix(demoStoragePrefix(groupId));
            await db.recursiveDelete(db.collection('groups').doc(groupId));
            removedGroupIds.push(groupId);
        }
        await sessionSnap.ref.delete();
    }
    return { removedGroupIds };
}
