/**
 * The safe move between two records (spec 4.7), run as a real transaction
 * against the real `firestore.rules`: it writes both records or neither, two
 * moves into one record at once leave the loser refused for room, a store's
 * waiting save cannot land on top of it, and a drop writes the character and
 * the GM item together.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, type DocumentData, type Firestore } from 'firebase/firestore'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { campaignDocRef, campaignGmItemRef, npcSheetRef } from '../../campaign/firestorePaths'
import { lubecCharacterVersioning } from '../../ruleSets/characterMigrations'
import { characterSchemaStamp } from '../../ruleSets/characterSchemaStamp'
import { LUBEC_NO_ROOM_TO_ACCEPT } from '../../ruleSets/lubec/gear/arrival'
import { LUBEC_STALE_MOVE } from '../../ruleSets/lubec/gear/containers'
import { lubecMoveBetween, type LubecMoveStore } from './lubecMoveTransaction'
import { emulatorPort } from '../../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../../vitest.firestoreRules'

const projectId = 'homeboyshouse-lubec-move-tests'
const scope = { groupId: 'move-group', campaignId: 'move-campaign' }
const adminUid = 'move-admin'
const campaignGmUid = 'move-campaign-gm'
const playerUid = 'move-player'
const otherPlayerUid = 'move-other-player'

const anvil = { id: 'anvil', kind: 'thing', carrier: 'hands', slot: 0, name: 'Small anvil', size: 1, qty: 1, weight: 'heavy', note: '', check: 'fail' }
const flashlight = { id: 'flashlight', kind: 'thing', carrier: 'backpack', pocket: 0, cells: [4], name: 'Flashlight', size: 1, qty: 1, weight: 'normal', note: '' }
const tent = (id: string) => ({ id, kind: 'thing', name: 'Tent', size: 4, qty: 1, weight: 'normal', note: '', status: 'dropped', droppedByUserId: playerUid })

const sheet = (id: string, ownerUserId: string, items: object[]) => ({
  id, system: 'lubec', name: id, ownerUserId, schemaVersion: 1,
  lubec: { counters: { stress: 2, minimumStress: 2, trauma: 0 }, gear: { items, carriers: [], overrides: [], supplies: [], backpackArt: 'teal' } },
})

const wayne = { kind: 'character', characterId: 'wayne' } as const
const stephen = { kind: 'character', characterId: 'stephen' } as const
const gmItems = { kind: 'gm-items' } as const
const droppedBy = { characterId: 'wayne', characterName: 'Wayne Gardner', userId: playerUid }

/** A store with nothing waiting, for moves that start from a quiet sheet. */
const quietStore: LubecMoveStore = { sendSaveNow: () => {}, hasPendingWrite: () => false }

/**
 * A store that holds one save for half a second, as `useCharacterStore` does:
 * a pending save waiting out its delay, then in flight until Firestore settles
 * it, writing the whole `lubec` map of its local copy with a merge.
 */
function storeHoldingASave(db: Firestore, characterId: string, localLubec: object) {
  let pending: ReturnType<typeof setTimeout> | null = null
  let inFlight = false
  const send = () => {
    pending = null
    inFlight = true
    const fields = { lubec: localLubec, ...characterSchemaStamp(lubecCharacterVersioning), updatedAt: serverTimestamp() }
    void setDoc(campaignDocRef(db, scope, 'characters', characterId), fields, { merge: true }).finally(() => { inFlight = false })
  }
  pending = setTimeout(send, 500)
  const store: LubecMoveStore = {
    sendSaveNow: () => {
      if (pending) clearTimeout(pending)
      send()
    },
    hasPendingWrite: () => Boolean(pending || inFlight),
  }
  return store
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('the move between two records', () => {
  let testEnv: RulesTestEnvironment
  const as = (uid: string) => testEnv.authenticatedContext(uid).firestore() as unknown as Firestore

  const stored = async (path: (db: Firestore) => ReturnType<typeof campaignDocRef>): Promise<DocumentData | undefined> => {
    let data: DocumentData | undefined
    await testEnv.withSecurityRulesDisabled(async (context) => {
      data = (await getDoc(path(context.firestore() as unknown as Firestore))).data()
    })
    return data
  }
  const character = (id: string) => stored((db) => campaignDocRef(db, scope, 'characters', id))
  const gmItem = (id: string) => stored((db) => campaignGmItemRef(db, scope, id))
  const itemIds = (data: DocumentData | undefined) => (data?.lubec.gear.items as { id: string }[]).map((i) => i.id)

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: { host: '127.0.0.1', port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080), rules: firestoreRules() },
    })
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  beforeEach(async () => {
    await testEnv.clearFirestore()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore() as unknown as Firestore
      await setDoc(doc(db, 'groups', scope.groupId), { createdBy: adminUid })
      const members: [string, string][] = [[adminUid, 'admin'], [campaignGmUid, 'member'], [playerUid, 'member'], [otherPlayerUid, 'member']]
      for (const [uid, role] of members) {
        await setDoc(doc(db, 'groups', scope.groupId, 'members', uid), { userId: uid, role, status: 'active' })
      }
      await setDoc(doc(db, 'groups', scope.groupId, 'campaigns', scope.campaignId), { createdBy: adminUid, gmUserId: campaignGmUid, system: 'lubec' })
      await setDoc(campaignDocRef(db, scope, 'characters', 'wayne'), sheet('wayne', playerUid, [anvil, flashlight]))
      await setDoc(campaignDocRef(db, scope, 'characters', 'stephen'), sheet('stephen', otherPlayerUid, []))
      await setDoc(npcSheetRef(db, scope, 'ferryman'), sheet('ferryman', campaignGmUid, [anvil]))
      await setDoc(campaignGmItemRef(db, scope, 'tent-1'), tent('tent-1'))
      await setDoc(campaignGmItemRef(db, scope, 'tent-2'), tent('tent-2'))
    })
  })

  it('drops a thing: the character loses it and a dropped GM item appears, in one write', async () => {
    const result = await lubecMoveBetween(as(playerUid), {
      scope, from: wayne, to: gmItems, store: quietStore,
      move: { itemId: 'anvil', seen: { carrier: 'hands', slot: 0 }, droppedBy },
    })

    expect(result).toEqual({ ok: true })
    const after = await character('wayne')
    expect(itemIds(after)).toEqual(['flashlight'])
    expect(after?.lubec.counters).toEqual({ stress: 2, minimumStress: 2, trauma: 0 })
    expect(after?.lubec.gear.backpackArt).toBe('teal')
    expect(after?.schemaVersion).toBe(1)
    const { carrier: _carrier, slot: _slot, check: _check, ...unplaced } = anvil
    expect(await gmItem('anvil')).toMatchObject({
      ...unplaced, status: 'dropped', droppedFrom: 'hands',
      droppedByCharacterId: 'wayne', droppedByCharacterName: 'Wayne Gardner', droppedByUserId: playerUid,
    })
    expect(await gmItem('anvil')).not.toHaveProperty('carrier')
  })

  it('drops a thing from an NPC sheet for the GM, and a player cannot', async () => {
    const ferryman = { kind: 'npc', npcId: 'ferryman' } as const
    const move = { itemId: 'anvil', seen: { carrier: 'hands', slot: 0 }, droppedBy: { characterId: 'ferryman', characterName: 'Ferryman', userId: campaignGmUid } }

    await expect(lubecMoveBetween(as(playerUid), { scope, from: ferryman, to: gmItems, store: quietStore, move })).rejects.toMatchObject({ code: 'permission-denied' })
    expect(await lubecMoveBetween(as(campaignGmUid), { scope, from: ferryman, to: gmItems, store: quietStore, move })).toEqual({ ok: true })
    expect((await stored((db) => npcSheetRef(db, scope, 'ferryman')))?.lubec.gear.items).toEqual([])
    expect(await gmItem('anvil')).toMatchObject({ status: 'dropped', droppedByCharacterName: 'Ferryman' })
  })

  it('gives a dropped GM item: it lands in the backpack and leaves the tab, in one write', async () => {
    const result = await lubecMoveBetween(as(campaignGmUid), { scope, from: gmItems, to: wayne, store: quietStore, move: { itemId: 'tent-1' } })

    expect(result).toEqual({ ok: true })
    expect((await character('wayne'))?.lubec.gear.items.at(-1)).toEqual({
      id: 'tent-1', kind: 'thing', name: 'Tent', size: 4, qty: 1, weight: 'normal', note: '', carrier: 'backpack', pocket: 0,
    })
    expect(await gmItem('tent-1')).toBeUndefined()
  })

  it('writes neither record when the GM item it would make is refused', async () => {
    const forged = { ...droppedBy, userId: otherPlayerUid }
    const move = lubecMoveBetween(as(playerUid), { scope, from: wayne, to: gmItems, store: quietStore, move: { itemId: 'anvil', seen: { carrier: 'hands', slot: 0 }, droppedBy: forged } })

    await expect(move).rejects.toMatchObject({ code: 'permission-denied' })
    expect(itemIds(await character('wayne'))).toEqual(['anvil', 'flashlight'])
    expect(await gmItem('anvil')).toBeUndefined()
  })

  it('writes neither record when the player may not write the second one', async () => {
    const move = lubecMoveBetween(as(playerUid), {
      scope, from: wayne, to: stephen, store: quietStore,
      move: { itemId: 'flashlight', seen: { carrier: 'backpack', pocket: 0 }, dest: 'backpack' },
    })

    await expect(move).rejects.toMatchObject({ code: 'permission-denied' })
    expect(itemIds(await character('wayne'))).toEqual(['anvil', 'flashlight'])
    expect(itemIds(await character('stephen'))).toEqual([])
  })

  it('refuses a stale move and writes nothing', async () => {
    const result = await lubecMoveBetween(as(playerUid), {
      scope, from: wayne, to: gmItems, store: quietStore, move: { itemId: 'anvil', seen: { carrier: 'body', slot: 0 }, droppedBy },
    })

    expect(result).toEqual({ ok: false, msg: LUBEC_STALE_MOVE })
    expect(itemIds(await character('wayne'))).toEqual(['anvil', 'flashlight'])
    expect(await gmItem('anvil')).toBeUndefined()
  })

  it('lets only one of two moves into one backpack at once land; the other is refused for room', async () => {
    const give = (uid: string, itemId: string) => lubecMoveBetween(as(uid), { scope, from: gmItems, to: wayne, store: quietStore, move: { itemId } })

    const results = await Promise.all([give(adminUid, 'tent-1'), give(campaignGmUid, 'tent-2')])

    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, msg: LUBEC_NO_ROOM_TO_ACCEPT }])
    const tents = itemIds(await character('wayne')).filter((id) => id.startsWith('tent'))
    expect(tents).toHaveLength(1)
    const [landed, refused] = tents[0] === 'tent-1' ? ['tent-1', 'tent-2'] : ['tent-2', 'tent-1']
    expect(await gmItem(landed)).toBeUndefined()
    expect(await gmItem(refused)).toMatchObject({ status: 'dropped' })
  })

  it('sends the store\'s waiting save first, so the save cannot land on top of the move', async () => {
    const db = as(playerUid)
    // The page's copy: Stress ticked up, gear as it was before the move.
    const local = sheet('wayne', playerUid, [anvil, flashlight]).lubec
    const store = storeHoldingASave(db, 'wayne', { ...local, counters: { ...local.counters, stress: 3 } })

    const result = await lubecMoveBetween(db, { scope, from: wayne, to: gmItems, store, move: { itemId: 'anvil', seen: { carrier: 'hands', slot: 0 }, droppedBy } })
    expect(result).toEqual({ ok: true })
    expect(store.hasPendingWrite('wayne')).toBe(false)
    // Past the moment the held save would have landed on its own.
    await wait(700)

    const after = await character('wayne')
    expect(itemIds(after)).toEqual(['flashlight'])
    expect(after?.lubec.counters.stress).toBe(3)
    expect(await gmItem('anvil')).toMatchObject({ status: 'dropped' })
  })

  it('resolves only once a listener on the sheet, as the store keeps, has the move', async () => {
    const db = as(playerUid)
    let seen: string[] = []
    const stop = onSnapshot(campaignDocRef(db, scope, 'characters', 'wayne'), (snap) => {
      seen = itemIds(snap.data())
    })

    await lubecMoveBetween(db, { scope, from: wayne, to: gmItems, store: quietStore, move: { itemId: 'anvil', seen: { carrier: 'hands', slot: 0 }, droppedBy } })
    stop()

    expect(seen).toEqual(['flashlight'])
  })

  it('refuses a move whose two records are one', async () => {
    await expect(lubecMoveBetween(as(playerUid), { scope, from: wayne, to: wayne, store: quietStore, move: { itemId: 'anvil', dest: 'body' } }))
      .rejects.toThrow('A move between records needs two records.')
  })
})
