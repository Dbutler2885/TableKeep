import { HttpsError } from 'firebase-functions/v2/https';
export const transferOperationId = (transferId) => `transfer-${transferId}`;
/** Retry after the offer was atomically deleted, using the caller's retained offer identity. */
export async function replayTransferReceipt(tx, access, isGm) {
    if (!access.identity)
        return false;
    const paths = [access.identity.fromCharacterId, access.identity.toCharacterId].map((id) => access.campaign.collection('characters').doc(id).collection('writeReceipts').doc(transferOperationId(access.transferId)));
    const receipts = await Promise.all(paths.map((ref) => tx.get(ref)));
    const transfers = receipts.map((receipt) => receipt.data()?.transfer);
    if (!transfers.every((transfer) => matchesTransferReceipt(transfer, access)))
        return false;
    requireReceiptRecipient(transfers[1], access.uid, isGm);
    return true;
}
function matchesTransferReceipt(transfer, access) {
    if (!transfer || !access.identity)
        return false;
    return transfer.id === access.transferId && sameTransferPair(transfer, access.identity);
}
function sameTransferPair(transfer, identity) {
    return transfer.fromCharacterId === identity.fromCharacterId && transfer.toCharacterId === identity.toCharacterId;
}
function requireReceiptRecipient(transfer, uid, isGm) {
    if (transfer.toUserId !== uid && !isGm)
        throw new HttpsError('permission-denied', 'You cannot accept this transfer.');
}
