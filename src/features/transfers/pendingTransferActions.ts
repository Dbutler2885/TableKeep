import { deleteDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../../firebase'
import { campaignDocRef, type CampaignScope } from '../campaign/firestorePaths'
import type { CharacterRecord, PendingTransfer, TransferableInventoryItem } from '../../types/app'

type Character = Pick<CharacterRecord, 'id' | 'name' | 'ownerUserId'>
export const transferScope = (campaignId: string | null, groupId: string | null) => campaignId && groupId ? { campaignId, groupId } : null
const ref = (scope: CampaignScope, id: string) => campaignDocRef(db, scope, 'pendingTransfers', id)

function readyScope(scope: CampaignScope | null): CampaignScope {
  if (!scope) throw new Error('Campaign not ready')
  return scope
}
function requireDestination(from: Character, to: Character) {
  if (from.id === to.id) throw new Error('Choose a different character.')
  if (!to.ownerUserId) throw new Error('Target character has no owner.')
}
function requireUnoffered(transfers: PendingTransfer[], from: Character, sourceItemId: string) {
  const duplicate = transfers.find((transfer) => transfer.fromCharacterId === from.id && transfer.itemId === sourceItemId)
  if (duplicate) throw new Error(`This item is already offered to ${duplicate.toCharacterName}.`)
}
const transferId = () => globalThis.crypto?.randomUUID?.() ?? `transfer-${Date.now()}`

export async function createPendingTransfer(scope: CampaignScope | null, transfers: PendingTransfer[], item: TransferableInventoryItem, sourceItemId: string, from: Character, to: Character) {
  const ready = readyScope(scope)
  requireDestination(from, to)
  requireUnoffered(transfers, from, sourceItemId)
  const id = transferId()
  await setDoc(ref(ready, id), {
    id, itemSnapshot: item, itemId: sourceItemId, itemKind: item.kind, itemName: item.name ?? item.typeName,
    fromCharacterId: from.id, fromCharacterName: from.name, fromUserId: from.ownerUserId,
    toCharacterId: to.id, toCharacterName: to.name, toUserId: to.ownerUserId, createdAt: serverTimestamp(),
  })
}

export async function acceptPendingTransfer(scope: CampaignScope | null, transferId: string) {
  const ready = readyScope(scope)
  const callable = httpsCallable<{ groupId: string; campaignId: string; transferId: string }, { ok: boolean }>(functions, 'acceptPendingTransfer')
  try {
    await callable({ ...ready, transferId })
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Failed to accept transfer.')
  }
}

export async function removePendingTransfer(scope: CampaignScope | null, transferId: string) {
  if (scope) await deleteDoc(ref(scope, transferId))
}
