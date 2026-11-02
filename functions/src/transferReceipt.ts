import type { Transaction } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import type { TransferAccess, TransferDoc } from './acceptTransfer.js'

export type TransferIdentity = { fromCharacterId: string; toCharacterId: string }
export const transferOperationId = (transferId: string) => `transfer-${transferId}`

/** Retry after the offer was atomically deleted, using the caller's retained offer identity. */
export async function replayTransferReceipt(tx: Transaction, access: TransferAccess, isGm: boolean) {
  if (!access.identity) return false
  const paths = [access.identity.fromCharacterId, access.identity.toCharacterId].map((id) => access.campaign.collection('characters').doc(id).collection('writeReceipts').doc(transferOperationId(access.transferId)))
  const receipts = await Promise.all(paths.map((ref) => tx.get(ref)))
  const transfers = receipts.map((receipt) => receipt.data()?.transfer as TransferDoc | undefined)
  if (!transfers.every((transfer) => matchesTransferReceipt(transfer, access))) return false
  requireReceiptRecipient(transfers[1]!, access.uid, isGm)
  return true
}

function matchesTransferReceipt(transfer: TransferDoc | undefined, access: TransferAccess) {
  if (!transfer || !access.identity) return false
  return transfer.id === access.transferId && sameTransferPair(transfer, access.identity)
}

function sameTransferPair(transfer: TransferDoc, identity: TransferIdentity) {
  return transfer.fromCharacterId === identity.fromCharacterId && transfer.toCharacterId === identity.toCharacterId
}

function requireReceiptRecipient(transfer: TransferDoc, uid: string, isGm: boolean) {
  if (transfer.toUserId !== uid && !isGm) throw new HttpsError('permission-denied', 'You cannot accept this transfer.')
}
