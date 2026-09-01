import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { getBytes, getDownloadURL, ref, uploadString } from 'firebase/storage'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { emulatorPort } from '../../../vitest.emulatorEndpoint'

// Storage Rules resolve their `firestore.get()` lookups against the emulator's
// own project, so this has to match the project the suite runs under
// (`.firebaserc`'s default, exported as GCLOUD_PROJECT by `firebase emulators:exec`).
// Under a mismatched id every firestore.get()-gated rule reads an empty database
// and denies, which looks exactly like a rules bug.
const projectId = process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev'
const groupId = 'group-1'
const campaignId = 'campaign-1'
const characterId = 'char-1'
const visibleNpcId = 'npc-visible'
const hiddenNpcId = 'npc-hidden'
const gmUid = 'gm-user'
const captainUid = 'captain-user'
const playerUid = 'player-user'

const tokenPath = `groups/${groupId}/campaigns/${campaignId}/characters/${characterId}/token-icons/1700000000000-token.webp`
const captainCharacterPortraitPath = `groups/${groupId}/campaigns/${campaignId}/characters/${characterId}/portraits/1700000000001-captain.webp`
const visibleNpcPortraitPath = `groups/${groupId}/campaigns/${campaignId}/npcs/${visibleNpcId}/portraits/1700000000000-visible.webp`
const visibleNpcTokenPath = `groups/${groupId}/campaigns/${campaignId}/npcs/${visibleNpcId}/token-icons/1700000000000-visible.webp`
const hiddenNpcTokenPath = `groups/${groupId}/campaigns/${campaignId}/npcs/${hiddenNpcId}/token-icons/1700000000000-hidden.webp`
const captainNpcPortraitPath = `groups/${groupId}/campaigns/${campaignId}/npcs/${hiddenNpcId}/portraits/1700000000001-captain.webp`

describe('entity media storage rules', () => {
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: {
        host: 'localhost',
        port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080),
        rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
      },
      storage: {
        host: 'localhost',
        port: emulatorPort('FIREBASE_STORAGE_EMULATOR_HOST', 9199),
        rules: readFileSync(resolve(process.cwd(), 'storage.rules'), 'utf8'),
      },
    })

    // Seed the Firestore docs the storage rules read via firestore.get().
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore()
      await setDoc(doc(adminDb, 'groups', groupId, 'members', gmUid), { status: 'active', role: 'member' })
      await setDoc(doc(adminDb, 'groups', groupId, 'members', captainUid), { status: 'active', role: 'admin' })
      await setDoc(doc(adminDb, 'groups', groupId, 'members', playerUid), { status: 'active', role: 'member' })
      await setDoc(doc(adminDb, 'groups', groupId, 'campaigns', campaignId), { gmUserId: gmUid })
      await setDoc(doc(adminDb, 'groups', groupId, 'campaigns', campaignId, 'characters', characterId), {
        ownerUserId: playerUid,
        name: 'Connor',
      })
      await setDoc(doc(adminDb, 'groups', groupId, 'campaigns', campaignId, 'npcs', visibleNpcId), {
        name: 'Visible NPC',
        title: 'Contact',
        visibleToPlayers: true,
        tags: [],
        portraitPath: '',
        portraitFocusX: 50,
        portraitFocusY: 50,
        tokenIcon: { icon: 'pawn', color: '#2f5bbf', size: 34 },
        playerDescription: '',
        playerNotes: '',
      })
      await setDoc(doc(adminDb, 'groups', groupId, 'campaigns', campaignId, 'npcs', hiddenNpcId), {
        name: 'Hidden NPC',
        title: 'Secret',
        visibleToPlayers: false,
        tags: [],
        portraitPath: '',
        portraitFocusX: 50,
        portraitFocusY: 50,
        tokenIcon: { icon: 'pawn', color: '#2f5bbf', size: 34 },
        playerDescription: '',
        playerNotes: '',
      })
    })
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  it('lets the owning player upload their own character token icon', async () => {
    const storage = testEnv.authenticatedContext(playerUid).storage()
    await assertSucceeds(uploadString(ref(storage, tokenPath), 'data', 'raw', { contentType: 'image/webp' }))
  })

  it('lets the GM upload a character token icon', async () => {
    const storage = testEnv.authenticatedContext(gmUid).storage()
    await assertSucceeds(uploadString(ref(storage, tokenPath), 'data', 'raw', { contentType: 'image/webp' }))
  })

  it('keeps path-only captain character and NPC portraits readable after reload', async () => {
    const captainStorage = testEnv.authenticatedContext(captainUid).storage()
    const captainDb = testEnv.authenticatedContext(captainUid).firestore()

    await assertSucceeds(uploadString(ref(captainStorage, captainCharacterPortraitPath), 'character-bytes', 'raw', { contentType: 'image/webp' }))
    await assertSucceeds(uploadString(ref(captainStorage, captainNpcPortraitPath), 'npc-bytes', 'raw', { contentType: 'image/webp' }))

    const characterUrl = await getDownloadURL(ref(captainStorage, captainCharacterPortraitPath))
    const npcUrl = await getDownloadURL(ref(captainStorage, captainNpcPortraitPath))
    await assertSucceeds(setDoc(
      doc(captainDb, 'groups', groupId, 'campaigns', campaignId, 'characters', characterId),
      { portraitPath: captainCharacterPortraitPath },
      { merge: true },
    ))
    await assertSucceeds(setDoc(
      doc(captainDb, 'groups', groupId, 'campaigns', campaignId, 'npcs', hiddenNpcId),
      { portraitPath: captainNpcPortraitPath },
      { merge: true },
    ))

    const reloaded = testEnv.authenticatedContext(captainUid)
    const reloadedCharacter = await getDoc(doc(reloaded.firestore(), 'groups', groupId, 'campaigns', campaignId, 'characters', characterId))
    const reloadedNpc = await getDoc(doc(reloaded.firestore(), 'groups', groupId, 'campaigns', campaignId, 'npcs', hiddenNpcId))
    expect(reloadedCharacter.data()?.portraitUrl).toBeUndefined()
    expect(reloadedNpc.data()?.portraitUrl).toBeUndefined()
    expect(reloadedCharacter.data()?.portraitPath).toBe(captainCharacterPortraitPath)
    expect(reloadedNpc.data()?.portraitPath).toBe(captainNpcPortraitPath)
    await expect(getDownloadURL(ref(reloaded.storage(), captainCharacterPortraitPath))).resolves.toBe(characterUrl)
    await expect(getDownloadURL(ref(reloaded.storage(), captainNpcPortraitPath))).resolves.toBe(npcUrl)
    await assertSucceeds(getBytes(ref(reloaded.storage(), captainCharacterPortraitPath)))
    await assertSucceeds(getBytes(ref(reloaded.storage(), captainNpcPortraitPath)))
  })

  it('blocks a non-owner non-GM member from uploading', async () => {
    const storage = testEnv.authenticatedContext('other-user').storage()
    await assertFails(uploadString(ref(storage, tokenPath), 'data', 'raw', { contentType: 'image/webp' }))
  })

  it('lets a player upload visible NPC portrait and token media', async () => {
    const storage = testEnv.authenticatedContext(playerUid).storage()
    await assertSucceeds(uploadString(ref(storage, visibleNpcPortraitPath), 'data', 'raw', { contentType: 'image/webp' }))
    await assertSucceeds(uploadString(ref(storage, visibleNpcTokenPath), 'data', 'raw', { contentType: 'image/webp' }))
  })

  it('blocks a player from uploading hidden NPC media', async () => {
    const storage = testEnv.authenticatedContext(playerUid).storage()
    await assertFails(uploadString(ref(storage, hiddenNpcTokenPath), 'data', 'raw', { contentType: 'image/webp' }))
  })

  it('lets a player persist visible NPC media metadata', async () => {
    const db = testEnv.authenticatedContext(playerUid).firestore()
    const npcRef = doc(db, 'groups', groupId, 'campaigns', campaignId, 'npcs', visibleNpcId)
    await assertSucceeds(setDoc(npcRef, {
      portraitPath: visibleNpcPortraitPath,
      portraitFocusX: 42,
      portraitFocusY: 58,
      tokenIcon: {
        icon: 'custom',
        color: '#ffffff',
        size: 34,
        customImagePath: visibleNpcTokenPath,
        customImageName: 'visible',
      },
    }, { merge: true }))
  })

  it('blocks a player from persisting a bearer portrait URL', async () => {
    const db = testEnv.authenticatedContext(playerUid).firestore()
    const npcRef = doc(db, 'groups', groupId, 'campaigns', campaignId, 'npcs', visibleNpcId)
    await assertFails(setDoc(npcRef, {
      portraitUrl: 'https://firebasestorage.test/visible.webp?token=bearer',
    }, { merge: true }))
  })

  it('blocks a player media update that also changes NPC identity fields', async () => {
    const db = testEnv.authenticatedContext(playerUid).firestore()
    const npcRef = doc(db, 'groups', groupId, 'campaigns', campaignId, 'npcs', visibleNpcId)
    await assertFails(setDoc(npcRef, {
      name: 'Renamed NPC',
      portraitPath: visibleNpcPortraitPath,
    }, { merge: true }))
  })
})
