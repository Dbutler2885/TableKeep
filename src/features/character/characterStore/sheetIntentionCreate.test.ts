import { beforeEach, expect, it, vi } from 'vitest'
import { FirebaseError } from 'firebase/app'
import { getDocFromServer, runTransaction, type DocumentReference, type Firestore, type Transaction } from 'firebase/firestore'
import { createRevisionedSheet } from './sheetIntentionCreate'
import { sheetPayload } from './sheetIntentionEdits'
vi.mock('firebase/firestore', () => ({
  doc: (ref: { path: string }, ...parts: string[]) => ({ path: [ref.path, ...parts].join('/') }),
  runTransaction: vi.fn(), getDocFromServer: vi.fn(),
}))
const ref = { path: 'characters/hero', id: 'hero', withConverter() { return this } } as DocumentReference
const db = {} as Firestore
const initial = { name: 'Ada', system: 'lubec', schemaVersion: 1 }
const fields = { ...initial, createdAt: 'server-time', updatedAt: 'server-time', schemaWrittenAt: 'server-time' }
const receiptRef = { path: 'characters/hero/writeReceipts/create-hero' }
const snapshot = (data?: object) => ({ exists: () => data !== undefined, data: () => data })
function transaction(sheet?: object, receipt?: object) {
  return { get: vi.fn(async (target: DocumentReference) => snapshot(target.path.includes('/writeReceipts/') ? receipt : sheet)), set: vi.fn() } as unknown as Transaction
}
beforeEach(() => vi.resetAllMocks())
it('creates revision zero and its stable receipt atomically without losing the schema stamps', async () => {
  const tx = transaction()
  vi.mocked(runTransaction).mockImplementation(async (_db, callback) => callback(tx))
  await createRevisionedSheet(db, ref, fields, initial)
  expect(tx.get).toHaveBeenCalledExactlyOnceWith(ref)
  expect(tx.set).toHaveBeenNthCalledWith(1, ref, { ...fields, sheetRevision: 0 })
  expect(tx.set).toHaveBeenNthCalledWith(2, receiptRef, { createPayload: sheetPayload(initial), outcome: { status: 'committed', operationId: 'create-hero', revision: 0 } })
})
it('deduplicates creation after later edits without overwriting them', async () => {
  const tx = transaction({ ...fields, name: 'Newer', sheetRevision: 4 }, { createPayload: sheetPayload(initial) })
  vi.mocked(runTransaction).mockImplementation(async (_db, callback) => callback(tx))
  await createRevisionedSheet(db, ref, fields, initial)
  expect(tx.get).toHaveBeenNthCalledWith(2, receiptRef)
  expect(tx.set).not.toHaveBeenCalled()
})
it.each([undefined, { createPayload: sheetPayload({ ...initial, name: 'Other' }) }])('refuses a colliding identity with receipt %j', async (receipt) => {
  const tx = transaction(initial, receipt)
  vi.mocked(runTransaction).mockImplementation(async (_db, callback) => callback(tx))
  await expect(createRevisionedSheet(db, ref, fields, initial)).rejects.toThrow('value-conflict')
  expect(tx.set).not.toHaveBeenCalled()
})
it('recovers a simultaneous creation only after a server read proves its revision exists', async () => {
  const missing = transaction(), existing = transaction(initial, { createPayload: sheetPayload(initial) })
  const denied = new FirebaseError('permission-denied', 'creation race')
  vi.mocked(runTransaction).mockImplementationOnce(async (_db, callback) => { await callback(missing); throw denied }).mockImplementationOnce(async (_db, callback) => callback(existing))
  vi.mocked(getDocFromServer).mockResolvedValue(snapshot({ sheetRevision: 0 }) as never)
  await createRevisionedSheet(db, ref, fields, initial)
  expect(runTransaction).toHaveBeenCalledTimes(2)
  expect(existing.set).not.toHaveBeenCalled()
})
it('clears the attempted creation revision before an SDK retry loses read authority', async () => {
  const denied = new FirebaseError('permission-denied', 'cannot read')
  const unreadable = transaction(); vi.mocked(unreadable.get).mockRejectedValue(denied)
  vi.mocked(runTransaction).mockImplementation(async (_db, callback) => { await callback(transaction()); return callback(unreadable) })
  await expect(createRevisionedSheet(db, ref, fields, initial)).rejects.toBe(denied)
  expect(getDocFromServer).not.toHaveBeenCalled()
})
