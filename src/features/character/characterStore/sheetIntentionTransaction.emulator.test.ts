import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, runTransaction, setDoc, updateDoc, type Firestore } from 'firebase/firestore'
import { emulatorPort } from '../../../../vitest.emulatorEndpoint'
import fixture from '../../ruleSets/lubec/fixtures/stored-character.json'
import { prepareSheetIntention, saveSheetIntention, writePreparedSheetIntentions } from './sheetIntentionTransaction'
import type { SheetEdit, SheetIntention } from './sheetIntentionTypes'

// Deliberately isolated, rules-disabled protocol proof only.
// Ticket 07 exercises authorization with the real rules and revision fence.
const sheetPath = 'groups/protocol/campaigns/campaign/characters/hero'
const delta: SheetEdit = { kind: 'delta', path: ['lubec', 'counters', 'stress'], base: 4, amount: 2 }
const intention = (operationId: string, edits: readonly SheetEdit[] = [delta]): SheetIntention => ({ operationId, baseRevision: 0, edits })
const rename: SheetEdit = { kind: 'set', path: ['name'], base: { exists: true, value: 'Ada Mitchell' }, value: 'Ada' }

describe('sheet intention protocol against Firestore, without authorization claims', () => {
  let env: RulesTestEnvironment

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: 'demo-sheet-intention-protocol',
      firestore: { host: '127.0.0.1', port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080), rules: 'rules_version = "2"; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }' },
    })
  })
  beforeEach(async () => env.clearFirestore())
  afterAll(async () => env.cleanup())

  async function protocol(test: (db: Firestore) => Promise<void>) {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore() as unknown as Firestore
      await setDoc(doc(db, sheetPath), { ...fixture.data, schemaWrittenAt: new Date(123), 'future.field': { kept: true } })
      await test(db)
    })
  }

  it('rebases two concurrent devices without losing unrelated fields, unknown data or schema stamps', async () => protocol(async (first) => {
    await env.withSecurityRulesDisabled(async (context) => {
      const second = context.firestore() as unknown as Firestore
      const results = await Promise.all([
        saveSheetIntention(first, doc(first, sheetPath), intention('counter-edit')),
        saveSheetIntention(second, doc(second, sheetPath), intention('name-edit', [rename])),
      ])
      expect(results.map((result) => result.status)).toEqual(['committed', 'committed'])
    })
    const sheet = (await getDoc(doc(first, sheetPath))).data()!
    expect(sheet).toEqual({ ...fixture.data, name: 'Ada', sheetRevision: 2, updatedAt: expect.anything(), schemaWrittenAt: expect.anything(), 'future.field': { kept: true }, lubec: { ...fixture.data.lubec, counters: { ...fixture.data.lubec.counters, stress: 6 } } })
    expect(sheet.schemaWrittenAt.toMillis()).toBe(123)
    expect(await getDocs(collection(first, sheetPath, 'writeReceipts'))).toHaveProperty('size', 2)
  }))

  it('returns the original receipt after lost acknowledgement and later mutations, without repeating a delta', async () => protocol(async (db) => {
    const ref = doc(db, sheetPath)
    const edit = intention('uncertain')
    const original = await saveSheetIntention(db, ref, edit)
    const receiptBefore = (await getDoc(doc(ref, 'writeReceipts', edit.operationId))).data()
    await saveSheetIntention(db, ref, intention('later', [rename]))
    expect(await saveSheetIntention(db, ref, edit)).toEqual(original)
    expect((await getDoc(ref)).data()).toMatchObject({ sheetRevision: 2, name: 'Ada', lubec: { counters: { stress: 6 } } })
    expect((await getDoc(doc(ref, 'writeReceipts', edit.operationId))).data()).toEqual(receiptBefore)
    expect(await saveSheetIntention(db, ref, intention('uncertain', [{ ...delta, amount: 3 }]))).toMatchObject({ status: 'repair', code: 'operation-id-reused' })
    expect((await getDoc(ref)).data()?.sheetRevision).toBe(2)
  }))

  it('deduplicates simultaneous copies of one delta and refuses changed payload reuse under contention', async () => protocol(async (db) => {
    const ref = doc(db, sheetPath)
    const duplicates = await Promise.all([saveSheetIntention(db, ref, intention('same-delta')), saveSheetIntention(db, ref, intention('same-delta'))])
    expect(duplicates[0]).toEqual(duplicates[1])
    expect((await getDoc(ref)).data()).toMatchObject({ sheetRevision: 1, lubec: { counters: { stress: 6 } } })
    const conflicting = await Promise.all([
      saveSheetIntention(db, ref, intention('reused-id')),
      saveSheetIntention(db, ref, intention('reused-id', [{ ...delta, amount: 3 }])),
    ])
    expect(conflicting).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'committed', revision: 2 }), { status: 'repair', code: 'operation-id-reused', path: [] }]))
    expect(await getDocs(collection(ref, 'writeReceipts'))).toHaveProperty('size', 2)
  }))

  it('ignores caller converters so future fields and original schema stamps survive', async () => protocol(async (db) => {
    const ref = doc(db, sheetPath)
    const converted = ref.withConverter({ toFirestore: () => ({ name: 'lossy' }), fromFirestore: () => ({ name: 'lossy' }) })
    expect(await saveSheetIntention(db, converted, intention('raw-save'))).toMatchObject({ status: 'committed' })
    expect((await getDoc(ref)).data()).toMatchObject({ unknownTopLevel: fixture.data.unknownTopLevel, schemaVersion: 1, lubec: { counters: { stress: 6 } } })
  }))

  it('survives a forced real transaction callback retry with stable edits and one receipt', async () => protocol(async (db) => {
    const ref = doc(db, sheetPath)
    let attempts = 0
    const edit = intention('forced-retry')
    await runTransaction(db, async (tx) => {
      attempts += 1
      const prepared = await prepareSheetIntention(tx, ref, edit)
      if (attempts === 1) await updateDoc(ref, { concurrent: 'preserve me' })
      return writePreparedSheetIntentions(tx, [prepared])
    })
    expect(attempts).toBeGreaterThan(1)
    expect((await getDoc(ref)).data()).toMatchObject({ sheetRevision: 1, concurrent: 'preserve me', lubec: { counters: { stress: 6 } } })
    expect(await getDocs(collection(ref, 'writeReceipts'))).toHaveProperty('size', 1)
  }))

  it('refuses same-value conflicts and vanished records atomically without creating receipts', async () => protocol(async (db) => {
    const ref = doc(db, sheetPath)
    await saveSheetIntention(db, ref, intention('first', [rename]))
    expect(await saveSheetIntention(db, ref, intention('conflict', [delta, rename]))).toMatchObject({ status: 'repair', code: 'value-conflict' })
    await updateDoc(ref, { 'lubec.effects': [] })
    const edit: SheetEdit = { kind: 'set', path: ['lubec', 'effects', { recordId: 'effect-1' }, 'name'], base: { exists: true, value: 'Severe Concussion' }, value: 'Changed' }
    expect(await saveSheetIntention(db, ref, intention('vanished', [edit]))).toMatchObject({ status: 'repair', code: 'record-missing' })
    expect((await getDoc(ref)).data()).toMatchObject({ sheetRevision: 1, lubec: { effects: [], counters: { stress: 4 } } })
    expect(await getDocs(collection(ref, 'writeReceipts'))).toHaveProperty('size', 1)
  }))

  it('does not resurrect a deleted sheet, while a previously committed retry still returns its outcome', async () => protocol(async (db) => {
    const ref = doc(db, sheetPath)
    const committed = await saveSheetIntention(db, ref, intention('committed'))
    await deleteDoc(ref)
    expect(await saveSheetIntention(db, ref, intention('new-edit'))).toMatchObject({ status: 'repair', code: 'sheet-deleted' })
    expect(await saveSheetIntention(db, ref, intention('committed'))).toEqual(committed)
    expect((await getDoc(ref)).exists()).toBe(false)
    expect((await getDoc(doc(ref, 'writeReceipts', 'new-edit'))).exists()).toBe(false)
  }))

  it('composes multi-sheet system edits with all reads before writes and rolls all of them back on repair', async () => protocol(async (db) => {
    const first = doc(db, sheetPath)
    const second = doc(db, 'groups/protocol/campaigns/campaign/npcSheets/npc')
    await setDoc(second, fixture.data)
    await runTransaction(db, async (tx) => {
      const pc = await prepareSheetIntention(tx, first, intention('system-pc'))
      const npc = await prepareSheetIntention(tx, second, intention('system-npc', [rename]))
      await tx.get(doc(db, 'groups/protocol/campaigns/campaign/items/item'))
      writePreparedSheetIntentions(tx, [pc, npc])
    })
    expect((await getDoc(first)).data()).toMatchObject({ sheetRevision: 1, lubec: { counters: { stress: 6 } } })
    expect((await getDoc(second)).data()).toMatchObject({ sheetRevision: 1, name: 'Ada' })
    await deleteDoc(second)
    await expect(runTransaction(db, async (tx) => {
      const pc = await prepareSheetIntention(tx, first, intention('abort-pc'))
      const npc = await prepareSheetIntention(tx, second, intention('abort-npc'))
      writePreparedSheetIntentions(tx, [pc, npc])
    })).rejects.toThrow('sheet-deleted')
    expect((await getDoc(first)).data()?.sheetRevision).toBe(1)
    expect((await getDoc(doc(first, 'writeReceipts', 'abort-pc'))).exists()).toBe(false)
  }))
})
