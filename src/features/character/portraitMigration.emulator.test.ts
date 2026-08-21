/**
 * Verifies the post-state that `scripts/migrate_legacy_campaign_storage.py`
 * produces for the migrated OSE campaign ("The Black Wyrm of Brandonsford").
 *
 * Phase 1 of the migration (`scripts/migrate_legacy_campaign.py`) copied
 * Firestore documents verbatim into the group-scoped schema but never touched
 * Cloud Storage, leaving every migrated `portraitPath` / `customImagePath`
 * pointing into the old flat `campaigns/{legacyCampaignId}/...` tree. Those
 * reads only still resolve because the legacy `campaigns/{legacyCampaignId}/
 * members/*` documents were never deleted - `storage.rules` gates the flat tree
 * on `isCampaignMember(legacyCampaignId)`.
 *
 * These tests seed the emulator with the shape the phase-2 dry run says it will
 * produce (media copied under `groups/{groupId}/campaigns/{campaignId}/...`,
 * pointers rewritten to match) and with the legacy campaign member documents
 * DELIBERATELY ABSENT, i.e. the world after the legacy data is finally pruned.
 * They assert that in that world players and GM keep full portrait/token access
 * through the new paths, while the old paths correctly go dark.
 *
 * Real production identifiers are used so the seeded documents match the live
 * data byte for byte.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { getBytes, ref, uploadString } from 'firebase/storage'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'

// Storage Rules resolve their `firestore.get()` lookups against the emulator's
// own project, so this has to match the project the suite runs under
// (`.firebaserc`'s default, exported as GCLOUD_PROJECT by `firebase emulators:exec`).
// Under a mismatched id every firestore.get()-gated rule reads an empty database
// and denies, which looks exactly like a rules bug.
const projectId = process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev'

// Live identifiers from the migrated campaign.
const legacyCampaignId = '237sg5HxL39dgZbZg9pQ'
const groupId = 'nCNPq08BwD5dR7wAiONG'
const campaignId = 'S9OsX5rbdBthdhh49LIW'
const chevId = 'ae4e6491-e684-41a0-9914-80818ed16982'
const bogId = '0eae98a8-5358-425c-9c1e-1a9bbb5f5ecf'
const gmUid = '1vpfR7r1gOQ7eizSSYOGgyK9USy2'          // Dbutler, campaign GM / group admin
const wolfmanUid = 'AvTfwKLu55QCksnkxGtZzFHdFTF2'     // owns Chev Chelios
const poooooUid = 'KQCQCvUFhhXrq5RJX3ICYhCbgWF2'      // owns Bog; another group member
const outsiderUid = 'not-in-this-group'

const legacyTree = `campaigns/${legacyCampaignId}`
const newTree = `groups/${groupId}/campaigns/${campaignId}`

// Exactly the source -> destination pairs the phase-2 dry run reports for these
// two characters.
const chevPortrait = {
  legacy: `${legacyTree}/characters/${chevId}/portraits/1779926200704-ChevChelios2.webp`,
  migrated: `${newTree}/characters/${chevId}/portraits/1779926200704-ChevChelios2.webp`,
}
const chevTokenIcon = {
  legacy: `${legacyTree}/characters/${chevId}/token-icons/1779926219087-ChevChelios2.webp`,
  migrated: `${newTree}/characters/${chevId}/token-icons/1779926219087-ChevChelios2.webp`,
}
const bogPortrait = {
  legacy: `${legacyTree}/characters/${bogId}/portraits/1779929704629-Bog.webp`,
  migrated: `${newTree}/characters/${bogId}/portraits/1779929704629-Bog.webp`,
}

const replacementPortrait = `${newTree}/characters/${chevId}/portraits/1790000000000-replacement.webp`

const character = (name: string, ownerUserId: string, portraitPath: string, customImagePath: string) => ({
  name,
  ownerUserId,
  portraitPath,
  portraitUrl: null,
  portraitFocusX: 50,
  portraitFocusY: 50,
  tokenIcon: { icon: 'custom', color: '#bf2f2a', size: 34, customImagePath, customImageName: name },
})

describe('migrated campaign portraits after the storage migration', () => {
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: {
        host: '127.0.0.1',
        port: 8080,
        rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
      },
      storage: {
        host: '127.0.0.1',
        port: 9199,
        rules: readFileSync(resolve(process.cwd(), 'storage.rules'), 'utf8'),
      },
    })
    await testEnv.clearFirestore()
    await testEnv.clearStorage()

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore()
      const adminStorage = context.storage()

      // Group membership as `migrate_legacy_campaign.py` left it. Note there is
      // deliberately NO `campaigns/{legacyCampaignId}/members/*` document here:
      // this is the world after the legacy campaign data has been pruned.
      await setDoc(doc(adminDb, 'groups', groupId, 'members', gmUid), {
        userId: gmUid, status: 'active', role: 'admin',
      })
      await setDoc(doc(adminDb, 'groups', groupId, 'members', wolfmanUid), {
        userId: wolfmanUid, status: 'active', role: 'member',
      })
      await setDoc(doc(adminDb, 'groups', groupId, 'members', poooooUid), {
        userId: poooooUid, status: 'active', role: 'member',
      })
      await setDoc(doc(adminDb, 'groups', groupId, 'campaigns', campaignId), {
        name: 'The Black Wyrm of Brandonsford', gmUserId: gmUid,
      })

      // Characters as the phase-2 migration leaves them: pointers into the new
      // tree, including Chev Chelios's restored portrait.
      await setDoc(
        doc(adminDb, 'groups', groupId, 'campaigns', campaignId, 'characters', chevId),
        character('Chev Chelios', wolfmanUid, chevPortrait.migrated, chevTokenIcon.migrated),
      )
      await setDoc(
        doc(adminDb, 'groups', groupId, 'campaigns', campaignId, 'characters', bogId),
        character('Bog', poooooUid, bogPortrait.migrated, `${newTree}/characters/${bogId}/token-icons/1779930623714-359761.png`),
      )

      // Media copied to the new tree, with the legacy objects still in place -
      // the migration is additive and never deletes the originals.
      for (const pair of [chevPortrait, chevTokenIcon, bogPortrait]) {
        for (const path of [pair.legacy, pair.migrated]) {
          await uploadString(ref(adminStorage, path), 'webp-bytes', 'raw', { contentType: 'image/webp' })
        }
      }
    })
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  describe('reads no longer depend on the legacy campaign data', () => {
    it('lets the owning player read their own restored portrait at the new path', async () => {
      const storage = testEnv.authenticatedContext(wolfmanUid).storage()
      await assertSucceeds(getBytes(ref(storage, chevPortrait.migrated)))
      await assertSucceeds(getBytes(ref(storage, chevTokenIcon.migrated)))
    })

    it('lets every other group member read that portrait too', async () => {
      for (const uid of [gmUid, poooooUid]) {
        const storage = testEnv.authenticatedContext(uid).storage()
        await assertSucceeds(getBytes(ref(storage, chevPortrait.migrated)))
      }
    })

    it('lets a player read another player character portrait at the new path', async () => {
      const storage = testEnv.authenticatedContext(wolfmanUid).storage()
      await assertSucceeds(getBytes(ref(storage, bogPortrait.migrated)))
    })

    it('shows why the migration was needed: the legacy path lives or dies with the legacy member doc', async () => {
      const storage = testEnv.authenticatedContext(wolfmanUid).storage()

      // The legacy object is still sitting in the bucket, and while the
      // superseded `campaigns/{legacyCampaignId}/members/{uid}` document exists
      // it reads fine - this is what masks the problem in production today.
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(
          doc(context.firestore(), 'campaigns', legacyCampaignId, 'members', wolfmanUid),
          { userId: wolfmanUid, status: 'active', role: 'player' },
        )
      })
      await assertSucceeds(getBytes(ref(storage, chevPortrait.legacy)))

      // Prune that one document - the thing phase 1 advertised as safe to delete -
      // and the very same object goes dark for the very same signed-in player,
      // because `storage.rules` gates the flat tree on isCampaignMember(legacyCampaignId).
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await deleteDoc(doc(context.firestore(), 'campaigns', legacyCampaignId, 'members', wolfmanUid))
      })
      await assertFails(getBytes(ref(storage, chevPortrait.legacy)))
      await assertFails(getBytes(ref(storage, bogPortrait.legacy)))

      // The migrated copy is unaffected, which is the whole point of phase 2.
      await assertSucceeds(getBytes(ref(storage, chevPortrait.migrated)))
    })

    it('still keeps portraits away from people outside the group', async () => {
      const storage = testEnv.authenticatedContext(outsiderUid).storage()
      await assertFails(getBytes(ref(storage, chevPortrait.migrated)))
    })
  })

  describe('the rewritten pointers are readable and writable by the app', () => {
    it('lets a player read the rewritten character document', async () => {
      const db = testEnv.authenticatedContext(wolfmanUid).firestore()
      await assertSucceeds(getDoc(doc(db, 'groups', groupId, 'campaigns', campaignId, 'characters', chevId)))
    })

    it('lets the owning player replace a portrait end to end at the new path', async () => {
      const storage = testEnv.authenticatedContext(wolfmanUid).storage()
      const db = testEnv.authenticatedContext(wolfmanUid).firestore()
      const characterRef = doc(db, 'groups', groupId, 'campaigns', campaignId, 'characters', chevId)

      // The EntityMediaEditor sequence: clear the pointer, upload the new file,
      // then persist the new pointer.
      await assertSucceeds(updateDoc(characterRef, { portraitPath: '' }))
      await assertSucceeds(uploadString(ref(storage, replacementPortrait), 'new-bytes', 'raw', { contentType: 'image/webp' }))
      await assertSucceeds(updateDoc(characterRef, { portraitPath: replacementPortrait }))
      await assertSucceeds(getBytes(ref(storage, replacementPortrait)))

      // Leave the seeded state as the migration produced it for later tests.
      await assertSucceeds(updateDoc(characterRef, { portraitPath: chevPortrait.migrated }))
    })

    it('lets the owning player replace their token icon at the new path', async () => {
      const storage = testEnv.authenticatedContext(wolfmanUid).storage()
      const db = testEnv.authenticatedContext(wolfmanUid).firestore()
      const replacementIcon = `${newTree}/characters/${chevId}/token-icons/1790000000000-replacement.webp`
      await assertSucceeds(uploadString(ref(storage, replacementIcon), 'new-bytes', 'raw', { contentType: 'image/webp' }))
      await assertSucceeds(updateDoc(
        doc(db, 'groups', groupId, 'campaigns', campaignId, 'characters', chevId),
        { 'tokenIcon.customImagePath': replacementIcon },
      ))
    })

    it('lets the GM replace a player character portrait at the new path', async () => {
      const storage = testEnv.authenticatedContext(gmUid).storage()
      const db = testEnv.authenticatedContext(gmUid).firestore()
      const gmUpload = `${newTree}/characters/${bogId}/portraits/1790000000001-gm.webp`
      await assertSucceeds(uploadString(ref(storage, gmUpload), 'gm-bytes', 'raw', { contentType: 'image/webp' }))
      await assertSucceeds(updateDoc(
        doc(db, 'groups', groupId, 'campaigns', campaignId, 'characters', bogId),
        { portraitPath: gmUpload },
      ))
    })

    it('still blocks a non-owner player from writing someone else character media', async () => {
      const storage = testEnv.authenticatedContext(wolfmanUid).storage()
      const db = testEnv.authenticatedContext(wolfmanUid).firestore()
      const stolen = `${newTree}/characters/${bogId}/portraits/1790000000002-stolen.webp`
      await assertFails(uploadString(ref(storage, stolen), 'bytes', 'raw', { contentType: 'image/webp' }))
      await assertFails(updateDoc(
        doc(db, 'groups', groupId, 'campaigns', campaignId, 'characters', bogId),
        { portraitPath: stolen },
      ))
    })

    it('does not let the migration target be written by anyone outside the group', async () => {
      const storage = testEnv.authenticatedContext(outsiderUid).storage()
      await assertFails(uploadString(ref(storage, chevPortrait.migrated), 'bytes', 'raw', { contentType: 'image/webp' }))
    })
  })
})
