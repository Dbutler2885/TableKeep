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
  const [ownPendingRequests, setOwnPendingRequests] = useState<ItemApprovalRequest[]>([])
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

    const pendingQuery = query(
      col,
      where('requestedByUserId', '==', currentUserId),
      where('status', '==', 'pending'),
    )
    const unsubPending = onSnapshot(pendingQuery, (snap) => {
      setOwnPendingRequests(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ItemApprovalRequest),
      )
    }, (err) => console.error('Item approval pending listener (player) failed:', err))

    const rejectedQuery = query(
      col,
      where('requestedByUserId', '==', currentUserId),
      where('status', '==', 'rejected'),
    )
    const unsubRejected = onSnapshot(rejectedQuery, (snap) => {
      setRejections(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ItemApprovalRequest),
      )
    }, (err) => console.error('Item approval listener (player) failed:', err))

    return () => {
      unsubPending()
      unsubRejected()
    }
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

  const submitSpellLearnRequest = async (
    characterId: string,
    characterName: string,
    username: string,
    spellIds: string[],
    spellNames: string[],
  ) => {
    if (!campaignId) return
    if (spellIds.length === 0) return
    const id = crypto.randomUUID()
    const ref = doc(db, 'campaigns', campaignId, 'itemApprovals', id)
    await setDoc(ref, {
      id,
      action: 'learn_spell',
      campaignId,
      characterId,
      characterName,
      requestedByUserId: currentUserId,
      requestedByUsername: username,
      spellIds,
      spellNames,
      status: 'pending',
      createdAt: serverTimestamp(),
    })
  }

  const submitAbilityRerollRequest = async (
    characterId: string,
    characterName: string,
    username: string,
  ) => {
    if (!campaignId) return
    const id = crypto.randomUUID()
    const ref = doc(db, 'campaigns', campaignId, 'itemApprovals', id)
    await setDoc(ref, {
      id,
      action: 'ability_reroll',
      campaignId,
      characterId,
      characterName,
      requestedByUserId: currentUserId,
      requestedByUsername: username,
      status: 'pending',
      createdAt: serverTimestamp(),
    })
  }

  const rollAbilityScores = () => {
    const roll3d6 = () =>
      Array.from({ length: 3 }, () => Math.floor(Math.random() * 6) + 1).reduce((sum, value) => sum + value, 0)
    return {
      STR: String(roll3d6()),
      INT: String(roll3d6()),
      WIS: String(roll3d6()),
      DEX: String(roll3d6()),
      CON: String(roll3d6()),
      CHA: String(roll3d6()),
    }
  }

  const approveCreate = async (request: ItemApprovalRequest) => {
    if (!campaignId) return
    if (!request.item) return
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
    if (!request.item) return
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

  const approveLearnSpell = async (request: ItemApprovalRequest) => {
    if (!campaignId) return
    const spellIds = Array.isArray(request.spellIds) ? request.spellIds.filter((id) => typeof id === 'string') : []
    const approvalRef = doc(db, 'campaigns', campaignId, 'itemApprovals', request.id)
    if (spellIds.length === 0) {
      await updateDoc(approvalRef, { status: 'approved', resolvedAt: serverTimestamp() })
      return
    }

    const charRef = doc(db, 'campaigns', campaignId, 'characters', request.characterId)
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(charRef)
      if (!snap.exists()) throw new Error('Character not found')
      const data = snap.data() as { details?: CharacterSheetDetails | null }
      const existingDetails = (data?.details && typeof data.details === 'object')
        ? data.details as Record<string, unknown>
        : {}
      const existingSpellIds = Array.isArray(existingDetails.spellBookSpellIds)
        ? (existingDetails.spellBookSpellIds as string[]).filter((id) => typeof id === 'string')
        : []
      const merged = [...existingSpellIds]
      for (const spellId of spellIds) {
        if (!merged.includes(spellId)) merged.push(spellId)
      }

      tx.set(charRef, {
        details: {
          ...existingDetails,
          spellBookSpellIds: merged,
        },
      }, { merge: true })

      tx.update(approvalRef, { status: 'approved', resolvedAt: serverTimestamp() })
    })
  }

  const approveAbilityReroll = async (request: ItemApprovalRequest) => {
    if (!campaignId) return
    const charRef = doc(db, 'campaigns', campaignId, 'characters', request.characterId)
    const approvalRef = doc(db, 'campaigns', campaignId, 'itemApprovals', request.id)

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(charRef)
      if (!snap.exists()) throw new Error('Character not found')
      const data = snap.data() as { details?: CharacterSheetDetails | null, creationStatus?: string }
      if (data.creationStatus !== 'draft') {
        tx.update(approvalRef, { status: 'approved', resolvedAt: serverTimestamp() })
        return
      }

      const existingDetails = (data?.details && typeof data.details === 'object')
        ? data.details as Record<string, unknown>
        : {}
      const nextScores = rollAbilityScores()

      tx.set(charRef, {
        details: {
          ...existingDetails,
          abilityScores: nextScores,
          rolledAbilityScores: nextScores,
          abilityScoresRolled: true,
        },
      }, { merge: true })

      tx.update(approvalRef, { status: 'approved', resolvedAt: serverTimestamp() })
    })
  }

  const approveRequest = async (request: ItemApprovalRequest) => {
    if (request.action === 'sell') {
      await approveSell(request)
    } else if (request.action === 'learn_spell') {
      await approveLearnSpell(request)
    } else if (request.action === 'ability_reroll') {
      await approveAbilityReroll(request)
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

  return {
    pendingRequests,
    ownPendingRequests,
    rejections,
    submitRequest,
    submitSpellLearnRequest,
    submitAbilityRerollRequest,
    approveRequest,
    rejectRequest,
    dismissRejection,
  }
}
