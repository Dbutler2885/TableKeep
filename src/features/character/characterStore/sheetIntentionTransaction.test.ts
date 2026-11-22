import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FirebaseError } from 'firebase/app'
import { doc, getDocFromServer, runTransaction, type DocumentReference, type Firestore, type Transaction } from 'firebase/firestore'
import fixture from '../../ruleSets/lubec/fixtures/stored-character.json'
import { prepareSheetIntention, saveSheetIntention, writePreparedSheetIntentions } from './sheetIntentionTransaction'
import { validateSheetIntention } from './sheetIntentionValidation'
import type { SheetIntention } from './sheetIntentionTypes'

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_parent, ...segments: string[]) => ({ path: segments.join('/') })),
  runTransaction: vi.fn(),
  getDocFromServer: vi.fn(),
  serverTimestamp: () => 'server-time',
}))

const db = {} as Firestore
const reference = (path: string): DocumentReference => ({ path, withConverter() { return this } }) as DocumentReference
const sheetRef = reference('characters/hero')
const intention = (): SheetIntention => ({ operationId: 'stable-edit', baseRevision: 0, edits: [{ kind: 'delta', path: ['lubec', 'counters', 'stress'], base: 4, amount: 2 }] })

function transaction(sheet: Record<string, unknown> | undefined = fixture.data) {
  return {
    get: vi.fn(async (ref: DocumentReference) => {
      const data = ref.path.startsWith('writeReceipts/') ? undefined : sheet
      return { exists: () => data !== undefined, data: () => data }
    }),
    set: vi.fn(),
  } as unknown as Transaction
}

describe('opt-in transactional save adapter', () => {
  beforeEach(() => vi.resetAllMocks())

  it('reads receipt before canonical sheet, then atomically writes the sheet and immutable receipt', async () => {
    const tx = transaction()
    vi.mocked(runTransaction).mockImplementation(async (_db, callback) => callback(tx))
    const result = await saveSheetIntention(db, sheetRef, intention())
    expect(result).toEqual({ status: 'committed', operationId: 'stable-edit', revision: 1 })
    expect(doc).toHaveBeenCalledWith(sheetRef, 'writeReceipts', 'stable-edit')
    expect(tx.get).toHaveBeenNthCalledWith(1, { path: 'writeReceipts/stable-edit' })
    expect(tx.get).toHaveBeenNthCalledWith(2, sheetRef)
    expect(tx.set).toHaveBeenNthCalledWith(1, sheetRef, {
      ...fixture.data, sheetRevision: 1, updatedAt: 'server-time',
      lubec: { ...fixture.data.lubec, counters: { ...fixture.data.lubec.counters, stress: 6 } },
    })
    expect(tx.set).toHaveBeenNthCalledWith(2, { path: 'writeReceipts/stable-edit' }, { intention: intention(), outcome: result })
    expect(vi.mocked(tx.get).mock.invocationCallOrder[1]).toBeLessThan(vi.mocked(tx.set).mock.invocationCallOrder[0])
  })

  it('returns the receipt without rereading or rewriting a sheet', async () => {
    const tx = transaction()
    const outcome = { status: 'committed', operationId: 'stable-edit', revision: 3 }
    vi.mocked(tx.get).mockResolvedValue({ exists: () => true, data: () => ({ intention: intention(), outcome }) } as never)
    vi.mocked(runTransaction).mockImplementation(async (_db, callback) => callback(tx))
    expect(await saveSheetIntention(db, sheetRef, intention())).toEqual(outcome)
    expect(tx.get).toHaveBeenCalledTimes(1)
    expect(tx.set).not.toHaveBeenCalled()
  })

  it('does not write or create a receipt for a repair result', async () => {
    const tx = transaction({ sheetRevision: 1 })
    vi.mocked(runTransaction).mockImplementation(async (_db, callback) => callback(tx))
    expect(await saveSheetIntention(db, sheetRef, intention())).toEqual({ status: 'repair', code: 'invalid-path', path: ['lubec', 'counters', 'stress'] })
    expect(tx.set).not.toHaveBeenCalled()
  })

  it('returns structured validation repair before accessing Firestore', async () => {
    expect(await saveSheetIntention(db, sheetRef, { ...intention(), operationId: '/' })).toEqual({ status: 'repair', code: 'invalid-intention', path: [] })
    expect(runTransaction).not.toHaveBeenCalled()
  })

  it('validates composed preparation before reading any document', async () => {
    const tx = transaction()
    await expect(prepareSheetIntention(tx, sheetRef, { ...intention(), operationId: '/' })).rejects.toThrow('invalid-intention')
    expect(tx.get).not.toHaveBeenCalled()
  })

  it('removes any caller converter to read and write canonical stored fields', async () => {
    const tx = transaction()
    const withConverter = vi.fn(() => sheetRef)
    const converted = { path: sheetRef.path, withConverter } as unknown as DocumentReference
    vi.mocked(runTransaction).mockImplementation(async (_db, callback) => callback(tx))
    expect(await saveSheetIntention(db, converted, intention())).toMatchObject({ status: 'committed' })
    expect(withConverter).toHaveBeenCalledWith(null)
    expect(tx.get).toHaveBeenLastCalledWith(sheetRef)
    expect(vi.mocked(tx.set).mock.calls[0][0]).toBe(sheetRef)
  })

  it('propagates network or permission failures for the caller to retry with the same operation id', async () => {
    vi.mocked(runTransaction).mockRejectedValue(new Error('permission-denied'))
    await expect(saveSheetIntention(db, sheetRef, intention())).rejects.toThrow('permission-denied')
  })

  it('rebases a revision-fenced permission denial only after a fresh server read proves contention', async () => {
    const denied = new FirebaseError('permission-denied', 'revision fence')
    const old = transaction()
    const current = transaction({ ...fixture.data, sheetRevision: 1, name: 'Newer name', lubec: { ...fixture.data.lubec, counters: { ...fixture.data.lubec.counters, stress: 9 } } })
    const edit = intention()
    vi.mocked(runTransaction)
      .mockImplementationOnce(async (_db, callback) => { await callback(old); edit.edits[0].path = ['name']; throw denied })
      .mockImplementationOnce(async (_db, callback) => callback(current))
    vi.mocked(getDocFromServer).mockResolvedValue({ exists: () => true, data: () => ({ sheetRevision: 1 }) } as never)
    expect(await saveSheetIntention(db, sheetRef, edit)).toEqual({ status: 'committed', operationId: 'stable-edit', revision: 2 })
    expect(runTransaction).toHaveBeenCalledTimes(2)
    expect(getDocFromServer).toHaveBeenCalledWith(sheetRef)
    expect(vi.mocked(current.set).mock.calls[0][1]).toMatchObject({ name: 'Newer name', sheetRevision: 2, lubec: { counters: { stress: 11 } } })
    expect(vi.mocked(current.set).mock.calls[1][1]).toMatchObject({ intention: intention() })
  })

  it.each([undefined, 0])('surfaces a genuine denial without retry when the stored revision is still %s', async (revision) => {
    const denied = new FirebaseError('permission-denied', 'not authorized')
    vi.mocked(runTransaction).mockImplementation(async (_db, callback) => { await callback(transaction()); throw denied })
    vi.mocked(getDocFromServer).mockResolvedValue({ exists: () => true, data: () => ({ sheetRevision: revision }) } as never)
    await expect(saveSheetIntention(db, sheetRef, intention())).rejects.toBe(denied)
    expect(runTransaction).toHaveBeenCalledTimes(1)
  })

  it('surfaces genuine write denial after unrelated contention instead of looping', async () => {
    const denied = new FirebaseError('permission-denied', 'owner changed')
    vi.mocked(runTransaction)
      .mockImplementationOnce(async (_db, callback) => { await callback(transaction()); throw denied })
      .mockImplementationOnce(async (_db, callback) => { await callback(transaction({ ...fixture.data, sheetRevision: 1 })); throw denied })
    vi.mocked(getDocFromServer).mockResolvedValue({ exists: () => true, data: () => ({ sheetRevision: 1 }) } as never)
    await expect(saveSheetIntention(db, sheetRef, intention())).rejects.toBe(denied)
    expect(runTransaction).toHaveBeenCalledTimes(2)
  })

  it('does not treat arbitrary errors with a matching code as an SDK revision denial', async () => {
    const error = Object.assign(new Error('application error'), { code: 'permission-denied' })
    vi.mocked(runTransaction).mockImplementation(async (_db, callback) => { await callback(transaction()); throw error })
    await expect(saveSheetIntention(db, sheetRef, intention())).rejects.toBe(error)
    expect(runTransaction).toHaveBeenCalledTimes(1)
    expect(getDocFromServer).not.toHaveBeenCalled()
  })

  it('bounds recovery at three transactions even if the revision keeps advancing', async () => {
    const denied = new FirebaseError('permission-denied', 'keeps losing contention')
    let revision = 0
    vi.mocked(runTransaction).mockImplementation(async (_db, callback) => {
      await callback(transaction({ ...fixture.data, sheetRevision: revision }))
      revision += 1
      throw denied
    })
    vi.mocked(getDocFromServer).mockImplementation(async () => ({ exists: () => true, data: () => ({ sheetRevision: revision }) }) as never)
    await expect(saveSheetIntention(db, sheetRef, intention())).rejects.toBe(denied)
    expect(runTransaction).toHaveBeenCalledTimes(3)
    expect(getDocFromServer).toHaveBeenCalledTimes(2)
  })

  it('does not retry read-denied or network failures before a write is prepared', async () => {
    const denied = new FirebaseError('permission-denied', 'cannot read receipt')
    vi.mocked(runTransaction).mockRejectedValueOnce(denied)
    await expect(saveSheetIntention(db, sheetRef, intention())).rejects.toBe(denied)
    expect(runTransaction).toHaveBeenCalledTimes(1)
    expect(getDocFromServer).not.toHaveBeenCalled()
  })

  it('propagates a non-permission error after preparing a write without probing the revision', async () => {
    const offline = new FirebaseError('unavailable', 'offline')
    vi.mocked(runTransaction).mockImplementation(async (_db, callback) => { await callback(transaction()); throw offline })
    await expect(saveSheetIntention(db, sheetRef, intention())).rejects.toBe(offline)
    expect(runTransaction).toHaveBeenCalledTimes(1)
    expect(getDocFromServer).not.toHaveBeenCalled()
  })

  it('surfaces revoked read authority and deleted sheets instead of retrying or resurrecting them', async () => {
    const denied = new FirebaseError('permission-denied', 'cannot commit')
    vi.mocked(runTransaction).mockImplementation(async (_db, callback) => { await callback(transaction()); throw denied })
    const readDenied = new FirebaseError('permission-denied', 'membership revoked')
    vi.mocked(getDocFromServer).mockRejectedValueOnce(readDenied)
    await expect(saveSheetIntention(db, sheetRef, intention())).rejects.toBe(readDenied)
    vi.mocked(getDocFromServer).mockResolvedValueOnce({ exists: () => false } as never)
    await expect(saveSheetIntention(db, sheetRef, intention())).rejects.toBe(denied)
    expect(runTransaction).toHaveBeenCalledTimes(2)
  })

  it('returns a receipt committed by a duplicate operation after a revision race without another write', async () => {
    const denied = new FirebaseError('permission-denied', 'revision fence')
    const retried = transaction()
    const outcome = { status: 'committed', operationId: 'stable-edit', revision: 1 }
    vi.mocked(retried.get).mockResolvedValue({ exists: () => true, data: () => ({ intention: intention(), outcome }) } as never)
    vi.mocked(runTransaction)
      .mockImplementationOnce(async (_db, callback) => { await callback(transaction()); throw denied })
      .mockImplementationOnce(async (_db, callback) => callback(retried))
    vi.mocked(getDocFromServer).mockResolvedValue({ exists: () => true, data: () => ({ sheetRevision: 1 }) } as never)
    expect(await saveSheetIntention(db, sheetRef, intention())).toEqual(outcome)
    expect(retried.set).not.toHaveBeenCalled()
    expect(retried.get).toHaveBeenCalledTimes(1)
  })

  it('clears the attempted revision when a later SDK callback cannot prepare a write', async () => {
    const denied = new FirebaseError('permission-denied', 'membership revoked during SDK retry')
    vi.mocked(runTransaction).mockImplementation(async (_db, callback) => {
      await callback(transaction())
      const unreadable = transaction()
      vi.mocked(unreadable.get).mockRejectedValue(denied)
      return callback(unreadable)
    })
    await expect(saveSheetIntention(db, sheetRef, intention())).rejects.toBe(denied)
    expect(getDocFromServer).not.toHaveBeenCalled()
  })

  it('captures the envelope before sending and retains it over callback retries', async () => {
    const edit = intention()
    const tx = transaction()
    vi.mocked(runTransaction).mockImplementation(async (_db, callback) => {
      await callback(tx)
      edit.edits[0].path = ['name']
      return callback(tx)
    })
    expect(await saveSheetIntention(db, sheetRef, edit)).toEqual({ status: 'committed', operationId: 'stable-edit', revision: 1 })
    expect(tx.set).toHaveBeenCalledTimes(4)
    expect(vi.mocked(tx.set).mock.calls[1]).toEqual(vi.mocked(tx.set).mock.calls[3])
  })

  it('allows preparation of multiple sheets and external reads before any writes', async () => {
    const tx = transaction()
    const second = reference('npcSheets/npc')
    const firstPrepared = await prepareSheetIntention(tx, sheetRef, intention())
    const secondPrepared = await prepareSheetIntention(tx, second, { ...intention(), operationId: 'npc-edit' })
    await tx.get({ path: 'items/rope' } as DocumentReference)
    expect(tx.set).not.toHaveBeenCalled()
    writePreparedSheetIntentions(tx, [firstPrepared, secondPrepared])
    expect(tx.get).toHaveBeenCalledTimes(5)
    expect(tx.set).toHaveBeenCalledTimes(4)
    expect(vi.mocked(tx.get).mock.invocationCallOrder[4]).toBeLessThan(vi.mocked(tx.set).mock.invocationCallOrder[0])
  })

  it('refuses a multi-sheet operation before writing when any sheet needs repair or appears twice', async () => {
    const tx = transaction()
    const first = await prepareSheetIntention(tx, sheetRef, intention())
    expect(() => writePreparedSheetIntentions(tx, [first, first])).toThrow('invalid-intention')
    const second = { ...first, sheetRef: { path: 'npcSheets/npc' } as DocumentReference, outcome: { status: 'repair', code: 'sheet-deleted', path: [] } as const }
    expect(() => writePreparedSheetIntentions(tx, [first, second])).toThrow('sheet-deleted')
    expect(tx.set).not.toHaveBeenCalled()
  })
})

it('rejects malformed path and edit bases at validation, before any storage read', () => {
  for (const path of [[], [{ recordId: 'row' }], ['items', { recordId: ['row'] }]]) expect(() => validateSheetIntention({ ...intention(), edits: [{ kind: 'set', path, base: { exists: false }, value: 'new' }] } as never)).toThrow('invalid-path')
  expect(() => validateSheetIntention({ ...intention(), edits: [{ kind: 'delta', path: ['counter'], base: NaN, amount: 1 }] })).toThrow('invalid-intention')
  expect(() => validateSheetIntention({ ...intention(), edits: [{ kind: 'set', path: ['name'], base: { exists: true, value: undefined }, value: 'new' }] } as never)).toThrow('invalid-intention')
})
