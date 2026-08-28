/**
 * End-to-end coverage for the `acceptPendingTransfer` callable.
 *
 * The transfer is written by a real, rules-enforced client through the app's
 * own `campaignDocRef` helper, and is then accepted by the actual Cloud
 * Function, imported from `functions/src/index.ts` and invoked through its
 * `run()` test entrypoint against the same emulator. The admin SDK inside the
 * function picks the emulator up from `FIRESTORE_EMULATOR_HOST`, which
 * `firebase emulators:exec` exports.
 *
 * This is the seam the original bug lived in: the function resolved every
 * reference under the pre-reorganisation flat `campaigns/{campaignId}` tree
 * while the client wrote under `groups/{groupId}/campaigns/{campaignId}`, and
 * no test ever put the two sides in the same room.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import {
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { campaignDocRef } from '../campaign/firestorePaths'

// The function's admin SDK resolves the project from GCLOUD_PROJECT, so the
// rules-unit-testing contexts have to share that project id or the two sides
// would read different namespaces inside the same emulator.
const projectId = process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev'

const groupId = 'accept-transfer-group'
const campaignId = 'accept-transfer-campaign'
const gmUid = 'accept-transfer-gm'
const senderUid = 'accept-transfer-sender'
const receiverUid = 'accept-transfer-receiver'
const outsiderUid = 'accept-transfer-outsider'
const senderCharacterId = 'sender-character'
const receiverCharacterId = 'receiver-character'

const sword = { id: 'sword-1', kind: 'weapon' as const, equipped: false, qty: 1 }

type AcceptRequest = {
  data: { groupId?: string; campaignId?: string; transferId?: string }
  auth?: { uid: string }
}
type AcceptCallable = (request: AcceptRequest) => Promise<{ ok: boolean }>

let testEnv: RulesTestEnvironment
let acceptPendingTransfer: AcceptCallable

const withAdmin = (fn: (db: Firestore) => Promise<void>) =>
  testEnv.withSecurityRulesDisabled(async (context) => fn(context.firestore()))

const transferPayload = (transferId: string, overrides: Record<string, unknown> = {}) => ({
  id: transferId,
  itemSnapshot: sword,
  itemId: sword.id,
  itemKind: sword.kind,
  itemName: 'Sword',
  fromCharacterId: senderCharacterId,
  fromCharacterName: 'Sender PC',
  fromUserId: senderUid,
  toCharacterId: receiverCharacterId,
  toCharacterName: 'Receiver PC',
  toUserId: receiverUid,
  createdAt: serverTimestamp(),
  ...overrides,
})

const acceptFails = async (request: AcceptRequest) => {
  try {
    await acceptPendingTransfer(request)
  } catch (error) {
    return error as { code?: string; message?: string }
  }
  throw new Error('Expected acceptPendingTransfer to reject.')
}

const inventoryOf = async (db: Firestore, characterId: string) => {
  const snap = await getDoc(
    doc(db, `groups/${groupId}/campaigns/${campaignId}/characters/${characterId}`),
  )
  const details = snap.data()?.details as { inventory?: { id: string }[] } | undefined
  return details?.inventory ?? []
}

beforeAll(async () => {
  process.env.GCLOUD_PROJECT ||= projectId

  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })

  const functionsModule = await import('../../../functions/src/index')
  acceptPendingTransfer = (functionsModule.acceptPendingTransfer as unknown as {
    run: AcceptCallable
  }).run
})

beforeEach(async () => {
  await testEnv.clearFirestore()

  await withAdmin(async (db) => {
    await setDoc(doc(db, `groups/${groupId}/members/${gmUid}`), {
      userId: gmUid,
      role: 'admin',
      status: 'active',
    })
    await setDoc(doc(db, `groups/${groupId}/members/${senderUid}`), {
      userId: senderUid,
      role: 'member',
      status: 'active',
    })
    await setDoc(doc(db, `groups/${groupId}/members/${receiverUid}`), {
      userId: receiverUid,
      role: 'member',
      status: 'active',
    })
    await setDoc(doc(db, `groups/${groupId}/campaigns/${campaignId}`), {
      name: 'Accept Transfer',
      status: 'active',
      createdBy: gmUid,
      gmUserId: gmUid,
    })
    await setDoc(
      doc(db, `groups/${groupId}/campaigns/${campaignId}/characters/${senderCharacterId}`),
      {
        ownerUserId: senderUid,
        name: 'Sender PC',
        details: { abilityScores: { STR: '12' }, inventory: [sword] },
      },
    )
    await setDoc(
      doc(db, `groups/${groupId}/campaigns/${campaignId}/characters/${receiverCharacterId}`),
      {
        ownerUserId: receiverUid,
        name: 'Receiver PC',
        details: { abilityScores: { STR: '12' }, inventory: [] },
      },
    )
  })
})

/** Writes the transfer the way `usePendingTransfers.createTransfer` does. */
const writeTransferAsClient = async (transferId: string) => {
  const senderDb = testEnv.authenticatedContext(senderUid).firestore()
  await assertSucceeds(
    setDoc(
      campaignDocRef(senderDb, { campaignId, groupId }, 'pendingTransfers', transferId),
      transferPayload(transferId),
    ),
  )
}

describe('acceptPendingTransfer group-scoped path resolution', () => {
  it('accepts a transfer the client wrote at the group-scoped path', async () => {
    await writeTransferAsClient('client-written-transfer')

    const result = await acceptPendingTransfer({
      auth: { uid: receiverUid },
      data: { groupId, campaignId, transferId: 'client-written-transfer' },
    })

    expect(result).toEqual({ ok: true })

    await withAdmin(async (db) => {
      expect(await inventoryOf(db, senderCharacterId)).toEqual([])
      const received = await inventoryOf(db, receiverCharacterId)
      expect(received).toHaveLength(1)
      expect(received[0].id).toBe(sword.id)
      const transferSnap = await getDoc(
        doc(
          db,
          `groups/${groupId}/campaigns/${campaignId}/pendingTransfers/client-written-transfer`,
        ),
      )
      expect(transferSnap.exists()).toBe(false)
    })
  })

  it('leaves the pre-reorganisation flat tree untouched', async () => {
    await writeTransferAsClient('flat-tree-transfer')
    await acceptPendingTransfer({
      auth: { uid: receiverUid },
      data: { groupId, campaignId, transferId: 'flat-tree-transfer' },
    })

    await withAdmin(async (db) => {
      for (const sub of ['pendingTransfers', 'members', 'characters']) {
        const snap = await getDocs(collection(db, `campaigns/${campaignId}/${sub}`))
        expect(snap.empty).toBe(true)
      }
    })
  })

  it('rejects a transfer that is not addressed anywhere the caller can reach', async () => {
    await writeTransferAsClient('missing-group-transfer')

    const error = await acceptFails({
      auth: { uid: receiverUid },
      data: { campaignId, transferId: 'missing-group-transfer' },
    })
    expect(error.code).toBe('invalid-argument')

    const wrongGroup = await acceptFails({
      auth: { uid: receiverUid },
      data: { groupId: 'some-other-group', campaignId, transferId: 'missing-group-transfer' },
    })
    expect(wrongGroup.code).toBe('permission-denied')
  })
})

describe('acceptPendingTransfer authorization', () => {
  it('lets the campaign GM accept on a player behalf', async () => {
    await writeTransferAsClient('gm-accepted-transfer')

    await expect(acceptPendingTransfer({
      auth: { uid: gmUid },
      data: { groupId, campaignId, transferId: 'gm-accepted-transfer' },
    })).resolves.toEqual({ ok: true })
  })

  it('refuses a caller who is not the recipient', async () => {
    await writeTransferAsClient('not-yours-transfer')

    const error = await acceptFails({
      auth: { uid: senderUid },
      data: { groupId, campaignId, transferId: 'not-yours-transfer' },
    })
    expect(error.code).toBe('permission-denied')

    await withAdmin(async (db) => {
      expect(await inventoryOf(db, senderCharacterId)).toHaveLength(1)
      expect(await inventoryOf(db, receiverCharacterId)).toHaveLength(0)
    })
  })

  it('refuses a caller with no active group membership', async () => {
    await writeTransferAsClient('outsider-transfer')

    const error = await acceptFails({
      auth: { uid: outsiderUid },
      data: { groupId, campaignId, transferId: 'outsider-transfer' },
    })
    expect(error.code).toBe('permission-denied')
  })

  it('refuses an unauthenticated caller', async () => {
    await writeTransferAsClient('anonymous-transfer')

    const error = await acceptFails({
      data: { groupId, campaignId, transferId: 'anonymous-transfer' },
    })
    expect(error.code).toBe('unauthenticated')
  })

  // Regression guard for `fix(transfers): prevent forged cross-user item
  // transfers`. Rules block the forgery at write time, so the transfer is
  // planted with rules disabled to reach the function's own ownership check.
  it('discards a forged transfer whose source character belongs to someone else', async () => {
    await withAdmin(async (db) => {
      await setDoc(
        doc(db, `groups/${groupId}/campaigns/${campaignId}/pendingTransfers/forged-transfer`),
        transferPayload('forged-transfer', { fromUserId: receiverUid }),
      )
    })

    const error = await acceptFails({
      auth: { uid: receiverUid },
      data: { groupId, campaignId, transferId: 'forged-transfer' },
    })
    expect(error.code).toBe('permission-denied')

    await withAdmin(async (db) => {
      expect(await inventoryOf(db, senderCharacterId)).toHaveLength(1)
      expect(await inventoryOf(db, receiverCharacterId)).toHaveLength(0)
      const transferSnap = await getDoc(
        doc(db, `groups/${groupId}/campaigns/${campaignId}/pendingTransfers/forged-transfer`),
      )
      expect(transferSnap.exists()).toBe(false)
    })
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})
