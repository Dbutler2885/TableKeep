/**
 * The GM Items tab's rules (spec 4.5), against the real `firestore.rules`: a
 * member reads library items only and must filter a list by status, creates
 * only a dropped item naming themselves, and only the GM changes or removes one.
 * Both kinds of GM count: a group admin, and the campaign's `gmUserId`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where, type Firestore } from 'firebase/firestore'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { campaignGmItemRef, campaignGmItemsRef } from '../../campaign/firestorePaths'
import { emulatorPort } from '../../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../../vitest.firestoreRules'

const projectId = 'homeboyshouse-lubec-gm-items-tests'
const scope = { groupId: 'gm-items-group', campaignId: 'gm-items-campaign' }
const adminUid = 'gm-items-admin'
const campaignGmUid = 'gm-items-campaign-gm'
const playerUid = 'gm-items-player'
const outsiderUid = 'gm-items-outsider'

const rope = { id: 'rope', kind: 'thing', name: 'Rope', size: 1, qty: 1, weight: 'normal', note: '', status: 'library' }
const crowbar = {
  id: 'crowbar', kind: 'thing', name: 'Crowbar', size: 2, qty: 1, weight: 'normal', note: '',
  status: 'dropped', droppedByCharacterId: 'wayne', droppedByCharacterName: 'Wayne Gardner', droppedByUserId: playerUid, droppedFrom: 'hands',
}
const dropBy = (id: string, droppedByUserId: string) => ({ ...crowbar, id, droppedByUserId })

describe('the GM Items tab rules', () => {
  let testEnv: RulesTestEnvironment
  const as = (uid: string) => testEnv.authenticatedContext(uid).firestore() as unknown as Firestore
  const item = (db: Firestore, id: string) => campaignGmItemRef(db, scope, id)

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
      const members: [string, string][] = [[adminUid, 'admin'], [campaignGmUid, 'member'], [playerUid, 'member']]
      for (const [uid, role] of members) {
        await setDoc(doc(db, 'groups', scope.groupId, 'members', uid), { userId: uid, role, status: 'active' })
      }
      await setDoc(doc(db, 'groups', scope.groupId, 'campaigns', scope.campaignId), { createdBy: adminUid, gmUserId: campaignGmUid, system: 'lubec' })
      await setDoc(item(db, 'rope'), rope)
      await setDoc(item(db, 'crowbar'), crowbar)
    })
  })

  describe('a member', () => {
    it('reads a library item and not a dropped one', async () => {
      const db = as(playerUid)

      await assertSucceeds(getDoc(item(db, 'rope')))
      await assertFails(getDoc(item(db, 'crowbar')))
    })

    it('lists the library with the status filter, and is denied a list without it', async () => {
      const db = as(playerUid)

      const library = await assertSucceeds(getDocs(query(campaignGmItemsRef(db, scope), where('status', '==', 'library'))))
      expect(library.docs.map((d) => d.id)).toEqual(['rope'])
      await assertFails(getDocs(campaignGmItemsRef(db, scope)))
      await assertFails(getDocs(query(campaignGmItemsRef(db, scope), where('status', '==', 'dropped'))))
    })

    it('creates a dropped item naming themselves, and nothing else', async () => {
      const db = as(playerUid)

      await assertSucceeds(setDoc(item(db, 'mine'), dropBy('mine', playerUid)))
      await assertFails(setDoc(item(db, 'forged'), dropBy('forged', campaignGmUid)))
      await assertFails(setDoc(item(db, 'unsigned'), { ...rope, id: 'unsigned', status: 'dropped' }))
      await assertFails(setDoc(item(db, 'lantern'), { ...rope, id: 'lantern' }))
    })

    it('cannot change or remove an item, even one they dropped', async () => {
      const db = as(playerUid)

      await assertFails(updateDoc(item(db, 'rope'), { name: 'Frayed rope' }))
      await assertFails(updateDoc(item(db, 'crowbar'), { status: 'library' }))
      await assertFails(deleteDoc(item(db, 'crowbar')))
      await assertFails(deleteDoc(item(db, 'rope')))
    })
  })

  describe('someone outside the group', () => {
    it('reads nothing and creates nothing', async () => {
      const db = as(outsiderUid)

      await assertFails(getDoc(item(db, 'rope')))
      await assertFails(getDocs(query(campaignGmItemsRef(db, scope), where('status', '==', 'library'))))
      await assertFails(setDoc(item(db, 'theirs'), dropBy('theirs', outsiderUid)))
    })
  })

  describe.each([['a group admin', adminUid], ['the campaign\'s GM who is not an admin', campaignGmUid]])('the GM, as %s', (_label, gmUid) => {
    it('reads and lists every item, library and dropped', async () => {
      const db = as(gmUid)

      await assertSucceeds(getDoc(item(db, 'crowbar')))
      const all = await assertSucceeds(getDocs(campaignGmItemsRef(db, scope)))
      expect(all.docs.map((d) => d.id).sort()).toEqual(['crowbar', 'rope'])
    })

    it('creates a library item, changes items and removes them', async () => {
      const db = as(gmUid)

      await assertSucceeds(setDoc(item(db, 'lantern'), { ...rope, id: 'lantern' }))
      await assertSucceeds(updateDoc(item(db, 'crowbar'), { status: 'library', droppedFrom: null }))
      await assertSucceeds(deleteDoc(item(db, 'rope')))
    })
  })
})
