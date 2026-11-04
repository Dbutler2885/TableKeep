import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore'
import { campaignDocRef, campaignGmItemRef } from '../../campaign/firestorePaths'
import { emulatorPort } from '../../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../../vitest.firestoreRules'
import { lineageGear, lineageSupply, lineageWeapon } from '../../ruleSets/lubec/gear/__tests__/itemLineageFixtures'
import { lubecCommandItemId } from '../../ruleSets/lubec/gear/itemIdentity'
import { assertLubecItemOwnership } from '../../ruleSets/lubec/gear/itemIdentity'
import { lubecMovePhysicalBetween, type LubecPhysicalMoveRequest } from './lubecPhysicalMoves'

const scope = { groupId: 'lineage-group', campaignId: 'lineage-campaign' }
const gm = 'lineage-gm'
const player = 'lineage-player'
const source = { kind: 'character', characterId: 'source' } as const
const target = { kind: 'character', characterId: 'target' } as const
const gmItems = { kind: 'gm-items' } as const
const store = { sendSaveNow: () => {}, hasPendingWrite: () => false }
const sheet = (id: string, gear = lineageGear()) => ({ id, system: 'lubec', schemaVersion: 1, ownerUserId: player, name: id, lubec: { gear, counters: { stress: 2 } } })
const library = { ...lineageWeapon, carrier: '', status: 'library', supplies: [lineageSupply] }

let env: RulesTestEnvironment
const as = (uid = gm) => env.authenticatedContext(uid).firestore() as unknown as Firestore
const sheetRef = (db: Firestore, id: string) => campaignDocRef(db, scope, 'characters', id)
async function seed(path: (db: Firestore) => ReturnType<typeof doc>, data: object) {
  await env.withSecurityRulesDisabled(async (context) => setDoc(path(context.firestore() as unknown as Firestore), data))
}
const readSheet = async (id: string) => (await getDoc(sheetRef(as(), id))).data()!
const readGm = async (id: string) => (await getDoc(campaignGmItemRef(as(), scope, id))).data()
const request = (operationId: string, from = source, to: LubecPhysicalMoveRequest['to'] = target): LubecPhysicalMoveRequest => ({
  scope, from, to, operationId, store, move: { itemId: 'balls', qty: 1, seen: { carrier: 'hands', slot: 0 }, dest: 'hands' },
})

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'homeboyshouse-lineage-tests', firestore: { host: '127.0.0.1', port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080), rules: firestoreRules() } })
})
afterAll(async () => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await seed((db) => doc(db, 'groups', scope.groupId), { createdBy: gm })
  for (const [userId, role] of [[gm, 'admin'], [player, 'member']]) {
    await seed((db) => doc(db, 'groups', scope.groupId, 'members', userId), { userId, role, status: 'active' })
  }
  await seed((db) => doc(db, 'groups', scope.groupId, 'campaigns', scope.campaignId), { createdBy: gm, gmUserId: gm, system: 'lubec' })
  await seed((db) => sheetRef(db, 'source'), sheet('source'))
  await seed((db) => sheetRef(db, 'target'), sheet('target', lineageGear([], [])))
  await seed((db) => campaignGmItemRef(db, scope, 'balls'), library)
})

describe('physical moves through real inventory transactions', () => {
  it('copies partial library stacks once per logical command, with distinct ordinal ids and preserved source', async () => {
    const first: LubecPhysicalMoveRequest = { ...request('copy-stacks'), from: gmItems }
    expect(await lubecMovePhysicalBetween(as(), first)).toEqual({ ok: true })
    expect(await lubecMovePhysicalBetween(as(), first)).toEqual({ ok: true })
    const second = { ...first, operationId: 'copy-stacks-second', ordinal: 1 }
    expect(await lubecMovePhysicalBetween(as(), second)).toEqual({ ok: true })
    const after = await readSheet('target')
    const ids = [lubecCommandItemId({ commandId: first.operationId! }, 'copy:balls'), lubecCommandItemId({ commandId: second.operationId!, ordinal: 1 }, 'copy:balls')]
    expect(after.lubec.gear.items.map((item: { id: string }) => item.id)).toEqual(ids)
    expect(after.lubec.gear.items).toEqual(ids.map((id, slot) => ({ ...lineageWeapon, id, qty: 1, slot })))
    expect(after.lubec.gear.supplies).toEqual([lineageSupply])
    expect(after.sheetRevision).toBe(2)
    expect(await readGm('balls')).toEqual(library)
  })

  it('moves a partial dropped stack atomically and retries without consuming another portion', async () => {
    await seed((db) => campaignGmItemRef(db, scope, 'balls'), { ...library, status: 'dropped' })
    const take: LubecPhysicalMoveRequest = { ...request('partial-drop'), from: gmItems, move: { itemId: 'balls', qty: 2, dest: 'hands' } }
    expect(await lubecMovePhysicalBetween(as(), take)).toEqual({ ok: true })
    expect(await lubecMovePhysicalBetween(as(), take)).toEqual({ ok: true })
    expect(await readGm('balls')).toMatchObject({ id: 'balls', qty: 2, status: 'dropped', supplies: [lineageSupply], future: lineageWeapon.future })
    const after = await readSheet('target')
    expect(after.lubec.gear.items).toEqual([{ ...lineageWeapon, qty: 2, id: lubecCommandItemId({ commandId: 'partial-drop' }, 'split:balls') }])
    expect(after.sheetRevision).toBe(1)
  })

  it('round trips one unit through a dropped record into the original holder beside its remainder', async () => {
    const drop = request('throw-to-floor', source, gmItems)
    expect(await lubecMovePhysicalBetween(as(), drop)).toEqual({ ok: true })
    const childId = lubecCommandItemId({ commandId: drop.operationId! }, 'split:balls')
    expect(await readGm(childId)).toMatchObject({ id: childId, qty: 1, status: 'dropped', supplies: [lineageSupply] })
    expect(await readGm('balls')).toEqual(library)
    const back: LubecPhysicalMoveRequest = { ...request('catch-back'), from: gmItems, to: source, move: { itemId: childId, dest: 'hands' } }
    expect(await lubecMovePhysicalBetween(as(), back)).toEqual({ ok: true })
    expect(await lubecMovePhysicalBetween(as(), back)).toEqual({ ok: true })
    const items = (await readSheet('source')).lubec.gear.items
    expect(items).toEqual([{ ...lineageWeapon, qty: 3 }, { ...lineageWeapon, id: childId, qty: 1, slot: 1 }])
    expect(items.reduce((sum: number, item: { qty: number }) => sum + item.qty, 0)).toBe(lineageWeapon.qty)
    assertLubecItemOwnership(items)
    expect(await readGm(childId)).toBeUndefined()
  })

  it('preserves same-name different-rule records and remaps conflicting custom supplies in both references', async () => {
    const other = { ...lineageWeapon, id: 'other', qty: 1, impact: 9 }
    const otherSupply = { ...lineageSupply, name: 'Blue paint' }
    await seed((db) => sheetRef(db, 'target'), sheet('target', lineageGear([other], [otherSupply])))
    const transfer = request('collision')
    expect(await lubecMovePhysicalBetween(as(), transfer)).toEqual({ ok: true })
    expect(await lubecMovePhysicalBetween(as(), transfer)).toEqual({ ok: true })
    const after = (await readSheet('target')).lubec.gear
    const supplyId = lubecCommandItemId({ commandId: 'collision', role: 'supply:custom' }, 'supply:custom')
    expect(after.items).toEqual([other, { ...lineageWeapon, id: lubecCommandItemId({ commandId: 'collision' }, 'split:balls'), qty: 1, slot: 1, takes: supplyId, fits: supplyId }])
    expect(after.supplies).toEqual([otherSupply, { ...lineageSupply, id: supplyId }])
    expect((await readSheet('source')).lubec.gear.items).toEqual([{ ...lineageWeapon, qty: 3 }])
    await expect(lubecMovePhysicalBetween(as(), { ...transfer, move: { ...transfer.move, qty: 2 } })).rejects.toThrow('operation-id-reused')
  })

  it('refuses a conflicting destination document and leaves the source, receipt and library untouched', async () => {
    const drop = request('conflicting-drop', source, gmItems)
    const id = lubecCommandItemId({ commandId: drop.operationId! }, 'split:balls')
    const conflicting = { ...library, id, impact: 88, status: 'dropped' }
    await seed((db) => campaignGmItemRef(db, scope, id), conflicting)
    await expect(lubecMovePhysicalBetween(as(), drop)).rejects.toThrow('conflicting dropped item')
    expect((await readSheet('source')).lubec.gear).toEqual(lineageGear())
    expect((await readSheet('source')).sheetRevision).toBeUndefined()
    expect(await readGm(id)).toEqual(conflicting)
    expect((await getDoc(doc(sheetRef(as(), 'source'), 'writeReceipts', drop.operationId!))).exists()).toBe(false)
  })

  it('serializes concurrent portions from one dropped record and conserves the original quantity', async () => {
    await seed((db) => campaignGmItemRef(db, scope, 'balls'), { ...library, status: 'dropped' })
    const first: LubecPhysicalMoveRequest = { ...request('race-first'), from: gmItems, move: { itemId: 'balls', qty: 3, dest: 'hands' } }
    const second: LubecPhysicalMoveRequest = { ...request('race-second'), from: gmItems, to: source, move: { itemId: 'balls', qty: 3, dest: 'hands' } }
    const results = await Promise.allSettled([lubecMovePhysicalBetween(as(), first), lubecMovePhysicalBetween(as(), second)])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(await readGm('balls')).toMatchObject({ qty: 1 })
    const items = [...(await readSheet('source')).lubec.gear.items, ...(await readSheet('target')).lubec.gear.items]
    expect(items.reduce((sum: number, item: { qty: number }) => sum + item.qty, 0)).toBe(7)
    assertLubecItemOwnership(items)
  })

  it('rejects unauthorized cross-sheet writes atomically', async () => {
    await seed((db) => sheetRef(db, 'target'), { ...sheet('target', lineageGear([], [])), ownerUserId: 'another-player' })
    await expect(lubecMovePhysicalBetween(as(player), request('unauthorized'))).rejects.toMatchObject({ code: 'permission-denied' })
    expect((await readSheet('source')).lubec.gear).toEqual(lineageGear())
    expect((await readSheet('target')).lubec.gear.items).toEqual([])
  })
})
