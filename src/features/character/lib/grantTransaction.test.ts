import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentReference, Transaction } from 'firebase/firestore'
import type { CampaignItem, CharacterInventoryItem } from '../../../types/app'
import { parseOseCharacter } from './storedCharacterRecord'

vi.mock('../../../firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', async (original) => ({
  ...await original<typeof import('firebase/firestore')>(),
  doc: (parent: { path: string }, ...segments: string[]) => ({ path: [parent.path, ...segments].join('/'), id: segments.at(-1) }),
  serverTimestamp: () => 'server-time',
}))
const { applyGrantToCharacter } = await import('./grantTransaction')
const { makeDroppedGoldCampaignItem } = await import('../inventoryOverflow')
const campaignPath = 'groups/g/campaigns/c'
const charRef = { path: `${campaignPath}/characters/pc`, parent: { parent: { path: campaignPath } } } as unknown as DocumentReference
const target = parseOseCharacter('pc', { name: 'Ada', class: 'Fighter', xp: 10 })
const rope = { id: 'rope', name: 'Rope', kind: 'general', typeId: 'rope', typeName: 'Rope', equipped: false, qty: 1, costGp: 1 } as CharacterInventoryItem
const tx = { get: vi.fn(), set: vi.fn() }
const params = { target, xpAmount: 0, goldAmount: 0, campaignEntries: [], templateEntries: [], overflowGoldDocId: 'overflow-gold' }
// A stored character at OSE's current version, unless the data names another.
function stored(data: Record<string, unknown>) {
  tx.get.mockResolvedValue({ exists: () => true, data: () => ({ schemaVersion: 1, ...data }) })
}
const stamp = { schemaVersion: 1, schemaWrittenAt: 'server-time' }
const grant = (overrides: Partial<Parameters<typeof applyGrantToCharacter>[2]> = {}, ref = charRef) =>
  applyGrantToCharacter(tx as unknown as Transaction, ref, { ...params, ...overrides })
const goldTotal = (inventory: CharacterInventoryItem[]) => inventory.reduce((sum, item) => sum + (item.kind === 'gold' ? item.qty : 0), 0)

beforeEach(() => { vi.resetAllMocks(); stored({ xp: 100, details: { inventory: [rope], abilityScores: { STR: '10' } } }) })

describe('GM grant transaction', () => {
  it('grants onto the current version, preserving unknown details, and stamps it', async () => {
    const details = { inventory: [rope], future: { kept: true }, abilityScores: { STR: '16' } }
    stored({ details, xp: 100, schemaWrittenAt: 'old-stamp' })
    const result = await grant({ xpAmount: 15 })
    expect(result).toEqual({ xp: 116, inventory: [rope], overflowFeedback: null })
    expect(tx.get).toHaveBeenCalledExactlyOnceWith(charRef)
    expect(tx.set).toHaveBeenCalledExactlyOnceWith(charRef, { xp: 116, details, ...stamp, updatedAt: 'server-time' }, { merge: true })
    expect(tx.get.mock.invocationCallOrder[0]).toBeLessThan(tx.set.mock.invocationCallOrder[0])
  })

  it.each([undefined, 0, 2])('refuses stored version %s with the plain message and writes nothing', async (schemaVersion) => {
    stored({ details: { inventory: [rope], weapons: ['legacy'] }, xp: 100, schemaVersion })
    await expect(grant({ xpAmount: 15 })).rejects.toThrow('This character is being updated. Try again in a minute.')
    expect(tx.set).not.toHaveBeenCalled()
  })

  it.each([null, 'invalid', undefined])('defaults details %j and falls back to the target XP', async (details) => {
    stored({ details })
    expect(await grant({ xpAmount: 3 })).toEqual({ xp: 13, inventory: [], overflowFeedback: null })
    expect(tx.set).toHaveBeenCalledExactlyOnceWith(charRef, { xp: 13, details: { inventory: [] }, ...stamp, updatedAt: 'server-time' }, { merge: true })
  })

  it('defaults both missing XP values to zero and clamps a negative stored XP', async () => {
    stored({})
    expect((await grant({ target: { ...target, xp: undefined as unknown as number } })).xp).toBe(0)
    stored({ xp: -50 })
    expect((await grant({ xpAmount: 3 })).xp).toBe(0)
  })

  it('expands quantities, combines direct/campaign/existing gold, then writes non-gold before rechunked gold', async () => {
    const gold = makeDroppedGoldCampaignItem(7, 'source', 'Source', 'gold-source')
    const gpTextGold = { ...gold, goldAmount: undefined, gpValue: '8gp' } as CampaignItem
    const invalidGold = { ...gold, goldAmount: undefined, gpValue: 'unknown' } as CampaignItem
    const item = { ...gold, type: 'general', typeId: 'custom', typeName: 'Lantern', name: 'Lantern', qty: '1' } as CampaignItem
    stored({ details: { inventory: [{ id: 'old-gold', kind: 'gold', qty: 99 }, rope] } })
    const result = await grant({
      goldAmount: 2,
      campaignEntries: [gold, gpTextGold, invalidGold, item].map((item) => ({ item, entry: { itemId: item.id, name: item.name, qty: 2 } })),
      templateEntries: [{ key: 'gear-rope', name: 'Rope', kind: 'general', costGp: 1, qty: 2 }],
    })
    expect(result.inventory.map((i) => i.kind)).toEqual(['general', 'general', 'general', 'general', 'general', 'gold', 'gold'])
    expect(result.inventory[0]).toEqual(rope)
    expect(result.inventory.slice(1, 3)).toMatchObject([{ name: 'Lantern' }, { name: 'Lantern' }])
    expect(goldTotal(result.inventory)).toBe(131)
    expect(result.inventory.slice(-2)).toMatchObject([{ qty: 100 }, { qty: 31 }])
    expect(result.inventory.slice(-2).map((i) => i.id)).not.toContain('old-gold')
  })

  it('writes overflow item documents, then overflow gold, then the merged character', async () => {
    stored({ xp: 4, details: { inventory: Array.from({ length: 13 }, (_, i) => ({ ...rope, id: `kept-${i}` })), notes: 'keep' } })
    const result = await grant({ goldAmount: 120, templateEntries: [{ key: 'gear-rope', name: 'Rope', kind: 'general', costGp: 1, qty: 1 }] })
    expect(result.inventory).toHaveLength(13)
    expect(result.overflowFeedback).toContain('Not all items fit')
    expect(tx.set).toHaveBeenCalledTimes(3)
    const [itemWrite, goldWrite, characterWrite] = tx.set.mock.calls
    expect(itemWrite[0].path).toMatch(new RegExp(`^${campaignPath}/items/`))
    expect(itemWrite[1]).toMatchObject({ type: 'general', status: 'dropped', droppedByCharacterId: 'pc', createdAt: 'server-time', updatedAt: 'server-time' })
    expect(itemWrite).toHaveLength(2)
    expect(goldWrite[0]).toEqual({ path: `${campaignPath}/items/overflow-gold`, id: 'overflow-gold' })
    expect(goldWrite[1]).toMatchObject({ type: 'gold', goldAmount: 120, status: 'dropped', droppedByCharacterName: 'Ada', createdAt: 'server-time', updatedAt: 'server-time' })
    expect(characterWrite).toEqual([charRef, { xp: 4, details: { inventory: result.inventory, notes: 'keep' }, ...stamp, updatedAt: 'server-time' }, { merge: true }])
  })

  it('does not write when the character is missing', async () => {
    tx.get.mockResolvedValue({ exists: () => false })
    await expect(grant()).rejects.toThrow('Target not found: Ada')
    expect(tx.set).not.toHaveBeenCalled()
  })

  it('fails on a truthy malformed stored inventory instead of treating it as empty', async () => {
    stored({ details: { inventory: 'invalid' } })
    await expect(grant()).rejects.toThrow('filter is not a function')
    expect(tx.set).not.toHaveBeenCalled()
  })

  it('rejects a character ref without a campaign parent before writing', async () => {
    await expect(grant({}, { parent: { parent: null } } as unknown as DocumentReference)).rejects.toThrow('Character reference must be nested below a campaign document.')
    expect(tx.set).not.toHaveBeenCalled()
  })

  it('propagates read and write errors', async () => {
    tx.get.mockRejectedValueOnce(new Error('read failed'))
    await expect(grant()).rejects.toThrow('read failed')
    expect(tx.set).not.toHaveBeenCalled()
    tx.set.mockImplementationOnce(() => { throw new Error('write failed') })
    await expect(grant()).rejects.toThrow('write failed')
  })
})

describe('grant edge behavior before shared persistence', () => {
  it('uses the caller target class for XP bonus even when the stored class differs', async () => {
    stored({ class: 'Magic-User', xp: 100, details: { inventory: [], abilityScores: { STR: '16', INT: '3' } } })
    // The caller's Fighter gets +10% from STR; the stored Magic-User would get
    // a penalty from INT. The transaction does not parse a fresh target.
    const result = await grant({ xpAmount: 20 })
    expect(result.xp).toBe(122)
    expect(tx.set).toHaveBeenCalledExactlyOnceWith(charRef, {
      xp: 122, details: { inventory: [], abilityScores: { STR: '16', INT: '3' } }, ...stamp, updatedAt: 'server-time',
    }, { merge: true })
  })

  it('normalizes negative total gold to empty, ignoring gold rows with missing quantities', async () => {
    stored({ details: { inventory: [rope, { id: 'gold', kind: 'gold' }] } })
    const result = await grant({ goldAmount: -5 })
    expect(result.inventory).toEqual([rope])
    expect(tx.set).toHaveBeenCalledTimes(1)
  })
})
