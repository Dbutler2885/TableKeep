import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { getBytes, getDownloadURL, ref, uploadString } from 'firebase/storage'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { uploadAuthorityMetadata, type UploadAuthority } from '../common/mediaStorage'
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
const portraitPath = `groups/${groupId}/campaigns/${campaignId}/characters/${characterId}/portraits/1700000000000-portrait.webp`
const visibleNpcPortraitPath = `groups/${groupId}/campaigns/${campaignId}/npcs/${visibleNpcId}/portraits/1700000000000-visible.webp`
const visibleNpcTokenPath = `groups/${groupId}/campaigns/${campaignId}/npcs/${visibleNpcId}/token-icons/1700000000000-visible.webp`
const hiddenNpcTokenPath = `groups/${groupId}/campaigns/${campaignId}/npcs/${hiddenNpcId}/token-icons/1700000000000-hidden.webp`
const captainNpcPortraitPath = `groups/${groupId}/campaigns/${campaignId}/npcs/${hiddenNpcId}/portraits/1700000000001-captain.webp`

describe('character and NPC media storage rules', () => {
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
      await setDoc(doc(adminDb, 'groups', groupId, 'members', 'other-user'), { status: 'active', role: 'member' })
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

  const upload = (uid: string, path: string, uploadAuthority?: UploadAuthority) =>
    uploadString(ref(testEnv.authenticatedContext(uid).storage(), path), 'data', 'raw', {
      contentType: 'image/webp',
      ...uploadAuthorityMetadata(uploadAuthority),
    })

  // Production Storage rules may read at most two Firestore documents per
  // request and the emulator does not enforce that, so these cases pin the
  // structure that keeps each check inside the limit: an owner or player is
  // admitted only through the branch their upload names, never through a
  // fallback after the (two-document) GM check.
  for (const [label, path] of [['token icon', tokenPath], ['portrait', portraitPath]] as const) {
    it(`lets the owning player upload their character ${label} when claiming ownership`, async () => {
      await assertSucceeds(upload(playerUid, path, 'owner'))
    })

    it(`holds an unclaimed ${label} upload to the GM check, even from the owner`, async () => {
      await assertFails(upload(playerUid, path))
    })

    it(`lets a group admin upload a character ${label}`, async () => {
      await assertSucceeds(upload(captainUid, path))
    })

    it(`lets a campaign GM who is not a group admin upload a character ${label}`, async () => {
      await assertSucceeds(upload(gmUid, path))
    })

    it(`blocks a GM from claiming ownership of a character ${label} they do not own`, async () => {
      await assertFails(upload(gmUid, path, 'owner'))
    })

    it(`blocks a non-owner member from uploading a character ${label}`, async () => {
      await assertFails(upload('other-user', path))
      await assertFails(upload('other-user', path, 'owner'))
    })
  }

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

  it('lets a player upload visible NPC portrait and token media when claiming the player branch', async () => {
    await assertSucceeds(upload(playerUid, visibleNpcPortraitPath, 'player'))
    await assertSucceeds(upload(playerUid, visibleNpcTokenPath, 'player'))
  })

  it('holds an unclaimed player NPC upload to the GM check', async () => {
    await assertFails(upload(playerUid, visibleNpcTokenPath))
  })

  it('blocks a player from uploading hidden NPC media', async () => {
    await assertFails(upload(playerUid, hiddenNpcTokenPath, 'player'))
  })

  it('lets the campaign GM upload hidden NPC media', async () => {
    await assertSucceeds(upload(gmUid, hiddenNpcTokenPath))
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
