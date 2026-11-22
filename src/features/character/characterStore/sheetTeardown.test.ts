/**
 * Deleting a sheet with its write receipts, against an in-memory store: the
 * receipts go in the commit that deletes the sheet, older ones beyond what
 * that commit holds go first in batches, and a revision that moved after the
 * listing sends it back to list again. The real rules and transactions are
 * exercised in `sheetTeardown.emulator.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Ref = { path: string; withConverter: () => Ref }

const store = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  batches: [] as number[],
  transactions: [] as string[][],
  afterListing: null as null | (() => void),
}))

vi.mock('firebase/firestore', () => {
  const ref = (path: string): Ref => ({ path, withConverter: () => ref(path) })
  // A snapshot holds what was stored when it was read, as Firestore's do.
  const snapshot = (path: string) => {
    const data = store.docs.get(path)
    return { ref: ref(path), exists: () => data !== undefined, data: () => data }
  }
  return {
    collection: (parent: Ref, name: string) => ref(`${parent.path}/${name}`),
    getDocFromServer: async (target: Ref) => snapshot(target.path),
    getDocs: async (target: Ref) => {
      const depth = target.path.split('/').length + 1
      const docs = [...store.docs.keys()]
        .filter((path) => path.startsWith(`${target.path}/`) && path.split('/').length === depth)
        .sort()
        .map(snapshot)
      store.afterListing?.()
      return { docs }
    },
    writeBatch: () => {
      const deletes: string[] = []
      return {
        delete: (target: Ref) => { deletes.push(target.path) },
        commit: async () => {
          store.batches.push(deletes.length)
          deletes.forEach((path) => store.docs.delete(path))
        },
      }
    },
    runTransaction: async (_db: unknown, update: (tx: unknown) => Promise<unknown>) => {
      const deletes: string[] = []
      const result = await update({
        get: async (target: Ref) => snapshot(target.path),
        delete: (target: Ref) => { deletes.push(target.path) },
      })
      store.transactions.push(deletes)
      deletes.forEach((path) => store.docs.delete(path))
      return result
    },
  }
})

const { deleteSheetWithReceipts, SHEET_TEARDOWN_CONTENDED, SHEET_TEARDOWN_FINAL_RECEIPTS } = await import('./sheetTeardown')

const db = {} as never
const SHEET = 'groups/g/campaigns/c/characters/wayne'
const sheetRef = { path: SHEET, withConverter: () => sheetRef } as never
const receiptPath = (index: number) => `${SHEET}/writeReceipts/op-${String(index).padStart(5, '0')}`

function seed(receipts: number, revision = receipts) {
  store.docs.set(SHEET, { name: 'Wayne', sheetRevision: revision })
  for (let index = 0; index < receipts; index += 1) store.docs.set(receiptPath(index), { revision: index })
}

/** A save landing now: one more receipt and a revision increment, as every sheet write commits them. */
function landSave() {
  const sheet = store.docs.get(SHEET)!
  const revision = (sheet.sheetRevision as number) + 1
  store.docs.set(SHEET, { ...sheet, sheetRevision: revision })
  store.docs.set(`${SHEET}/writeReceipts/save-${revision}`, { revision })
}

beforeEach(() => {
  store.docs = new Map([['groups/g/campaigns/c/characters/stephen', { sheetRevision: 4 }]])
  store.batches = []
  store.transactions = []
  store.afterListing = null
})

describe('deleting a sheet with its write receipts', () => {
  it('deletes the sheet and every receipt in one transaction, running the extra work there with the sheet as read', async () => {
    seed(3)
    const work = vi.fn()

    await deleteSheetWithReceipts(db, sheetRef, work)

    expect([...store.docs.keys()]).toEqual(['groups/g/campaigns/c/characters/stephen'])
    expect(store.batches).toEqual([])
    expect(store.transactions).toEqual([[receiptPath(0), receiptPath(1), receiptPath(2), SHEET]])
    expect(work).toHaveBeenCalledTimes(1)
    expect(work.mock.calls[0][1].data()).toEqual({ name: 'Wayne', sheetRevision: 3 })
  })

  it('deletes receipts beyond what the final commit holds first, in batches, keeping the last ones listed for that commit', async () => {
    seed(SHEET_TEARDOWN_FINAL_RECEIPTS + 850)

    await deleteSheetWithReceipts(db, sheetRef)

    expect(store.batches).toEqual([400, 400, 50])
    expect(store.transactions).toHaveLength(1)
    expect(store.transactions[0]).toHaveLength(SHEET_TEARDOWN_FINAL_RECEIPTS + 1)
    expect(store.transactions[0][0]).toBe(receiptPath(850))
    expect(store.docs.has(SHEET)).toBe(false)
    expect([...store.docs.keys()].filter((path) => path.startsWith(SHEET))).toEqual([])
  })

  it('lists again when a save lands after the listing, so its receipt goes too', async () => {
    seed(2)
    store.afterListing = () => {
      store.afterListing = null
      landSave()
    }
    const work = vi.fn()

    await deleteSheetWithReceipts(db, sheetRef, work)

    expect(store.transactions).toHaveLength(2)
    expect(store.transactions[0]).toEqual([])
    expect(store.transactions[1]).toContain(`${SHEET}/writeReceipts/save-3`)
    expect(work).toHaveBeenCalledTimes(1)
    expect([...store.docs.keys()].filter((path) => path.startsWith(SHEET))).toEqual([])
  })

  it('reports a sheet that changed after every listing, leaving it in place', async () => {
    seed(1)
    store.afterListing = landSave

    await expect(deleteSheetWithReceipts(db, sheetRef)).rejects.toThrow(SHEET_TEARDOWN_CONTENDED)

    expect(store.transactions).toEqual([[], [], []])
    expect(store.docs.get(SHEET)?.sheetRevision).toBe(4)
  })

  it('leaves a sheet already gone alone, with no transaction', async () => {
    const work = vi.fn()

    await deleteSheetWithReceipts(db, sheetRef, work)

    expect(store.transactions).toEqual([])
    expect(work).not.toHaveBeenCalled()
  })

  it('settles without the extra work when the sheet goes between the listing and the transaction', async () => {
    seed(1)
    store.afterListing = () => {
      store.afterListing = null
      store.docs.delete(SHEET)
    }
    const work = vi.fn()

    await deleteSheetWithReceipts(db, sheetRef, work)

    expect(store.transactions).toEqual([[]])
    expect(work).not.toHaveBeenCalled()
  })

  it('reads a sheet with no stored revision as revision zero', async () => {
    store.docs.set(SHEET, { name: 'Wayne' })
    store.docs.set(`${SHEET}/writeReceipts/create-wayne`, {})

    await deleteSheetWithReceipts(db, sheetRef)

    expect(store.transactions).toEqual([[`${SHEET}/writeReceipts/create-wayne`, SHEET]])
  })
})
