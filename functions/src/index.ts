import { Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions'
import type { Request } from 'express'
import { adminApp, adminFirestore } from './adminApp.js'
import { isTransferSourceAuthorized } from './transferAuthorization.js'
import { campaignPath, groupMemberPath } from './firestorePaths.js'
import { createDemoSandbox, sweepExpiredDemoSandboxes } from './demoSessions.js'

adminApp()

const db = adminFirestore()
const sessionSummaryApiKey = defineSecret('SESSION_SUMMARY_API_KEY')

function campaignRef(groupId: string, campaignId: string) {
  return db.doc(campaignPath(groupId, campaignId))
}

function groupMemberRef(groupId: string, userId: string) {
  return db.doc(groupMemberPath(groupId, userId))
}

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

    const body = req.body ?? {}
    const { groupId, campaignId, title, summaryMarkdown, sessionNumber } = body

    if (
      typeof groupId !== 'string' ||
      groupId.trim().length === 0 ||
      typeof campaignId !== 'string' ||
      typeof title !== 'string' ||
      title.trim().length === 0
    ) {
      res.status(400).json({ error: 'invalid_payload' })
      return
    }

    // Normalize structured fields from snake_case API payload
    const normalizeScenes = (raw: unknown): unknown[] => {
      if (!Array.isArray(raw)) return []
      return raw.map((s: Record<string, unknown>) => ({
        name: typeof s.name === 'string' ? s.name : '',
        summary: typeof s.summary === 'string' ? s.summary : '',
        details: Array.isArray(s.details) ? s.details.filter((d: unknown) => typeof d === 'string') : [],
      }))
    }

    const normalizeNpcs = (raw: unknown): unknown[] => {
      if (!Array.isArray(raw)) return []
      return raw.map((n: Record<string, unknown>, i: number) => ({
        npcKey: typeof n.npc_key === 'string' ? n.npc_key : typeof n.npcKey === 'string' ? n.npcKey : `npc_${i}`,
        name: typeof n.name === 'string' ? n.name : '',
        title: typeof n.title === 'string' ? n.title : '',
        action: n.action === 'update' ? 'update' : 'new',
        facts: Array.isArray(n.facts) ? n.facts.filter((f: unknown) => typeof f === 'string') : [],
        linkedNpcId: null,
      }))
    }

    const normalizeCalendar = (raw: unknown): unknown[] => {
      if (!Array.isArray(raw)) return []
      return raw.map((c: Record<string, unknown>, i: number) => ({
        key: typeof c.key === 'string' ? c.key : `day_${String(i + 1).padStart(3, '0')}`,
        action: c.action === 'update' ? 'update' : 'new',
        label: typeof c.label === 'string' ? c.label : '',
        dayComplete: c.day_complete === true || c.dayComplete === true,
        entries: Array.isArray(c.entries) ? c.entries.filter((e: unknown) => typeof e === 'string') : [],
      }))
    }

    const overallSummary = typeof body.overall_summary === 'string'
      ? body.overall_summary
      : typeof body.overallSummary === 'string'
        ? body.overallSummary
        : ''

    const scenes = normalizeScenes(body.scenes)
    const npcMentions = normalizeNpcs(body.npcs)
    const cliffhangers = Array.isArray(body.cliffhangers)
      ? body.cliffhangers.filter((c: unknown) => typeof c === 'string')
      : []
    const calendar = normalizeCalendar(body.calendar)

    // Auto-match NPCs by name; auto-create a stub for any the GM hasn't entered yet.
    if (npcMentions.length > 0) {
      const npcsCollection = campaignRef(groupId, campaignId).collection('npcs')
      const npcPrivateCollection = campaignRef(groupId, campaignId).collection('npcPrivate')
      const npcsSnap = await npcsCollection.get()
      const npcLookup = new Map<string, string>()
      npcsSnap.docs.forEach((docSnap) => {
        const data = docSnap.data() as { name?: string }
        if (typeof data.name === 'string') {
          const key = data.name.toLowerCase().trim()
          if (npcLookup.has(key)) {
            npcLookup.delete(key)
          } else {
            npcLookup.set(key, docSnap.id)
          }
        }
      })

      const batch = db.batch()
      let created = 0
      for (const mention of npcMentions) {
        const m = mention as { name: string; title: string; linkedNpcId: string | null }
        const key = m.name.toLowerCase().trim()
        if (!key) continue
        const matchId = npcLookup.get(key)
        if (matchId) {
          m.linkedNpcId = matchId
          continue
        }
        // No existing NPC: create a stub the model owns (its facts surface as Auto-Notes).
        // Transcript NPCs have been met, so they're visible to players by default.
        const newRef = npcsCollection.doc()
        batch.set(newRef, {
          id: newRef.id,
          name: m.name,
          title: typeof m.title === 'string' ? m.title : '',
          visibleToPlayers: true,
          tags: [],
          portraitPath: '',
          portraitUrl: null,
          portraitFocusX: 50,
          portraitFocusY: 50,
          tokenIcon: { icon: 'pawn', color: '#2f5bbf', size: 34 },
          playerDescription: '',
          playerNotes: '',
          createdBy: 'api',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        })
        batch.set(npcPrivateCollection.doc(newRef.id), {
          id: newRef.id,
          gmNotes: '',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        })
        npcLookup.set(key, newRef.id)
        m.linkedNpcId = newRef.id
        created += 1
      }
      if (created > 0) await batch.commit()
    }

    const summaryRef = campaignRef(groupId, campaignId).collection('sessionSummaries').doc()

    await summaryRef.set({
      title: title.trim(),
      summaryMarkdown: typeof summaryMarkdown === 'string' ? summaryMarkdown : '',
      sessionNumber: typeof sessionNumber === 'number' ? sessionNumber : null,
      sourceType: 'api',
      postedBy: 'api',
      overallSummary,
      scenes,
      npcMentions,
      cliffhangers,
      calendar,
      generatedSnapshot: {
        title: title.trim(),
        summaryMarkdown: typeof summaryMarkdown === 'string' ? summaryMarkdown : '',
        overallSummary,
        scenes,
        npcMentions,
        cliffhangers,
        calendar,
      },
      hasHumanEdits: false,
      editedAt: null,
      editedBy: null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })

    res.status(201).json({ ok: true, id: summaryRef.id })
  },
)

export const getCampaignNpcs = onRequest(
  { region: 'us-central1', secrets: [sessionSummaryApiKey] },
  async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'method_not_allowed' })
      return
    }
    if (!isAuthorized(req)) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }

    const groupId = typeof req.query.groupId === 'string' ? req.query.groupId : ''
    const campaignId = typeof req.query.campaignId === 'string' ? req.query.campaignId : ''
    if (!groupId || !campaignId) {
      res.status(400).json({ error: 'invalid_params' })
      return
    }

    const snap = await campaignRef(groupId, campaignId).collection('npcs').get()
    const npcs = snap.docs
      .map((docSnap) => {
        const data = docSnap.data() as { name?: string; title?: string }
        return {
          name: typeof data.name === 'string' ? data.name : '',
          title: typeof data.title === 'string' ? data.title : '',
        }
      })
      .filter((n) => n.name.trim().length > 0)

    res.status(200).json({ npcs })
  },
)

type InventoryItem = {
  id: string
  kind: 'weapon' | 'armour' | 'ammunition' | 'consumable' | 'general' | 'gold' | 'treasure'
  equipped: boolean
  qty?: number
}

type TransferDoc = {
  id: string
  itemId: string
  itemKind: Exclude<InventoryItem['kind'], 'gold'>
  itemSnapshot: InventoryItem
  fromCharacterId: string
  fromCharacterName: string
  fromUserId: string
  toCharacterId: string
  toCharacterName: string
  toUserId: string
}

type TransferRejection = {
  code: 'not-found' | 'failed-precondition' | 'permission-denied'
  message: string
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

function applyAcceptedTransfer(
  senderInventory: InventoryItem[],
  receiverInventory: InventoryItem[],
  transfer: Pick<TransferDoc, 'itemId' | 'itemSnapshot'>,
  packedAllowed: number,
) {
  const movedSnapshot = transfer.itemSnapshot
  if (!movedSnapshot || movedSnapshot.kind === 'gold') {
    return { ok: false as const, reason: 'missing_item' as const }
  }

  const senderItem = senderInventory.find((item) => item.id === transfer.itemId)
  if (!senderItem || senderItem.kind === 'gold') {
    return { ok: false as const, reason: 'missing_item' as const }
  }
  if (senderItem.kind !== movedSnapshot.kind) {
    return { ok: false as const, reason: 'kind_mismatch' as const }
  }

  const senderQty = Math.max(1, senderItem.qty ?? 1)
  const movedQty = Math.max(1, movedSnapshot.qty ?? 1)
  if (senderQty < movedQty) {
    return { ok: false as const, reason: 'qty_changed' as const }
  }

  const nextReceiverInventory = [...receiverInventory, { ...movedSnapshot, equipped: false }]
  const packedUsed = nextReceiverInventory.filter((item) => !item.equipped).length
  if (packedUsed > packedAllowed) {
    return { ok: false as const, reason: 'packed_slots' as const }
  }

  const nextSenderInventory = senderInventory.flatMap((item) => {
    if (item.id !== transfer.itemId) return [item]
    if (senderQty <= movedQty) return []
    return [{ ...item, qty: senderQty - movedQty }]
  })

  return {
    ok: true as const,
    senderInventory: nextSenderInventory,
    receiverInventory: nextReceiverInventory,
  }
}

export const acceptPendingTransfer = onCall({ region: 'us-central1' }, async (request) => {
  const uid = request.auth?.uid ?? ''
  if (!uid) throw new HttpsError('unauthenticated', 'Authentication required.')
  const groupId = typeof request.data?.groupId === 'string' ? request.data.groupId : ''
  const campaignId = typeof request.data?.campaignId === 'string' ? request.data.campaignId : ''
  const transferId = typeof request.data?.transferId === 'string' ? request.data.transferId : ''
  if (!groupId || !campaignId || !transferId) {
    throw new HttpsError('invalid-argument', 'groupId, campaignId and transferId are required.')
  }

  const campaignDoc = campaignRef(groupId, campaignId)
  const transferRef = campaignDoc.collection('pendingTransfers').doc(transferId)

  const rejection = await db.runTransaction(async (tx): Promise<TransferRejection | null> => {
    // Mirrors `isGroupMember` / `isCampaignGm` in firestore.rules: membership is
    // held by the group, and the GM is a group admin or the campaign's gmUserId.
    const [membershipSnap, campaignSnap] = await Promise.all([
      tx.get(groupMemberRef(groupId, uid)),
      tx.get(campaignDoc),
    ])
    if (!membershipSnap.exists || membershipSnap.data()?.status !== 'active') {
      throw new HttpsError('permission-denied', 'Active group membership required.')
    }
    if (!campaignSnap.exists) {
      throw new HttpsError('not-found', 'Campaign no longer exists.')
    }

    const transferSnap = await tx.get(transferRef)
    if (!transferSnap.exists) throw new HttpsError('not-found', 'Transfer no longer exists.')
    const transfer = transferSnap.data() as TransferDoc
    const isGm = membershipSnap.data()?.role === 'admin'
      || campaignSnap.data()?.gmUserId === uid
    if (transfer.toUserId !== uid && !isGm) {
      throw new HttpsError('permission-denied', 'You cannot accept this transfer.')
    }

    const senderRef = campaignDoc.collection('characters').doc(transfer.fromCharacterId)
    const receiverRef = campaignDoc.collection('characters').doc(transfer.toCharacterId)
    const [senderSnap, receiverSnap] = await Promise.all([tx.get(senderRef), tx.get(receiverRef)])
    if (!senderSnap.exists || !receiverSnap.exists) {
      tx.delete(transferRef)
      return { code: 'not-found', message: 'Item no longer available.' }
    }

    const senderData = senderSnap.data() as { details?: unknown; ownerUserId?: unknown } | undefined
    const receiverData = receiverSnap.data() as { details?: unknown } | undefined
    if (!isTransferSourceAuthorized(senderData?.ownerUserId, transfer.fromUserId)) {
      tx.delete(transferRef)
      return { code: 'permission-denied', message: 'Transfer is not authorized.' }
    }
    const senderDetails = (senderData?.details && typeof senderData.details === 'object') ? senderData.details as Record<string, unknown> : {}
    const receiverDetails = (receiverData?.details && typeof receiverData.details === 'object') ? receiverData.details as Record<string, unknown> : {}
    const senderInventory = asInventory(senderDetails)
    const receiverInventory = asInventory(receiverDetails)
    const transferResult = applyAcceptedTransfer(
      senderInventory,
      receiverInventory,
      transfer,
      availablePackedSlots(receiverDetails),
    )

    if (!transferResult.ok && (transferResult.reason === 'missing_item' || transferResult.reason === 'kind_mismatch')) {
      tx.delete(transferRef)
      return { code: 'not-found', message: 'Item no longer available.' }
    }
    if (!transferResult.ok && transferResult.reason === 'qty_changed') {
      tx.delete(transferRef)
      return { code: 'failed-precondition', message: 'Item quantity changed before transfer could be accepted.' }
    }
    if (!transferResult.ok) {
      throw new HttpsError('failed-precondition', 'Not enough packed slots to accept this item.')
    }

    tx.set(senderRef, {
      details: {
        ...senderDetails,
        inventory: transferResult.senderInventory,
      },
    }, { merge: true })
    tx.set(receiverRef, {
      details: {
        ...receiverDetails,
        inventory: transferResult.receiverInventory,
      },
    }, { merge: true })
    tx.delete(transferRef)
    return null
  })

  if (rejection) throw new HttpsError(rejection.code, rejection.message)

  return { ok: true }
})

// ── Try-it-now demo sandboxes ────────────────────────────────────────────────

/**
 * Deletes every Cloud Storage object under a prefix.
 *
 * Only the fog and vision overlays a visitor painted live under their own
 * group's prefix; the map images and portraits they saw belong to the demo
 * template and are shared, not copied, so nothing here can reach them.
 */
async function deleteDemoStoragePrefix(prefix: string) {
  await getStorage(adminApp()).bucket().deleteFiles({ prefix, force: true })
}

/**
 * Hands an anonymous visitor a private, writable copy of the demo campaign.
 *
 * Anonymous-only on purpose. A signed-in person already has their own groups,
 * and letting a real account mint sandboxes would put documents they can write
 * outside the lifecycle that cleans them up. The visitor becomes the GM of the
 * copy - group admin plus the campaign's `gmUserId` - so they get the map tools,
 * the fog brush and the whole tool rail rather than a player's view.
 *
 * Everything the caller could otherwise reach is refused rather than clamped:
 * there is no `groupId` in the payload, so there is nothing to point at a group
 * that is not theirs.
 */
export const createDemoSandboxSession = onCall({ region: 'us-central1' }, async (request) => {
  const uid = request.auth?.uid ?? ''
  if (!uid) throw new HttpsError('unauthenticated', 'Authentication required.')

  const provider = request.auth?.token?.firebase?.sign_in_provider
  if (provider !== 'anonymous') {
    throw new HttpsError('permission-denied', 'The demo is for anonymous visitors.')
  }

  const result = await createDemoSandbox(db, uid, Date.now())

  if (result.status === 'full') {
    throw new HttpsError(
      'resource-exhausted',
      `The demo is at capacity (${result.liveSandboxes} of ${result.limit} tables in use).`,
    )
  }
  if (result.status === 'template-missing') {
    logger.error('Demo template campaign is missing; run scripts/demo/seed-template.mjs')
    throw new HttpsError('failed-precondition', 'The demo is not set up yet.')
  }

  return {
    groupId: result.sandbox.groupId,
    campaignId: result.sandbox.campaignId,
    expiresAt: result.sandbox.expiresAtMs,
    resumed: result.status === 'resumed',
  }
})

/**
 * Collects demo sandboxes whose time is up.
 *
 * Every fifteen minutes rather than hourly, because the ceiling counts sandboxes
 * that have not expired yet: a short sweep interval keeps the live count honest
 * and keeps a visitor who arrives just after a busy hour from being told the
 * demo is full when it is not.
 */
export const expireDemoSandboxes = onSchedule(
  { region: 'us-central1', schedule: 'every 15 minutes' },
  async () => {
    const { removedGroupIds } = await sweepExpiredDemoSandboxes(db, deleteDemoStoragePrefix, Date.now())
    if (removedGroupIds.length > 0) {
      logger.info(`Expired ${removedGroupIds.length} demo sandbox(es).`, { removedGroupIds })
    }
  },
)
