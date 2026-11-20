import { SheetRepair } from './sheets/sheetIntentionTypes.js';
import { writeAdminSheetChanges } from './sheets/adminSheetWrites.js';
import { replayTransferReceipt, transferOperationId } from './transferReceipt.js';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { isTransferSourceAuthorized } from './transferAuthorization.js';
import { NO_CARRYING_MESSAGE, droppedOffer, resolveTransferCarrying } from './ruleSetCarrying.js';
import { CHARACTER_BEING_UPDATED_MESSAGE, currentCharacterSchemaVersion, isCharacterAtSchemaVersion } from './characterSchemaVersions.js';
async function transferAuthority(tx, access) {
    const [member, campaign] = await Promise.all([tx.get(access.member), tx.get(access.campaign)]);
    if (!isActiveTransferMember(member.exists, member.data()))
        throw new HttpsError('permission-denied', 'Active group membership required.');
    if (!campaign.exists)
        throw new HttpsError('not-found', 'Campaign no longer exists.');
    return { system: campaign.data()?.system, isGm: isTransferGm(member.data(), campaign.data(), access.uid) };
}
function isActiveTransferMember(exists, data) {
    return exists && data?.status === 'active';
}
function isTransferGm(member, campaign, uid) {
    return member.role === 'admin' || campaign.gmUserId === uid;
}
function transferCarrying(system) {
    const carrying = resolveTransferCarrying(system);
    if (!carrying)
        throw new HttpsError('failed-precondition', NO_CARRYING_MESSAGE);
    return carrying;
}
function requireTransferRecipient(transfer, uid, isGm) {
    if (transfer.toUserId !== uid && !isGm)
        throw new HttpsError('permission-denied', 'You cannot accept this transfer.');
}
function requireTransferVersions(sender, receiver, system) {
    const version = currentCharacterSchemaVersion(system);
    if (![sender, receiver].every((character) => isCharacterAtSchemaVersion(character, version)))
        throw new HttpsError('failed-precondition', CHARACTER_BEING_UPDATED_MESSAGE);
    return version;
}
function refusedTransfer(tx, ref, result) {
    if (result.reason === 'no_room')
        throw new HttpsError('failed-precondition', result.message);
    tx.delete(ref);
    return droppedOffer(result.reason);
}
export async function applyAcceptedTransfer(tx, access, transfer, system) {
    const senderRef = access.campaign.collection('characters').doc(transfer.fromCharacterId);
    const receiverRef = access.campaign.collection('characters').doc(transfer.toCharacterId);
    const ref = access.campaign.collection('pendingTransfers').doc(access.transferId);
    const carrying = transferCarrying(system);
    const [sender, receiver] = await Promise.all([tx.get(senderRef), tx.get(receiverRef)]);
    if (!sender.exists || !receiver.exists) {
        tx.delete(ref);
        return { code: 'not-found', message: 'Item no longer available.' };
    }
    return finishTransfer(tx, { senderRef, receiverRef, ref }, sender.data(), receiver.data(), transfer, system, carrying);
}
async function finishTransfer(tx, refs, sender, receiver, transfer, system, carrying) {
    if (!isTransferSourceAuthorized(sender.ownerUserId, transfer.fromUserId)) {
        tx.delete(refs.ref);
        return { code: 'permission-denied', message: 'Transfer is not authorized.' };
    }
    const version = requireTransferVersions(sender, receiver, system);
    const result = carrying(sender, receiver, transfer);
    if (!result.ok)
        return refusedTransfer(tx, refs.ref, result);
    await writeTransferredSheets(tx, refs, sender, receiver, transfer, result, system, version);
    tx.delete(refs.ref);
    return null;
}
export async function acceptTransfer(access) {
    const rejection = await runTransferTransaction(access, async (tx) => {
        return performTransfer(tx, access);
    });
    if (rejection)
        throw new HttpsError(rejection.code, rejection.message);
    return { ok: true };
}
async function performTransfer(tx, access) {
    const authority = await transferAuthority(tx, access);
    const ref = access.campaign.collection('pendingTransfers').doc(access.transferId);
    const snapshot = await tx.get(ref);
    if (!snapshot.exists)
        return missingTransfer(tx, access, authority);
    const transfer = snapshot.data();
    requireTransferRecipient(transfer, access.uid, authority.isGm);
    return applyAcceptedTransfer(tx, access, transfer, authority.system);
}
async function runTransferTransaction(access, body) {
    try {
        return await access.db.runTransaction(body);
    }
    catch (error) {
        if (error instanceof SheetRepair)
            throw new HttpsError('failed-precondition', 'This character needs repair before the transfer can be accepted. The offer has been kept.');
        throw error;
    }
}
async function missingTransfer(tx, access, authority) {
    if (authority.system === 'lubec' && await replayTransferReceipt(tx, access, authority.isGm))
        return null;
    throw new HttpsError('not-found', 'Transfer no longer exists.');
}
async function writeTransferredSheets(tx, refs, sender, receiver, transfer, result, system, version) {
    if (system === 'lubec') {
        await writeAdminSheetChanges(tx, [
            { ref: refs.senderRef, current: sender, patch: result.sender },
            { ref: refs.receiverRef, current: receiver, patch: result.receiver },
        ], transferOperationId(refs.ref.id), { transfer: { ...transfer, id: refs.ref.id } });
        return;
    }
    const stamp = { schemaVersion: version, schemaWrittenAt: FieldValue.serverTimestamp() };
    tx.set(refs.senderRef, { ...result.sender, ...stamp }, { merge: true });
    tx.set(refs.receiverRef, { ...result.receiver, ...stamp }, { merge: true });
}
