import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import type { Request } from 'express'

initializeApp()

const db = getFirestore()
const sessionSummaryApiKey = defineSecret('SESSION_SUMMARY_API_KEY')

function isAuthorized(req: Request) {
  const incoming = req.get('x-internal-api-key')
  const expected = sessionSummaryApiKey.value()
  return Boolean(incoming) && Boolean(expected) && incoming === expected
}

export const health = onRequest({ region: 'us-central1' }, (_req, res) => {
  res.status(200).json({ ok: true, service: 'homeboyshouse-functions' })
})

export const postSessionSummary = onRequest(
  { region: 'us-central1', secrets: [sessionSummaryApiKey] },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' })
      return
    }

    if (!isAuthorized(req)) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }

    const { campaignId, title, summaryMarkdown, sessionNumber } = req.body ?? {}

    if (
      typeof campaignId !== 'string' ||
      typeof title !== 'string' ||
      typeof summaryMarkdown !== 'string' ||
      title.trim().length === 0 ||
      summaryMarkdown.trim().length === 0
    ) {
      res.status(400).json({ error: 'invalid_payload' })
      return
    }

    const summaryRef = db.collection('campaigns').doc(campaignId).collection('sessionSummaries').doc()

    await summaryRef.set({
      title: title.trim(),
      summaryMarkdown,
      sessionNumber: typeof sessionNumber === 'number' ? sessionNumber : null,
      sourceType: 'api',
      postedBy: 'api',
      createdAt: Timestamp.now(),
    })

    res.status(201).json({ ok: true, id: summaryRef.id })
  },
)

type InventoryItem = {
  id: string
  kind: 'weapon' | 'armour' | 'ammunition' | 'consumable' | 'general' | 'gold'
  equipped: boolean
  qty?: number
}

type TransferDoc = {
  id: string
  itemId: string
  itemKind: Exclude<InventoryItem['kind'], 'gold'>
  fromCharacterId: string
  fromCharacterName: string
  fromUserId: string
  toCharacterId: string
  toCharacterName: string
  toUserId: string
}

function asInventory(details: unknown): InventoryItem[] {
  if (!details || typeof details !== 'object') return []
  const inventory = (details as { inventory?: unknown }).inventory
  return Array.isArray(inventory) ? inventory as InventoryItem[] : []
}

function availablePackedSlots(details: unknown): number {
  const packedSlotThresholds = [18, 16, 13, 9, 6, 4]
  const packedMovementSlotCount = 13
  if (!details || typeof details !== 'object') return packedMovementSlotCount
  const abilityScores = (details as { abilityScores?: Record<string, string> }).abilityScores
  const str = Number.parseInt(abilityScores?.STR ?? '', 10)
  let unlocked = 0
  for (let i = 0; i < packedSlotThresholds.length; i += 1) {
    if (str >= packedSlotThresholds[i]) unlocked += 1
  }
  return unlocked + packedMovementSlotCount
}

export const acceptPendingTransfer = onCall({ region: 'us-central1' }, async (request) => {
  const uid = request.auth?.uid ?? ''
  if (!uid) throw new HttpsError('unauthenticated', 'Authentication required.')
  const campaignId = typeof request.data?.campaignId === 'string' ? request.data.campaignId : ''
  const transferId = typeof request.data?.transferId === 'string' ? request.data.transferId : ''
  if (!campaignId || !transferId) {
    throw new HttpsError('invalid-argument', 'campaignId and transferId are required.')
  }

  const transferRef = db.collection('campaigns').doc(campaignId).collection('pendingTransfers').doc(transferId)

  await db.runTransaction(async (tx) => {
    const membershipRef = db.collection('campaigns').doc(campaignId).collection('members').doc(uid)
    const membershipSnap = await tx.get(membershipRef)
    if (!membershipSnap.exists || membershipSnap.data()?.status !== 'active') {
      throw new HttpsError('permission-denied', 'Active campaign membership required.')
    }

    const transferSnap = await tx.get(transferRef)
    if (!transferSnap.exists) throw new HttpsError('not-found', 'Transfer no longer exists.')
    const transfer = transferSnap.data() as TransferDoc
    const isGm = membershipSnap.data()?.role === 'gm'
    if (transfer.toUserId !== uid && !isGm) {
      throw new HttpsError('permission-denied', 'You cannot accept this transfer.')
    }

    const senderRef = db.collection('campaigns').doc(campaignId).collection('characters').doc(transfer.fromCharacterId)
    const receiverRef = db.collection('campaigns').doc(campaignId).collection('characters').doc(transfer.toCharacterId)
    const [senderSnap, receiverSnap] = await Promise.all([tx.get(senderRef), tx.get(receiverRef)])
    if (!senderSnap.exists || !receiverSnap.exists) {
      tx.delete(transferRef)
      throw new HttpsError('not-found', 'Item no longer available.')
    }

    const senderData = senderSnap.data() as { details?: unknown } | undefined
    const receiverData = receiverSnap.data() as { details?: unknown } | undefined
    const senderDetails = (senderData?.details && typeof senderData.details === 'object') ? senderData.details as Record<string, unknown> : {}
    const receiverDetails = (receiverData?.details && typeof receiverData.details === 'object') ? receiverData.details as Record<string, unknown> : {}
    const senderInventory = asInventory(senderDetails)
    const receiverInventory = asInventory(receiverDetails)
    const senderItem = senderInventory.find((item) => item.id === transfer.itemId)
    if (!senderItem || senderItem.kind === 'gold') {
      tx.delete(transferRef)
      throw new HttpsError('not-found', 'Item no longer available.')
    }

    const movedItem = { ...senderItem, equipped: false }
    const candidateInventory = [...receiverInventory, movedItem]
    const packedUsed = candidateInventory.filter((item) => !item.equipped).length
    const packedAllowed = availablePackedSlots(receiverDetails)
    if (packedUsed > packedAllowed) {
      throw new HttpsError('failed-precondition', 'Not enough packed slots to accept this item.')
    }

    tx.set(senderRef, {
      details: {
        ...senderDetails,
        inventory: senderInventory.filter((item) => item.id !== transfer.itemId),
      },
    }, { merge: true })
    tx.set(receiverRef, {
      details: {
        ...receiverDetails,
        inventory: candidateInventory,
      },
    }, { merge: true })
    tx.delete(transferRef)
  })

  return { ok: true }
})
