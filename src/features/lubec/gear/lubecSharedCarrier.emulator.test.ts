/**
 * Shared carriers (spec 4.3) against the real `firestore.rules`: who may create,
 * change and delete one, and the moves between a sheet and a carrier as real
 * transactions, including two at once into the same pocket.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteDoc, doc, getDoc, setDoc, updateDoc, type DocumentData, type Firestore } from 'firebase/firestore'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { campaignDocRef, campaignGmItemRef, campaignSharedCarrierRef } from '../../campaign/firestorePaths'
import { LUBEC_STALE_MOVE } from '../../ruleSets/lubec/gear/containers'
import { lubecMoveBetween, type LubecMoveStore } from './lubecMoveTransaction'
import { lubecChangeSharedCarrier, lubecDeleteSharedCarrier, lubecEditSharedItems } from './lubecSharedCarrierWrites'
import { parseLubecSharedCarrier } from '../../ruleSets/lubec/gear/sharedCarrier'
import { emulatorPort } from '../../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../../vitest.firestoreRules'

const projectId = 'homeboyshouse-lubec-shared-carrier-tests'
const scope = { groupId: 'shared-group', campaignId: 'shared-campaign' }
const adminUid = 'shared-admin'
const campaignGmUid = 'shared-campaign-gm'
const ownerUid = 'shared-owner'
const memberUid = 'shared-member'
const outsiderUid = 'shared-outsider'

const T = (id: string, carrier: string, pocket: number, name: string) => ({ id, kind: 'thing', carrier, pocket, name, size: 1, qty: 1, weight: 'normal', note: '' })
const sheet = (id: string, ownerUserId: string, items: object[]) => ({
  id, system: 'lubec', name: id, ownerUserId, schemaVersion: 1,
  lubec: { counters: { stress: 2, minimumStress: 2, trauma: 0 }, gear: { items, carriers: [], overrides: [], supplies: [] } },
})
const skiff = (items: object[] = [T('rope', 'skiff', 0, 'Rope')]) => ({
  name: 'Skiff', type: 'skiff', pockets: [{ name: 'Hull', slots: 2, max: 2 }, { name: 'Locker', slots: 1, max: 1 }], ownerCharacterId: 'wayne', items,
})

const quietStore: LubecMoveStore = { sendSaveNow: () => {}, hasPendingWrite: () => false }
const shared = { kind: 'shared', carrierId: 'skiff' } as const
const character = (characterId: string) => ({ kind: 'character', characterId }) as const
const seenRope = { carrier: 'skiff', pocket: 0 }
const seenLamp = { carrier: 'backpack', pocket: 0 }

describe('a shared carrier', () => {
  let testEnv: RulesTestEnvironment
  const as = (uid: string) => testEnv.authenticatedContext(uid).firestore() as unknown as Firestore
  const carrierAs = (uid: string, id = 'skiff') => campaignSharedCarrierRef(as(uid), scope, id)

  const read = async (path: (db: Firestore) => ReturnType<typeof campaignDocRef>): Promise<DocumentData | undefined> => {
    let data: DocumentData | undefined
    await testEnv.withSecurityRulesDisabled(async (context) => {
      data = (await getDoc(path(context.firestore() as unknown as Firestore))).data()
    })
    return data
  }
  const storedCarrier = () => read((db) => campaignSharedCarrierRef(db, scope, 'skiff'))
  const storedSheet = (id: string) => read((db) => campaignDocRef(db, scope, 'characters', id))
  const itemIds = (items: { id: string }[] | undefined) => items?.map((i) => i.id)

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
      const members: [string, string][] = [[adminUid, 'admin'], [campaignGmUid, 'member'], [ownerUid, 'member'], [memberUid, 'member']]
      for (const [uid, role] of members) {
        await setDoc(doc(db, 'groups', scope.groupId, 'members', uid), { userId: uid, role, status: 'active' })
      }
      await setDoc(doc(db, 'groups', scope.groupId, 'campaigns', scope.campaignId), { createdBy: adminUid, gmUserId: campaignGmUid, system: 'lubec' })
      await setDoc(campaignDocRef(db, scope, 'characters', 'wayne'), sheet('wayne', ownerUid, []))
      await setDoc(campaignDocRef(db, scope, 'characters', 'stephen'), sheet('stephen', memberUid, [T('lamp', 'backpack', 0, 'Lamp')]))
      await setDoc(campaignDocRef(db, scope, 'characters', 'gail'), sheet('gail', outsiderUid, []))
      await setDoc(campaignSharedCarrierRef(db, scope, 'skiff'), skiff())
    })
  })

  describe('the rules', () => {
    it('lets every member read it and nobody else', async () => {
      await assertSucceeds(getDoc(carrierAs(memberUid)))
      await assertFails(getDoc(carrierAs(outsiderUid)))
    })

    it('lets a member create one for a character they own, and not for someone else\'s', async () => {
      await assertSucceeds(setDoc(carrierAs(memberUid, 'dory'), { ...skiff([]), ownerCharacterId: 'stephen' }))
      await assertFails(setDoc(carrierAs(memberUid, 'punt'), { ...skiff([]), ownerCharacterId: 'wayne' }))
      await assertFails(setDoc(carrierAs(memberUid, 'nope'), { ...skiff([]), ownerCharacterId: 'nobody' }))
    })

    it('lets the GM, of either kind, create one for any character', async () => {
      await assertSucceeds(setDoc(carrierAs(adminUid, 'dory'), { ...skiff([]), ownerCharacterId: 'wayne' }))
      await assertSucceeds(setDoc(carrierAs(campaignGmUid, 'punt'), { ...skiff([]), ownerCharacterId: 'stephen' }))
    })

    it('refuses a character\'s owner who has left the group', async () => {
      await assertFails(setDoc(carrierAs(outsiderUid, 'dory'), { ...skiff([]), ownerCharacterId: 'gail' }))
    })

    it('lets any member change only the items', async () => {
      await assertSucceeds(updateDoc(carrierAs(memberUid), { items: [], updatedAt: new Date() }))
      await assertFails(updateDoc(carrierAs(memberUid), { name: 'Mine now' }))
      await assertFails(updateDoc(carrierAs(memberUid), { items: [], ownerCharacterId: 'stephen' }))
      await assertFails(updateDoc(carrierAs(outsiderUid), { items: [] }))
    })

    it('lets the owner\'s player and both kinds of GM change anything', async () => {
      await assertSucceeds(updateDoc(carrierAs(ownerUid), { name: 'Dory' }))
      await assertSucceeds(updateDoc(carrierAs(adminUid), { pockets: [] }))
      await assertSucceeds(updateDoc(carrierAs(campaignGmUid), { ownerCharacterId: 'stephen' }))
    })

    it('does not let a member delete it, and lets the owner\'s player', async () => {
      await assertFails(deleteDoc(carrierAs(memberUid)))
      await assertSucceeds(deleteDoc(carrierAs(ownerUid)))
    })

    it('lets the GM delete it', async () => {
      await assertSucceeds(deleteDoc(carrierAs(campaignGmUid)))
    })

    it('follows the character when the GM gives it to another player', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await updateDoc(campaignDocRef(context.firestore() as unknown as Firestore, scope, 'characters', 'wayne'), { ownerUserId: memberUid })
      })
      await assertSucceeds(updateDoc(carrierAs(memberUid), { name: 'Stephen\'s now' }))
      await assertFails(updateDoc(carrierAs(ownerUid), { name: 'Still mine' }))
    })
  })

  describe('moves', () => {
    const put = (uid: string, characterId: string, itemId: string, dest: string) => lubecMoveBetween(as(uid), {
      scope, from: character(characterId), to: shared, store: quietStore, move: { itemId, seen: seenLamp, dest },
    })

    it('lets a member who is not the owner put a thing in, writing both records', async () => {
      expect(await put(memberUid, 'stephen', 'lamp', 'skiff#1')).toEqual({ ok: true })

      expect((await storedCarrier())?.items).toMatchObject([{ id: 'rope' }, { id: 'lamp', carrier: 'skiff', pocket: 1 }])
      expect((await storedSheet('stephen'))?.lubec.gear.items).toEqual([])
      expect((await storedSheet('stephen'))?.lubec.counters).toEqual({ stress: 2, minimumStress: 2, trauma: 0 })
    })

    it('lets a member who is not the owner take a thing out into their own backpack', async () => {
      const result = await lubecMoveBetween(as(memberUid), { scope, from: shared, to: character('stephen'), store: quietStore, move: { itemId: 'rope', seen: seenRope, dest: 'backpack#0' } })

      expect(result).toEqual({ ok: true })
      expect((await storedCarrier())?.items).toEqual([])
      expect(itemIds((await storedSheet('stephen'))?.lubec.gear.items)).toEqual(['lamp', 'rope'])
    })

    it('refuses a player taking a thing into someone else\'s backpack, and nothing changes', async () => {
      await expect(lubecMoveBetween(as(memberUid), { scope, from: shared, to: character('wayne'), store: quietStore, move: { itemId: 'rope', seen: seenRope, dest: 'backpack#0' } })).rejects.toMatchObject({ code: 'permission-denied' })

      expect(itemIds((await storedCarrier())?.items)).toEqual(['rope'])
    })

    it('refuses a second member\'s stale move with the stale text', async () => {
      const take = (uid: string, characterId: string) => lubecMoveBetween(as(uid), { scope, from: shared, to: character(characterId), store: quietStore, move: { itemId: 'rope', seen: seenRope, dest: 'backpack#0' } })
      expect(await take(memberUid, 'stephen')).toEqual({ ok: true })

      expect(await take(ownerUid, 'wayne')).toEqual({ ok: false, msg: LUBEC_STALE_MOVE })
      expect((await storedSheet('wayne'))?.lubec.gear.items).toEqual([])
    })

    it('checks two moves at once against the carrier\'s real contents: one lands and the other is refused', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await updateDoc(campaignDocRef(context.firestore() as unknown as Firestore, scope, 'characters', 'wayne'), { 'lubec.gear.items': [T('oar', 'backpack', 0, 'Oar')] })
      })

      const results = await Promise.all([put(memberUid, 'stephen', 'lamp', 'skiff#1'), put(ownerUid, 'wayne', 'oar', 'skiff#1')])

      expect(results.filter((r) => r.ok)).toHaveLength(1)
      expect(results.filter((r) => !r.ok)).toHaveLength(1)
      expect((await storedCarrier())?.items).toHaveLength(2)
    })

    it('leaves a member free to drop a thing from it, naming themselves', async () => {
      const result = await lubecMoveBetween(as(memberUid), {
        scope, from: shared, to: { kind: 'gm-items' }, store: quietStore,
        move: { itemId: 'rope', seen: seenRope, droppedBy: { characterId: 'stephen', characterName: 'Stephen', userId: memberUid } },
      })

      expect(result).toEqual({ ok: true })
      expect(await read((db) => campaignGmItemRef(db, scope, 'rope'))).toMatchObject({ status: 'dropped', droppedFrom: 'Skiff', droppedByUserId: memberUid })
    })
  })

  describe('its own writes', () => {
    const asRead = async () => parseLubecSharedCarrier(await storedCarrier(), 'skiff')
    const dropper = (uid: string) => ({ characterId: 'wayne', characterName: 'Wayne', userId: uid })
    const records = (uid: string) => ({ db: as(uid), scope })

    it('lets a member change what is in it, and refuses a page that has an old copy', async () => {
      const seen = await asRead()
      expect(await lubecEditSharedItems(records(memberUid), seen, [])).toEqual({ ok: true })
      expect((await storedCarrier())?.items).toEqual([])

      expect(await lubecEditSharedItems(records(memberUid), seen, [])).toEqual({ ok: false, msg: LUBEC_STALE_MOVE })
    })

    it('checks a change of pockets against what is in it now', async () => {
      const draft = { type: 'skiff', name: 'Dory', pockets: [{ name: 'Hull', slots: 1, max: 1 }] }
      expect(await lubecChangeSharedCarrier(records(ownerUid), 'skiff', draft)).toEqual({ ok: true })
      expect(await storedCarrier()).toMatchObject({ name: 'Dory', pockets: draft.pockets, ownerCharacterId: 'wayne' })

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await updateDoc(campaignSharedCarrierRef(context.firestore() as unknown as Firestore, scope, 'skiff'), { items: [T('oar', 'skiff', 1, 'Oar')], pockets: skiff().pockets })
      })
      expect(await lubecChangeSharedCarrier(records(ownerUid), 'skiff', draft)).toEqual({ ok: false, msg: "Oar wouldn't fit. Take it out first." })
    })

    it('refuses a member who is not the owner', async () => {
      await expect(lubecChangeSharedCarrier(records(memberUid), 'skiff', { type: 'skiff', name: 'Mine', pockets: skiff().pockets })).rejects.toMatchObject({ code: 'permission-denied' })
    })

    it('sends the things in it to the GM Items tab when the owner\'s player deletes it, in one transaction', async () => {
      await lubecDeleteSharedCarrier(records(ownerUid), 'skiff', dropper(ownerUid))

      expect(await storedCarrier()).toBeUndefined()
      expect(await read((db) => campaignGmItemRef(db, scope, 'rope'))).toMatchObject({ status: 'dropped', droppedFrom: 'Skiff', droppedByUserId: ownerUid })
      expect(await read((db) => campaignGmItemRef(db, scope, 'rope'))).not.toHaveProperty('carrier')
    })

    it('writes nothing when a member tries to delete it', async () => {
      await expect(lubecDeleteSharedCarrier(records(memberUid), 'skiff', dropper(memberUid))).rejects.toMatchObject({ code: 'permission-denied' })

      expect(await storedCarrier()).toBeDefined()
      expect(await read((db) => campaignGmItemRef(db, scope, 'rope'))).toBeUndefined()
    })
  })
})
