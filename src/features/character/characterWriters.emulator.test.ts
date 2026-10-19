// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { doc, getDoc, runTransaction, setDoc, Timestamp, waitForPendingWrites, type Firestore } from 'firebase/firestore'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { emulatorPort } from '../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../vitest.firestoreRules'
import { makeVtmCharacter } from './vtmDefaults'
import type { ItemApprovalRequest } from '../../types/app'

const connection = vi.hoisted(() => ({ db: null as unknown as Firestore }))
vi.mock('../../firebase', () => ({ get db() { return connection.db } }))
const { characterSaveFields } = await import('./lib/characterWrites')
const { readStoredCharacter, parseOseCharacter } = await import('./lib/storedCharacterRecord')
const { createVtmCharacterDoc, vtmCharacterSaveFields } = await import('./vtmCharacterWrites')
const { readVtmCharacterDoc } = await import('./vtmCharacterRecord')
const { useCharacterRoster } = await import('./hooks/useCharacterRoster')
const { useItemApprovals } = await import('./hooks/useItemApprovals')
const { applyGrantToCharacter } = await import('./lib/grantTransaction')

const scope = { groupId: 'writer-group', campaignId: 'writer-campaign' }
const path = `groups/${scope.groupId}/campaigns/${scope.campaignId}`
const oldTime = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
const rope = { id: 'rope', kind: 'general' as const, name: 'Rope', typeId: 'rope', typeName: 'Rope', costGp: 1, qty: 1, equipped: false, notes: '', stack: { stackable: false as const } }
let env: RulesTestEnvironment
const charRef = () => doc(connection.db, `${path}/characters/pc`)
async function seed(data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (context) => { await setDoc(doc(context.firestore(), `${path}/characters/pc`), data) })
}
const read = async () => (await getDoc(charRef())).data()!

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'homeboyshouse-writer-characterization', firestore: {
    host: '127.0.0.1', port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080), rules: firestoreRules(),
  } })
  connection.db = env.authenticatedContext('gm').firestore() as unknown as Firestore
})
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, `groups/${scope.groupId}`), { createdBy: 'gm' })
    await setDoc(doc(db, `groups/${scope.groupId}/members/gm`), { userId: 'gm', status: 'active', role: 'admin' })
    await setDoc(doc(db, path), { gmUserId: 'gm', status: 'active' })
  })
})
afterEach(() => cleanup())
afterAll(async () => { await env?.cleanup() })

const BEING_UPDATED = 'This character is being updated. Try again in a minute.'
// A stamp the server set during this test, not the seeded one. The emulator's
// clock is the machine's, so allow it a little skew.
const expectFreshStamp = (stamp: Timestamp, startedAt: number) => {
  expect(stamp).toBeInstanceOf(Timestamp)
  expect(stamp.toMillis()).toBeGreaterThan(startedAt - 5_000)
}

describe('character writer persistence', () => {
  it('OSE save stores an old-format character at version 1, with its inventory and without the old lists or the AC flag', async () => {
    const raw = { name: 'Ada', ownerUserId: 'gm', class: 'Fighter', hpMax: 6, hpCurrent: 6,
      schemaWrittenAt: oldTime, createdAt: oldTime, updatedAt: oldTime, future: { kept: true },
      details: { weapons: [{ id: 'sword', name: 'Sword' }], armour: [], packedItems: ['Rope'], equippedItems: [], storeGoldSlotIndices: [], acManualOverride: true, futureNested: { kept: true } } }
    await seed(raw)
    const record = readStoredCharacter('pc', raw, undefined, { userId: 'gm', currentUsername: 'gamemst' })
    const startedAt = Date.now()
    await setDoc(charRef(), characterSaveFields({ ...record, name: 'Edited' }), { merge: true })
    const saved = await read()
    expect(saved).toMatchObject({ name: 'Edited', schemaVersion: 1, createdAt: oldTime, future: { kept: true },
      details: { futureNested: { kept: true }, inventory: record.details!.inventory } })
    expectFreshStamp(saved.schemaWrittenAt, startedAt)
    expect(saved.updatedAt.toMillis()).toBeGreaterThan(oldTime.toMillis())
    expect(saved.details.inventory).toHaveLength(2)
    expect(Object.keys(saved.details).sort()).toEqual(['futureNested', 'inventory'])
    expect(saved).not.toHaveProperty('system')
  })

  it('VtM save changes sheet fields, preserves unknown fields and stamps version 1 with a fresh write time', async () => {
    const character = makeVtmCharacter('gm', 'gamemst')
    const raw = { ...character, schemaVersion: 0, schemaWrittenAt: oldTime, createdAt: oldTime, future: { kept: true } }
    await seed(raw)
    const record = readVtmCharacterDoc('pc', raw, undefined)
    if (!record) throw new Error('Expected the VtM reader to accept a VtM document')
    const startedAt = Date.now()
    await setDoc(charRef(), vtmCharacterSaveFields({ ...record, name: 'Edited Vampire' }), { merge: true })
    const saved = await read()
    expect(saved).toMatchObject({ name: 'Edited Vampire', system: 'vtm', schemaVersion: 1, createdAt: oldTime, future: { kept: true }, vtm: character.vtm })
    expectFreshStamp(saved.schemaWrittenAt, startedAt)
  })

  it.each(['new', 'established'] as const)('the real OSE create hook persists a %s character at version 1, without system or details', async (mode) => {
    let selected = ''
    const { result } = renderHook(() => useCharacterRoster({
      campaignId: scope.campaignId, groupId: scope.groupId, currentUserId: 'gm', currentUsername: 'gamemst',
      canCreateCharacter: true, effectiveSelected: null, canEditSelected: false, isGuidedCreation: false,
      isInFinalizationFlow: false, hasRolledAbilityScores: false, hasRolledHp: false, selectedInventory: [],
      setSelectedCharacterId: (id) => { selected = id }, isSinglePane: false, showDetailPane: vi.fn(), updateSelectedCharacter: vi.fn(),
    }))
    act(() => result.current.addCharacter(mode))
    const created = doc(connection.db, `${path}/characters/${selected}`)
    await waitForPendingWrites(connection.db)
    expect((await getDoc(created)).exists()).toBe(true)
    const data = (await getDoc(created)).data()!
    expect(data).toMatchObject({ name: 'New Character', ownerUserId: 'gm', creationMode: mode, creationStatus: mode === 'new' ? 'draft' : 'established_draft',
      schemaVersion: 1, schemaWrittenAt: expect.any(Timestamp), createdAt: expect.any(Timestamp), updatedAt: expect.any(Timestamp) })
    for (const field of ['system', 'details']) expect(data).not.toHaveProperty(field)
  })

  it('the VtM create writer persists system, version 1 and timestamps', async () => {
    const character = { ...makeVtmCharacter('gm', 'gamemst'), id: 'pc' }
    await createVtmCharacterDoc(scope, character)
    const data = await read()
    expect(data).toMatchObject({ system: 'vtm', vtm: character.vtm, schemaVersion: 1, schemaWrittenAt: expect.any(Timestamp),
      createdAt: expect.any(Timestamp), updatedAt: expect.any(Timestamp) })
  })

  const grantRope = () => runTransaction(connection.db, (tx) => applyGrantToCharacter(tx, charRef(), {
    target: parseOseCharacter('pc', { name: 'Ada', class: 'Fighter' }), xpAmount: 10, goldAmount: 0, campaignEntries: [],
    templateEntries: [{ key: 'gear-rope', name: 'Rope', costGp: 1, qty: 1, kind: 'general' }], overflowGoldDocId: 'overflow',
  }))

  it('the grant writer grants onto a version 1 character, retaining unknown data, and stamps a fresh write time', async () => {
    const raw = { name: 'Ada', ownerUserId: 'gm', class: 'Fighter', schemaVersion: 1, schemaWrittenAt: oldTime, updatedAt: oldTime,
      details: { inventory: [], future: { kept: true } } }
    await seed(raw)
    const startedAt = Date.now()
    await grantRope()
    const data = await read()
    expect(data).toMatchObject({ schemaVersion: 1, xp: 10,
      details: { future: { kept: true }, inventory: [expect.objectContaining({ name: 'Rope' })] } })
    expectFreshStamp(data.schemaWrittenAt, startedAt)
    expect(data.updatedAt.toMillis()).toBeGreaterThan(oldTime.toMillis())
  })

  it.each([0, 2])('the grant writer refuses a version %s character with the plain message, leaving it unchanged', async (schemaVersion) => {
    const raw = { name: 'Ada', ownerUserId: 'gm', class: 'Fighter', schemaVersion, schemaWrittenAt: oldTime, updatedAt: oldTime,
      details: { weapons: [{ name: 'Old sword' }], future: { kept: true } } }
    await seed(raw)
    await expect(grantRope()).rejects.toThrow(BEING_UPDATED)
    expect(await read()).toEqual(raw)
  })

  const approvalRequest = (action: ItemApprovalRequest['action']): ItemApprovalRequest => ({ id: 'request', campaignId: scope.campaignId,
    characterId: 'pc', characterName: 'Ada', action, requestedByUserId: 'gm', requestedByUsername: 'gamemst', status: 'pending',
    createdAt: oldTime, item: rope, spellIds: ['light'] })
  const approvalRef = () => doc(connection.db, `${path}/itemApprovals/request`)
  const approveAsGm = async (request: ItemApprovalRequest) => {
    await setDoc(approvalRef(), { ...request })
    const { result } = renderHook(() => useItemApprovals(scope.campaignId, scope.groupId, 'gm', 'gm', false))
    await act(() => result.current.approveRequest(request))
  }

  it.each(['create', 'sell', 'learn_spell', 'ability_reroll'] as const)('the real %s approval commits character and approval writes onto a version 1 character, stamping a fresh write time', async (action) => {
    const raw = { name: 'Ada', ownerUserId: 'gm', creationStatus: 'draft', schemaVersion: 1, schemaWrittenAt: oldTime, updatedAt: oldTime,
      details: { inventory: [rope], unknown: { kept: true } } }
    await seed(raw)
    const startedAt = Date.now()
    await approveAsGm(approvalRequest(action))
    const data = await read()
    expect(data).toMatchObject({ schemaVersion: 1, updatedAt: oldTime, details: { unknown: { kept: true } } })
    expectFreshStamp(data.schemaWrittenAt, startedAt)
    if (action === 'create') expect(data.details.inventory).toEqual([rope, rope])
    if (action === 'sell') expect(data.details.inventory).toMatchObject([{ kind: 'gold', qty: 1 }])
    if (action === 'learn_spell') expect(data.details.spellBookSpellIds).toEqual(['light'])
    if (action === 'ability_reroll') expect(data.details.abilityScoresRolled).toBe(true)
    expect((await getDoc(approvalRef())).data()).toMatchObject({ status: 'approved', resolvedAt: expect.any(Timestamp) })
  })

  it.each(['create', 'sell', 'learn_spell', 'ability_reroll'] as const)('the real %s approval refuses a version 0 character with the plain message, leaving it and the request unchanged', async (action) => {
    const raw = { name: 'Ada', ownerUserId: 'gm', creationStatus: 'draft', schemaVersion: 0, schemaWrittenAt: oldTime, updatedAt: oldTime,
      details: { inventory: [rope], weapons: ['legacy'], unknown: { kept: true } } }
    await seed(raw)
    await expect(approveAsGm(approvalRequest(action))).rejects.toThrow(BEING_UPDATED)
    expect(await read()).toEqual(raw)
    expect((await getDoc(approvalRef())).data()).toMatchObject({ status: 'pending' })
  })

  it('rolls back a create approval character write when the approval record is missing', async () => {
    const raw = { ownerUserId: 'gm', schemaVersion: 1, details: { inventory: [] } }
    await seed(raw)
    const request: ItemApprovalRequest = { id: 'missing', campaignId: scope.campaignId, characterId: 'pc', characterName: 'Ada', action: 'create',
      requestedByUserId: 'gm', requestedByUsername: 'gamemst', status: 'pending', createdAt: oldTime, item: rope }
    const { result } = renderHook(() => useItemApprovals(scope.campaignId, scope.groupId, 'gm', 'gm', false))
    await expect(act(() => result.current.approveRequest(request))).rejects.toBeDefined()
    expect(await read()).toEqual(raw)
  })
})
