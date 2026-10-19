import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const records = new Map<string, Record<string, unknown>>()
  type Ref = { path: string; collection: (name: string) => { doc: (id: string) => Ref } }
  const ref = (path: string): Ref => ({
    path, collection: (name) => ({ doc: (id) => ref(`${path}/${name}/${id}`) }),
  })
  return { records, ref, get: vi.fn(), set: vi.fn(), delete: vi.fn(), runTransaction: vi.fn() }
})
vi.mock('../../../functions/src/adminApp.js', () => ({
  adminApp: vi.fn(), adminFirestore: () => ({ doc: mocks.ref, runTransaction: mocks.runTransaction }),
}))
const module = await import('../../../functions/src/index')
type Request = { data?: Record<string, unknown>; auth?: { uid: string } }
const accept = (module.acceptPendingTransfer as unknown as { run: (request: Request) => Promise<{ ok: boolean }> }).run
const path = 'groups/g/campaigns/c'
const senderPath = `${path}/characters/sender`
const receiverPath = `${path}/characters/receiver`
const transferPath = `${path}/pendingTransfers/offer`
const sword = { id: 'sword', kind: 'weapon', equipped: true, qty: 5, unknownRow: { kept: true } }
const offer = {
  fromCharacterId: 'sender', toCharacterId: 'receiver', fromUserId: 'sender-user', toUserId: 'receiver-user',
  itemId: 'sword', itemSnapshot: { ...sword, id: 'split', qty: 2 },
}
const request: Request = { auth: { uid: 'receiver-user' }, data: { groupId: 'g', campaignId: 'c', transferId: 'offer' } }
const writes = () => mocks.set.mock.calls.map(([ref, fields, options]) => [ref.path, fields, options])
const deletes = () => mocks.delete.mock.calls.map(([ref]) => ref.path)

beforeEach(() => {
  vi.resetAllMocks()
  mocks.records.clear()
  mocks.records.set('groups/g/members/receiver-user', { status: 'active', role: 'member' })
  mocks.records.set(path, { gmUserId: 'gm' })
  mocks.records.set(transferPath, offer)
  mocks.records.set(senderPath, { ownerUserId: 'sender-user', details: { inventory: [sword], notes: 'sender-note' } })
  mocks.records.set(receiverPath, { ownerUserId: 'receiver-user', details: { inventory: [], future: { kept: true } } })
  mocks.get.mockImplementation(async (ref) => ({ exists: mocks.records.has(ref.path), data: () => mocks.records.get(ref.path) }))
  mocks.runTransaction.mockImplementation(async (body) => body(mocks))
})

describe('actual transfer callable before version stamping', () => {
  it('reads membership/campaign, transfer, then both characters; writes sender then receiver then deletes the offer', async () => {
    await expect(accept(request)).resolves.toEqual({ ok: true })
    expect(mocks.get.mock.calls.map(([ref]) => ref.path)).toEqual([
      'groups/g/members/receiver-user', path, transferPath, senderPath, receiverPath,
    ])
    expect(writes()).toEqual([
      [senderPath, { details: { inventory: [{ ...sword, qty: 3 }], notes: 'sender-note' } }, { merge: true }],
      [receiverPath, { details: { inventory: [{ ...offer.itemSnapshot, equipped: false }], future: { kept: true } } }, { merge: true }],
    ])
    expect(deletes()).toEqual([transferPath])
    expect(Math.max(...mocks.get.mock.invocationCallOrder)).toBeLessThan(mocks.set.mock.invocationCallOrder[0])
    expect(mocks.set.mock.invocationCallOrder[1]).toBeLessThan(mocks.delete.mock.invocationCallOrder[0])
  })

  it.each([undefined, '', 'unknown', 'ose', 'vtm', 'lubec'])('currently ignores campaign system %s', async (system) => {
    mocks.records.set(path, { gmUserId: 'gm', ...(system === undefined ? {} : { system }) })
    await expect(accept(request)).resolves.toEqual({ ok: true })
    expect(mocks.set).toHaveBeenCalledTimes(2)
  })

  it.each([senderPath, receiverPath])('ignores old and newer versions on %s and writes no stamps', async (characterPath) => {
    for (const schemaVersion of [undefined, 0, 1, 2]) {
      mocks.set.mockClear()
      mocks.records.set(characterPath, { ...mocks.records.get(characterPath), schemaVersion, schemaWrittenAt: 'previous' })
      await expect(accept(request)).resolves.toEqual({ ok: true })
      expect(writes().map(([, fields]) => Object.keys(fields))).toEqual([['details'], ['details']])
    }
  })

  it.each([{}, { auth: { uid: '' } }])('requires authentication before any database operation: %j', async (auth) => {
    await expect(accept({ data: request.data, ...auth })).rejects.toMatchObject({ code: 'unauthenticated', message: 'Authentication required.' })
    expect(mocks.runTransaction).not.toHaveBeenCalled()
  })

  it.each([undefined, {}, { groupId: 7, campaignId: 'c', transferId: 'offer' }, { groupId: 'g', campaignId: '', transferId: 'offer' }, { groupId: 'g', campaignId: 'c', transferId: null }])('requires string scope and offer ids: %j', async (data) => {
    await expect(accept({ ...request, data })).rejects.toMatchObject({ code: 'invalid-argument' })
    expect(mocks.runTransaction).not.toHaveBeenCalled()
  })

  it.each([undefined, { status: 'inactive' }])('requires active membership: %j', async (member) => {
    mocks.records.delete('groups/g/members/receiver-user')
    if (member) mocks.records.set('groups/g/members/receiver-user', member)
    await expect(accept(request)).rejects.toMatchObject({ code: 'permission-denied', message: 'Active group membership required.' })
    expect(mocks.get).toHaveBeenCalledTimes(2)
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.delete).not.toHaveBeenCalled()
  })

  it.each([[path, 'Campaign no longer exists.'], [transferPath, 'Transfer no longer exists.']])('refuses missing %s without writing', async (missingPath, message) => {
    mocks.records.delete(missingPath)
    await expect(accept(request)).rejects.toMatchObject({ code: 'not-found', message })
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.delete).not.toHaveBeenCalled()
  })

  it('refuses another recipient without reading either character', async () => {
    mocks.records.set(transferPath, { ...offer, toUserId: 'other' })
    await expect(accept(request)).rejects.toMatchObject({ code: 'permission-denied', message: 'You cannot accept this transfer.' })
    expect(mocks.get).toHaveBeenCalledTimes(3)
    expect(mocks.delete).not.toHaveBeenCalled()
  })

  it.each(['admin', 'campaign-gm'])('lets a %s accept on a recipient behalf', async (authority) => {
    mocks.records.set(transferPath, { ...offer, toUserId: 'other' })
    if (authority === 'admin') mocks.records.set('groups/g/members/receiver-user', { status: 'active', role: 'admin' })
    else mocks.records.set(path, { gmUserId: 'receiver-user' })
    await expect(accept(request)).resolves.toEqual({ ok: true })
  })

  it.each([senderPath, receiverPath])('deletes the offer when %s is missing, then rejects after the transaction', async (missingPath) => {
    mocks.records.delete(missingPath)
    await expect(accept(request)).rejects.toMatchObject({ code: 'not-found', message: 'Item no longer available.' })
    expect(mocks.set).not.toHaveBeenCalled()
    expect(deletes()).toEqual([transferPath])
  })

  it('discards a forged source without modifying either character', async () => {
    mocks.records.set(senderPath, { ownerUserId: 'victim' })
    await expect(accept(request)).rejects.toMatchObject({ code: 'permission-denied', message: 'Transfer is not authorized.' })
    expect(mocks.set).not.toHaveBeenCalled()
    expect(deletes()).toEqual([transferPath])
  })

  it.each([
    ['missing inventory', undefined], ['malformed details', 'bad'], ['malformed inventory', { inventory: 'bad' }],
    ['missing item', { inventory: [] }], ['kind mismatch', { inventory: [{ ...sword, kind: 'general' }] }],
  ])('discards an unavailable offer for %s', async (_name, details) => {
    mocks.records.set(senderPath, { ownerUserId: 'sender-user', details })
    await expect(accept(request)).rejects.toMatchObject({ code: 'not-found', message: 'Item no longer available.' })
    expect(mocks.set).not.toHaveBeenCalled()
    expect(deletes()).toEqual([transferPath])
  })

  it('discards an offer whose quantity changed', async () => {
    mocks.records.set(senderPath, { ownerUserId: 'sender-user', details: { inventory: [{ ...sword, qty: 1 }] } })
    await expect(accept(request)).rejects.toMatchObject({ code: 'failed-precondition', message: 'Item quantity changed before transfer could be accepted.' })
    expect(mocks.set).not.toHaveBeenCalled()
    expect(deletes()).toEqual([transferPath])
  })

  it('keeps the offer and both characters untouched when packed slots are full', async () => {
    mocks.records.set(receiverPath, { details: { inventory: Array.from({ length: 13 }, (_, i) => ({ ...sword, id: String(i), equipped: false })) } })
    await expect(accept(request)).rejects.toMatchObject({ code: 'failed-precondition', message: 'Not enough packed slots to accept this item.' })
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.delete).not.toHaveBeenCalled()
  })

  it.each([undefined, null, 'bad', { inventory: 'bad' }])('defaults receiver details %j and writes the offered snapshot', async (details) => {
    mocks.records.set(receiverPath, { details })
    await expect(accept(request)).resolves.toEqual({ ok: true })
    expect(writes()[1]).toEqual([receiverPath, { details: { inventory: [{ ...offer.itemSnapshot, equipped: false }] } }, { merge: true }])
  })

  it('propagates a transaction failure', async () => {
    mocks.runTransaction.mockRejectedValue(new Error('database unavailable'))
    await expect(accept(request)).rejects.toThrow('database unavailable')
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.delete).not.toHaveBeenCalled()
  })
})
