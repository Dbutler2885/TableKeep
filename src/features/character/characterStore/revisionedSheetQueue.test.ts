// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FirebaseError } from 'firebase/app'
import type { DocumentReference, Firestore } from 'firebase/firestore'
import type { SheetIntention } from './sheetIntentionTypes'
const mocks = vi.hoisted(() => ({ save: vi.fn(), read: vi.fn() }))
vi.mock('firebase/firestore', () => ({ doc: (parent: { path: string }, ...parts: string[]) => ({ path: [parent.path, ...parts].join('/') }), getDocFromServer: mocks.read }))
vi.mock('./sheetIntentionTransaction', () => ({ saveSheetIntention: mocks.save }))
const { makeRevisionedSheetQueue, enqueueSheetEdit, flushSheetQueue, queueSheetSave, receiveSheetSnapshot, discardSheetEdits, sheetQueueOutstanding, sheetQueueError } = await import('./revisionedSheetQueue')
const { readSheetEditJournal, writeSheetEditJournal } = await import('./sheetEditJournal')
const { optimisticSheet } = await import('./sheetOptimistic')
const ref = { path: 'groups/g/campaigns/c/characters/hero' } as DocumentReference
const raw = { name: 'Ada', lubec: { counters: { stress: 4 } } }
const intention: SheetIntention = { operationId: 'edit', baseRevision: 0, edits: [{ kind: 'delta', path: ['lubec', 'counters', 'stress'], base: 4, amount: 1 }] }
const committed = { status: 'committed', operationId: 'edit', revision: 1 }
const queue = () => makeRevisionedSheetQueue({} as Firestore, ref, 'owner', raw, vi.fn())
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); sessionStorage.clear(); mocks.save.mockResolvedValue(committed); mocks.read.mockResolvedValue({ exists: () => false }) })
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks() })

it('debounces edits, flushes at once, persists the operation and never double-starts an in-flight save', async () => {
  const q = queue(); enqueueSheetEdit(q, intention); queueSheetSave(q); queueSheetSave(q)
  expect(sheetQueueOutstanding(q)).toBe(true)
  await vi.advanceTimersByTimeAsync(499)
  expect(mocks.save).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(mocks.save).toHaveBeenCalledTimes(1)
  expect(readSheetEditJournal('owner', ref.path)[0].intention).toEqual(intention)
  expect(sheetQueueOutstanding(q)).toBe(false)
  mocks.read.mockResolvedValue({ exists: () => true, data: () => ({ intention, outcome: committed }) })
  expect(await receiveSheetSnapshot(q, { ...raw, sheetRevision: 1, lubec: { counters: { stress: 5 } } })).toMatchObject({ lubec: { counters: { stress: 5 } } })
  expect(q.state.pending).toEqual([])
  expect(readSheetEditJournal('owner', ref.path)).toEqual([])
})

it('keeps a busy queue intact and drains an edit appended while an earlier operation is awaiting acknowledgement', async () => {
  const q = queue(); let release = () => {}
  mocks.save.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(committed) }))
  enqueueSheetEdit(q, intention)
  const first = flushSheetQueue(q)
  expect(flushSheetQueue(q)).toBe(first)
  discardSheetEdits(q)
  expect(q.state.pending).toHaveLength(1)
  enqueueSheetEdit(q, { ...intention, operationId: 'second' })
  release(); await first
  expect(mocks.save).toHaveBeenCalledTimes(2)
  expect(sheetQueueError(q)).toBeUndefined()
})

it('retains offline edits, retries the same envelope, and lets an explicit discard remove its journal record', async () => {
  const q = queue(); enqueueSheetEdit(q, intention)
  mocks.save.mockRejectedValueOnce(new FirebaseError('unavailable', 'offline'))
  await flushSheetQueue(q)
  expect(sheetQueueError(q)).toContain('Retry when connected')
  expect(optimisticSheet(q.state)).toMatchObject({ lubec: { counters: { stress: 5 } } })
  queueSheetSave(q, true)
  await flushSheetQueue(q)
  expect(mocks.save).toHaveBeenNthCalledWith(2, q.db, q.ref, intention)
  discardSheetEdits(q)
  expect(readSheetEditJournal('owner', ref.path)).toEqual([])
})

it('explains a real rules denial as refresh-required and stops the queue before later edits', async () => {
  const q = queue(); enqueueSheetEdit(q, intention); enqueueSheetEdit(q, { ...intention, operationId: 'later' })
  mocks.save.mockRejectedValue(new FirebaseError('permission-denied', 'outdated writer'))
  await flushSheetQueue(q)
  expect(sheetQueueError(q)).toContain('Your version of Table Keep is out of date. Refresh to keep editing.')
  expect(mocks.save).toHaveBeenCalledTimes(1)
  expect(q.state.pending).toHaveLength(2)
})

it.each(['value-conflict', 'record-missing', 'sheet-deleted', 'record-exists', 'operation-id-reused', 'invalid-revision'] as const)('keeps %s repairs visible without discarding the intention', async (code) => {
  const q = queue(); enqueueSheetEdit(q, intention)
  mocks.save.mockResolvedValue({ status: 'repair', code, path: ['name'] })
  await flushSheetQueue(q)
  expect(sheetQueueError(q)).toContain('retained')
  expect(q.state.pending[0].intention).toEqual(intention)
})

it('reconciles committed receipts before rendering and retains current canonical data if the receipt read fails', async () => {
  const q = queue(); enqueueSheetEdit(q, intention)
  mocks.read.mockResolvedValueOnce({ exists: () => true, data: () => ({ intention, outcome: committed }) })
  const current = { ...raw, sheetRevision: 1, lubec: { counters: { stress: 5 } } }
  expect(await receiveSheetSnapshot(q, current)).toEqual(current)
  expect(q.state.pending).toEqual([])
  enqueueSheetEdit(q, { operationId: 'rename', baseRevision: 1, edits: [{ kind: 'set', path: ['name'], base: { exists: true, value: 'Ada' }, value: 'Mine' }] })
  mocks.read.mockRejectedValue(new FirebaseError('unavailable', 'offline'))
  expect(await receiveSheetSnapshot(q, { ...current, sheetRevision: 2, wound: 'Dazed' })).toMatchObject({ name: 'Mine', wound: 'Dazed' })
  expect(sheetQueueError(q)).toContain('retained')
})

it('rehydrates retained edits, ignores malformed journal entries and tolerates unavailable browser storage', async () => {
  writeSheetEditJournal('owner', ref.path, [{ intention }])
  const recovered = queue()
  expect(optimisticSheet(recovered.state)).toMatchObject({ lubec: { counters: { stress: 5 } } })
  await vi.advanceTimersByTimeAsync(500)
  expect(mocks.save).toHaveBeenCalledTimes(1)
  sessionStorage.setItem(`tablekeep-sheet-edits:owner:${ref.path}`, JSON.stringify([{ intention }, { intention: {} }]))
  expect(readSheetEditJournal('owner', ref.path)).toEqual([{ intention }])
  sessionStorage.setItem(`tablekeep-sheet-edits:owner:${ref.path}`, '{}')
  expect(readSheetEditJournal('owner', ref.path)).toEqual([])
  sessionStorage.setItem(`tablekeep-sheet-edits:owner:${ref.path}`, '{broken')
  expect(readSheetEditJournal('owner', ref.path)).toEqual([])
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('disabled') })
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('disabled') })
  expect(() => writeSheetEditJournal('owner', ref.path, [{ intention }])).not.toThrow()
  expect(readSheetEditJournal('owner', ref.path)).toEqual([])
})

it('notifies and journals each optimistic edit immediately, then journals acknowledgement before notifying completion', async () => {
  const q = queue()
  expect(sheetQueueOutstanding(q)).toBe(false)
  expect(q.notify).not.toHaveBeenCalled()
  enqueueSheetEdit(q, intention)
  expect(q.notify).toHaveBeenCalledTimes(1)
  expect(sessionStorage.getItem(`tablekeep-sheet-edits:owner:${ref.path}`)).toContain('edit')
  mocks.save.mockResolvedValue({ ...committed, revision: 7 })
  await flushSheetQueue(q)
  expect(q.running).toBeUndefined()
  expect(q.notify).toHaveBeenCalledTimes(3)
  expect(JSON.parse(sessionStorage.getItem(`tablekeep-sheet-edits:owner:${ref.path}`)!)[0].committedRevision).toBe(7)
  discardSheetEdits(q)
  expect(q.state.pending).toEqual([])
  expect(q.notify).toHaveBeenCalledTimes(4)
})
it('cancels a pending debounce on an immediate flush and marks all queued operations acknowledged before resolving', async () => {
  const q = queue(); enqueueSheetEdit(q, intention)
  queueSheetSave(q)
  mocks.save.mockImplementation(async (_db, _ref, envelope) => ({ status: 'committed', operationId: envelope.operationId, revision: envelope.operationId === 'edit' ? 1 : 2 }))
  enqueueSheetEdit(q, { ...intention, operationId: 'second' })
  await flushSheetQueue(q)
  expect(q.state.pending.map((entry) => entry.committedRevision)).toEqual([1, 2])
  const notices = vi.mocked(q.notify).mock.calls.length
  await vi.advanceTimersByTimeAsync(500)
  expect(q.notify).toHaveBeenCalledTimes(notices)
  expect(sheetQueueOutstanding(q)).toBe(false)
})
it('starts a clean edit enqueued during the completion notification of its previous save', async () => {
  const q = queue(); enqueueSheetEdit(q, intention)
  let added = false
  q.notify = () => {
    if (q.running || added) return
    added = true
    enqueueSheetEdit(q, { ...intention, operationId: 'second' })
  }
  await flushSheetQueue(q)
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
  expect(mocks.save).toHaveBeenCalledTimes(2)
  expect(q.state.pending.every((entry) => entry.committedRevision === 1)).toBe(true)
})
it('retains canonical updates and handles receipt-read denial even if an earlier snapshot already removed the pending entry', async () => {
  const q = queue(); enqueueSheetEdit(q, intention)
  let reject = (_error: unknown) => {}
  mocks.read.mockReturnValue(new Promise((_resolve, rejectRead) => { reject = rejectRead }))
  const receiving = receiveSheetSnapshot(q, { ...raw, sheetRevision: 1 })
  q.state.pending = []
  reject(new FirebaseError('permission-denied', 'revoked'))
  await expect(receiving).resolves.toMatchObject({ sheetRevision: 1 })
  expect(q.state.pending).toEqual([])
})
it('reports a receipt-probe permission failure as refresh-required while retaining the same operation', async () => {
  const q = queue(); enqueueSheetEdit(q, intention)
  mocks.read.mockRejectedValue(new FirebaseError('permission-denied', 'revoked'))
  await receiveSheetSnapshot(q, raw)
  expect(sheetQueueError(q)).toContain('Refresh to keep editing')
  expect(q.state.pending[0].intention).toEqual(intention)
  expect(readSheetEditJournal('another-user', ref.path)).toEqual([])
  expect(readSheetEditJournal('owner', `${ref.path}-another`)).toEqual([])
})
it('keeps a genuine repair in replay and prunes already confirmed intentions without applying another delta', () => {
  const q = queue(); enqueueSheetEdit(q, intention)
  q.state.pending[0].committedRevision = 0
  expect(optimisticSheet(q.state)).toEqual(raw)
  q.state.pending[0].committedRevision = undefined
  q.state.pending[0].intention = { operationId: 'repair', baseRevision: 0, edits: [{ kind: 'set', path: ['name'], base: { exists: true, value: 'Wrong base' }, value: 'Mine' }] }
  expect(optimisticSheet(q.state)).toEqual(raw)
  expect(sheetQueueError(q)).toContain('Another device changed')
})
it('accepts updated canonical data at the same revision, including metadata-only confirmations', () => {
  const q = queue()
  const state = q.state
  // No edit revision changes when only a timestamp resolves from the server.
  const current = { ...raw, updatedAt: 'server-time' }
  state.confirmed = { ...raw, sheetRevision: 0 }
  // This is the same public snapshot handler used for actual metadata confirmations.
  return receiveSheetSnapshot(q, current).then((shown) => expect(shown).toEqual(current))
})
it('flushes an immediate edit without a second explicit flush or a timer tick', async () => {
  const q = queue(); enqueueSheetEdit(q, intention)
  queueSheetSave(q, true)
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(q.db, q.ref, intention)
  expect(q.state.pending[0].committedRevision).toBe(1)
  expect(sheetQueueOutstanding(q)).toBe(false)
})
it('restarts the debounce without leaving an earlier timer to send another notification', async () => {
  const q = queue(); enqueueSheetEdit(q, intention); queueSheetSave(q)
  await vi.advanceTimersByTimeAsync(300)
  queueSheetSave(q)
  await vi.advanceTimersByTimeAsync(200)
  expect(mocks.save).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(300)
  const notices = vi.mocked(q.notify).mock.calls.length
  await vi.advanceTimersByTimeAsync(500)
  expect(mocks.save).toHaveBeenCalledTimes(1)
  expect(q.notify).toHaveBeenCalledTimes(notices)
})
it('reads a missing receipt from the correct subcollection without inventing an error or acknowledgement', async () => {
  const q = queue(); enqueueSheetEdit(q, intention)
  mocks.read.mockResolvedValue({ exists: () => false, data: () => undefined })
  await receiveSheetSnapshot(q, raw)
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith({ path: `${ref.path}/writeReceipts/edit` })
  expect(q.state.pending[0].error).toBeUndefined()
  expect(q.state.pending[0].committedRevision).toBeUndefined()
})
it('does not resolve a flush while the next queued operation is still awaiting its commit', async () => {
  const q = queue(); enqueueSheetEdit(q, intention); enqueueSheetEdit(q, { ...intention, operationId: 'second' })
  let release = () => {}, finished = false
  mocks.save.mockResolvedValueOnce(committed).mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({ ...committed, operationId: 'second', revision: 2 }) }))
  const saving = flushSheetQueue(q).then(() => { finished = true })
  for (let i = 0; i < 10; i += 1) await Promise.resolve()
  expect(mocks.save).toHaveBeenCalledTimes(2)
  expect(finished).toBe(false)
  release(); await saving
  expect(finished).toBe(true)
})
