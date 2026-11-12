/**
 * Overlapping saves of a sheet followed by a drop, through the shared store's
 * real save tracking, the drop the Gear page makes, and the move transaction,
 * over a stand-in Firestore whose saves land only when the test lets them.
 * Two saves of one sheet can be in flight at once, and each writes the page's
 * whole copy of the sheet with a merge, so a move that went ahead before the
 * last of them landed would be overwritten by it. The real rules and a real
 * transaction are in `lubecMove.emulator.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'

type Data = Record<string, unknown>
type Ref = { path: string; id: string }

const server = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  /** Each save sent, in sending order; calling one lands it. One client's saves land in order, as Firestore's do. */
  held: [] as Array<() => void>,
  events: [] as string[],
  clock: 0,
}))

vi.mock('../../../firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', async (original) => {
  const SERVER_TIME = 'server-time'
  const isMap = (value: unknown): value is Data => typeof value === 'object' && value !== null && !Array.isArray(value)
  // Firestore's merge: maps merge key by key, everything else (arrays included) is replaced whole.
  const merged = (before: Data, after: Data): Data => Object.fromEntries([...Object.keys(before), ...Object.keys(after)].map((key) => {
    const [was, now] = [before[key], after[key]]
    if (!(key in after)) return [key, was]
    return [key, isMap(was) && isMap(now) ? merged(was, now) : now]
  }))
  const stamped = (data: Data): Data => {
    const at = { seconds: (server.clock += 1), nanoseconds: 0 }
    return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === SERVER_TIME ? at : value]))
  }
  const write = (path: string, data: Data, options?: { merge?: boolean }) => {
    const before = server.docs.get(path)
    server.docs.set(path, before && options?.merge ? merged(before, stamped(data)) : stamped(data))
  }
  const snap = (ref: Ref) => {
    const data = server.docs.get(ref.path)
    return { id: ref.id, exists: () => data !== undefined, data: () => data, get: (field: string) => data?.[field], metadata: { hasPendingWrites: false } }
  }
  return {
    ...await original<typeof import('firebase/firestore')>(),
    doc: (_db: unknown, path: string): Ref => ({ path, id: path.split('/').at(-1) ?? '' }),
    serverTimestamp: () => SERVER_TIME,
    setDoc: (ref: Ref, data: Data, options?: { merge?: boolean }) => new Promise<void>((resolve) => {
      const n = server.held.length + 1
      server.events.push(`save ${n} sent`)
      server.held.push(() => {
        write(ref.path, data, options)
        server.events.push(`save ${n} landed`)
        resolve()
      })
    }),
    runTransaction: async (_db: unknown, run: (tx: unknown) => Promise<unknown>) => {
      server.events.push('move read')
      const writes: Array<() => void> = []
      const result = await run({
        get: async (ref: Ref) => snap(ref),
        set: (ref: Ref, data: Data, options?: { merge?: boolean }) => writes.push(() => write(ref.path, data, options)),
        delete: (ref: Ref) => writes.push(() => server.docs.delete(ref.path)),
      })
      writes.forEach((apply) => apply())
      server.events.push('move committed')
      return result
    },
    onSnapshot: (ref: Ref, next: (s: ReturnType<typeof snap>) => void) => {
      queueMicrotask(() => next(snap(ref)))
      return () => undefined
    },
  }
})

const {
  emptyCharacterStoreSaves,
  scheduleCharacterStoreSave,
  sendCharacterStoreSavesNow,
  settleCharacterStoreSaves,
} = await import('../../character/characterStore/characterStoreWrites')
const { lubecCharacterStore, parseLubecCharacter } = await import('../../ruleSets/lubec/characterParser')
const { lubecGearDrop } = await import('./lubecGearDrop')
type LubecCharacterRecord = import('../../ruleSets/lubec/characterRecord').LubecCharacterRecord

const scope = { groupId: 'g', campaignId: 'c' }
const wayneDoc = 'groups/g/campaigns/c/characters/wayne'
const anvil = { id: 'anvil', kind: 'thing', carrier: 'hands', slot: 0, name: 'Small anvil', size: 1, qty: 1, weight: 'normal', note: '' } as const
const flashlight = { id: 'flashlight', kind: 'thing', carrier: 'backpack', pocket: 0, name: 'Flashlight', size: 1, qty: 1, weight: 'normal', note: '' } as const
const dropper = { characterId: 'wayne', characterName: 'Wayne', userId: 'player' }

/** Long enough for a move that is not waiting on the saves to have read and written. */
const aWhile = () => new Promise((resolve) => setTimeout(resolve, 100))

/** The page: its copy of Wayne, the shared store's save tracking, and the drop the Gear page makes. */
function page() {
  const saves = emptyCharacterStoreSaves()
  let copy = parseLubecCharacter('wayne', server.docs.get(wayneDoc) ?? {})
  const edit = (stress: number) => {
    copy = { ...copy, lubec: { ...copy.lubec, counters: { ...copy.lubec.counters, stress } } } as LubecCharacterRecord
    scheduleCharacterStoreSave(saves, { ...scope, collection: 'characters' }, lubecCharacterStore, 'wayne', () => copy)
  }
  const records = { db: {} as Firestore, scope, sheet: { kind: 'character', characterId: 'wayne' } as const }
  const drop = lubecGearDrop(records, { settleSaves: (id) => settleCharacterStoreSaves(saves, id) }, dropper)
  return { saves, edit, sendNow: () => sendCharacterStoreSavesNow(saves), drop }
}

const stored = () => server.docs.get(wayneDoc) as { lubec: { counters: { stress: number }; gear: { items: { id: string }[] } } }
const storedItems = () => stored().lubec.gear.items.map((item) => item.id)

beforeEach(() => {
  server.docs.clear()
  server.held.length = 0
  server.events.length = 0
  server.docs.set(wayneDoc, {
    system: 'lubec', name: 'Wayne', ownerUserId: 'player', schemaVersion: 1, updatedAt: { seconds: 0, nanoseconds: 0 },
    lubec: { counters: { stress: 2, minimumStress: 2, trauma: 0 }, gear: { items: [anvil, flashlight], carriers: [], overrides: [], supplies: [] } },
  })
})

describe('a drop after two overlapping saves of the sheet', () => {
  it('reads nothing until both saves have landed, so neither lands on top of the move', async () => {
    const { edit, sendNow, drop } = page()
    edit(3)
    sendNow()
    edit(4)
    sendNow()
    expect(server.events).toEqual(['save 1 sent', 'save 2 sent'])

    const dropping = drop(anvil)
    server.held[0]()
    await aWhile()
    // The second save is still in flight, carrying the sheet as it was before the drop.
    expect(server.events).not.toContain('move read')

    server.held[1]()
    await expect(dropping).resolves.toEqual({ ok: true })
    expect(server.events.slice(-2)).toEqual(['move read', 'move committed'])
    expect(storedItems()).toEqual(['flashlight'])
    expect(stored().lubec.counters.stress).toBe(4)
    expect(server.docs.get('groups/g/campaigns/c/gmItems/anvil')).toMatchObject({ status: 'dropped', droppedByCharacterId: 'wayne' })
  })

  it('sends an edit still waiting out its delay at once, and waits for it and the save in flight', async () => {
    const { saves, edit, sendNow, drop } = page()
    edit(3)
    sendNow()
    edit(4)

    const dropping = drop(anvil)
    expect(server.events).toEqual(['save 1 sent', 'save 2 sent'])
    expect(saves.pending).toEqual({})
    server.held[0]()
    await aWhile()
    expect(server.events).not.toContain('move read')

    server.held[1]()
    await expect(dropping).resolves.toEqual({ ok: true })
    expect(storedItems()).toEqual(['flashlight'])
    expect(stored().lubec.counters.stress).toBe(4)
    expect(server.held).toHaveLength(2)
  })

  it('also waits for an edit made while the drop waits, which then carries the sheet as it was before the drop', async () => {
    const { edit, sendNow, drop } = page()
    edit(3)
    sendNow()

    const dropping = drop(anvil)
    edit(4)
    server.held[0]()
    await aWhile()
    expect(server.events).toEqual(['save 1 sent', 'save 1 landed', 'save 2 sent'])

    server.held[1]()
    await expect(dropping).resolves.toEqual({ ok: true })
    expect(storedItems()).toEqual(['flashlight'])
    expect(stored().lubec.counters.stress).toBe(4)
  })
})
