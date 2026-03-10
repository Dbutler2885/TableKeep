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
  CharacterGoldItem,
  CharacterInventoryItem,
  CharacterSheetDetails,
  ItemApprovalAction,
  ItemApprovalRequest,
  Role,
} from '../../types/app'
import {
  normalizeGoldAmount,
  goldChunksForAmount,
  makeGoldItem,
  computeOverflow,
  computeAvailablePackedSlots,
} from './inventoryOverflow'

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
      const q = query(col, where('status', '==', 'pending'))
      return onSnapshot(q, (snap) => {
        setPendingRequests(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ItemApprovalRequest),
        )
      }, (err) => console.error('Item approval listener (gm) failed:', err))
    }

    const q = query(
      col,
      where('requestedByUserId', '==', currentUserId),
      where('status', '==', 'rejected'),
    )
    return onSnapshot(q, (snap) => {
      setRejections(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ItemApprovalRequest),
      )
    }, (err) => console.error('Item approval listener (player) failed:', err))
  }, [campaignId, role, currentUserId])

  const submitRequest = async (
    action: ItemApprovalAction,
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
      action,
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

  const approveCreate = async (request: ItemApprovalRequest) => {
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

  const approveSell = async (request: ItemApprovalRequest) => {
    if (!campaignId) return
    const charRef = doc(db, 'campaigns', campaignId, 'characters', request.characterId)
    const approvalRef = doc(db, 'campaigns', campaignId, 'itemApprovals', request.id)
    const sellItem = request.item
    const sellAmount = normalizeGoldAmount(sellItem.costGp)

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

      // Verify the item still exists in inventory
      if (!currentInventory.some((i) => i.id === sellItem.id)) {
        tx.update(approvalRef, { status: 'approved', resolvedAt: serverTimestamp() })
        return
      }

      // Remove sold item
      const remaining = currentInventory.filter((i) => i.id !== sellItem.id)

      if (sellAmount <= 0) {
        tx.set(charRef, {
          details: { ...existingDetails, inventory: remaining },
        }, { merge: true })
        tx.update(approvalRef, { status: 'approved', resolvedAt: serverTimestamp() })
        return
      }

      // Compute new gold total and rebuild inventory
      const existingGold = remaining
        .filter((i): i is CharacterGoldItem => i.kind === 'gold')
        .reduce((sum, g) => sum + (g.qty ?? 0), 0)
      const nonGold = remaining.filter((i) => i.kind !== 'gold')
      const chunks = goldChunksForAmount(existingGold + sellAmount)
      const golds = chunks.map((chunk) => makeGoldItem(chunk))
      const candidateInventory = [...nonGold, ...golds]

      // Compute STR-based packed slots
      const abilityScores = (existingDetails.abilityScores && typeof existingDetails.abilityScores === 'object')
        ? existingDetails.abilityScores as Record<string, string>
        : {}
      const strScore = Number.parseInt(abilityScores.STR ?? '', 10)
      const availableSlots = computeAvailablePackedSlots(strScore)

      const overflow = computeOverflow(candidateInventory, availableSlots, request.characterId, request.characterName)

      tx.set(charRef, {
        details: { ...existingDetails, inventory: overflow.keptInventory },
      }, { merge: true })

      tx.update(approvalRef, { status: 'approved', resolvedAt: serverTimestamp() })
    })
  }

  const approveRequest = async (request: ItemApprovalRequest) => {
    if (request.action === 'sell') {
      await approveSell(request)
    } else {
      await approveCreate(request)
    }
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

