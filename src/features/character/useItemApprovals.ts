import { useEffect, useState } from 'react'
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../../firebase'
import type {
  CharacterInventoryItem,
  CharacterSheetDetails,
  ItemApprovalRequest,
  Role,
} from '../../types/app'

export function useItemApprovals(
  campaignId: string | null,
  role: Role | null,
  currentUserId: string,
) {
  const [pendingRequests, setPendingRequests] = useState<ItemApprovalRequest[]>([])
  const [rejections, setRejections] = useState<ItemApprovalRequest[]>([])

  useEffect(() => {
    if (!campaignId) return

    const col = collection(db, 'campaigns', campaignId, 'itemApprovals')

    if (role === 'gm') {
      // GM sees all pending requests
      const q = query(col, where('status', '==', 'pending'))
      return onSnapshot(q, (snap) => {
        setPendingRequests(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ItemApprovalRequest),
        )
      })
    }

    // Player sees their own rejected requests (to show feedback)
    const q = query(
      col,
      where('requestedByUserId', '==', currentUserId),
      where('status', '==', 'rejected'),
    )
    return onSnapshot(q, (snap) => {
      setRejections(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ItemApprovalRequest),
      )
    })
  }, [campaignId, role, currentUserId])

  const submitRequest = async (
    characterId: string,
    characterName: string,
    username: string,
    item: CharacterInventoryItem,
  ) => {
    if (!campaignId) return
    const id = crypto.randomUUID()
    const ref = doc(db, 'campaigns', campaignId, 'itemApprovals', id)
    await setDoc(ref, {
      id,
      campaignId,
      characterId,
      characterName,
      requestedByUserId: currentUserId,
      requestedByUsername: username,
      item,
      status: 'pending',
      createdAt: serverTimestamp(),
    })
  }

  const approveRequest = async (request: ItemApprovalRequest) => {
    if (!campaignId) return
    const charRef = doc(db, 'campaigns', campaignId, 'characters', request.characterId)
    const approvalRef = doc(db, 'campaigns', campaignId, 'itemApprovals', request.id)

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(charRef)
      if (!snap.exists()) throw new Error('Character not found')
      const data = snap.data() as { details?: CharacterSheetDetails | null }
      const existingDetails = (data?.details && typeof data.details === 'object')
        ? data.details as Record<string, unknown>
        : {}
      const currentInventory: CharacterInventoryItem[] = Array.isArray(existingDetails.inventory)
        ? existingDetails.inventory
        : []

      tx.set(charRef, {
        details: {
          ...existingDetails,
          inventory: [...currentInventory, request.item],
        },
      }, { merge: true })

      tx.update(approvalRef, { status: 'approved', resolvedAt: serverTimestamp() })
    })
  }

  const rejectRequest = async (request: ItemApprovalRequest) => {
    if (!campaignId) return
    const ref = doc(db, 'campaigns', campaignId, 'itemApprovals', request.id)
    await updateDoc(ref, { status: 'rejected', resolvedAt: serverTimestamp() })
  }

  const dismissRejection = async (requestId: string) => {
    if (!campaignId) return
    const ref = doc(db, 'campaigns', campaignId, 'itemApprovals', requestId)
    await deleteDoc(ref)
  }

  return { pendingRequests, rejections, submitRequest, approveRequest, rejectRequest, dismissRejection }
}
