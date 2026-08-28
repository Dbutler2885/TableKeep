import { useEffect, useMemo, useState } from 'react'
import {
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../../firebase'
import { campaignCollectionRef, campaignDocRef } from '../campaign/firestorePaths'
import type {
  CharacterRecord,
  PendingTransfer,
  Role,
  TransferableInventoryItem,
} from '../../types/app'

const parseTransfer = (id: string, data: Record<string, unknown>): PendingTransfer | null => {
  const itemSnapshot = data.itemSnapshot
  if (!itemSnapshot || typeof itemSnapshot !== 'object') return null
  const item = itemSnapshot as TransferableInventoryItem
  return {
    id,
    itemSnapshot: item,
    itemId: typeof data.itemId === 'string' ? data.itemId : item.id,
    itemKind: item.kind,
    itemName: typeof data.itemName === 'string' ? data.itemName : (item.name ?? item.typeName),
    fromCharacterId: typeof data.fromCharacterId === 'string' ? data.fromCharacterId : '',
    fromCharacterName: typeof data.fromCharacterName === 'string' ? data.fromCharacterName : '',
    fromUserId: typeof data.fromUserId === 'string' ? data.fromUserId : '',
    toCharacterId: typeof data.toCharacterId === 'string' ? data.toCharacterId : '',
    toCharacterName: typeof data.toCharacterName === 'string' ? data.toCharacterName : '',
    toUserId: typeof data.toUserId === 'string' ? data.toUserId : '',
    createdAt: data.createdAt,
  }
}

export function usePendingTransfers(
  campaignId: string | null,
  groupId: string | null,
  role: Role | null,
  currentUserId: string,
) {
  const [transfers, setTransfers] = useState<PendingTransfer[]>([])

  useEffect(() => {
    if (!campaignId || !groupId) {
      setTransfers([])
      return
    }

    const unsub = onSnapshot(
      campaignCollectionRef(db, { campaignId, groupId }, 'pendingTransfers'),
      (snapshot) => {
        const next = snapshot.docs
          .map((docSnap) => parseTransfer(docSnap.id, docSnap.data() as Record<string, unknown>))
          .filter((entry): entry is PendingTransfer => entry !== null)
          .sort((a, b) => {
            const aMs = typeof (a.createdAt as { seconds?: number } | null)?.seconds === 'number'
              ? ((a.createdAt as { seconds: number }).seconds * 1000)
              : 0
            const bMs = typeof (b.createdAt as { seconds?: number } | null)?.seconds === 'number'
              ? ((b.createdAt as { seconds: number }).seconds * 1000)
              : 0
            return aMs - bMs
          })
        setTransfers(next)
      },
      () => setTransfers([]),
    )

    return () => unsub()
  }, [campaignId, groupId])

  const incomingTransfers = useMemo(
    () => transfers.filter((transfer) => transfer.toUserId === currentUserId),
    [currentUserId, transfers],
  )
  const outgoingTransfers = useMemo(
    () => transfers.filter((transfer) => transfer.fromUserId === currentUserId),
    [currentUserId, transfers],
  )
  const allTransfers = useMemo(
    () => (role === 'gm' ? transfers : []),
    [role, transfers],
  )

  const createTransfer = async (
    item: TransferableInventoryItem,
    sourceItemId: string,
    fromCharacter: Pick<CharacterRecord, 'id' | 'name' | 'ownerUserId'>,
    toCharacter: Pick<CharacterRecord, 'id' | 'name' | 'ownerUserId'>,
  ) => {
    if (!campaignId || !groupId) throw new Error('Campaign not ready')
    if (fromCharacter.id === toCharacter.id) throw new Error('Choose a different character.')
    if (!toCharacter.ownerUserId) throw new Error('Target character has no owner.')
    const duplicate = transfers.find((transfer) =>
      transfer.fromCharacterId === fromCharacter.id && transfer.itemId === sourceItemId,
    )
    if (duplicate) throw new Error(`This item is already offered to ${duplicate.toCharacterName}.`)

    const transferId = globalThis.crypto?.randomUUID?.() ?? `transfer-${Date.now()}`
    const payload: Omit<PendingTransfer, 'createdAt'> & { createdAt: unknown } = {
      id: transferId,
      itemSnapshot: item,
      itemId: sourceItemId,
      itemKind: item.kind,
      itemName: item.name ?? item.typeName,
      fromCharacterId: fromCharacter.id,
      fromCharacterName: fromCharacter.name,
      fromUserId: fromCharacter.ownerUserId,
      toCharacterId: toCharacter.id,
      toCharacterName: toCharacter.name,
      toUserId: toCharacter.ownerUserId,
      createdAt: serverTimestamp(),
    }

    await setDoc(campaignDocRef(db, { campaignId, groupId }, 'pendingTransfers', transferId), payload)
  }

  const acceptTransfer = async (transferId: string) => {
    if (!campaignId || !groupId) throw new Error('Campaign not ready')
    // The callable resolves every document under `groups/{groupId}/campaigns/
    // {campaignId}`, the same scope the transfer was written to above, so it
    // needs the group id that only the client knows.
    const callable = httpsCallable<
      { groupId: string; campaignId: string; transferId: string },
      { ok: boolean }
    >(
      functions,
      'acceptPendingTransfer',
    )
    try {
      await callable({ groupId, campaignId, transferId })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to accept transfer.'
      throw new Error(message)
    }
  }

  const declineTransfer = async (transferId: string) => {
    if (!campaignId || !groupId) return
    await deleteDoc(campaignDocRef(db, { campaignId, groupId }, 'pendingTransfers', transferId))
  }

  const cancelTransfer = async (transferId: string) => {
    if (!campaignId || !groupId) return
    await deleteDoc(campaignDocRef(db, { campaignId, groupId }, 'pendingTransfers', transferId))
  }

  return {
    incomingTransfers,
    outgoingTransfers,
    allTransfers,
    createTransfer,
    acceptTransfer,
    declineTransfer,
    cancelTransfer,
  }
}
