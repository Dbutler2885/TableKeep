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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import {
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { campaignDocRef } from '../campaign/firestorePaths'
import { emulatorPort } from '../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../vitest.firestoreRules'

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
  testEnv.withSecurityRulesDisabled(async (context) => fn(context.firestore() as unknown as Firestore))

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
      rules: firestoreRules(),
      host: '127.0.0.1',
      port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080),
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
        schemaVersion: 1,
        details: { abilityScores: { STR: '12' }, inventory: [sword] },
      },
    )
    await setDoc(
      doc(db, `groups/${groupId}/campaigns/${campaignId}/characters/${receiverCharacterId}`),
      {
        ownerUserId: receiverUid,
        name: 'Receiver PC',
        schemaVersion: 1,
        details: { abilityScores: { STR: '12' }, inventory: [] },
      },
    )
  })
})

/** Writes the transfer the way `usePendingTransfers.createTransfer` does. */
const writeTransferAsClient = async (transferId: string) => {
  const senderDb = testEnv.authenticatedContext(senderUid).firestore() as unknown as Firestore
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


describe('transfer persistence', () => {
  const characterRef = (db: Firestore, id: string) => doc(db, `groups/${groupId}/campaigns/${campaignId}/characters/${id}`)
  const offerRef = (db: Firestore) => doc(db, `groups/${groupId}/campaigns/${campaignId}/pendingTransfers/baseline`)
  const accept = () => acceptPendingTransfer({ auth: { uid: receiverUid }, data: { groupId, campaignId, transferId: 'baseline' } })

  const oldTime = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
  const characterData = async (db: Firestore, id: string) => (await getDoc(characterRef(db, id))).data()!

  it('accepts an OSE transfer between current-version characters, stamping both with version 1 and a fresh write time', async () => {
    await withAdmin(async (db) => {
      for (const id of [senderCharacterId, receiverCharacterId]) {
        await setDoc(characterRef(db, id), { schemaWrittenAt: oldTime, updatedAt: oldTime,
          future: { kept: true }, details: { futureNested: { kept: true } } }, { merge: true })
      }
      await setDoc(offerRef(db), transferPayload('baseline'))
    })
    const startedAt = Date.now()
    await expect(accept()).resolves.toEqual({ ok: true })
    await withAdmin(async (db) => {
      for (const id of [senderCharacterId, receiverCharacterId]) {
        const data = await characterData(db, id)
        expect(data).toMatchObject({ schemaVersion: 1, updatedAt: oldTime, future: { kept: true }, details: { futureNested: { kept: true } } })
        // The emulator's clock is the machine's, so allow it a little skew.
        expect(data.schemaWrittenAt.toMillis()).toBeGreaterThan(startedAt - 5_000)
      }
      expect(await inventoryOf(db, senderCharacterId)).toEqual([])
      expect(await inventoryOf(db, receiverCharacterId)).toEqual([sword])
      expect((await getDoc(offerRef(db))).exists()).toBe(false)
    })
  })

  it.each([
    ['receiver', 'version 0', 0],
    ['receiver', 'an unversioned', undefined],
    ['sender', 'version 0', 0],
    ['receiver', 'above-current', 2],
    ['sender', 'above-current', 2],
  ])('refuses a transfer when the %s is %s character, with the plain message, leaving both characters and the offer', async (side, _label, schemaVersion) => {
    let before: unknown[] = []
    await withAdmin(async (db) => {
      const id = side === 'sender' ? senderCharacterId : receiverCharacterId
      const rest = await characterData(db, id)
      delete rest.schemaVersion
      await setDoc(characterRef(db, id), { ...rest, ...(schemaVersion === undefined ? {} : { schemaVersion }), schemaWrittenAt: oldTime })
      await setDoc(offerRef(db), transferPayload('baseline'))
      before = await Promise.all([senderCharacterId, receiverCharacterId].map((characterId) => characterData(db, characterId)))
    })
    await expect(accept()).rejects.toMatchObject({ code: 'failed-precondition', message: 'This character is being updated. Try again in a minute.' })
    await withAdmin(async (db) => {
      expect(await Promise.all([senderCharacterId, receiverCharacterId].map((characterId) => characterData(db, characterId)))).toEqual(before)
      expect((await getDoc(offerRef(db))).exists()).toBe(true)
    })
  })

  it.each(['missing sender', 'missing receiver', 'missing item', 'kind mismatch', 'quantity changed'])('commits offer deletion for %s but leaves both character documents unchanged', async (scenario) => {
    let before: unknown[] = []
    await withAdmin(async (db) => {
      if (scenario === 'missing sender') await deleteDoc(characterRef(db, senderCharacterId))
      if (scenario === 'missing receiver') await deleteDoc(characterRef(db, receiverCharacterId))
      if (scenario === 'missing item') await setDoc(characterRef(db, senderCharacterId), { details: { inventory: [] } }, { merge: true })
      if (scenario === 'kind mismatch') await setDoc(characterRef(db, senderCharacterId), { details: { inventory: [{ ...sword, kind: 'general' }] } }, { merge: true })
      await setDoc(offerRef(db), transferPayload('baseline', scenario === 'quantity changed' ? { itemSnapshot: { ...sword, qty: 2 } } : {}))
      before = await Promise.all([senderCharacterId, receiverCharacterId].map(async (id) => (await getDoc(characterRef(db, id))).data()))
    })
    await expect(accept()).rejects.toMatchObject({ code: scenario === 'quantity changed' ? 'failed-precondition' : 'not-found' })
    await withAdmin(async (db) => {
      const after = await Promise.all([senderCharacterId, receiverCharacterId].map(async (id) => (await getDoc(characterRef(db, id))).data()))
      expect(after).toEqual(before)
      expect((await getDoc(offerRef(db))).exists()).toBe(false)
    })
  })

  it('retains the offer and both characters unchanged when receiver capacity rejects the transfer', async () => {
    let before: unknown[] = []
    await withAdmin(async (db) => {
      await setDoc(characterRef(db, receiverCharacterId), { details: { inventory: Array.from({ length: 16 }, (_, i) => ({ ...sword, id: `packed-${i}` })) } }, { merge: true })
      await setDoc(offerRef(db), transferPayload('baseline'))
      before = await Promise.all([senderCharacterId, receiverCharacterId].map(async (id) => (await getDoc(characterRef(db, id))).data()))
    })
    await expect(accept()).rejects.toMatchObject({ code: 'failed-precondition', message: 'Not enough packed slots to accept this item.' })
    await withAdmin(async (db) => {
      expect(await Promise.all([senderCharacterId, receiverCharacterId].map(async (id) => (await getDoc(characterRef(db, id))).data()))).toEqual(before)
      expect((await getDoc(offerRef(db))).exists()).toBe(true)
    })
  })
})

describe('transfer carrying by rule set', () => {
  const campaignDocPath = `groups/${groupId}/campaigns/${campaignId}`
  const characterRef = (db: Firestore, id: string) => doc(db, `${campaignDocPath}/characters/${id}`)
  const offerRef = (db: Firestore) => doc(db, `${campaignDocPath}/pendingTransfers/by-rule-set`)
  const accept = () => acceptPendingTransfer({ auth: { uid: receiverUid }, data: { groupId, campaignId, transferId: 'by-rule-set' } })
  const bothCharacters = (db: Firestore) =>
    Promise.all([senderCharacterId, receiverCharacterId].map(async (id) => (await getDoc(characterRef(db, id))).data()))
  const oldTime = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))

  // The campaign document as beforeEach leaves it has no `system` at all.
  const offerIn = async (system: string | undefined, { both = {}, receiver = {} }: Record<string, Record<string, unknown>> = {}) => {
    let before: unknown[] = []
    await withAdmin(async (db) => {
      if (system !== undefined) await setDoc(doc(db, campaignDocPath), { system }, { merge: true })
      for (const id of [senderCharacterId, receiverCharacterId]) {
        await setDoc(characterRef(db, id), { schemaWrittenAt: oldTime, ...both }, { merge: true })
      }
      await setDoc(characterRef(db, receiverCharacterId), receiver, { merge: true })
      await setDoc(offerRef(db), transferPayload('by-rule-set'))
      before = await bothCharacters(db)
    })
    return before
  }

  const actsAsOse = [['ose', 'ose'], ['missing', undefined], ['empty', ''], ['unregistered', 'pathfinder']] as const

  it.each(actsAsOse)('moves the item as today in a campaign whose rule set is %s, stamping both characters', async (_label, system) => {
    await offerIn(system)
    const startedAt = Date.now()
    await expect(accept()).resolves.toEqual({ ok: true })
    await withAdmin(async (db) => {
      expect(await inventoryOf(db, senderCharacterId)).toEqual([])
      expect(await inventoryOf(db, receiverCharacterId)).toEqual([sword])
      for (const data of await bothCharacters(db)) {
        expect(data?.schemaVersion).toBe(1)
        // The emulator's clock is the machine's, so allow it a little skew.
        expect(data?.schemaWrittenAt.toMillis()).toBeGreaterThan(startedAt - 5_000)
      }
      expect((await getDoc(offerRef(db))).exists()).toBe(false)
    })
  })

  it.each(actsAsOse)('refuses an over-capacity transfer with the packed-slots reason in a campaign whose rule set is %s', async (_label, system) => {
    // STR 12 gives 16 packed slots, all of them full.
    const before = await offerIn(system, {
      receiver: { details: { inventory: Array.from({ length: 16 }, (_, i) => ({ ...sword, id: `packed-${i}` })) } },
    })
    await expect(accept()).rejects.toMatchObject({ code: 'failed-precondition', message: 'Not enough packed slots to accept this item.' })
    await withAdmin(async (db) => {
      expect(await bothCharacters(db)).toEqual(before)
      expect((await getDoc(offerRef(db))).exists()).toBe(true)
    })
  })

  it.each(['vtm'])('refuses a transfer in a %s campaign, which declares no carrying, leaving both characters and the offer', async (system) => {
    const before = await offerIn(system, { both: { system } })
    await expect(accept()).rejects.toMatchObject({
      code: 'failed-precondition', message: 'Items cannot be handed to another character in this campaign.',
    })
    await withAdmin(async (db) => {
      expect(await bothCharacters(db)).toEqual(before)
      expect((await getDoc(offerRef(db))).exists()).toBe(true)
    })
  })
})

describe('a Lubec transfer', () => {
  const campaignDocPath = `groups/${groupId}/campaigns/${campaignId}`
  const characterRef = (db: Firestore, id: string) => doc(db, `${campaignDocPath}/characters/${id}`)
  const offerRef = (db: Firestore) => doc(db, `${campaignDocPath}/pendingTransfers/lubec-offer`)
  const accept = () => acceptPendingTransfer({ auth: { uid: receiverUid }, data: { groupId, campaignId, transferId: 'lubec-offer' } })
  const bothCharacters = (db: Firestore) =>
    Promise.all([senderCharacterId, receiverCharacterId].map(async (id) => (await getDoc(characterRef(db, id))).data()))
  const oldTime = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))

  const thing = (id: string, carrier: string, at: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    ({ id, kind: 'thing', carrier, ...at, name: id, size: 1, qty: 1, weight: 'normal', note: '', ...extra })
  const rope = thing('rope', 'strap', { pocket: 0 }, { batch: 'b1', check: 'pass' })
  const cup = thing('cup', 'backpack', { pocket: 0 })
  // Everything on the sheet besides gear, which the callable must not touch.
  const restOfSheet = (stress: number) => ({
    door: 'direct', counters: { stress, minimumStress: 2, trauma: 1 }, effects: [{ id: 'dazed', name: 'Dazed' }], lastRoll: { total: 14 },
  })
  const sheet = (stress: number, items: unknown[]) => ({
    ...restOfSheet(stress),
    gear: { items, carriers: [{ id: 'strap', name: 'Strap', type: 'strap', pockets: [{ name: 'Strap', slots: 8, max: 8 }] }], overrides: [], supplies: [] },
  })
  const gearOf = async (db: Firestore, id: string) => (await getDoc(characterRef(db, id))).data()?.lubec?.gear?.items

  /** Lubec characters on both sides, and the offer written by the sender through the real rules. */
  const offerIn = async (snapshot: Record<string, unknown>, senderItems: unknown[], receiverItems: unknown[] = []) => {
    let before: unknown[] = []
    await withAdmin(async (db) => {
      await setDoc(doc(db, campaignDocPath), { system: 'lubec' }, { merge: true })
      await setDoc(characterRef(db, senderCharacterId), { ownerUserId: senderUid, name: 'Sender PC', system: 'lubec', schemaVersion: 1, schemaWrittenAt: oldTime, lubec: sheet(3, senderItems) })
      await setDoc(characterRef(db, receiverCharacterId), { ownerUserId: receiverUid, name: 'Receiver PC', system: 'lubec', schemaVersion: 1, schemaWrittenAt: oldTime, lubec: sheet(5, receiverItems) })
    })
    const senderDb = testEnv.authenticatedContext(senderUid).firestore() as unknown as Firestore
    await assertSucceeds(setDoc(offerRef(senderDb), transferPayload('lubec-offer', {
      itemSnapshot: snapshot, itemId: snapshot.id, itemKind: snapshot.kind, itemName: snapshot.name,
    })))
    await withAdmin(async (db) => { before = await bothCharacters(db) })
    return before
  }

  it("lands an accepted item in the receiver's backpack, leaves the rest of each sheet alone, and stamps both", async () => {
    await offerIn(rope, [rope, cup])
    const startedAt = Date.now()
    await expect(accept()).resolves.toEqual({ ok: true })
    await withAdmin(async (db) => {
      expect(await gearOf(db, senderCharacterId)).toEqual([cup])
      expect(await gearOf(db, receiverCharacterId)).toEqual([thing('rope', 'backpack', { pocket: 0 })])
      const [sender, receiver] = await bothCharacters(db)
      expect(sender?.lubec).toMatchObject(restOfSheet(3))
      expect(receiver?.lubec).toMatchObject(restOfSheet(5))
      for (const data of [sender, receiver]) {
        expect(data?.lubec.gear.carriers).toHaveLength(1)
        expect(data?.schemaVersion).toBe(1)
        // The emulator's clock is the machine's, so allow it a little skew.
        expect(data?.schemaWrittenAt.toMillis()).toBeGreaterThan(startedAt - 5_000)
      }
      expect((await getDoc(offerRef(db))).exists()).toBe(false)
    })
  })

  it('puts an 8-slot thing into two empty hands', async () => {
    const canoe = thing('canoe', 'strap', { pocket: 0 }, { size: 8 })
    await offerIn(canoe, [canoe])
    await expect(accept()).resolves.toEqual({ ok: true })
    await withAdmin(async (db) => {
      expect(await gearOf(db, senderCharacterId)).toEqual([])
      expect(await gearOf(db, receiverCharacterId)).toEqual([thing('canoe', 'hands', { slot: 0 }, { size: 8 })])
    })
  })

  it('refuses with a full backpack, leaving both characters and the offer', async () => {
    const full = [thing('tent', 'backpack', { pocket: 0 }, { size: 4 }), cup, thing('map', 'backpack', { pocket: 1 }), thing('pen', 'backpack', { pocket: 2 })]
    const before = await offerIn(rope, [rope], full)
    await expect(accept()).rejects.toMatchObject({
      code: 'failed-precondition', message: 'Not enough room to accept this item. Make room in your backpack or hands, then accept again.',
    })
    await withAdmin(async (db) => {
      expect(await bothCharacters(db)).toEqual(before)
      expect((await getDoc(offerRef(db))).exists()).toBe(true)
    })
  })
})
