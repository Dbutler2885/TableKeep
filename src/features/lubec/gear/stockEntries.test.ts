/** The picker's sources and sections: the game's stock, and this campaign's, hidden while empty. */
import { describe, expect, it } from 'vitest'
import { LUBEC_STOCK } from '../../ruleSets/lubec/gear/stock'
import { hasCampaignStock, lubecStockEntries, lubecStockSections } from './stockEntries'

const sled = { sid: 'm-1', kind: 'thing' as const, name: 'Sled', note: '', size: 4 as const, weight: 'normal' as const, qty: 1 }

describe('the picker\'s entries', () => {
  it('offers the game\'s stock alone until the campaign has its own', () => {
    const entries = lubecStockEntries([])
    expect(entries).toHaveLength(20)
    expect(entries.every((x) => x.from === 'game')).toBe(true)
    expect(hasCampaignStock(entries)).toBe(false)
  })

  it('adds the campaign\'s, one for each design, leaving out unchanged copies of the stock (Rule T3)', () => {
    const entries = lubecStockEntries([sled, { ...LUBEC_STOCK[0], sid: 'm-2' }, { ...sled, sid: 'm-3' }])
    expect(entries.filter((x) => x.from === 'campaign').map((x) => x.sid)).toEqual(['m-3'])
    expect(hasCampaignStock(entries)).toBe(true)
  })
})

describe('the picker\'s sections', () => {
  const entries = lubecStockEntries([sled])
  const sections = (filter: Partial<Parameters<typeof lubecStockSections>[1]>) =>
    lubecStockSections(entries, { query: '', kind: '', from: '', ...filter }).map((s) => [s.kind, s.list.map((x) => x.name)])

  it('shows every kind with something in it, in the kinds\' order', () => {
    expect(sections({}).map(([kind, list]) => [kind, list.length])).toEqual([['thing', 6], ['weapon', 4], ['armor', 4], ['consumable', 3], ['holder', 4]])
  })

  it('searches the name and the search words, leaving out a kind with nothing found', () => {
    expect(sections({ query: ' AMMO' })).toEqual([['holder', ['Box of .38 rounds', 'Box of 12-gauge shells']]])
    expect(sections({ query: 'zebra' })).toEqual([])
  })

  it('shows a picked kind even when nothing in it matches, and filters by where it comes from', () => {
    expect(sections({ kind: 'armor', query: 'bat' })).toEqual([['armor', []]])
    expect(sections({ from: 'campaign' })).toEqual([['thing', ['Sled']]])
    expect(sections({ from: 'game', kind: 'thing' })).toEqual([['thing', ['Walkie-talkie', 'Multimeter', 'Instamatic camera', 'Coil of rope', 'Pocket compass']]])
  })
})
