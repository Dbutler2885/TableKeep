/**
 * The move transaction's own steps, over a stubbed Firestore: which records it
 * reads and writes, what each write carries, the quiet store before it and the
 * snapshot after it. The real rules and a real transaction are in
 * `lubecMove.emulator.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'

type Snap = { metadata: { hasPendingWrites: boolean }; get: (field: string) => unknown }
const tx = { get: vi.fn(), set: vi.fn(), delete: vi.fn() }
const listen = vi.fn()
const stop = vi.fn()

vi.mock('firebase/firestore', async (original) => ({
  ...await original<typeof import('firebase/firestore')>(),
  doc: (_db: unknown, path: string) => ({ path, id: path.split('/').at(-1) }),
  serverTimestamp: () => 'server-time',
  runTransaction: (_db: unknown, run: (t: typeof tx) => unknown) => run(tx),
  onSnapshot: (ref: unknown, next: (snap: Snap) => void, fail: (err: unknown) => void) => {
    listen(ref, next, fail)
    return stop
  },
}))
const { lubecMoveBetween } = await import('./lubecMoveTransaction')

const db = {} as Firestore
const scope = { groupId: 'g', campaignId: 'c' }
const base = 'groups/g/campaigns/c'
const at = (seconds: number, nanoseconds = 0) => ({ seconds, nanoseconds })
const quietStore = { sendSaveNow: vi.fn(), hasPendingWrite: vi.fn(() => false) }
const stamp = { schemaVersion: 1, schemaWrittenAt: 'server-time' }

const anvil = { id: 'anvil', kind: 'thing', carrier: 'hands', slot: 0, name: 'Small anvil', size: 1, qty: 1, weight: 'normal', note: '' }
const wayneDoc = { schemaVersion: 1, updatedAt: at(10, 5), lubec: { counters: { stress: 2 }, gear: { items: [anvil], carriers: [], overrides: [], supplies: [] } } }
const exists = (data: unknown) => ({ id: 'doc', exists: () => true, data: () => data })
const missing = { id: 'doc', exists: () => false, data: () => undefined }
const snap = (updatedAt: unknown, hasPendingWrites = false): Snap => ({ metadata: { hasPendingWrites }, get: () => updatedAt })

/** Answers the snapshot listener with each snapshot in turn, as Firestore would. */
function snapshotsWill(...snaps: Snap[]) {
  listen.mockImplementation((_ref, next: (s: Snap) => void) => queueMicrotask(() => snaps.forEach((s) => next(s))))
}

const wayne = { kind: 'character', characterId: 'wayne' } as const
const gmItems = { kind: 'gm-items' } as const
const drop = { itemId: 'anvil', seen: { carrier: 'hands', slot: 0 }, droppedBy: { characterId: 'wayne', characterName: 'Wayne', userId: 'u1' } }

beforeEach(() => {
  vi.resetAllMocks()
  quietStore.hasPendingWrite.mockReturnValue(false)
  tx.get.mockResolvedValue(exists(wayneDoc))
  snapshotsWill(snap(at(11)))
})

describe('the move transaction', () => {
  it('drops a thing: reads the character only, writes it stamped and merged, and creates the GM item', async () => {
    expect(await lubecMoveBetween(db, { scope, from: wayne, to: gmItems, store: quietStore, move: drop })).toEqual({ ok: true })

    expect(tx.get).toHaveBeenCalledExactlyOnceWith({ path: `${base}/characters/wayne`, id: 'wayne' })
    expect(tx.set).toHaveBeenCalledWith(
      { path: `${base}/characters/wayne`, id: 'wayne' },
      { lubec: { gear: { items: [], carriers: [], overrides: [], supplies: [] } }, ...stamp, updatedAt: 'server-time' },
      { merge: true },
    )
    const { carrier: _carrier, slot: _slot, ...unplaced } = anvil
    expect(tx.set).toHaveBeenCalledWith({ path: `${base}/gmItems/anvil`, id: 'anvil' }, {
      ...unplaced, status: 'dropped', droppedFrom: 'hands', droppedByCharacterId: 'wayne', droppedByCharacterName: 'Wayne', droppedByUserId: 'u1',
      createdAt: 'server-time',
    })
    expect(tx.delete).not.toHaveBeenCalled()
  })

  it('refuses a stale move with the plain words, writes nothing and waits for no snapshot', async () => {
    const result = await lubecMoveBetween(db, { scope, from: wayne, to: gmItems, store: quietStore, move: { ...drop, seen: { carrier: 'body', slot: 0 } } })

    expect(result).toEqual({ ok: false, msg: 'Someone moved that first. Nothing changed.' })
    expect(tx.set).not.toHaveBeenCalled()
    expect(listen).not.toHaveBeenCalled()
  })

  it('gives a dropped GM item: reads it, deletes it and writes the character', async () => {
    const tent = { id: 'tent', kind: 'thing', name: 'Tent', size: 4, qty: 1, weight: 'normal', note: '', status: 'dropped' }
    tx.get.mockImplementation(async (ref: { path: string }) => (ref.path.endsWith('gmItems/tent') ? { ...exists(tent), id: 'tent' } : exists(wayneDoc)))

    expect(await lubecMoveBetween(db, { scope, from: gmItems, to: wayne, store: quietStore, move: { itemId: 'tent' } })).toEqual({ ok: true })
    expect(tx.delete).toHaveBeenCalledExactlyOnceWith({ path: `${base}/gmItems/tent`, id: 'tent' })
    expect(tx.set.mock.calls[0][1].lubec.gear.items.at(-1)).toMatchObject({ id: 'tent', carrier: 'backpack', pocket: 0 })
  })

  it('gives a copy of a library item and leaves the library item alone', async () => {
    const rope = { id: 'rope', kind: 'thing', name: 'Rope', size: 1, qty: 1, weight: 'normal', note: '', status: 'library' }
    tx.get.mockImplementation(async (ref: { path: string }) => (ref.path.endsWith('gmItems/rope') ? { ...exists(rope), id: 'rope' } : exists(wayneDoc)))

    await lubecMoveBetween(db, { scope, from: gmItems, to: wayne, store: quietStore, move: { itemId: 'rope', copyId: 'rope-2' } })
    expect(tx.set).toHaveBeenCalledOnce()
    expect(tx.delete).not.toHaveBeenCalled()
  })

  it('writes a shared carrier\'s items alone, merged, and waits only for the character\'s snapshot', async () => {
    tx.get.mockImplementation(async (ref: { path: string }) => (ref.path.includes('sharedCarriers')
      ? { ...exists({ name: 'Skiff', pockets: [{ name: 'Hull', slots: 2, max: 2 }], items: [] }), id: 'skiff' }
      : exists(wayneDoc)))

    await lubecMoveBetween(db, { scope, from: wayne, to: { kind: 'shared', carrierId: 'skiff' }, store: quietStore, move: { ...drop, dest: 'skiff' } })
    expect(tx.set).toHaveBeenCalledWith(
      { path: `${base}/sharedCarriers/skiff`, id: 'skiff' },
      { items: [{ ...anvil, slot: undefined, carrier: 'skiff', pocket: 0 }].map(({ slot: _slot, ...rest }) => rest), updatedAt: 'server-time' },
      { merge: true },
    )
    expect(listen).toHaveBeenCalledOnce()
    expect(listen.mock.calls[0][0]).toEqual({ path: `${base}/characters/wayne`, id: 'wayne' })
  })

  it('finds a hidden carrier under its character and an NPC sheet in npcSheets', async () => {
    tx.get.mockImplementation(async (ref: { path: string }) => (ref.path.includes('hiddenCarriers') ? missing : exists(wayneDoc)))

    const result = await lubecMoveBetween(db, {
      scope, from: { kind: 'npc', npcId: 'ferryman' }, to: { kind: 'hidden', characterId: 'wayne', carrierId: 'box' }, store: quietStore, move: { ...drop, dest: 'box' },
    })
    expect(result).toEqual({ ok: false, msg: 'Someone moved that first. Nothing changed.' })
    expect(tx.get.mock.calls.map(([ref]) => ref.path)).toEqual([`${base}/npcSheets/ferryman`, `${base}/characters/wayne/hiddenCarriers/box`])
  })

  it('refuses a character that is not at the current version', async () => {
    tx.get.mockResolvedValue(exists({ ...wayneDoc, schemaVersion: 0 }))

    await expect(lubecMoveBetween(db, { scope, from: wayne, to: gmItems, store: quietStore, move: drop }))
      .rejects.toThrow('This character is being updated. Try again in a minute.')
  })

  it('reads a character with no Lubec sheet, or no document, as holding nothing', async () => {
    tx.get.mockResolvedValue(exists({ schemaVersion: 1 }))

    expect(await lubecMoveBetween(db, { scope, from: wayne, to: gmItems, store: quietStore, move: drop }))
      .toEqual({ ok: false, msg: 'Someone moved that first. Nothing changed.' })
    tx.get.mockResolvedValue(missing)
    expect(await lubecMoveBetween(db, { scope, from: wayne, to: gmItems, store: quietStore, move: drop }))
      .toEqual({ ok: false, msg: 'Someone moved that first. Nothing changed.' })
  })

  it('refuses a move whose two records are one', async () => {
    await expect(lubecMoveBetween(db, { scope, from: wayne, to: { ...wayne }, store: quietStore, move: drop })).rejects.toThrow('two records')
  })
})

describe('the store around the move', () => {
  it('sends each sheet\'s waiting save and waits until none is outstanding before reading', async () => {
    let outstanding = 3
    const store = { sendSaveNow: vi.fn(), hasPendingWrite: vi.fn(() => outstanding-- > 0) }

    await lubecMoveBetween(db, { scope, from: wayne, to: gmItems, store, move: drop })

    expect(store.sendSaveNow).toHaveBeenCalledExactlyOnceWith('wayne')
    expect(store.hasPendingWrite.mock.invocationCallOrder.at(-1)).toBeLessThan(tx.get.mock.invocationCallOrder[0])
  })

  it('resolves on the first settled snapshot saved after the one it read, and stops listening', async () => {
    const seen: string[] = []
    snapshotsWill(snap(at(10, 5)), snap(at(9, 999)), snap(at(12), true), snap('server-time'), snap(at(10, 6)))
    stop.mockImplementation(() => seen.push('stopped'))

    await lubecMoveBetween(db, { scope, from: wayne, to: gmItems, store: quietStore, move: drop })
    expect(seen).toEqual(['stopped'])
  })

  it('takes any saved snapshot when the record it read had never been saved', async () => {
    tx.get.mockResolvedValue(exists({ ...wayneDoc, updatedAt: undefined }))
    snapshotsWill(snap(undefined), snap(at(1)))

    expect(await lubecMoveBetween(db, { scope, from: wayne, to: gmItems, store: quietStore, move: drop })).toEqual({ ok: true })
    expect(stop).toHaveBeenCalledOnce()
  })

  it('rejects when the snapshot listener fails', async () => {
    listen.mockImplementation((_ref, _next, fail: (err: unknown) => void) => queueMicrotask(() => fail(new Error('offline'))))

    await expect(lubecMoveBetween(db, { scope, from: wayne, to: gmItems, store: quietStore, move: drop })).rejects.toThrow('offline')
  })
})
