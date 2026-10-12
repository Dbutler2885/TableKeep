import { getStorage } from 'firebase-admin/storage'
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onDocumentDeleted, onDocumentWritten } from 'firebase-functions/v2/firestore'
import { defineSecret, defineString } from 'firebase-functions/params'
import { logger } from 'firebase-functions'
import type { Request } from 'express'
import { adminApp, adminFirestore } from './adminApp.js'
import { isTransferSourceAuthorized } from './transferAuthorization.js'
import { campaignPath, groupMemberPath } from './firestorePaths.js'
import { deleteCampaignSessions } from './campaignSessions.js'
import { recapIsDue, requestRecapRerun, runSessionRecap } from './recap/sessionRecap.js'
import { callOpenAi, transcriptObjectPath } from './recap/writeRecap.js'
import {
  saveGeneratedSummary,
  type SummaryCalendarDay,
  type SummaryNpcMention,
  type SummaryScene,
} from './recap/sessionSummaries.js'
import { createDemoSandbox, sweepExpiredDemoSandboxes } from './demoSessions.js'
import {
  DISCORD_CONNECT_STATES_COLLECTION,
  beginDiscordConnect,
  completeDiscordConnect,
  disconnectDiscord,
  discordAuthorizeUrl,
  fetchDiscordIdentity,
  isWellFormedDiscordState,
  type DiscordOAuthConfig,
} from './discordConnect.js'
import {
  beginDiscordServerLink,
  completeDiscordServerLink,
  discordServerLinkUrl,
  fetchLinkedDiscordServer,
  isActiveGroupAdmin,
  unlinkDiscordServer,
} from './discordServerLink.js'

adminApp()

const db = adminFirestore()
const sessionSummaryApiKey = defineSecret('SESSION_SUMMARY_API_KEY')
/** The key the recap of a recorded session is written with. */
const openAiApiKey = defineSecret('OPENAI_API_KEY')

// The Discord application that people approve when they connect their account.
// The strings default to empty so that a checkout with no Discord application,
// the demo included, still loads and deploys; the functions that need them
// refuse to run until they are set.
const discordClientId = defineString('DISCORD_CLIENT_ID', { default: '' })
const discordClientSecret = defineSecret('DISCORD_CLIENT_SECRET')
/** Where Discord sends people back to: the public URL of `discordConnectCallback`, exactly as registered with Discord. */
const discordRedirectUri = defineString('DISCORD_REDIRECT_URI', { default: '' })
/** The web app's own address, which the callback returns people to. */
const appUrl = defineString('APP_URL', { default: '' })

function discordOAuthConfig(): DiscordOAuthConfig | null {
  const config = {
    clientId: discordClientId.value(),
    clientSecret: discordClientSecret.value(),
    redirectUri: discordRedirectUri.value(),
  }
  return config.clientId && config.clientSecret && config.redirectUri && appUrl.value() ? config : null
}

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
    const normalizeScenes = (raw: unknown): SummaryScene[] => {
      if (!Array.isArray(raw)) return []
      return raw.map((s: Record<string, unknown>) => ({
        name: typeof s.name === 'string' ? s.name : '',
        summary: typeof s.summary === 'string' ? s.summary : '',
        details: Array.isArray(s.details) ? s.details.filter((d: unknown) => typeof d === 'string') : [],
      }))
    }

    const normalizeNpcs = (raw: unknown): SummaryNpcMention[] => {
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

    const normalizeCalendar = (raw: unknown): SummaryCalendarDay[] => {
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

    const summaryId = await saveGeneratedSummary(db, groupId, campaignId, {
      title: title.trim(),
      summaryMarkdown: typeof summaryMarkdown === 'string' ? summaryMarkdown : '',
      sessionNumber: typeof sessionNumber === 'number' ? sessionNumber : null,
      overallSummary,
      scenes,
      npcMentions,
      cliffhangers,
      calendar,
    })

    res.status(201).json({ ok: true, id: summaryId })
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

/**
 * Starts connecting the caller's Discord account and returns the Discord page
 * to send them to.
 *
 * An anonymous demo visitor is refused: a connection is what lets the session
 * bot act on someone's word, and a visitor's account is gone in three hours.
 */
export const startDiscordConnect = onCall(
  { region: 'us-central1', secrets: [discordClientSecret] },
  async (request) => {
    const uid = request.auth?.uid ?? ''
    if (!uid) throw new HttpsError('unauthenticated', 'Authentication required.')
    if (request.auth?.token?.firebase?.sign_in_provider === 'anonymous') {
      throw new HttpsError('permission-denied', 'Sign in with your own account to connect Discord.')
    }
    const config = discordOAuthConfig()
    if (!config) throw new HttpsError('failed-precondition', 'Discord is not set up for this deployment yet.')

    const state = await beginDiscordConnect(db, uid, Date.now())
    return { url: discordAuthorizeUrl(config, state) }
  },
)

/**
 * Where Discord sends someone back after they approve or decline, whether they
 * were connecting their own account or adding the bot to a server. One address
 * serves both, so only one has to be registered with Discord; the state says
 * which it was.
 *
 * It always ends by returning them to the app with the outcome in the address,
 * so that a failure is something they are told and not a blank page.
 */
export const discordConnectCallback = onRequest(
  { region: 'us-central1', secrets: [discordClientSecret] },
  async (req, res) => {
    const config = discordOAuthConfig()
    if (!config) {
      res.status(503).send('Discord is not set up for this deployment yet.')
      return
    }
    // A server link returns to the group it was for; everything else to the app's front door.
    const back = (outcome: string, groupId?: string) => {
      const url = new URL(groupId ? `/groups/${encodeURIComponent(groupId)}` : '/', appUrl.value())
      url.searchParams.set('discord', outcome)
      res.redirect(303, url.toString())
    }

    const state = typeof req.query.state === 'string' ? req.query.state : ''
    const code = typeof req.query.code === 'string' ? req.query.code : ''
    // Declining on Discord comes back as an `error` with no code.
    if (!code) {
      back(req.query.error === 'access_denied' ? 'declined' : 'invalid_state')
      return
    }

    const stateSnap = isWellFormedDiscordState(state)
      ? await db.collection(DISCORD_CONNECT_STATES_COLLECTION).doc(state).get()
      : null
    if (stateSnap?.data()?.kind === 'server') {
      const result = await completeDiscordServerLink(db, {
        state,
        code,
        nowMs: Date.now(),
        resolveServer: (authorizationCode) => fetchLinkedDiscordServer(config, authorizationCode),
      })
      if (result.outcome === 'discord_error') logger.warn('Discord did not say which server the bot was added to.')
      back(result.outcome, result.groupId)
      return
    }
    const { outcome } = await completeDiscordConnect(db, {
      state,
      code,
      nowMs: Date.now(),
      identify: (authorizationCode) => fetchDiscordIdentity(config, authorizationCode),
    })
    if (outcome === 'discord_error') logger.warn('Discord could not identify an account during connect.')
    back(outcome)
  },
)

/** Removes the caller's Discord connection. */
export const disconnectDiscordAccount = onCall({ region: 'us-central1' }, async (request) => {
  const uid = request.auth?.uid ?? ''
  if (!uid) throw new HttpsError('unauthenticated', 'Authentication required.')
  await disconnectDiscord(db, uid)
  return { ok: true }
})

/**
 * Starts linking a Discord server to a group and returns the Discord page
 * where the caller picks the server and adds the bot to it.
 */
export const startDiscordServerLink = onCall(
  { region: 'us-central1', secrets: [discordClientSecret] },
  async (request) => {
    const uid = request.auth?.uid ?? ''
    if (!uid) throw new HttpsError('unauthenticated', 'Authentication required.')
    const groupId = typeof request.data?.groupId === 'string' ? request.data.groupId : ''
    if (!groupId) throw new HttpsError('invalid-argument', 'groupId is required.')
    const config = discordOAuthConfig()
    if (!config) throw new HttpsError('failed-precondition', 'Discord is not set up for this deployment yet.')

    const state = await beginDiscordServerLink(db, { uid, groupId }, Date.now())
    if (!state) throw new HttpsError('permission-denied', 'Only an admin of the group can link a Discord server.')
    return { url: discordServerLinkUrl(config, state) }
  },
)

/** Removes a group's Discord server link. The bot stays in the server until someone removes it there. */
export const unlinkGroupDiscordServer = onCall({ region: 'us-central1' }, async (request) => {
  const uid = request.auth?.uid ?? ''
  if (!uid) throw new HttpsError('unauthenticated', 'Authentication required.')
  const groupId = typeof request.data?.groupId === 'string' ? request.data.groupId : ''
  if (!groupId) throw new HttpsError('invalid-argument', 'groupId is required.')
  if (!(await isActiveGroupAdmin(db, groupId, uid))) {
    throw new HttpsError('permission-denied', 'Only an admin of the group can unlink its Discord server.')
  }
  await unlinkDiscordServer(db, groupId)
  return { ok: true }
})

/**
 * Clears a deleted campaign's recorded sessions.
 *
 * The app deletes a campaign's other subcollections itself. It cannot delete
 * sessions, transcripts or audio, which no client may touch, so those are
 * removed here when the campaign document goes.
 */
export const clearDeletedCampaignSessions = onDocumentDeleted(
  { region: 'us-central1', document: 'groups/{groupId}/campaigns/{campaignId}' },
  async (event) => {
    const { groupId, campaignId } = event.params
    await deleteCampaignSessions(
      db,
      (prefix) => getStorage(adminApp()).bucket().deleteFiles({ prefix, force: true }),
      groupId,
      campaignId,
    )
  },
)

const SESSION_DOCUMENT = 'groups/{groupId}/campaigns/{campaignId}/sessions/{sessionId}'
/** Short of the function's own limit, so that a model that never answers is recorded as a failure and not cut off. */
const RECAP_MODEL_TIMEOUT_MS = 8 * 60 * 1000

/**
 * Writes a recorded session's recap when the session ends.
 *
 * The bot marks an ended session's recap as pending; this notices the mark,
 * whenever it appears. Its progress is recorded on the session.
 */
export const writeEndedSessionRecap = onDocumentWritten(
  { region: 'us-central1', document: SESSION_DOCUMENT, secrets: [openAiApiKey], timeoutSeconds: 540, memory: '512MiB' },
  async (event) => {
    if (!recapIsDue(event.data?.after.data())) return
    const session = event.params
    const outcome = await runSessionRecap(db, session, {
      callModel: callOpenAi(openAiApiKey.value(), { timeoutMs: RECAP_MODEL_TIMEOUT_MS }),
      readTranscript: async (ref) => {
        const [bytes] = await getStorage(adminApp()).bucket().file(transcriptObjectPath(ref)).download()
        return bytes.toString('utf8')
      },
    })
    logger.info('Session recap', { ...session, outcome })
  },
)

/** Lets a GM ask for a session's recap to be tried again after it failed. */
export const rerunSessionRecap = onCall({ region: 'us-central1' }, async (request) => {
  const uid = request.auth?.uid ?? ''
  if (!uid) throw new HttpsError('unauthenticated', 'Authentication required.')
  const [groupId, campaignId, sessionId] = ['groupId', 'campaignId', 'sessionId'].map((key) =>
    typeof request.data?.[key] === 'string' ? (request.data[key] as string) : '',
  )
  if (!groupId || !campaignId || !sessionId) throw new HttpsError('invalid-argument', 'groupId, campaignId and sessionId are required.')
  if (!(await isActiveGroupAdmin(db, groupId, uid))) {
    throw new HttpsError('permission-denied', 'Only an admin of the group can rerun a recap.')
  }
  const result = await requestRecapRerun(db, { groupId: groupId!, campaignId: campaignId!, sessionId: sessionId! })
  if (result === 'not-found') throw new HttpsError('not-found', 'That session does not exist.')
  if (result === 'not-failed') throw new HttpsError('failed-precondition', 'That recap has not failed.')
  return { ok: true }
})
