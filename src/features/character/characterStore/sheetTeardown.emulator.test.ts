/**
 * Deleting one character or NPC takes its write receipts with it, run against
 * the real `firestore.rules`: the owner and the GM delete a character's
 * receipts in the commit that drops its things to the GM, the GM deletes an
 * NPC sheet's, a save that lands while the receipts are being listed is caught
 * rather than left behind, and a delayed save that arrives afterwards cannot
 * bring the sheet back.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { collection, doc, getDoc, getDocs, setDoc, writeBatch, type DocumentReference, type Firestore } from 'firebase/firestore'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { campaignDocRef, campaignGmItemRef, characterHiddenCarrierRef, npcSheetRef } from '../../campaign/firestorePaths'
import { lubecDeleteCharacterDroppingGear } from '../../lubec/gear/lubecDeleteDrop'
import { deleteNpcDocuments } from '../../npcs/lib/npcFirestore'
import { saveSheetIntention } from './sheetIntentionTransaction'
import { deleteSheetWithReceipts, SHEET_TEARDOWN_CONTENDED, SHEET_TEARDOWN_FINAL_RECEIPTS } from './sheetTeardown'
import { emulatorPort } from '../../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../../vitest.firestoreRules'

// Runs once after the next listing of a sheet's receipts, before the deleting
// transaction reads the sheet: the moment a delayed save can slip in.
const listing = vi.hoisted(() => ({ after: null as null | (() => Promise<void>), every: false }))

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  const getDocs: typeof actual.getDocs = async (query) => {
    const result = await actual.getDocs(query)
    const after = listing.after
    if (after && 'path' in query && String(query.path).endsWith('/writeReceipts')) {
      if (!listing.every) listing.after = null
      await after()
    }
    return result
  }
  return { ...actual, getDocs }
})

const projectId = 'homeboyshouse-sheet-teardown-tests'
const scope = { groupId: 'teardown-group', campaignId: 'teardown-campaign' }
const adminUid = 'teardown-admin'
const campaignGmUid = 'teardown-campaign-gm'
const playerUid = 'teardown-player'
const otherPlayerUid = 'teardown-other-player'

const anvil = { id: 'anvil', kind: 'thing', carrier: 'hands', slot: 0, name: 'Small anvil', size: 1, qty: 1, weight: 'heavy', note: '', check: 'fail' }
const hiddenCoin = { id: 'coin', kind: 'thing', name: 'Coin', size: 1, qty: 1, weight: 'normal', note: '' }

const sheet = (id: string, ownerUserId: string, items: object[]) => ({
  id, system: 'lubec', name: id, ownerUserId, schemaVersion: 1, sheetRevision: 0,
  lubec: { counters: { stress: 2, minimumStress: 2, trauma: 0 }, gear: { items, carriers: [], overrides: [], supplies: [], backpackArt: 'teal' } },
})

const receipt = (operationId: string, revision: number) => ({ outcome: { status: 'committed', operationId, revision } })
const droppedBy = (userId: string) => ({ characterId: 'wayne', characterName: 'Wayne Gardner', userId })

/** One stress point, as a delayed save carries it, made against the revision it was edited at. */
const stressSave = (operationId: string, baseRevision: number, base: number) => ({
  operationId, baseRevision, edits: [{ kind: 'delta' as const, path: ['lubec', 'counters', 'stress'], base, amount: 1 }],
})

describe('deleting one sheet with its write receipts', () => {
  let testEnv: RulesTestEnvironment
  const as = (uid: string) => testEnv.authenticatedContext(uid).firestore() as unknown as Firestore
  const wayne = (db: Firestore) => campaignDocRef(db, scope, 'characters', 'wayne')
  const ferryman = (db: Firestore) => npcSheetRef(db, scope, 'ferryman')

  const withoutRules = async <T>(read: (db: Firestore) => Promise<T>): Promise<T> => {
    let result: T | undefined
    await testEnv.withSecurityRulesDisabled(async (context) => {
      result = await read(context.firestore() as unknown as Firestore)
    })
    return result as T
  }
  const exists = (ref: (db: Firestore) => DocumentReference) => withoutRules(async (db) => (await getDoc(ref(db))).exists())
  const receiptIds = (sheetRef: (db: Firestore) => DocumentReference) =>
    withoutRules(async (db) => (await getDocs(collection(sheetRef(db), 'writeReceipts'))).docs.map((d) => d.id).sort())

  const seedReceipts = (sheetRef: (db: Firestore) => DocumentReference, count: number) => withoutRules(async (db) => {
    const batch = writeBatch(db)
    for (let index = 0; index < count; index += 1) {
      batch.set(doc(sheetRef(db), 'writeReceipts', `op-${String(index).padStart(4, '0')}`), receipt(`op-${index}`, index))
    }
    await batch.commit()
  })

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: { host: '127.0.0.1', port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080), rules: firestoreRules() },
    })
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  afterEach(() => {
    listing.after = null
    listing.every = false
  })

  beforeEach(async () => {
    await testEnv.clearFirestore()
    await withoutRules(async (db) => {
      await setDoc(doc(db, 'groups', scope.groupId), { createdBy: adminUid })
      const members: [string, string][] = [[adminUid, 'admin'], [campaignGmUid, 'member'], [playerUid, 'member'], [otherPlayerUid, 'member']]
      for (const [uid, role] of members) {
        await setDoc(doc(db, 'groups', scope.groupId, 'members', uid), { userId: uid, role, status: 'active' })
      }
      await setDoc(doc(db, 'groups', scope.groupId, 'campaigns', scope.campaignId), { createdBy: adminUid, gmUserId: campaignGmUid, system: 'lubec' })
      await setDoc(wayne(db), sheet('wayne', playerUid, [anvil]))
      await setDoc(doc(wayne(db), 'writeReceipts', 'create-wayne'), receipt('create-wayne', 0))
      await setDoc(characterHiddenCarrierRef(db, scope, 'wayne', 'stash'), { id: 'stash', name: 'Stash', items: [hiddenCoin] })
      await setDoc(campaignDocRef(db, scope, 'npcs', 'ferryman'), { name: 'Ferryman', visibleToPlayers: false })
      await setDoc(campaignDocRef(db, scope, 'npcPrivate', 'ferryman'), { gmNotes: 'Takes coin.' })
      await setDoc(ferryman(db), sheet('ferryman', campaignGmUid, []))
      await setDoc(doc(ferryman(db), 'writeReceipts', 'create-ferryman'), receipt('create-ferryman', 0))
    })
    await seedReceipts(wayne, 3)
    await seedReceipts(ferryman, 3)
  })

  it('deletes a character with its receipts and hidden carriers, dropping its things, for the owner and for the GM', async () => {
    for (const uid of [playerUid, campaignGmUid]) {
      await lubecDeleteCharacterDroppingGear(as(uid), scope, droppedBy(uid))

      expect(await exists(wayne)).toBe(false)
      expect(await receiptIds(wayne)).toEqual([])
      expect(await exists((db) => characterHiddenCarrierRef(db, scope, 'wayne', 'stash'))).toBe(false)
      expect((await withoutRules((db) => getDoc(campaignGmItemRef(db, scope, 'anvil')))).data()).toMatchObject({ status: 'dropped', droppedByUserId: uid })
      await withoutRules((db) => setDoc(wayne(db), sheet('wayne', playerUid, [anvil])))
      await seedReceipts(wayne, 3)
    }
  })

  it('refuses another player\'s delete whole, receipts included', async () => {
    await expect(lubecDeleteCharacterDroppingGear(as(otherPlayerUid), scope, droppedBy(otherPlayerUid)))
      .rejects.toMatchObject({ code: 'permission-denied' })

    expect(await exists(wayne)).toBe(true)
    expect(await receiptIds(wayne)).toEqual(['create-wayne', 'op-0000', 'op-0001', 'op-0002'])
  })

  it('deletes the owner\'s receipts beyond what the final commit holds before that commit', async () => {
    await seedReceipts(wayne, SHEET_TEARDOWN_FINAL_RECEIPTS + 30)

    await lubecDeleteCharacterDroppingGear(as(playerUid), scope, droppedBy(playerUid))

    expect(await exists(wayne)).toBe(false)
    expect(await receiptIds(wayne)).toEqual([])
  })

  it('catches a save that lands between listing the receipts and deleting the sheet', async () => {
    listing.after = async () => {
      const db = as(playerUid)
      expect(await saveSheetIntention(db, wayne(db), stressSave('raced-save', 0, 2))).toMatchObject({ status: 'committed' })
    }

    await lubecDeleteCharacterDroppingGear(as(playerUid), scope, droppedBy(playerUid))

    expect(listing.after).toBeNull()
    expect(await exists(wayne)).toBe(false)
    expect(await receiptIds(wayne)).toEqual([])
  })

  it('reports a sheet that changed during every attempt, leaving it and its newest receipts', async () => {
    let revision = 0
    listing.every = true
    listing.after = async () => {
      const db = as(campaignGmUid)
      const outcome = await saveSheetIntention(db, wayne(db), stressSave(`busy-${revision}`, revision, 2 + revision))
      expect(outcome).toMatchObject({ status: 'committed' })
      revision += 1
    }

    const db = as(playerUid)
    await expect(deleteSheetWithReceipts(db, wayne(db))).rejects.toThrow(SHEET_TEARDOWN_CONTENDED)

    expect(await exists(wayne)).toBe(true)
    expect(await receiptIds(wayne)).toContain('busy-2')
  })

  it('lets no delayed save bring a deleted sheet back or leave a receipt under it', async () => {
    await lubecDeleteCharacterDroppingGear(as(playerUid), scope, droppedBy(playerUid))

    const owner = as(playerUid)
    const gm = as(campaignGmUid)
    await expect(saveSheetIntention(owner, wayne(owner), stressSave('late-owner-save', 0, 2)))
      .rejects.toMatchObject({ code: 'permission-denied' })
    expect(await saveSheetIntention(gm, wayne(gm), stressSave('late-gm-save', 0, 2))).toMatchObject({ status: 'repair' })

    expect(await exists(wayne)).toBe(false)
    expect(await receiptIds(wayne)).toEqual([])
  })

  it('deletes an NPC with its GM notes, its sheet and the sheet\'s receipts', async () => {
    await deleteNpcDocuments(scope, 'ferryman', as(campaignGmUid))

    expect(await exists((db) => campaignDocRef(db, scope, 'npcs', 'ferryman'))).toBe(false)
    expect(await exists((db) => campaignDocRef(db, scope, 'npcPrivate', 'ferryman'))).toBe(false)
    expect(await exists(ferryman)).toBe(false)
    expect(await receiptIds(ferryman)).toEqual([])
  })

  it('catches an NPC sheet save that lands while its receipts are listed', async () => {
    listing.after = async () => {
      const db = as(campaignGmUid)
      expect(await saveSheetIntention(db, ferryman(db), stressSave('raced-npc-save', 0, 2))).toMatchObject({ status: 'committed' })
    }

    await deleteNpcDocuments(scope, 'ferryman', as(campaignGmUid))

    expect(await exists(ferryman)).toBe(false)
    expect(await receiptIds(ferryman)).toEqual([])
  })

  it('refuses a player\'s delete of an NPC sheet whole', async () => {
    await expect(deleteNpcDocuments(scope, 'ferryman', as(playerUid))).rejects.toMatchObject({ code: 'permission-denied' })

    expect(await exists(ferryman)).toBe(true)
    expect(await receiptIds(ferryman)).toHaveLength(4)
  })

  it('settles quietly when another delete takes the sheet and its receipts while they are listed', async () => {
    listing.after = async () => {
      const gm = as(campaignGmUid)
      await deleteSheetWithReceipts(gm, wayne(gm))
    }

    await expect(lubecDeleteCharacterDroppingGear(as(playerUid), scope, droppedBy(playerUid))).resolves.toBeUndefined()

    expect(await exists(wayne)).toBe(false)
    expect(await receiptIds(wayne)).toEqual([])
    expect(await exists((db) => campaignGmItemRef(db, scope, 'anvil'))).toBe(false)
  })

  it('leaves a sheet already gone alone', async () => {
    await withoutRules((db) => deleteSheetWithReceipts(db, wayne(db)))

    const gm = as(campaignGmUid)
    await expect(deleteSheetWithReceipts(gm, wayne(gm))).resolves.toBeUndefined()
    expect(await exists(wayne)).toBe(false)
  })
})
