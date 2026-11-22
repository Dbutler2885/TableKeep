import { beforeEach, expect, it, vi } from 'vitest'
import { FirebaseError } from 'firebase/app'
import { getDocFromServer, type DocumentReference, type Transaction } from 'firebase/firestore'
import { sheetFixtureDoc } from '../../character/characterStore/__tests__/sheetProtocol'
import { hasMoveReceipt, isSheetRef, moveCommand, prepareMovedSheet, withMoveSheetRetries, writeMovedSheets } from './lubecMoveSheets'
import type { LubecMoveRequest } from './lubecMoveTransaction'
vi.mock('firebase/firestore', () => ({ doc: (...args: Parameters<typeof sheetFixtureDoc>) => sheetFixtureDoc(...args), getDocFromServer: vi.fn(), serverTimestamp: () => 'server-time' }))
const ref = (path: string) => sheetFixtureDoc({}, path) as DocumentReference
const source = ref('groups/g/campaigns/c/characters/source'), target = ref('groups/g/campaigns/c/npcSheets/target'), carrier = ref('groups/g/campaigns/c/sharedCarriers/skiff')
const request: LubecMoveRequest = { scope: { groupId: 'g', campaignId: 'c' }, operationId: 'move-one', from: { kind: 'character', characterId: 'source' }, to: { kind: 'npc', npcId: 'target' }, move: { itemId: 'one' } }
const tx = { get: vi.fn(), set: vi.fn() }
const transaction = tx as unknown as Transaction
const snap = (data?: object) => ({ exists: () => data !== undefined, data: () => data })
beforeEach(() => { vi.resetAllMocks(); tx.get.mockResolvedValue(snap()) })
it('reads command receipts only for character/NPC sheets and returns false when none exist', async () => {
  expect(isSheetRef(source)).toBe(true); expect(isSheetRef(target)).toBe(true); expect(isSheetRef(carrier)).toBe(false)
  expect(await hasMoveReceipt(transaction, [source, carrier, target], request)).toBe(false)
  expect(tx.get.mock.calls.map(([entry]) => entry.path)).toEqual([`${source.path}/writeReceipts/move-one`, `${target.path}/writeReceipts/move-one`])
  tx.get.mockClear()
  expect(await hasMoveReceipt(transaction, [carrier], request)).toBe(false)
  expect(tx.get).not.toHaveBeenCalled()
})
it('replays an identical multi-sheet command and refuses mismatched or incomplete receipts before writes', async () => {
  const command = moveCommand(request)
  tx.get.mockResolvedValue(snap({ command }))
  expect(await hasMoveReceipt(transaction, [source, target], request)).toBe(true)
  tx.get.mockResolvedValueOnce(snap({ command })).mockResolvedValueOnce(snap())
  await expect(hasMoveReceipt(transaction, [source, target], request)).rejects.toThrow('invalid-intention')
  for (const mismatch of [undefined, { ...command, move: { itemId: 'other' } }]) {
    tx.get.mockResolvedValueOnce(snap({ command })).mockResolvedValueOnce(snap({ command: mismatch }))
    await expect(hasMoveReceipt(transaction, [source, target], request)).rejects.toThrow('operation-id-reused')
  }
  expect(tx.set).not.toHaveBeenCalled()
})
it('prepares canonical sheet intentions and command metadata without writing non-sheet records', () => {
  const before = { name: 'Ada', schemaVersion: 1, schemaWrittenAt: 'stamp', unknown: true, sheetRevision: 4, lubec: { counters: { stress: 2 }, gear: { items: [{ id: 'one', name: 'Rock' }], carriers: [], supplies: [], overrides: [] } } }
  const after = { kind: 'sheet' as const, gear: { ...before.lubec.gear, items: [] } }
  const prepared = prepareMovedSheet(source, before, after as never, request)!
  expect(prepared.receiptRef.path).toBe(`${source.path}/writeReceipts/move-one`)
  expect(prepared.mutation?.sheet).toMatchObject({ ...before, sheetRevision: 5, lubec: { ...before.lubec, gear: after.gear } })
  expect(prepared.mutation?.receipt).toMatchObject({ command: moveCommand(request), intention: { operationId: 'move-one', baseRevision: 4 } })
  writeMovedSheets(transaction, [null, prepared])
  expect(tx.set).toHaveBeenCalledTimes(2)
  expect(tx.set.mock.calls[1][1]).toMatchObject({ command: moveCommand(request) })
  expect(prepareMovedSheet(carrier, {}, { items: [] } as never, request)).toBeNull()
  const repair = prepareMovedSheet(source, before, after as never, { ...request, operationId: '/' })!
  expect(repair.outcome.status).toBe('repair')
  expect(repair.mutation).toBeUndefined()
})
it('retries a revision-fenced sheet write using its captured attempted revision and ignores carrier-only writes', async () => {
  const denied = new FirebaseError('permission-denied', 'revision fence')
  const write = vi.fn().mockRejectedValueOnce(denied).mockResolvedValue('committed')
  vi.mocked(getDocFromServer).mockResolvedValue(snap({ sheetRevision: 1 }) as never)
  expect(await withMoveSheetRetries([carrier, source], write, new Map([[source.path, 1]]))).toBe('committed')
  expect(write).toHaveBeenCalledTimes(2)
  expect(getDocFromServer).toHaveBeenCalledExactlyOnceWith(source)
  vi.mocked(getDocFromServer).mockClear()
  const carrierWrite = vi.fn().mockRejectedValue(denied)
  await expect(withMoveSheetRetries([carrier], carrierWrite, new Map([[carrier.path, 1]]))).rejects.toBe(denied)
  expect(getDocFromServer).not.toHaveBeenCalled()
})
