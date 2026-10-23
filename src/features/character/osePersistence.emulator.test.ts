// @vitest-environment jsdom
/**
 * OSE persistence through the shared character store, on the four demo
 * characters as the migration leaves them. Each carries fields the record does
 * not model at the top level, nested in the sheet and in an inventory row.
 *
 * The writers that change a character inside a transaction - a grant, an
 * approval and an accepted transfer - then act on characters the store loaded
 * and saved, and the store shows what they wrote.
 */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, runTransaction, serverTimestamp, setDoc, Timestamp, waitForPendingWrites, type Firestore } from 'firebase/firestore'
import type { CharacterInventoryItem, CharacterRecord, ItemApprovalRequest } from '../../types/app'
import { emulatorPort } from '../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../vitest.firestoreRules'
import { migratedFixture, reviveTimestamps, type CharacterFixture } from '../ruleSets/characterFixtures'
import { oseCharacterVersioning } from '../ruleSets/characterMigrations'
import demoCleric from '../ruleSets/ose/fixtures/demo-cleric.json'
import demoFighter from '../ruleSets/ose/fixtures/demo-fighter.json'
import demoMagicUser from '../ruleSets/ose/fixtures/demo-magic-user.json'
import demoThief from '../ruleSets/ose/fixtures/demo-thief.json'

const connection = vi.hoisted(() => ({ db: null as unknown as Firestore }))
vi.mock('../../firebase', () => ({ get db() { return connection.db } }))
// URL resolution is a separate Storage concern. Exercise the real roster,
// parser, debounce, serializer and Firestore writes with deterministic URLs.
vi.mock('../common/mediaStorage', async (original) => ({
  ...await original<typeof import('../common/mediaStorage')>(),
  resolveStoragePathUrl: vi.fn(async (path: string) => `https://media.test/${path}`),
}))
const { useCharacters } = await import('./hooks/useCharacters')
const { useItemApprovals } = await import('./hooks/useItemApprovals')
const { applyGrantToCharacter } = await import('./lib/grantTransaction')

// The transfer callable's admin SDK resolves the project from GCLOUD_PROJECT,
// so the client contexts share that project id.
const projectId = process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev'
// Each case gets a campaign of its own, so the database is cleared once, before
// any listener exists: clearing it while a closed listener is still winding
// down in the emulator can fail the clear.
let caseNumber = 0
let scope = { groupId: '', campaignId: '' }
let path = ''
const gmUid = 'ose-persistence-gm'
const oldTime = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
let env: RulesTestEnvironment
let acceptPendingTransfer: (request: { auth: { uid: string }; data: Record<string, string> }) => Promise<{ ok: boolean }>
const errors = vi.fn()
const waitForStore = (assertion: () => void | Promise<void>) => waitFor(assertion, { timeout: 5_000 })

/** A demo character as the migration leaves it, last written before this test. */
function demoCharacter(fixture: unknown): CharacterFixture {
  const revived = reviveTimestamps(fixture, (iso) => Timestamp.fromDate(new Date(iso))) as CharacterFixture
  const { id, data } = migratedFixture(oseCharacterVersioning, revived)
  return { id, data: { ...data, schemaWrittenAt: oldTime } }
}

const demoCases = Object.entries({
  'demo-magic-user': demoMagicUser,
  'demo-fighter': demoFighter,
  'demo-thief': demoThief,
  'demo-cleric': demoCleric,
}).map(([name, fixture]) => [name, demoCharacter(fixture)] as const)

const characterRef = (id: string) => doc(connection.db, `${path}/characters/${id}`)
const userStateRef = (uid: string) => doc(connection.db, `${path}/userState/${uid}`)
const readCharacter = async (id: string) => (await getDoc(characterRef(id))).data()!
const ownerOf = ({ data }: CharacterFixture) => data.ownerUserId as string
const inventoryOf = (character: CharacterRecord | undefined) => character?.details?.inventory ?? []

async function seed(fixtures: CharacterFixture[]) {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    for (const fixture of fixtures) {
      await setDoc(doc(db, `groups/${scope.groupId}/members/${ownerOf(fixture)}`), { userId: ownerOf(fixture), status: 'active', role: 'member' })
      await setDoc(doc(db, `${path}/characters/${fixture.id}`), fixture.data)
      await setDoc(doc(db, `${path}/userState/${ownerOf(fixture)}`), { currentCharacterId: fixture.id, updatedAt: oldTime, futureState: { kept: true } })
    }
  })
}

function signInAs(uid: string) {
  connection.db = env.authenticatedContext(uid).firestore() as unknown as Firestore
}

function mount(uid: string) {
  const role = uid === gmUid ? 'gm' : 'player'
  return renderHook(() => useCharacters(scope.campaignId, scope.groupId, uid, uid, role, gmUid, errors))
}

/** Changes one sheet field through the store and waits for the save to be committed. */
async function editNotes(result: { current: ReturnType<typeof useCharacters> }, id: string, notes: string) {
  const character = result.current.characters.find((entry) => entry.id === id)!
  act(() => result.current.updateCharacter(id, { details: { ...character.details!, otherNotesText: notes } }))
  await waitForStore(async () => expect((await readCharacter(id)).details.otherNotesText).toBe(notes))
  // getDoc may include an optimistic local write with null server times.
  // Wait for the real commit before reading the persisted document.
  await waitForPendingWrites(connection.db)
  return readCharacter(id)
}

beforeAll(async () => {
  process.env.GCLOUD_PROJECT ||= projectId
  env = await initializeTestEnvironment({ projectId, firestore: {
    host: '127.0.0.1', port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080), rules: firestoreRules(),
  } })
  const functions = await import('../../../functions/src/index')
  acceptPendingTransfer = (functions.acceptPendingTransfer as unknown as { run: typeof acceptPendingTransfer }).run
  await env.clearFirestore()
})
beforeEach(async () => {
  errors.mockClear()
  caseNumber += 1
  scope = { groupId: `ose-persistence-group-${caseNumber}`, campaignId: `ose-persistence-campaign-${caseNumber}` }
  path = `groups/${scope.groupId}/campaigns/${scope.campaignId}`
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, `groups/${scope.groupId}`), { createdBy: gmUid })
    await setDoc(doc(db, `groups/${scope.groupId}/members/${gmUid}`), { userId: gmUid, status: 'active', role: 'admin' })
    await setDoc(doc(db, path), { gmUserId: gmUid, status: 'active', system: 'ose' })
  })
})
afterEach(async () => { cleanup(); await waitForPendingWrites(connection.db) })
afterAll(async () => { await env?.cleanup() })

describe('OSE persistence through the shared character store', () => {
  it.each(demoCases)('%s loads without writing, saves one edited sheet field, and reloads every other stored field unchanged', async (_name, fixture) => {
    const { id, data: raw } = fixture
    const owner = ownerOf(fixture)
    await seed([fixture])
    signInAs(owner)
    const userStateBefore = (await getDoc(userStateRef(owner))).data()
    const first = mount(owner)
    await waitForStore(() => expect(first.result.current.selectedCharacter?.id).toBe(id))
    await waitForStore(() => expect(first.result.current.currentCharacterId).toBe(id))
    await waitForStore(() => expect(first.result.current.selectedCharacter?.portraitUrl).toBe(`https://media.test/${raw.portraitPath}`))
    expect(await readCharacter(id)).toEqual(raw)

    const saved = await editNotes(first.result, id, 'After the edit')
    expect(saved).toEqual({
      ...raw, details: { ...(raw.details as object), otherNotesText: 'After the edit' }, schemaVersion: 1,
      schemaWrittenAt: expect.any(Timestamp), updatedAt: expect.any(Timestamp),
    })
    expect(saved.schemaWrittenAt.toMillis()).toBeGreaterThan(oldTime.toMillis())
    expect(saved.updatedAt).toEqual(saved.schemaWrittenAt)
    expect((await getDoc(userStateRef(owner))).data()).toEqual(userStateBefore)

    first.unmount()
    const reloaded = mount(owner)
    await waitForStore(() => expect(reloaded.result.current.selectedCharacter?.details?.otherNotesText).toBe('After the edit'))
    await waitForStore(() => expect(reloaded.result.current.currentCharacterId).toBe(id))
    await waitForStore(() => expect(reloaded.result.current.selectedCharacter?.portraitUrl).toBe(`https://media.test/${raw.portraitPath}`))
    expect(reloaded.result.current.selectedCharacter?.details).toEqual(saved.details)
    expect(reloaded.result.current.selectedCharacter?.unknownFields).toEqual({ unknownTopLevel: raw.unknownTopLevel })
    expect(reloaded.result.current.selectedCharacter?.portraitPath).toBe(raw.portraitPath)
    expect(await readCharacter(id)).toEqual(saved)
    expect((await getDoc(userStateRef(owner))).data()).toEqual(userStateBefore)
    expect(errors).not.toHaveBeenCalled()
  }, 15_000)

  it('a grant, an approval and an accepted transfer act on characters the store saved, and the store shows what they wrote', async () => {
    const [sender, receiver] = [demoCases[0][1], demoCases[2][1]]
    await seed([sender, receiver])
    signInAs(gmUid)
    const { result } = mount(gmUid)
    await waitForStore(() => expect(result.current.characters.map((character) => character.id).sort()).toEqual([sender.id, receiver.id].sort()))
    const listed = (id: string) => result.current.characters.find((character) => character.id === id)
    await editNotes(result, sender.id, 'Saved by the store')
    await editNotes(result, receiver.id, 'Saved by the store')
    const ropes = () => inventoryOf(listed(sender.id)).filter((item) => item.name === 'Rope').length
    const ropesBefore = ropes()

    const granted = await runTransaction(connection.db, (tx) => applyGrantToCharacter(tx, characterRef(sender.id), {
      target: listed(sender.id)!, xpAmount: 10, goldAmount: 0, campaignEntries: [],
      templateEntries: [{ key: 'gear-rope', name: 'Rope', costGp: 1, qty: 1, kind: 'general' }], overflowGoldDocId: 'overflow',
    }))
    expect(granted.xp).toBeGreaterThan(sender.data.xp as number)
    await waitForStore(() => expect(listed(sender.id)?.xp).toBe(granted.xp))
    expect(ropes()).toBe(ropesBefore + 1)

    const chalk: CharacterInventoryItem = { id: 'approved-chalk', kind: 'general', name: 'Chalk', typeId: 'chalk', typeName: 'Chalk',
      costGp: 0, qty: 1, equipped: false, notes: '', stack: { stackable: false } }
    const request: ItemApprovalRequest = { id: 'request', campaignId: scope.campaignId, characterId: sender.id, characterName: 'Mirelda',
      action: 'create', requestedByUserId: ownerOf(sender), requestedByUsername: 'player1', status: 'pending', createdAt: oldTime, item: chalk }
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `${path}/itemApprovals/request`), { ...request })
    })
    const approvals = renderHook(() => useItemApprovals(scope.campaignId, scope.groupId, 'gm', gmUid, false))
    await act(() => approvals.result.current.approveRequest(request))
    await waitForStore(() => expect(inventoryOf(listed(sender.id)).map((item) => item.id)).toContain(chalk.id))

    const senderDb = env.authenticatedContext(ownerOf(sender)).firestore()
    await setDoc(doc(senderDb, `${path}/pendingTransfers/transfer`), {
      id: 'transfer', itemSnapshot: chalk, itemId: chalk.id, itemKind: chalk.kind, itemName: chalk.name,
      fromCharacterId: sender.id, fromCharacterName: 'Mirelda', fromUserId: ownerOf(sender),
      toCharacterId: receiver.id, toCharacterName: 'Nix', toUserId: ownerOf(receiver), createdAt: serverTimestamp(),
    })
    expect(await acceptPendingTransfer({ auth: { uid: ownerOf(receiver) }, data: { ...scope, transferId: 'transfer' } })).toEqual({ ok: true })
    await waitForStore(() => expect(inventoryOf(listed(receiver.id)).map((item) => item.id)).toContain(chalk.id))
    expect(inventoryOf(listed(sender.id)).map((item) => item.id)).not.toContain(chalk.id)

    // A later save through the store keeps what the other writers stored.
    const saved = await editNotes(result, receiver.id, 'Saved after the transfer')
    expect(saved.details.inventory.map((item: CharacterInventoryItem) => item.id)).toContain(chalk.id)
    expect(saved).toMatchObject({ schemaVersion: 1, unknownTopLevel: receiver.data.unknownTopLevel })
    expect(errors).not.toHaveBeenCalled()
  }, 20_000)
})
