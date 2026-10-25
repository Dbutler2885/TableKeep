/**
 * An NPC's Lubec sheet in `npcSheets/{npcId}`, through the real Firestore
 * rules: only the campaign's GM reads or writes it, whether or not the NPC is
 * shown to players. The documents are written through the production path
 * builder and the Lubec store's own serializer.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteDoc, doc, getDoc, setDoc, updateDoc, type Firestore } from 'firebase/firestore'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { npcSheetRef } from '../campaign/firestorePaths'
import { characterSchemaStamp } from '../ruleSets/characterSchemaStamp'
import { lubecCharacterStore } from '../ruleSets/lubec/characterParser'
import { makeLubecDirectEntryCharacter } from '../ruleSets/lubec/directEntry'
import { emulatorPort } from '../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../vitest.firestoreRules'

const projectId = process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev'
const groupId = 'npc-sheet-group'
const campaignId = 'npc-sheet-campaign'
const scope = { groupId, campaignId }
const adminUid = 'npc-sheet-admin'
const campaignGmUid = 'npc-sheet-campaign-gm'
const playerUid = 'npc-sheet-player'
const outsiderUid = 'npc-sheet-outsider'
const npcId = 'rene'

// What the store writes for a new sheet the GM makes for the NPC.
const sheetFields = (ownerUid: string) => ({
  ...lubecCharacterStore.parser.serialize(makeLubecDirectEntryCharacter(npcId, { userId: ownerUid, username: 'gamemaster' })),
  ...characterSchemaStamp(lubecCharacterStore.versioning),
})

const npcFields = (visibleToPlayers: boolean) => ({ name: 'Rene Dube', title: 'Lobsterman', visibleToPlayers, tags: [] })

const firestoreOf = (uid: string): Firestore => testEnv.authenticatedContext(uid).firestore()

let testEnv: RulesTestEnvironment

async function seed(write: (db: Firestore) => Promise<unknown>) {
  await testEnv.withSecurityRulesDisabled(async (context) => { await write(context.firestore()) })
}

async function setNpcVisible(visibleToPlayers: boolean) {
  await seed((db) => setDoc(doc(db, 'groups', groupId, 'campaigns', campaignId, 'npcs', npcId), npcFields(visibleToPlayers)))
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080), rules: firestoreRules() },
  })
})

afterAll(async () => testEnv.cleanup())

beforeEach(async () => {
  await testEnv.clearFirestore()
  await seed(async (db) => {
    await setDoc(doc(db, 'groups', groupId, 'members', adminUid), { userId: adminUid, status: 'active', role: 'admin' })
    await setDoc(doc(db, 'groups', groupId, 'members', campaignGmUid), { userId: campaignGmUid, status: 'active', role: 'member' })
    await setDoc(doc(db, 'groups', groupId, 'members', playerUid), { userId: playerUid, status: 'active', role: 'member' })
    await setDoc(doc(db, 'groups', groupId, 'campaigns', campaignId), { gmUserId: campaignGmUid, system: 'lubec' })
  })
  await setNpcVisible(false)
})

describe('npcSheets', () => {
  it('lets a group admin create, read, save and delete an NPC\'s sheet', async () => {
    const db = firestoreOf(adminUid)

    await assertSucceeds(setDoc(npcSheetRef(db, scope, npcId), sheetFields(adminUid)))
    const read = await assertSucceeds(getDoc(npcSheetRef(db, scope, npcId)))
    expect(read.data()).toMatchObject({ system: 'lubec', ownerUserId: adminUid, creationStatus: 'established_draft' })
    await assertSucceeds(setDoc(npcSheetRef(db, scope, npcId), { creationStatus: 'active' }, { merge: true }))
    await assertSucceeds(deleteDoc(npcSheetRef(db, scope, npcId)))
  })

  it('lets the campaign\'s GM who is not a group admin read and write it', async () => {
    const db = firestoreOf(campaignGmUid)

    await assertSucceeds(setDoc(npcSheetRef(db, scope, npcId), sheetFields(campaignGmUid)))
    await assertSucceeds(getDoc(npcSheetRef(db, scope, npcId)))
  })

  it('denies a member who is not the GM any read or write, even of a sheet naming them its owner', async () => {
    await seed((db) => setDoc(npcSheetRef(db, scope, npcId), sheetFields(adminUid)))
    const db = firestoreOf(playerUid)

    await assertFails(getDoc(npcSheetRef(db, scope, npcId)))
    await assertFails(updateDoc(npcSheetRef(db, scope, npcId), { name: 'Forged' }))
    await assertFails(deleteDoc(npcSheetRef(db, scope, npcId)))
    await assertFails(setDoc(npcSheetRef(db, scope, 'other-npc'), sheetFields(playerUid)))
  })

  it('denies someone outside the group', async () => {
    await seed((db) => setDoc(npcSheetRef(db, scope, npcId), sheetFields(adminUid)))

    await assertFails(getDoc(npcSheetRef(firestoreOf(outsiderUid), scope, npcId)))
    await assertFails(getDoc(npcSheetRef(testEnv.unauthenticatedContext().firestore(), scope, npcId)))
  })

  it('stays the GM\'s alone when the NPC is shown to players', async () => {
    await seed((db) => setDoc(npcSheetRef(db, scope, npcId), sheetFields(adminUid)))
    await setNpcVisible(true)
    const player = firestoreOf(playerUid)

    await assertSucceeds(getDoc(doc(player, 'groups', groupId, 'campaigns', campaignId, 'npcs', npcId)))
    await assertFails(getDoc(npcSheetRef(player, scope, npcId)))
    await assertFails(setDoc(npcSheetRef(player, scope, npcId), { name: 'Forged' }, { merge: true }))
    await assertSucceeds(getDoc(npcSheetRef(firestoreOf(adminUid), scope, npcId)))
  })
})
