import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, or, query, setDoc, updateDoc, where } from 'firebase/firestore'
import { getBytes, ref, uploadBytes } from 'firebase/storage'
import { emulatorPort } from '../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../vitest.firestoreRules'

const root = 'groups/handout-group/campaigns/handout-campaign'
const projectId = process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev'
const makeHandout = (visibility: string, viewerUids: string[] = []) => ({
  title: 'An old letter', kind: 'text', text: 'Meet at the lighthouse.', folderId: '',
  storagePath: '', fileName: '', visibility, viewerUids, characterIds: ['mirelda'], gmUserId: 'gm',
})

let env: RulesTestEnvironment
const dbFor = (uid: string) => env.authenticatedContext(uid).firestore()
const record = (uid: string, id: string) => doc(dbFor(uid), `${root}/handouts/${id}`)
const bytes = new Uint8Array([1, 2, 3])
const file = (uid: string, id: string) => ref(env.authenticatedContext(uid).storage(), `${root}/handouts/${id}/letter.pdf`)

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080), rules: firestoreRules() },
    storage: { host: '127.0.0.1', port: emulatorPort('FIREBASE_STORAGE_EMULATOR_HOST', 9199), rules: readFileSync('storage.rules', 'utf8') },
  })
  await env.clearFirestore()
  await env.clearStorage()
  await env.withSecurityRulesDisabled(async (admin) => {
    for (const uid of ['gm', 'alice', 'bob', 'removed', 'admin']) {
      await setDoc(doc(admin.firestore(), `groups/handout-group/members/${uid}`), {
        userId: uid, role: uid === 'admin' ? 'admin' : 'member', status: uid === 'removed' ? 'inactive' : 'active',
      })
    }
    await setDoc(doc(admin.firestore(), root), { gmUserId: 'gm' })
    for (const [id, visibility, viewers] of [['hidden', 'hidden', []], ['all', 'all', []], ['alice-only', 'some', ['alice', 'removed']]] as const) {
      await setDoc(doc(admin.firestore(), `${root}/handouts/${id}`), makeHandout(visibility, [...viewers]))
      await uploadBytes(ref(admin.storage(), `${root}/handouts/${id}/letter.pdf`), bytes, { contentType: 'application/pdf' })
    }
  })
}, 30000)
afterAll(async () => { await env?.cleanup() })

describe('handout visibility in Firestore and Storage', () => {
  it.each(['alice', 'bob', 'outsider', 'removed'])('denies %s a hidden handout and its bytes', async (uid) => {
    await assertFails(getDoc(record(uid, 'hidden')))
    await assertFails(getBytes(file(uid, 'hidden')))
  })
  it('denies another character owner the selected handout and its bytes', async () => {
    await assertFails(getDoc(record('bob', 'alice-only')))
    await assertFails(getBytes(file('bob', 'alice-only')))
  })
  it('lets the chosen owner read the handout and bytes', async () => {
    await assertSucceeds(getDoc(record('alice', 'alice-only')))
    await assertSucceeds(getBytes(file('alice', 'alice-only')))
  })
  it('keeps live membership checks even for a saved viewer grant', async () => {
    await assertFails(getDoc(record('removed', 'alice-only')))
    await assertFails(getBytes(file('removed', 'alice-only')))
  })
  it.each(['alice', 'bob'])('lets active member %s read an all-players handout', async (uid) => {
    await assertSucceeds(getDoc(record(uid, 'all')))
    await assertSucceeds(getBytes(file(uid, 'all')))
  })
  it.each(['removed', 'outsider'])('denies %s even an all-players handout', async (uid) => {
    await assertFails(getDoc(record(uid, 'all')))
    await assertFails(getBytes(file(uid, 'all')))
  })
  it.each(['gm', 'admin'])('lets %s read hidden content, including a GM who is not an admin', async (uid) => {
    await assertSucceeds(getDoc(record(uid, 'hidden')))
    await assertSucceeds(getBytes(file(uid, 'hidden')))
  })
  it('supports the exact player subscription and rejects an unrestricted list', async () => {
    const all = collection(dbFor('alice'), `${root}/handouts`)
    const result = await assertSucceeds(getDocs(query(all, or(where('visibility', '==', 'all'), where('viewerUids', 'array-contains', 'alice')))))
    expect(result.docs.map((item) => item.id).sort()).toEqual(['alice-only', 'all'])
    await assertFails(getDocs(all))
  })
  it('revokes future reads when a handout is hidden again', async () => {
    await assertSucceeds(setDoc(record('gm', 'revoke'), makeHandout('some', ['alice'])))
    await assertSucceeds(uploadBytes(file('gm', 'revoke'), bytes, { contentType: 'application/pdf' }))
    await assertSucceeds(getBytes(file('alice', 'revoke')))
    await assertSucceeds(updateDoc(record('gm', 'revoke'), { visibility: 'hidden', viewerUids: [] }))
    await assertFails(getDoc(record('alice', 'revoke')))
    await assertFails(getBytes(file('alice', 'revoke')))
  })
  it('denies player edits, reveal attempts, folder writes, and uploads', async () => {
    await assertFails(updateDoc(record('alice', 'all'), { visibility: 'hidden' }))
    await assertFails(setDoc(record('alice', 'forged'), makeHandout('all')))
    await assertFails(setDoc(doc(dbFor('alice'), `${root}/handoutFolders/folder`), { name: 'Forged', parentId: '' }))
    await assertFails(uploadBytes(file('alice', 'all'), bytes, { contentType: 'application/pdf' }))
  })
  it('rejects hidden content with leftover viewers and a forged GM id', async () => {
    await assertFails(setDoc(record('gm', 'bad-hidden'), makeHandout('hidden', ['alice'])))
    await assertFails(setDoc(record('gm', 'bad-gm'), { ...makeHandout('all'), gmUserId: 'alice' }))
  })
  it('accepts nested GM folders and rejects a self-parent', async () => {
    const folder = doc(dbFor('gm'), `${root}/handoutFolders/parent`)
    await assertSucceeds(setDoc(folder, { name: 'Evidence', parentId: '' }))
    await assertSucceeds(setDoc(doc(dbFor('gm'), `${root}/handoutFolders/child`), { name: 'Letters', parentId: 'parent' }))
    await assertFails(updateDoc(folder, { parentId: 'parent' }))
  })
  it('limits uploaded content types', async () => {
    await assertFails(uploadBytes(file('gm', 'all'), bytes, { contentType: 'text/html' }))
  })
})
