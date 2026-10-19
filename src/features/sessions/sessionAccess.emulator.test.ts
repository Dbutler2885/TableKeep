/**
 * Who may read a recorded session, proved against the real rules in the
 * emulators: the database rules for the session and everything under it, and
 * the storage rules for its audio, each on its own.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { deleteObject, getBytes, ref, uploadString } from 'firebase/storage'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { emulatorPort } from '../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../vitest.firestoreRules'

// Storage rules look membership up in the emulator's own project, so this has to be that project.
const projectId = process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev'
const groupId = 'session-access-group'
const otherGroupId = 'session-access-other-group'
const campaignId = 'campaign-1'
const sessionId = 'session-1'

const base = `groups/${groupId}/campaigns/${campaignId}/sessions/${sessionId}`
const audioPath = `${base}/audio/111/111-000-000000048000.ogg`
const transcriptPath = `${base}/transcript.txt`
/** The session and one document of each kind beneath it. */
const documents = [
  base,
  `${base}/speakers/111`,
  `${base}/segments/111-000-000000048000`,
  `${base}/gaps/000000096000`,
  `${base}/markers/000000144000-111`,
  `${base}/transcripts/live/utterances/111-000000048000`,
  `${base}/transcripts/live/checkpoints/111`,
]

const people = {
  'the GM': 'gm-user',
  'a player in the group': 'player-user',
} as const
const outsiders = {
  'someone in no group': 'stranger-user',
  'someone removed from the group': 'removed-user',
  'a member of a different group': 'other-group-user',
} as const

describe('reading a recorded session', () => {
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: {
        host: '127.0.0.1',
        port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080),
        rules: firestoreRules(),
      },
      storage: {
        host: '127.0.0.1',
        port: emulatorPort('FIREBASE_STORAGE_EMULATOR_HOST', 9199),
        rules: readFileSync(resolve(process.cwd(), 'storage.rules'), 'utf8'),
      },
    })
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore()
      await setDoc(doc(adminDb, 'groups', groupId, 'members', 'gm-user'), { status: 'active', role: 'admin' })
      await setDoc(doc(adminDb, 'groups', groupId, 'members', 'player-user'), { status: 'active', role: 'member' })
      await setDoc(doc(adminDb, 'groups', groupId, 'members', 'removed-user'), { status: 'removed', role: 'member' })
      await setDoc(doc(adminDb, 'groups', otherGroupId, 'members', 'other-group-user'), { status: 'active', role: 'admin' })
      await setDoc(doc(adminDb, 'groups', groupId, 'campaigns', campaignId), { gmUserId: 'gm-user' })
      for (const path of documents) await setDoc(doc(adminDb, path), { number: 1, text: 'We open the door.' })
      await uploadString(ref(context.storage(), audioPath), 'audio', 'raw', { contentType: 'audio/ogg' })
      await uploadString(ref(context.storage(), transcriptPath), '[00:01] Jem: We open the door.', 'raw', { contentType: 'text/plain' })
    })
  })

  afterAll(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      for (const path of documents) await deleteDoc(doc(context.firestore(), path))
      await deleteObject(ref(context.storage(), audioPath))
      await deleteObject(ref(context.storage(), transcriptPath))
    })
    await testEnv.cleanup()
  })

  it.each(Object.entries(people))('%s can read the session, its transcript, its notes and its audio', async (_, uid) => {
    const context = testEnv.authenticatedContext(uid)
    for (const path of documents) await assertSucceeds(getDoc(doc(context.firestore(), path)))
    await assertSucceeds(getDocs(collection(context.firestore(), `groups/${groupId}/campaigns/${campaignId}/sessions`)))
    await assertSucceeds(getDocs(collection(context.firestore(), `${base}/transcripts/live/utterances`)))
    await assertSucceeds(getBytes(ref(context.storage(), audioPath)))
    await assertSucceeds(getBytes(ref(context.storage(), transcriptPath)))
  })

  it.each(Object.entries(outsiders))('%s can read none of it', async (_, uid) => {
    const context = testEnv.authenticatedContext(uid)
    for (const path of documents) await assertFails(getDoc(doc(context.firestore(), path)))
    await assertFails(getDocs(collection(context.firestore(), `groups/${groupId}/campaigns/${campaignId}/sessions`)))
    await assertFails(getDocs(collection(context.firestore(), `${base}/transcripts/live/utterances`)))
  })

  it.each(Object.entries(outsiders))('%s is refused the audio by the storage rules themselves', async (_, uid) => {
    const storage = testEnv.authenticatedContext(uid).storage()
    await assertFails(getBytes(ref(storage, audioPath)))
    await assertFails(getBytes(ref(storage, transcriptPath)))
  })

  it('someone not signed in can read none of it', async () => {
    const context = testEnv.unauthenticatedContext()
    await assertFails(getDoc(doc(context.firestore(), base)))
    await assertFails(getBytes(ref(context.storage(), audioPath)))
  })

  it('nobody can create, change or delete a session or anything in it, the GM included', async () => {
    const context = testEnv.authenticatedContext('gm-user')
    for (const path of documents) {
      await assertFails(updateDoc(doc(context.firestore(), path), { text: 'Something else was said.' }))
      await assertFails(deleteDoc(doc(context.firestore(), path)))
    }
    await assertFails(setDoc(doc(context.firestore(), `groups/${groupId}/campaigns/${campaignId}/sessions/forged`), { number: 2 }))
    await assertFails(setDoc(doc(context.firestore(), `${base}/markers/forged`), { text: 'forged' }))
    await assertFails(setDoc(doc(context.firestore(), `${base}/transcripts/live/utterances/forged`), { text: 'forged' }))
    await assertFails(uploadString(ref(context.storage(), audioPath), 'other audio', 'raw', { contentType: 'audio/ogg' }))
    await assertFails(uploadString(ref(context.storage(), `${base}/audio/111/forged.ogg`), 'forged', 'raw', { contentType: 'audio/ogg' }))
    await assertFails(deleteObject(ref(context.storage(), audioPath)))
  })
})
