import { FieldValue, type DocumentReference, type Firestore, type Transaction } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { isTransferSourceAuthorized } from './transferAuthorization.js'
import type { InventoryItem } from './oseCarrying.js'
import { NO_CARRYING_MESSAGE, droppedOffer, resolveTransferCarrying, type TransferOutcome, type TransferRejection } from './ruleSetCarrying.js'
import { CHARACTER_BEING_UPDATED_MESSAGE, currentCharacterSchemaVersion, isCharacterAtSchemaVersion } from './characterSchemaVersions.js'

export type TransferDoc = {
  id: string; itemId: string; itemKind: Exclude<InventoryItem['kind'], 'gold'>; itemSnapshot: InventoryItem
  fromCharacterId: string; fromCharacterName: string; fromUserId: string
  toCharacterId: string; toCharacterName: string; toUserId: string
}
type Fields = Record<string, unknown>
export type TransferAccess = { db: Firestore; campaign: DocumentReference; member: DocumentReference; uid: string; transferId: string }

async function transferAuthority(tx: Transaction, access: TransferAccess) {
  const [member, campaign] = await Promise.all([tx.get(access.member), tx.get(access.campaign)])
  if (!member.exists || member.data()?.status !== 'active') throw new HttpsError('permission-denied', 'Active group membership required.')
  if (!campaign.exists) throw new HttpsError('not-found', 'Campaign no longer exists.')
  return { system: campaign.data()?.system as unknown, isGm: member.data()?.role === 'admin' || campaign.data()?.gmUserId === access.uid }
}

function transferCarrying(system: unknown) {
  const carrying = resolveTransferCarrying(system)
  if (!carrying) throw new HttpsError('failed-precondition', NO_CARRYING_MESSAGE)
  return carrying
}

function requireTransferRecipient(transfer: TransferDoc, uid: string, isGm: boolean) {
  if (transfer.toUserId !== uid && !isGm) throw new HttpsError('permission-denied', 'You cannot accept this transfer.')
}

function requireTransferVersions(sender: Fields, receiver: Fields, system: unknown) {
  const version = currentCharacterSchemaVersion(system)
  if (![sender, receiver].every((character) => isCharacterAtSchemaVersion(character, version))) throw new HttpsError('failed-precondition', CHARACTER_BEING_UPDATED_MESSAGE)
  return version
}

function refusedTransfer(tx: Transaction, ref: DocumentReference, result: Exclude<TransferOutcome, { ok: true }>) {
  if (result.reason === 'no_room') throw new HttpsError('failed-precondition', result.message)
  tx.delete(ref)
  return droppedOffer(result.reason)
}

export async function applyAcceptedTransfer(tx: Transaction, access: TransferAccess, transfer: TransferDoc, system: unknown): Promise<TransferRejection | null> {
  const senderRef = access.campaign.collection('characters').doc(transfer.fromCharacterId)
  const receiverRef = access.campaign.collection('characters').doc(transfer.toCharacterId)
  const ref = access.campaign.collection('pendingTransfers').doc(access.transferId)
  const carrying = transferCarrying(system)
  const [sender, receiver] = await Promise.all([tx.get(senderRef), tx.get(receiverRef)])
  if (!sender.exists || !receiver.exists) { tx.delete(ref); return { code: 'not-found', message: 'Item no longer available.' } }
  return finishTransfer(tx, { senderRef, receiverRef, ref }, sender.data()!, receiver.data()!, transfer, system, carrying)
}

type TransferRefs = { senderRef: DocumentReference; receiverRef: DocumentReference; ref: DocumentReference }
function finishTransfer(tx: Transaction, refs: TransferRefs, sender: Fields, receiver: Fields, transfer: TransferDoc, system: unknown, carrying: ReturnType<typeof transferCarrying>): TransferRejection | null {
  if (!isTransferSourceAuthorized(sender.ownerUserId, transfer.fromUserId)) { tx.delete(refs.ref); return { code: 'permission-denied', message: 'Transfer is not authorized.' } }
  const version = requireTransferVersions(sender, receiver, system)
  const result = carrying(sender, receiver, transfer)
  if (!result.ok) return refusedTransfer(tx, refs.ref, result)
  const stamp = { schemaVersion: version, schemaWrittenAt: FieldValue.serverTimestamp() }
  tx.set(refs.senderRef, { ...result.sender, ...stamp }, { merge: true })
  tx.set(refs.receiverRef, { ...result.receiver, ...stamp }, { merge: true })
  tx.delete(refs.ref)
  return null
}

export async function acceptTransfer(access: TransferAccess) {
  const rejection = await access.db.runTransaction(async (tx) => {
    const authority = await transferAuthority(tx, access)
    const ref = access.campaign.collection('pendingTransfers').doc(access.transferId)
    const snapshot = await tx.get(ref)
    if (!snapshot.exists) throw new HttpsError('not-found', 'Transfer no longer exists.')
    const transfer = snapshot.data() as TransferDoc
    requireTransferRecipient(transfer, access.uid, authority.isGm)
    return applyAcceptedTransfer(tx, access, transfer, authority.system)
  })
  if (rejection) throw new HttpsError(rejection.code, rejection.message)
  return { ok: true }
}
