/**
 * The campaign deep delete against an in-memory store of document paths: what
 * it lists, what it deletes, and in which order. The real rules and adapter
 * are exercised in `deleteCampaignDeep.emulator.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  docs: new Set<string>(),
  listed: [] as string[],
  deleted: [] as string[],
  afterListing: null as null | ((path: string) => void),
}))

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  getDocs: async ({ path }: { path: string }) => {
    store.listed.push(path)
    const depth = path.split('/').length + 1
    const docs = [...store.docs]
      .filter((docPath) => docPath.startsWith(`${path}/`) && docPath.split('/').length === depth)
      .map((docPath) => ({ id: docPath.split('/').pop() }))
    store.afterListing?.(path)
    return { docs }
  },
  deleteDoc: async ({ path }: { path: string }) => {
    store.deleted.push(path)
    store.docs.delete(path)
  },
}))

const { deleteCampaignDeep } = await import('./deleteCampaignDeep')

const db = {} as never
const campaign = 'groups/g/campaigns/c'
const descendants = [
  'characters/wayne',
  'characters/wayne/hiddenCarriers/stash',
  'characters/wayne/writeReceipts/op-1',
  'npcSheets/ferryman',
  'npcSheets/ferryman/writeReceipts/op-2',
  'combatControl/current',
  'combats/fight-1',
  'combats/fight-1/log/entry-1',
  'combats/fight-1/commands/command-1',
  'maps/ford',
  'maps/ford/tokens/t1',
  'gmItems/anvil',
].map((path) => `${campaign}/${path}`)

beforeEach(() => {
  store.docs = new Set([campaign, ...descendants, 'groups/g/campaigns/other/combats/fight-9'])
  store.listed = []
  store.deleted = []
  store.afterListing = null
})

describe('deleting a campaign deeply', () => {
  it('deletes every declared descendant, fights and sheet receipts included, then the campaign', async () => {
    await deleteCampaignDeep(db, 'g', 'c')

    expect([...store.docs]).toEqual(['groups/g/campaigns/other/combats/fight-9'])
    expect(store.deleted.at(-1)).toBe(campaign)
  })

  it('deletes each document\'s subcollections before the document', async () => {
    await deleteCampaignDeep(db, 'g', 'c')

    const order = (path: string) => store.deleted.indexOf(`${campaign}/${path}`)
    expect(order('characters/wayne/writeReceipts/op-1')).toBeLessThan(order('characters/wayne'))
    expect(order('npcSheets/ferryman/writeReceipts/op-2')).toBeLessThan(order('npcSheets/ferryman'))
    expect(order('combats/fight-1/log/entry-1')).toBeLessThan(order('combats/fight-1'))
    expect(order('combats/fight-1/commands/command-1')).toBeLessThan(order('combats/fight-1'))
  })

  it('deletes the fight control by name, never listing a collection its rules do not let anyone list', async () => {
    store.docs.delete(`${campaign}/combatControl/current`)

    await deleteCampaignDeep(db, 'g', 'c')

    expect(store.listed).not.toContain(`${campaign}/combatControl`)
    expect(store.deleted).toContain(`${campaign}/combatControl/current`)
  })

  it('catches a receipt a save wrote after the sheet\'s receipts were listed', async () => {
    store.afterListing = (path) => {
      if (path !== `${campaign}/characters/wayne/writeReceipts`) return
      store.afterListing = null
      store.docs.add(`${campaign}/characters/wayne/writeReceipts/raced-save`)
    }

    await deleteCampaignDeep(db, 'g', 'c')

    expect(store.docs.has(`${campaign}/characters/wayne/writeReceipts/raced-save`)).toBe(false)
    expect(store.deleted.indexOf(`${campaign}/characters/wayne`))
      .toBeLessThan(store.deleted.indexOf(`${campaign}/characters/wayne/writeReceipts/raced-save`))
  })

  it('leaves recorded sessions to the Cloud Function that clears them', async () => {
    store.docs.add(`${campaign}/sessions/s1`)

    await deleteCampaignDeep(db, 'g', 'c')

    expect(store.docs.has(`${campaign}/sessions/s1`)).toBe(true)
    expect(store.listed).not.toContain(`${campaign}/sessions`)
  })
})
