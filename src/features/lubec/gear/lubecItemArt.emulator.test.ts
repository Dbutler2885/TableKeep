import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { doc, setDoc } from 'firebase/firestore'
import { getBytes, ref, uploadString } from 'firebase/storage'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { uploadAuthorityMetadata, type UploadAuthority } from '../../common/mediaStorage'
import { emulatorPort } from '../../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../../vitest.firestoreRules'

// Storage Rules resolve their `firestore.get()` lookups against the emulator's
// own project, so this has to match the project the suite runs under.
const projectId = process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev'
const groupId = 'item-art-group'
const campaignId = 'campaign-1'
const characterId = 'char-1'
const gmUid = 'gm-user'
const adminUid = 'admin-user'
const ownerUid = 'owner-user'
const otherUid = 'other-user'
const visitorUid = 'visitor-user'

const campaign = `groups/${groupId}/campaigns/${campaignId}`
const itemArt = `${campaign}/characters/${characterId}/item-art/1700000000000-mug.webp`
const libraryArt = `${campaign}/gmItems/item-1/item-art/1700000000000-mug.webp`

const VISITOR_LIMIT = 8 * 1024 * 1024

describe('item pictures in Storage', () => {
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: { host: 'localhost', port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080), rules: firestoreRules() },
      storage: { host: 'localhost', port: emulatorPort('FIREBASE_STORAGE_EMULATOR_HOST', 9199), rules: readFileSync(resolve(process.cwd(), 'storage.rules'), 'utf8') },
    })
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore()
      await setDoc(doc(adminDb, 'groups', groupId, 'members', gmUid), { status: 'active', role: 'member' })
      await setDoc(doc(adminDb, 'groups', groupId, 'members', adminUid), { status: 'active', role: 'admin' })
      await setDoc(doc(adminDb, 'groups', groupId, 'members', ownerUid), { status: 'active', role: 'member' })
      await setDoc(doc(adminDb, 'groups', groupId, 'members', otherUid), { status: 'active', role: 'member' })
      await setDoc(doc(adminDb, 'groups', groupId, 'members', visitorUid), { status: 'active', role: 'admin' })
      await setDoc(doc(adminDb, 'groups', groupId, 'campaigns', campaignId), { gmUserId: gmUid })
      await setDoc(doc(adminDb, 'groups', groupId, 'campaigns', campaignId, 'characters', characterId), { ownerUserId: ownerUid, name: 'Connor' })
      await context.storage().ref(itemArt).putString('data', 'raw', { contentType: 'image/webp' })
      await context.storage().ref(libraryArt).putString('data', 'raw', { contentType: 'image/webp' })
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

  const read = (uid: string, path: string) => getBytes(ref(testEnv.authenticatedContext(uid).storage(), path))

  const visitorUpload = (size: number) => {
    const visitor = testEnv.authenticatedContext(visitorUid, { firebase: { sign_in_provider: 'anonymous' } })
    return uploadString(ref(visitor.storage(), itemArt), 'x'.repeat(size), 'raw', { contentType: 'image/webp' })
  }

  // Production Storage rules may read at most two Firestore documents per request and the
  // emulator does not enforce that, so these pin the structure that keeps each check to two:
  // an owner is admitted only through the branch their upload names, never as a fallback after
  // the (two-document) GM check.
  it("lets the character's owner upload with the owner claim", async () => {
    await assertSucceeds(upload(ownerUid, itemArt, 'owner'))
  })

  it('denies another member, with the owner claim or without it', async () => {
    await assertFails(upload(otherUid, itemArt, 'owner'))
    await assertFails(upload(otherUid, itemArt))
  })

  it('holds an unclaimed upload by a non-GM to the GM check, even from the owner', async () => {
    await assertFails(upload(ownerUid, itemArt))
  })

  it('lets the GM upload unclaimed, as a group admin or as the campaign GM', async () => {
    await assertSucceeds(upload(adminUid, itemArt))
    await assertSucceeds(upload(gmUid, itemArt))
  })

  it('denies a GM who claims ownership of a character they do not own', async () => {
    await assertFails(upload(gmUid, itemArt, 'owner'))
  })

  it('lets any group member read a picture, and nobody outside the group', async () => {
    await assertSucceeds(read(otherUid, itemArt))
    await assertSucceeds(read(otherUid, libraryArt))
    await assertFails(read('stranger', itemArt))
    await assertFails(read('stranger', libraryArt))
  })

  it("lets the GM upload a campaign item's picture", async () => {
    await assertSucceeds(upload(adminUid, libraryArt))
    await assertSucceeds(upload(gmUid, libraryArt))
  })

  it("denies a player a campaign item's picture, whatever they claim", async () => {
    await assertFails(upload(ownerUid, libraryArt))
    await assertFails(upload(ownerUid, libraryArt, 'owner'))
  })

  it('caps one object from an anonymous visitor', async () => {
    await assertSucceeds(visitorUpload(16))
    await assertFails(visitorUpload(VISITOR_LIMIT))
  })
})
