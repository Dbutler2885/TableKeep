/**
 * Unit characterization of the real callable, with its database boundary mocked.
 * Lives in the emulator job because importing functions/src/index.ts requires
 * functions/node_modules, which the ordinary web unit-test job does not install.
 */
import { capacityCases } from '../character/oseCarryingCases'
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
// The admin SDK's server time sentinel, which the callable stamps both characters with.
const SERVER_TIME = expect.objectContaining({ methodName: 'FieldValue.serverTimestamp' })
const stamp = { schemaVersion: 1, schemaWrittenAt: SERVER_TIME }
const deletes = () => mocks.delete.mock.calls.map(([ref]) => ref.path)

beforeEach(() => {
  vi.resetAllMocks()
  mocks.records.clear()
  mocks.records.set('groups/g/members/receiver-user', { status: 'active', role: 'member' })
  mocks.records.set(path, { gmUserId: 'gm' })
  mocks.records.set(transferPath, offer)
  mocks.records.set(senderPath, { ownerUserId: 'sender-user', schemaVersion: 1, details: { inventory: [sword], notes: 'sender-note' } })
  mocks.records.set(receiverPath, { ownerUserId: 'receiver-user', schemaVersion: 1, details: { inventory: [], future: { kept: true } } })
  mocks.get.mockImplementation(async (ref) => ({ exists: mocks.records.has(ref.path), data: () => mocks.records.get(ref.path) }))
  mocks.runTransaction.mockImplementation(async (body) => body(mocks))
})

describe('actual transfer callable', () => {
  it('reads membership/campaign, transfer, then both characters; writes sender then receiver then deletes the offer', async () => {
    await expect(accept(request)).resolves.toEqual({ ok: true })
    expect(mocks.get.mock.calls.map(([ref]) => ref.path)).toEqual([
      'groups/g/members/receiver-user', path, transferPath, senderPath, receiverPath,
    ])
    expect(writes()).toEqual([
      [senderPath, { details: { inventory: [{ ...sword, qty: 3 }], notes: 'sender-note' }, ...stamp }, { merge: true }],
      [receiverPath, { details: { inventory: [{ ...offer.itemSnapshot, equipped: false }], future: { kept: true } }, ...stamp }, { merge: true }],
    ])
    expect(deletes()).toEqual([transferPath])
    expect(Math.max(...mocks.get.mock.invocationCallOrder)).toBeLessThan(mocks.set.mock.invocationCallOrder[0])
    expect(mocks.set.mock.invocationCallOrder[1]).toBeLessThan(mocks.delete.mock.invocationCallOrder[0])
  })

  it.each([undefined, '', 'unknown', 'ose'])('accepts current-version characters in a campaign of system %s and stamps that version', async (system) => {
    mocks.records.set(path, { gmUserId: 'gm', ...(system === undefined ? {} : { system }) })
    await expect(accept(request)).resolves.toEqual({ ok: true })
    expect(writes().map(([, fields]) => [fields.schemaVersion, fields.schemaWrittenAt])).toEqual([[1, SERVER_TIME], [1, SERVER_TIME]])
  })

  it.each(['vtm'])('refuses a transfer in a %s campaign, which has no carrying rule, without reading either character or dropping the offer', async (system) => {
    mocks.records.set(path, { gmUserId: 'gm', system })
    await expect(accept(request)).rejects.toMatchObject({
      code: 'failed-precondition', message: 'Items cannot be handed to another character in this campaign.',
    })
    expect(mocks.get).toHaveBeenCalledTimes(3)
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.delete).not.toHaveBeenCalled()
  })

  it.each([senderPath, receiverPath])('refuses %s below or above the current version with the plain message, keeping the offer', async (characterPath) => {
    for (const schemaVersion of [undefined, 0, 2, '1']) {
      mocks.records.set(characterPath, { ...mocks.records.get(characterPath), schemaVersion, schemaWrittenAt: 'previous' })
      await expect(accept(request)).rejects.toMatchObject({
        code: 'failed-precondition', message: 'This character is being updated. Try again in a minute.',
      })
    }
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.delete).not.toHaveBeenCalled()
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
    mocks.records.set(senderPath, { ownerUserId: 'sender-user', schemaVersion: 1, details })
    await expect(accept(request)).rejects.toMatchObject({ code: 'not-found', message: 'Item no longer available.' })
    expect(mocks.set).not.toHaveBeenCalled()
    expect(deletes()).toEqual([transferPath])
  })

  it('discards an offer whose quantity changed', async () => {
    mocks.records.set(senderPath, { ownerUserId: 'sender-user', schemaVersion: 1, details: { inventory: [{ ...sword, qty: 1 }] } })
    await expect(accept(request)).rejects.toMatchObject({ code: 'failed-precondition', message: 'Item quantity changed before transfer could be accepted.' })
    expect(mocks.set).not.toHaveBeenCalled()
    expect(deletes()).toEqual([transferPath])
  })

  it('keeps the offer and both characters untouched when packed slots are full', async () => {
    mocks.records.set(receiverPath, { schemaVersion: 1, details: { inventory: Array.from({ length: 13 }, (_, i) => ({ ...sword, id: String(i), equipped: false })) } })
    await expect(accept(request)).rejects.toMatchObject({ code: 'failed-precondition', message: 'Not enough packed slots to accept this item.' })
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.delete).not.toHaveBeenCalled()
  })

  it.each([undefined, null, 'bad', { inventory: 'bad' }])('defaults receiver details %j and writes the offered snapshot', async (details) => {
    mocks.records.set(receiverPath, { schemaVersion: 1, details })
    await expect(accept(request)).resolves.toEqual({ ok: true })
    expect(writes()[1]).toEqual([receiverPath, { details: { inventory: [{ ...offer.itemSnapshot, equipped: false }] }, ...stamp }, { merge: true }])
  })

  it('propagates a transaction failure', async () => {
    mocks.runTransaction.mockRejectedValue(new Error('database unavailable'))
    await expect(accept(request)).rejects.toThrow('database unavailable')
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.delete).not.toHaveBeenCalled()
  })
})

describe('transfer ordering before shared persistence', () => {
  it('checks sender authority before versions and deletes an unauthorized legacy offer', async () => {
    mocks.records.set(senderPath, { ownerUserId: 'different-owner', schemaVersion: 0 })
    mocks.records.set(receiverPath, { schemaVersion: 0 })
    await expect(accept(request)).rejects.toMatchObject({ code: 'permission-denied', message: 'Transfer is not authorized.' })
    expect(deletes()).toEqual([transferPath])
    expect(mocks.set).not.toHaveBeenCalled()
  })

  it('rejects an old character before checking an unavailable item, retaining the offer for migration', async () => {
    mocks.records.set(senderPath, { ownerUserId: 'sender-user', schemaVersion: 0, details: { inventory: [] } })
    await expect(accept(request)).rejects.toMatchObject({ code: 'failed-precondition', message: 'This character is being updated. Try again in a minute.' })
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.delete).not.toHaveBeenCalled()
  })
})

describe('callable carrying boundaries', () => {
  it.each(capacityCases)('$name accepts the last packed slot, counts equipped rows separately, and refuses the next', async ({ details, packedSlots }) => {
    const packed = Array.from({ length: packedSlots - 1 }, (_, i) => ({ ...sword, id: 'packed-' + i, equipped: false }))
    const equipped = Array.from({ length: 20 }, (_, i) => ({ ...sword, id: 'equipped-' + i }))
    const receiverDetails = { ...(details && typeof details === 'object' ? details : {}), inventory: [...equipped, ...packed] }
    mocks.records.set(receiverPath, { schemaVersion: 1, details: receiverDetails })
    await expect(accept(request)).resolves.toEqual({ ok: true })
    expect(writes()[1][1].details.inventory).toEqual([...equipped, ...packed, { ...offer.itemSnapshot, equipped: false }])
    mocks.set.mockClear()
    mocks.delete.mockClear()
    mocks.records.set(receiverPath, { schemaVersion: 1, details: { ...receiverDetails, inventory: [...receiverDetails.inventory, { ...sword, equipped: false }] } })
    await expect(accept(request)).rejects.toMatchObject({ code: 'failed-precondition', message: 'Not enough packed slots to accept this item.' })
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.delete).not.toHaveBeenCalled()
  })

  it('does not deduplicate an offered snapshot id already in the receiver inventory', async () => {
    const existing = { ...offer.itemSnapshot, equipped: false }
    mocks.records.set(receiverPath, { schemaVersion: 1, details: { inventory: [existing] } })
    await expect(accept(request)).resolves.toEqual({ ok: true })
    expect(writes()[1][1].details.inventory).toEqual([existing, existing])
  })

  it('does not delete the offer when a queued character write throws', async () => {
    mocks.set.mockImplementationOnce(() => undefined).mockImplementationOnce(() => { throw new Error('write failed') })
    await expect(accept(request)).rejects.toThrow('write failed')
    expect(mocks.set).toHaveBeenCalledTimes(2)
    expect(mocks.delete).not.toHaveBeenCalled()
  })
})

describe('a Lubec campaign', () => {
  const thing = (id: string, carrier: string, at: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    ({ id, kind: 'thing', carrier, ...at, name: id, size: 1, qty: 1, weight: 'normal', note: '', ...extra })
  const rope = thing('rope', 'backpack', { pocket: 1 }, { qty: 4, batch: 'b1', check: 'pass' })
  const lubecOf = (items: unknown[]) => ({ counters: { stress: 3 }, effects: [{ id: 'e1' }], gear: { items, carriers: [], overrides: [], supplies: [] } })
  const offerOf = (snapshot: Record<string, unknown>) => ({ ...offer, itemId: snapshot.id, itemSnapshot: snapshot })

  beforeEach(() => {
    mocks.records.set(path, { gmUserId: 'gm', system: 'lubec' })
    mocks.records.set(transferPath, offerOf(rope))
    mocks.records.set(senderPath, { ownerUserId: 'sender-user', schemaVersion: 1, lubec: lubecOf([rope, thing('cup', 'backpack', { pocket: 0 })]) })
    mocks.records.set(receiverPath, { ownerUserId: 'receiver-user', schemaVersion: 1, lubec: lubecOf([]) })
  })

  it("lands the item in the receiver's backpack, merging only `lubec.gear` into each character, then deletes the offer", async () => {
    await expect(accept(request)).resolves.toEqual({ ok: true })
    const gearWith = (items: unknown[]) => ({ lubec: { gear: { items, carriers: [], overrides: [], supplies: [] } }, ...stamp })
    expect(writes()).toEqual([
      [senderPath, gearWith([thing('cup', 'backpack', { pocket: 0 })]), { merge: true }],
      [receiverPath, gearWith([thing('rope', 'backpack', { pocket: 0 }, { qty: 4 })]), { merge: true }],
    ])
    expect(deletes()).toEqual([transferPath])
  })

  it('puts an 8-slot thing into two empty hands', async () => {
    const canoe = thing('canoe', 'strap', { pocket: 0 }, { size: 8 })
    mocks.records.set(transferPath, offerOf(canoe))
    mocks.records.set(senderPath, { ownerUserId: 'sender-user', schemaVersion: 1, lubec: lubecOf([canoe]) })
    await expect(accept(request)).resolves.toEqual({ ok: true })
    expect(writes()[1][1].lubec.gear.items).toEqual([thing('canoe', 'hands', { slot: 0 }, { size: 8 })])
  })

  it('keeps the offer and both characters untouched when the backpack is full', async () => {
    const full = [thing('tent', 'backpack', { pocket: 0 }, { size: 4 }), thing('a', 'backpack', { pocket: 0 }), thing('b', 'backpack', { pocket: 1 }), thing('c', 'backpack', { pocket: 2 })]
    mocks.records.set(receiverPath, { schemaVersion: 1, lubec: lubecOf(full) })
    await expect(accept(request)).rejects.toMatchObject({
      code: 'failed-precondition', message: 'Not enough room to accept this item. Make room in your backpack or hands, then accept again.',
    })
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.delete).not.toHaveBeenCalled()
  })

  it.each([
    ['the sender no longer holds it', [thing('cup', 'backpack', { pocket: 0 })], 'not-found', 'Item no longer available.'],
    ['its stack shrank below the offer', [{ ...rope, qty: 3 }], 'failed-precondition', 'Item quantity changed before transfer could be accepted.'],
  ])('discards the offer when %s', async (_name, items, code, message) => {
    mocks.records.set(senderPath, { ownerUserId: 'sender-user', schemaVersion: 1, lubec: lubecOf(items) })
    await expect(accept(request)).rejects.toMatchObject({ code, message })
    expect(mocks.set).not.toHaveBeenCalled()
    expect(deletes()).toEqual([transferPath])
  })

  it('refuses a character below the current version, keeping the offer', async () => {
    mocks.records.set(receiverPath, { schemaVersion: 0, lubec: lubecOf([]) })
    await expect(accept(request)).rejects.toMatchObject({ code: 'failed-precondition', message: 'This character is being updated. Try again in a minute.' })
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.delete).not.toHaveBeenCalled()
  })
})
