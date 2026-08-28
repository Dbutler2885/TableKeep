import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { ref, uploadString } from 'firebase/storage'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { entityMediaStoragePath } from '../common/mediaStorage'
import { npcDocWritePayload, npcMediaUploadParams, npcPrivateWritePayload, SCENE_NPC_WRITE_OPTIONS, sceneNpcDocSegments, sceneNpcPrivateDocSegments, toNpcGmNotes, toNpcRecord } from './lib/sceneNpcRecord'
import type { NpcRecord } from '../../types/app'
import { emulatorPort } from '../../../vitest.emulatorEndpoint'

const projectId = process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev'
const groupId = 'maps-npc-group'
const campaignId = 'maps-npc-campaign'
const gmUid = 'maps-npc-gm'
const playerUid = 'maps-npc-player'
const visibleNpcId = 'visible-npc'
const hiddenNpcId = 'hidden-npc'

const record = (id: string, visibleToPlayers = true): NpcRecord => ({ id, name: 'Innkeeper', title: 'Host', visibleToPlayers, tags: ['merchant'], portraitPath: '', portraitUrl: null, portraitFocusX: 45, portraitFocusY: 55, tokenIcon: { icon: 'pawn', color: '#2f5bbf', size: 34 }, playerDescription: 'Friendly', playerNotes: 'Met once' })

describe('scene NPC production paths and payloads', () => {
  let testEnv: RulesTestEnvironment
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: { host: '127.0.0.1', port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080), rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8') },
      storage: { host: '127.0.0.1', port: emulatorPort('FIREBASE_STORAGE_EMULATOR_HOST', 9199), rules: readFileSync(resolve(process.cwd(), 'storage.rules'), 'utf8') },
    })
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'groups', groupId, 'members', gmUid), { status: 'active', role: 'admin' })
      await setDoc(doc(db, 'groups', groupId, 'members', playerUid), { status: 'active', role: 'member' })
      await setDoc(doc(db, 'groups', groupId, 'campaigns', campaignId), { gmUserId: gmUid })
      await setDoc(doc(db, 'groups', groupId, 'campaigns', campaignId, ...sceneNpcDocSegments(visibleNpcId)), npcDocWritePayload(record(visibleNpcId)))
      await setDoc(doc(db, 'groups', groupId, 'campaigns', campaignId, ...sceneNpcDocSegments(hiddenNpcId)), npcDocWritePayload(record(hiddenNpcId, false)))
    })
  })
  afterAll(async () => testEnv.cleanup())

  it('allows only the GM to write private notes through the extracted builder', async () => {
    const gmRef = doc(testEnv.authenticatedContext(gmUid).firestore(), 'groups', groupId, 'campaigns', campaignId, ...sceneNpcPrivateDocSegments(visibleNpcId))
    await assertSucceeds(setDoc(gmRef, npcPrivateWritePayload(visibleNpcId, 'secret'), SCENE_NPC_WRITE_OPTIONS))
    const playerRef = doc(testEnv.authenticatedContext(playerUid).firestore(), 'groups', groupId, 'campaigns', campaignId, ...sceneNpcPrivateDocSegments(visibleNpcId))
    await assertFails(setDoc(playerRef, npcPrivateWritePayload(visibleNpcId, 'forged'), SCENE_NPC_WRITE_OPTIONS))
  })

  it('allows a GM full public writes and rejects a player identity rewrite', async () => {
    const updated = { ...record(visibleNpcId), title: 'Updated' }
    const gmRef = doc(testEnv.authenticatedContext(gmUid).firestore(), 'groups', groupId, 'campaigns', campaignId, ...sceneNpcDocSegments(visibleNpcId))
    await assertSucceeds(setDoc(gmRef, npcDocWritePayload(updated), SCENE_NPC_WRITE_OPTIONS))
    const playerRef = doc(testEnv.authenticatedContext(playerUid).firestore(), 'groups', groupId, 'campaigns', campaignId, ...sceneNpcDocSegments(visibleNpcId))
    await assertFails(setDoc(playerRef, npcDocWritePayload({ ...updated, name: 'Forged' }), SCENE_NPC_WRITE_OPTIONS))
  })

  it('round trips all mapped fields and preserves untouched fields under merge', async () => {
    const db = testEnv.authenticatedContext(gmUid).firestore()
    const npcRef = doc(db, 'groups', groupId, 'campaigns', campaignId, ...sceneNpcDocSegments(visibleNpcId))
    const source = record(visibleNpcId)
    await assertSucceeds(setDoc(npcRef, npcDocWritePayload(source), SCENE_NPC_WRITE_OPTIONS))
    expect(toNpcRecord(visibleNpcId, (await getDoc(npcRef)).data())).toEqual(source)
    await assertSucceeds(setDoc(npcRef, { playerNotes: 'changed' }, SCENE_NPC_WRITE_OPTIONS))
    const after = (await getDoc(npcRef)).data()
    expect(after?.name).toBe(source.name)
    expect(after?.playerNotes).toBe('changed')
  })

  it('pins mapper coercions for missing fields, mixed tags, and private notes', () => {
    expect(toNpcRecord('missing', { tags: ['a', 2, 'b'] as string[] })).toMatchObject({ name: 'Unnamed NPC', title: '', tags: ['a', 'b'], portraitFocusX: 50, portraitFocusY: 50, playerDescription: '', playerNotes: '' })
    expect(toNpcGmNotes(undefined)).toBe('')
    expect(toNpcGmNotes({})).toBe('')
    expect(toNpcGmNotes({ gmNotes: 1 as unknown as string })).toBe('')
  })

  it('uses accepted production storage paths for both media kinds', async () => {
    const storage = testEnv.authenticatedContext(gmUid).storage()
    for (const kind of ['portraits', 'token-icons'] as const) {
      const path = entityMediaStoragePath({ groupId, campaignId, entityId: visibleNpcId, fileName: `${kind}.webp`, timestamp: 1700000000000, ...npcMediaUploadParams(kind) })
      expect(path).toContain(`/npcs/${visibleNpcId}/${kind}/1700000000000-`)
      await assertSucceeds(uploadString(ref(storage, path), 'data', 'raw', { contentType: 'image/webp' }))
    }
  })

  it('allows player media for visible NPCs and rejects hidden NPC media', async () => {
    const storage = testEnv.authenticatedContext(playerUid).storage()
    const params = npcMediaUploadParams('portraits')
    const visible = entityMediaStoragePath({ groupId, campaignId, entityId: visibleNpcId, fileName: 'visible.webp', timestamp: 1, ...params })
    const hidden = entityMediaStoragePath({ groupId, campaignId, entityId: hiddenNpcId, fileName: 'hidden.webp', timestamp: 1, ...params })
    await assertSucceeds(uploadString(ref(storage, visible), 'data', 'raw', { contentType: 'image/webp' }))
    await assertFails(uploadString(ref(storage, hidden), 'data', 'raw', { contentType: 'image/webp' }))
  })
})
