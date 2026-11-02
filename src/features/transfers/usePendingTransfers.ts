import { useEffect, useMemo, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { campaignCollectionRef } from '../campaign/firestorePaths'
import type { CharacterRecord, PendingTransfer, Role, TransferableInventoryItem } from '../../types/app'
import { readPendingTransfers } from './pendingTransferRecord'
import { acceptPendingTransfer, createPendingTransfer, removePendingTransfer, transferScope } from './pendingTransferActions'

type TransferCharacter = Pick<CharacterRecord, 'id' | 'name' | 'ownerUserId'>

function useTransferRecords(campaignId: string | null, groupId: string | null) {
  const [transfers, setTransfers] = useState<PendingTransfer[]>([])
  useEffect(() => {
    if (!campaignId || !groupId) {
      queueMicrotask(() => setTransfers([]))
      return
    }
    return onSnapshot(campaignCollectionRef(db, { campaignId, groupId }, 'pendingTransfers'),
      (snapshot) => setTransfers(readPendingTransfers(snapshot.docs)), () => setTransfers([]))
  }, [campaignId, groupId])
  return transfers
}

export function usePendingTransfers(campaignId: string | null, groupId: string | null, role: Role | null, currentUserId: string) {
  const transfers = useTransferRecords(campaignId, groupId)
  const scope = transferScope(campaignId, groupId)
  const incomingTransfers = useMemo(() => transfers.filter((entry) => entry.toUserId === currentUserId), [currentUserId, transfers])
  const outgoingTransfers = useMemo(() => transfers.filter((entry) => entry.fromUserId === currentUserId), [currentUserId, transfers])
  const allTransfers = useMemo(() => role === 'gm' ? transfers : [], [role, transfers])
  return {
    incomingTransfers, outgoingTransfers, allTransfers,
    createTransfer: (item: TransferableInventoryItem, id: string, from: TransferCharacter, to: TransferCharacter) => createPendingTransfer(scope, transfers, item, id, from, to),
    acceptTransfer: (id: string) => acceptPendingTransfer(scope, id, identityOf(transfers, id)),
    declineTransfer: (id: string) => removePendingTransfer(scope, id),
    cancelTransfer: (id: string) => removePendingTransfer(scope, id),
  }
}

function identityOf(transfers: PendingTransfer[], id: string) {
  const transfer = transfers.find((entry) => entry.id === id)
  return transfer && { fromCharacterId: transfer.fromCharacterId, toCharacterId: transfer.toCharacterId }
}
