import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { isTransferSourceAuthorized } from './transferAuthorization.js';
initializeApp();
const db = getFirestore();
const sessionSummaryApiKey = defineSecret('SESSION_SUMMARY_API_KEY');
function campaignRef(groupId, campaignId) {
    return db.collection('groups').doc(groupId).collection('campaigns').doc(campaignId);
}
function isAuthorized(req) {
    const incoming = req.get('x-internal-api-key');
    const expected = sessionSummaryApiKey.value();
    return Boolean(incoming) && Boolean(expected) && incoming === expected;
}
export const health = onRequest({ region: 'us-central1' }, (_req, res) => {
    res.status(200).json({ ok: true, service: 'homeboyshouse-functions' });
});
export const postSessionSummary = onRequest({ region: 'us-central1', secrets: [sessionSummaryApiKey] }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'method_not_allowed' });
        return;
    }
    if (!isAuthorized(req)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
    }
    const body = req.body ?? {};
    const { groupId, campaignId, title, summaryMarkdown, sessionNumber } = body;
    if (typeof groupId !== 'string' ||
        groupId.trim().length === 0 ||
        typeof campaignId !== 'string' ||
        typeof title !== 'string' ||
        title.trim().length === 0) {
        res.status(400).json({ error: 'invalid_payload' });
        return;
    }
    // Normalize structured fields from snake_case API payload
    const normalizeScenes = (raw) => {
        if (!Array.isArray(raw))
            return [];
        return raw.map((s) => ({
            name: typeof s.name === 'string' ? s.name : '',
            summary: typeof s.summary === 'string' ? s.summary : '',
            details: Array.isArray(s.details) ? s.details.filter((d) => typeof d === 'string') : [],
        }));
    };
    const normalizeNpcs = (raw) => {
        if (!Array.isArray(raw))
            return [];
        return raw.map((n, i) => ({
            npcKey: typeof n.npc_key === 'string' ? n.npc_key : typeof n.npcKey === 'string' ? n.npcKey : `npc_${i}`,
            name: typeof n.name === 'string' ? n.name : '',
            title: typeof n.title === 'string' ? n.title : '',
            action: n.action === 'update' ? 'update' : 'new',
            facts: Array.isArray(n.facts) ? n.facts.filter((f) => typeof f === 'string') : [],
            linkedNpcId: null,
        }));
    };
    const normalizeCalendar = (raw) => {
        if (!Array.isArray(raw))
            return [];
        return raw.map((c, i) => ({
            key: typeof c.key === 'string' ? c.key : `day_${String(i + 1).padStart(3, '0')}`,
            action: c.action === 'update' ? 'update' : 'new',
            label: typeof c.label === 'string' ? c.label : '',
            dayComplete: c.day_complete === true || c.dayComplete === true,
            entries: Array.isArray(c.entries) ? c.entries.filter((e) => typeof e === 'string') : [],
        }));
    };
    const overallSummary = typeof body.overall_summary === 'string'
        ? body.overall_summary
        : typeof body.overallSummary === 'string'
            ? body.overallSummary
            : '';
    const scenes = normalizeScenes(body.scenes);
    const npcMentions = normalizeNpcs(body.npcs);
    const cliffhangers = Array.isArray(body.cliffhangers)
        ? body.cliffhangers.filter((c) => typeof c === 'string')
        : [];
    const calendar = normalizeCalendar(body.calendar);
    // Auto-match NPCs by name; auto-create a stub for any the GM hasn't entered yet.
    if (npcMentions.length > 0) {
        const npcsCollection = campaignRef(groupId, campaignId).collection('npcs');
        const npcPrivateCollection = campaignRef(groupId, campaignId).collection('npcPrivate');
        const npcsSnap = await npcsCollection.get();
        const npcLookup = new Map();
        npcsSnap.docs.forEach((docSnap) => {
            const data = docSnap.data();
            if (typeof data.name === 'string') {
                const key = data.name.toLowerCase().trim();
                if (npcLookup.has(key)) {
                    npcLookup.delete(key);
                }
                else {
                    npcLookup.set(key, docSnap.id);
                }
            }
        });
        const batch = db.batch();
        let created = 0;
        for (const mention of npcMentions) {
            const m = mention;
            const key = m.name.toLowerCase().trim();
            if (!key)
                continue;
            const matchId = npcLookup.get(key);
            if (matchId) {
                m.linkedNpcId = matchId;
                continue;
            }
            // No existing NPC: create a stub the model owns (its facts surface as Auto-Notes).
            // Transcript NPCs have been met, so they're visible to players by default.
            const newRef = npcsCollection.doc();
            batch.set(newRef, {
                id: newRef.id,
                name: m.name,
                title: typeof m.title === 'string' ? m.title : '',
                visibleToPlayers: true,
                tags: [],
                portraitPath: '',
                portraitUrl: null,
                portraitFocusX: 50,
                portraitFocusY: 50,
                tokenIcon: { icon: 'pawn', color: '#2f5bbf', size: 34 },
                playerDescription: '',
                playerNotes: '',
                createdBy: 'api',
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            });
            batch.set(npcPrivateCollection.doc(newRef.id), {
                id: newRef.id,
                gmNotes: '',
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            });
            npcLookup.set(key, newRef.id);
            m.linkedNpcId = newRef.id;
            created += 1;
        }
        if (created > 0)
            await batch.commit();
    }
    const summaryRef = campaignRef(groupId, campaignId).collection('sessionSummaries').doc();
    await summaryRef.set({
        title: title.trim(),
        summaryMarkdown: typeof summaryMarkdown === 'string' ? summaryMarkdown : '',
        sessionNumber: typeof sessionNumber === 'number' ? sessionNumber : null,
        sourceType: 'api',
        postedBy: 'api',
        overallSummary,
        scenes,
        npcMentions,
        cliffhangers,
        calendar,
        generatedSnapshot: {
            title: title.trim(),
            summaryMarkdown: typeof summaryMarkdown === 'string' ? summaryMarkdown : '',
            overallSummary,
            scenes,
            npcMentions,
            cliffhangers,
            calendar,
        },
        hasHumanEdits: false,
        editedAt: null,
        editedBy: null,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
    });
    res.status(201).json({ ok: true, id: summaryRef.id });
});
export const getCampaignNpcs = onRequest({ region: 'us-central1', secrets: [sessionSummaryApiKey] }, async (req, res) => {
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'method_not_allowed' });
        return;
    }
    if (!isAuthorized(req)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
    }
    const groupId = typeof req.query.groupId === 'string' ? req.query.groupId : '';
    const campaignId = typeof req.query.campaignId === 'string' ? req.query.campaignId : '';
    if (!groupId || !campaignId) {
        res.status(400).json({ error: 'invalid_params' });
        return;
    }
    const snap = await campaignRef(groupId, campaignId).collection('npcs').get();
    const npcs = snap.docs
        .map((docSnap) => {
        const data = docSnap.data();
        return {
            name: typeof data.name === 'string' ? data.name : '',
            title: typeof data.title === 'string' ? data.title : '',
        };
    })
        .filter((n) => n.name.trim().length > 0);
    res.status(200).json({ npcs });
});
function asInventory(details) {
    if (!details || typeof details !== 'object')
        return [];
    const inventory = details.inventory;
    return Array.isArray(inventory) ? inventory : [];
}
function availablePackedSlots(details) {
    const packedSlotThresholds = [18, 16, 13, 9, 6, 4];
    const packedMovementSlotCount = 13;
    if (!details || typeof details !== 'object')
        return packedMovementSlotCount;
    const abilityScores = details.abilityScores;
    const str = Number.parseInt(abilityScores?.STR ?? '', 10);
    let unlocked = 0;
    for (let i = 0; i < packedSlotThresholds.length; i += 1) {
        if (str >= packedSlotThresholds[i])
            unlocked += 1;
    }
    return unlocked + packedMovementSlotCount;
}
function applyAcceptedTransfer(senderInventory, receiverInventory, transfer, packedAllowed) {
    const movedSnapshot = transfer.itemSnapshot;
    if (!movedSnapshot || movedSnapshot.kind === 'gold') {
        return { ok: false, reason: 'missing_item' };
    }
    const senderItem = senderInventory.find((item) => item.id === transfer.itemId);
    if (!senderItem || senderItem.kind === 'gold') {
        return { ok: false, reason: 'missing_item' };
    }
    if (senderItem.kind !== movedSnapshot.kind) {
        return { ok: false, reason: 'kind_mismatch' };
    }
    const senderQty = Math.max(1, senderItem.qty ?? 1);
    const movedQty = Math.max(1, movedSnapshot.qty ?? 1);
    if (senderQty < movedQty) {
        return { ok: false, reason: 'qty_changed' };
    }
    const nextReceiverInventory = [...receiverInventory, { ...movedSnapshot, equipped: false }];
    const packedUsed = nextReceiverInventory.filter((item) => !item.equipped).length;
    if (packedUsed > packedAllowed) {
        return { ok: false, reason: 'packed_slots' };
    }
    const nextSenderInventory = senderInventory.flatMap((item) => {
        if (item.id !== transfer.itemId)
            return [item];
        if (senderQty <= movedQty)
            return [];
        return [{ ...item, qty: senderQty - movedQty }];
    });
    return {
        ok: true,
        senderInventory: nextSenderInventory,
        receiverInventory: nextReceiverInventory,
    };
}
export const acceptPendingTransfer = onCall({ region: 'us-central1' }, async (request) => {
    const uid = request.auth?.uid ?? '';
    if (!uid)
        throw new HttpsError('unauthenticated', 'Authentication required.');
    const campaignId = typeof request.data?.campaignId === 'string' ? request.data.campaignId : '';
    const transferId = typeof request.data?.transferId === 'string' ? request.data.transferId : '';
    if (!campaignId || !transferId) {
        throw new HttpsError('invalid-argument', 'campaignId and transferId are required.');
    }
    const transferRef = db.collection('campaigns').doc(campaignId).collection('pendingTransfers').doc(transferId);
    const rejection = await db.runTransaction(async (tx) => {
        const membershipRef = db.collection('campaigns').doc(campaignId).collection('members').doc(uid);
        const membershipSnap = await tx.get(membershipRef);
        if (!membershipSnap.exists || membershipSnap.data()?.status !== 'active') {
            throw new HttpsError('permission-denied', 'Active campaign membership required.');
        }
        const transferSnap = await tx.get(transferRef);
        if (!transferSnap.exists)
            throw new HttpsError('not-found', 'Transfer no longer exists.');
        const transfer = transferSnap.data();
        const isGm = membershipSnap.data()?.role === 'gm';
        if (transfer.toUserId !== uid && !isGm) {
            throw new HttpsError('permission-denied', 'You cannot accept this transfer.');
        }
        const senderRef = db.collection('campaigns').doc(campaignId).collection('characters').doc(transfer.fromCharacterId);
        const receiverRef = db.collection('campaigns').doc(campaignId).collection('characters').doc(transfer.toCharacterId);
        const [senderSnap, receiverSnap] = await Promise.all([tx.get(senderRef), tx.get(receiverRef)]);
        if (!senderSnap.exists || !receiverSnap.exists) {
            tx.delete(transferRef);
            return { code: 'not-found', message: 'Item no longer available.' };
        }
        const senderData = senderSnap.data();
        const receiverData = receiverSnap.data();
        if (!isTransferSourceAuthorized(senderData?.ownerUserId, transfer.fromUserId)) {
            tx.delete(transferRef);
            return { code: 'permission-denied', message: 'Transfer is not authorized.' };
        }
        const senderDetails = (senderData?.details && typeof senderData.details === 'object') ? senderData.details : {};
        const receiverDetails = (receiverData?.details && typeof receiverData.details === 'object') ? receiverData.details : {};
        const senderInventory = asInventory(senderDetails);
        const receiverInventory = asInventory(receiverDetails);
        const transferResult = applyAcceptedTransfer(senderInventory, receiverInventory, transfer, availablePackedSlots(receiverDetails));
        if (!transferResult.ok && (transferResult.reason === 'missing_item' || transferResult.reason === 'kind_mismatch')) {
            tx.delete(transferRef);
            return { code: 'not-found', message: 'Item no longer available.' };
        }
        if (!transferResult.ok && transferResult.reason === 'qty_changed') {
            tx.delete(transferRef);
            return { code: 'failed-precondition', message: 'Item quantity changed before transfer could be accepted.' };
        }
        if (!transferResult.ok) {
            throw new HttpsError('failed-precondition', 'Not enough packed slots to accept this item.');
        }
        tx.set(senderRef, {
            details: {
                ...senderDetails,
                inventory: transferResult.senderInventory,
            },
        }, { merge: true });
        tx.set(receiverRef, {
            details: {
                ...receiverDetails,
                inventory: transferResult.receiverInventory,
            },
        }, { merge: true });
        tx.delete(transferRef);
        return null;
    });
    if (rejection)
        throw new HttpsError(rejection.code, rejection.message);
    return { ok: true };
});
