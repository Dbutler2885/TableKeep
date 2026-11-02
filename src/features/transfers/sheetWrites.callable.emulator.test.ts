/** Pure protocol and Admin boundary coverage; no emulator or live project is used. */
import { beforeEach, expect, it, vi } from 'vitest'
import { writeAdminSheetChanges } from '../../../functions/src/sheets/adminSheetWrites'
import { replayTransferReceipt, transferOperationId } from '../../../functions/src/transferReceipt'
import type { TransferAccess } from '../../../functions/src/acceptTransfer'
import { planSheetIntention } from '../character/characterStore/sheetIntention'

type Transaction = Parameters<typeof writeAdminSheetChanges>[0]
type DocumentReference = Parameters<typeof writeAdminSheetChanges>[1][number]['ref']
type Fields = Record<string, unknown>
const records = new Map<string, Fields>()
const ref = (path: string): DocumentReference => ({ path, collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }) }) as DocumentReference
const tx = { get: vi.fn(), set: vi.fn() }
const transaction = tx as unknown as Transaction
const campaign = ref('groups/g/campaigns/c')
const sender = ref(`${campaign.path}/characters/sender`), receiver = ref(`${campaign.path}/characters/receiver`)
const identity = { fromCharacterId: 'sender', toCharacterId: 'receiver' }
const transfer = { id: 'offer', ...identity, fromUserId: 'sender-user', toUserId: 'recipient', itemId: 'item', itemSnapshot: {} }
const access = { uid: 'recipient', campaign, member: ref('groups/g/members/recipient'), transferId: 'offer', identity } as TransferAccess
const receiptPath = (id: string) => `${campaign.path}/characters/${id}/writeReceipts/transfer-offer`
beforeEach(() => { vi.resetAllMocks(); records.clear(); tx.get.mockImplementation(async (target) => ({ exists: records.has(target.path), data: () => records.get(target.path) })) })
it('prepares both Admin sheets before writing full canonical data and transfer metadata atomically', async () => {
  const first = { sheetRevision: 2, schemaVersion: 1, schemaWrittenAt: 'old-stamp', unknown: true, lubec: { future: true, gear: { items: [{ id: 'one', name: 'Old', unknown: 7 }], supplies: [] } } }
  const second = { ...first, sheetRevision: 4, name: 'Receiver' }
  await writeAdminSheetChanges(transaction, [
    { ref: sender, current: first, patch: { lubec: { gear: { items: [{ id: 'one', name: 'New', unknown: 7 }], supplies: [] } } } },
    { ref: receiver, current: second, patch: { name: 'Recipient' } },
  ], 'operation', { transfer })
  expect(tx.get.mock.calls.map(([target]) => target.path)).toEqual([`${sender.path}/writeReceipts/operation`, `${receiver.path}/writeReceipts/operation`])
  expect(Math.max(...tx.get.mock.invocationCallOrder)).toBeLessThan(tx.set.mock.invocationCallOrder[0])
  expect(tx.set.mock.calls[0]).toEqual([sender, { ...first, sheetRevision: 3, lubec: { ...first.lubec, gear: { ...first.lubec.gear, items: [{ id: 'one', name: 'New', unknown: 7 }] } }, updatedAt: expect.anything() }])
  expect(tx.set.mock.calls[2]).toEqual([receiver, { ...second, sheetRevision: 5, name: 'Recipient', updatedAt: expect.anything() }])
  expect(tx.set.mock.calls[1][0].path).toBe(`${sender.path}/writeReceipts/operation`)
  expect(tx.set.mock.calls[1][1]).toMatchObject({ transfer, intention: { operationId: 'operation', baseRevision: 2 }, outcome: { status: 'committed', revision: 3 } })
})
it('refuses duplicate Admin references and any repair before a write, and deduplicates an identical receipt', async () => {
  const change = { ref: sender, current: { name: 'Ada' }, patch: { name: 'New' } }
  await expect(writeAdminSheetChanges(transaction, [change, change], 'operation', {})).rejects.toThrow('invalid-intention')
  expect(tx.get).not.toHaveBeenCalled()
  records.set(`${sender.path}/writeReceipts/operation`, { intention: {}, outcome: {} })
  await expect(writeAdminSheetChanges(transaction, [change], 'operation', {})).rejects.toThrow('operation-id-reused')
  expect(tx.set).not.toHaveBeenCalled()
  records.set(`${sender.path}/writeReceipts/operation`, planSheetIntention(change.current, { operationId: 'operation', baseRevision: 0, edits: [{ kind: 'set', path: ['name'], base: { exists: true, value: 'Ada' }, value: 'New' }] }).mutation!.receipt)
  await writeAdminSheetChanges(transaction, [change], 'operation', {})
  expect(tx.set).not.toHaveBeenCalled()
})
it('replaces maps with scalars and scalars with maps in an Admin patch without manufacturing numeric deltas outside counters', async () => {
  await writeAdminSheetChanges(transaction, [{ ref: sender, current: { oldMap: { key: 'old' }, oldScalar: 1, number: 2 }, patch: { oldMap: 'new', oldScalar: { key: 'new' }, number: 3 } }], 'operation', {})
  expect(tx.set.mock.calls[0][1]).toMatchObject({ oldMap: 'new', oldScalar: { key: 'new' }, number: 3, sheetRevision: 1 })
})
it('replays both deleted-offer receipts for their recipient or GM without writing', async () => {
  expect(transferOperationId('offer')).toBe('transfer-offer')
  for (const id of ['sender', 'receiver']) records.set(receiptPath(id), { transfer })
  expect(await replayTransferReceipt(transaction, access, false)).toBe(true)
  expect(tx.get.mock.calls.map(([target]) => target.path)).toEqual([receiptPath('sender'), receiptPath('receiver')])
  expect(await replayTransferReceipt(transaction, { ...access, uid: 'other' }, true)).toBe(true)
  await expect(replayTransferReceipt(transaction, { ...access, uid: 'other' }, false)).rejects.toMatchObject({ code: 'permission-denied', message: 'You cannot accept this transfer.' })
  expect(tx.set).not.toHaveBeenCalled()
})
it('cannot replay a deleted offer without its retained pair or both receipts', async () => {
  expect(await replayTransferReceipt(transaction, { ...access, identity: undefined }, false)).toBe(false)
  expect(tx.get).not.toHaveBeenCalled()
  for (const existing of [[], ['sender'], ['receiver']]) {
    records.clear(); existing.forEach((id) => records.set(receiptPath(id), { transfer }))
    expect(await replayTransferReceipt(transaction, access, false)).toBe(false)
  }
})
it.each([undefined, {}, { ...transfer, id: 'different' }, { ...transfer, fromCharacterId: 'different' }, { ...transfer, toCharacterId: 'different' }])('refuses mismatched transfer metadata in either receipt: %j', async (bad) => {
  for (const badId of ['sender', 'receiver']) {
    for (const id of ['sender', 'receiver']) records.set(receiptPath(id), { transfer: id === badId ? bad : transfer })
    expect(await replayTransferReceipt(transaction, access, false)).toBe(false)
  }
})
