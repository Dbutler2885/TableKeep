/**
 * Hidden carriers against the real `firestore.rules` (spec 4.4 and 12.6): the
 * character's owner and the GM read and write one, and no other member can so
 * much as list them. The owner is read off the character when the rule runs,
 * so giving the character away (F8's write) hands them over. Moves in and out
 * go through the real transaction, and deleting the character takes its hidden
 * carriers with it and leaves their things in the GM's Items tab.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, type Firestore } from 'firebase/firestore'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { campaignDocRef, campaignGmItemRef, characterHiddenCarrierRef, characterHiddenCarriersRef } from '../../campaign/firestorePaths'
import { lubecCharacterVersioning } from '../../ruleSets/characterMigrations'
import { characterSchemaStamp } from '../../ruleSets/characterSchemaStamp'
import { LUBEC_STALE_MOVE } from '../../ruleSets/lubec/gear/containers'
import { parseLubecCarrierRecord, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecDeleteCharacterDroppingGear } from './lubecDeleteDrop'
import { lubecAddHiddenCarrier, lubecHiddenDrop, lubecMoveAcross, lubecSaveHiddenItems, type LubecGearHidden } from './lubecHiddenCarrierWrites'
import { emulatorPort } from '../../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../../vitest.firestoreRules'

const projectId = 'homeboyshouse-lubec-hidden-carrier-tests'
const scope = { groupId: 'hidden-group', campaignId: 'hidden-campaign' }
const adminUid = 'hidden-admin'
const campaignGmUid = 'hidden-campaign-gm'
const ownerUid = 'hidden-owner'
const otherUid = 'hidden-other'
const outsiderUid = 'hidden-outsider'

const flashlight = { id: 'flashlight', kind: 'thing', carrier: 'backpack', pocket: 0, name: 'Flashlight', size: 1, qty: 1, weight: 'normal', note: '' }
const letter = { id: 'letter', kind: 'thing', carrier: 'stash', pocket: 0, name: 'Letter', size: 1, qty: 1, weight: 'normal', note: '' }
const stash = { name: 'Cigar box', type: 'stash', pockets: [{ name: 'Box', slots: 2, max: 1 }], items: [letter] }

const sheet = (ownerUserId: string, items: object[]) => ({
  id: 'wayne', system: 'lubec', name: 'Wayne', ownerUserId, schemaVersion: 1,
  lubec: { counters: { stress: 2, minimumStress: 2, trauma: 0 }, gear: { items, carriers: [], overrides: [], supplies: [] } },
})

/** F8's write: what `usePlayerAssignment` saves, through the store's stamp. */
const givenTo = (ownerUserId: string) => ({
  ownerUserId, ownerUsername: ownerUserId, ...characterSchemaStamp(lubecCharacterVersioning), updatedAt: serverTimestamp(),
})

describe('hidden carriers', () => {
  let testEnv: RulesTestEnvironment
  const as = (uid: string) => testEnv.authenticatedContext(uid).firestore() as unknown as Firestore
  const carrier = (db: Firestore, id = 'stash') => characterHiddenCarrierRef(db, scope, 'wayne', id)
  const carriers = (db: Firestore) => characterHiddenCarriersRef(db, scope, 'wayne')
  const character = (db: Firestore) => campaignDocRef(db, scope, 'characters', 'wayne')

  const hiddenFor = (uid: string): LubecGearHidden => ({
    db: as(uid),
    scope,
    characterId: 'wayne',
    store: { updateCharacterNow: () => {}, hasPendingWrite: () => false },
    dropper: { characterId: 'wayne', characterName: 'Wayne', userId: uid },
  })

  const withoutRules = async <T>(read: (db: Firestore) => Promise<T>): Promise<T> => {
    let result: T | undefined
    await testEnv.withSecurityRulesDisabled(async (context) => {
      result = await read(context.firestore() as unknown as Firestore)
    })
    return result as T
  }
  const storedStash = async () => parseLubecCarrierRecord((await withoutRules((db) => getDoc(carrier(db)))).data(), 'stash')
  const storedGear = async () => (await withoutRules((db) => getDoc(character(db)))).data()?.lubec.gear

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
    await withoutRules(async (db) => {
      await setDoc(doc(db, 'groups', scope.groupId), { createdBy: adminUid })
      const members: [string, string][] = [[adminUid, 'admin'], [campaignGmUid, 'member'], [ownerUid, 'member'], [otherUid, 'member']]
      for (const [uid, role] of members) {
        await setDoc(doc(db, 'groups', scope.groupId, 'members', uid), { userId: uid, role, status: 'active' })
      }
      await setDoc(doc(db, 'groups', scope.groupId, 'campaigns', scope.campaignId), { createdBy: adminUid, gmUserId: campaignGmUid, system: 'lubec' })
      await setDoc(character(db), { ...sheet(ownerUid, [flashlight]), updatedAt: new Date(0) })
      await setDoc(carrier(db), stash)
    })
  })

  describe('who can read and write one', () => {
    it.each([['the owner', ownerUid], ['a group admin GM', adminUid], ['a GM who is the gmUserId but not an admin', campaignGmUid]])('%s reads, lists and writes', async (_who, uid) => {
      const db = as(uid)
      await assertSucceeds(getDoc(carrier(db)))
      expect((await assertSucceeds(getDocs(carriers(db)))).docs.map((d) => d.id)).toEqual(['stash'])
      await assertSucceeds(setDoc(carrier(db, 'second'), { name: 'Second', items: [] }))
      await assertSucceeds(updateDoc(carrier(db), { name: 'Renamed' }))
      await assertSucceeds(deleteDoc(carrier(db)))
    })

    it.each([['another member', otherUid], ['someone outside the group', outsiderUid]])('%s is denied a read, a list and a write', async (_who, uid) => {
      const db = as(uid)
      await assertFails(getDoc(carrier(db)))
      await assertFails(getDocs(carriers(db)))
      await assertFails(setDoc(carrier(db, 'second'), { name: 'Second', items: [] }))
      await assertFails(updateDoc(carrier(db), { name: 'Renamed' }))
      await assertFails(deleteDoc(carrier(db)))
    })

    it('still lets another member read the character, which says nothing of the carrier', async () => {
      const seen = await assertSucceeds(getDoc(character(as(otherUid))))
      expect(JSON.stringify(seen.data())).not.toContain('Cigar box')
    })

    it('follows the character when the GM gives it to another player', async () => {
      await assertSucceeds(updateDoc(character(as(adminUid)), givenTo(otherUid)))

      await assertSucceeds(getDoc(carrier(as(otherUid))))
      await assertSucceeds(getDocs(carriers(as(otherUid))))
      await assertSucceeds(updateDoc(carrier(as(otherUid)), { name: 'Renamed' }))
      await assertFails(getDoc(carrier(as(ownerUid))))
      await assertFails(getDocs(carriers(as(ownerUid))))
      await assertFails(updateDoc(carrier(as(ownerUid)), { name: 'Mine again' }))
    })
  })

  describe('writing one', () => {
    it('adds a carrier with no copy of its owner and nothing on the character', async () => {
      await lubecAddHiddenCarrier(hiddenFor(ownerUid), { id: 'tin', name: 'Tobacco tin', type: 'stash', pockets: [{ name: 'Box', slots: 2, max: 1 }] })

      const made = (await withoutRules((db) => getDoc(carrier(db, 'tin')))).data()
      expect(made).toMatchObject({ name: 'Tobacco tin', items: [] })
      expect(made).not.toHaveProperty('ownerUserId')
      expect(JSON.stringify(await storedGear())).not.toContain('Tobacco tin')
    })

    it('saves a change inside the carrier, and refuses one made from an out-of-date copy', async () => {
      const seen = await storedStash()
      const edited = [{ ...letter, note: 'Burn it.' }] as LubecItem[]
      expect(await lubecSaveHiddenItems(hiddenFor(ownerUid), seen, edited)).toEqual({ ok: true })
      expect((await storedStash()).items[0].note).toBe('Burn it.')

      expect(await lubecSaveHiddenItems(hiddenFor(adminUid), seen, [])).toEqual({ ok: false, msg: LUBEC_STALE_MOVE })
      expect((await storedStash()).items).toHaveLength(1)
    })
  })

  describe('moves in and out', () => {
    it('takes a thing from the character into the carrier, and the character keeps no trace of it', async () => {
      const seen = await storedStash()
      const moved = await lubecMoveAcross(hiddenFor(ownerUid), [seen], flashlight as LubecItem, 'stash#0')

      expect(moved).toMatchObject({ ok: true, item: { id: 'flashlight', carrier: 'stash', pocket: 0 } })
      expect((await storedStash()).items.map((i) => i.id)).toEqual(['letter', 'flashlight'])
      expect((await storedGear()).items).toEqual([])
    })

    it('takes a thing out onto the character, and the GM can do it too', async () => {
      const seen = await storedStash()
      const moved = await lubecMoveAcross(hiddenFor(campaignGmUid), [seen], letter as LubecItem, 'backpack#0')

      expect(moved).toMatchObject({ ok: true })
      expect((await storedStash()).items).toEqual([])
      expect((await storedGear()).items.map((i: { id: string }) => i.id)).toEqual(['flashlight', 'letter'])
    })

    it('moves a thing from one hidden carrier to another', async () => {
      await withoutRules((db) => setDoc(carrier(db, 'tin'), { name: 'Tin', type: 'stash', pockets: [{ name: 'Box', slots: 1, max: 1 }], items: [] }))
      const seen = [await storedStash(), parseLubecCarrierRecord({ name: 'Tin', pockets: [{ name: 'Box', slots: 1, max: 1 }] }, 'tin')]
      expect(await lubecMoveAcross(hiddenFor(ownerUid), seen, letter as LubecItem, 'tin#0')).toMatchObject({ ok: true })

      expect((await storedStash()).items).toEqual([])
      const tin = (await withoutRules((db) => getDoc(carrier(db, 'tin')))).data()
      expect(tin?.items).toMatchObject([{ id: 'letter', carrier: 'tin', pocket: 0 }])
    })

    it('writes neither record when another member tries it', async () => {
      const seen = await storedStash()
      await expect(lubecMoveAcross(hiddenFor(otherUid), [seen], letter as LubecItem, 'backpack#0')).rejects.toBeDefined()
      expect((await storedStash()).items).toHaveLength(1)
    })

    it('drops a thing to the GM with where it came from', async () => {
      expect(await lubecHiddenDrop(hiddenFor(ownerUid), 'stash')(letter as LubecItem)).toMatchObject({ ok: true })

      expect((await storedStash()).items).toEqual([])
      const dropped = (await withoutRules((db) => getDoc(campaignGmItemRef(db, scope, 'letter')))).data()
      expect(dropped).toMatchObject({ status: 'dropped', droppedFrom: 'Cigar box', droppedByUserId: ownerUid })
    })
  })

  describe('deleting the character', () => {
    it.each([['its owner', ownerUid], ['the GM', campaignGmUid]])('removes the hidden carriers and leaves their things with the GM, when %s does it', async (_who, uid) => {
      await lubecDeleteCharacterDroppingGear(as(uid), scope, { characterId: 'wayne', characterName: 'Wayne', userId: uid })

      expect((await withoutRules((db) => getDoc(character(db)))).exists()).toBe(false)
      expect((await withoutRules((db) => getDocs(carriers(db)))).empty).toBe(true)
      const dropped = (await withoutRules((db) => getDoc(campaignGmItemRef(db, scope, 'letter')))).data()
      expect(dropped).toMatchObject({ status: 'dropped', droppedFrom: 'Cigar box', droppedByCharacterName: 'Wayne' })
      expect((await withoutRules((db) => getDoc(campaignGmItemRef(db, scope, 'flashlight')))).exists()).toBe(true)
    })

    it('is refused for another member, and leaves everything', async () => {
      await expect(lubecDeleteCharacterDroppingGear(as(otherUid), scope, { characterId: 'wayne', characterName: 'Wayne', userId: otherUid })).rejects.toBeDefined()
      expect((await withoutRules((db) => getDocs(carriers(db)))).size).toBe(1)
    })
  })
})
