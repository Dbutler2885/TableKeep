/**
 * The game's stock (spec 7.1): exactly the prototype's 20 items, the bat at
 * +1, no catalog, and picking makes a copy that never follows the stock
 * (Rule T2). "This campaign" keeps one entry for each design (Rule T3).
 */
import { describe, expect, it } from 'vitest'
import * as stockModule from './stock'
import { parseLubecItem } from './gearRecord'
import { draftProblem } from './stacks'
import {
  LUBEC_COPY_FIELDS,
  LUBEC_STOCK,
  lubecCampaignStock,
  lubecCopyOf,
  lubecSameDesign,
  lubecStockMatching,
  lubecStockSuggestions,
  type LubecStockItem,
} from './stock'
import { LUBEC_SUPPLIES } from './supplies'

const stock = (sid: string) => LUBEC_STOCK.find((x) => x.sid === sid) as LubecStockItem

describe('the starter stock', () => {
  it('is exactly the prototype\'s 20 items, by kind', () => {
    expect(LUBEC_STOCK.map((x) => x.name)).toEqual([
      'Flashlight', 'Canteen', 'Walkie-talkie', 'Multimeter', 'Instamatic camera', 'Coil of rope', 'Pocket compass',
      'Baseball bat', 'Pocketknife', '.38 revolver', "Dad's shotgun",
      'Hockey helmet', 'Leather work gloves', 'Football shoulder pads', 'Snowmobile suit',
      'Box of .38 rounds', 'Box of 12-gauge shells', 'D batteries', 'Peanut butter sandwich', 'Bottle of Moxie',
    ])
    const count = (kind: string) => LUBEC_STOCK.filter((x) => x.kind === kind).length
    expect(['holder', 'thing', 'weapon', 'armor', 'consumable'].map(count)).toEqual([4, 5, 4, 4, 3])
    expect(new Set(LUBEC_STOCK.map((x) => x.sid)).size).toBe(20)
  })

  it('has the baseball bat at Impact 1, and every other number as the prototype has it', () => {
    expect(stock('bat')).toMatchObject({ kind: 'weapon', mode: 'melee', impact: 1, size: 2, wounds: ['blunt'], reach: 'long' })
    expect(stock('revolver')).toMatchObject({ impact: 1, capacity: 6, loaded: 0, takes: 'a38' })
    expect(stock('shotgun')).toMatchObject({ impact: 2, capacity: 2, takes: 'a12g', size: 4 })
    expect(stock('knife')).toMatchObject({ impact: 0, size: 0, wounds: ['cut', 'pierce'], reach: 'short' })
    expect(stock('dcell')).toMatchObject({ qty: 2, per: 4, fits: 'dcell' })
    expect(stock('suit')).toMatchObject({ exclusive: true, size: 4 })
    expect(stock('suit').locs).toHaveLength(11)
  })

  it('is all valid: every entry passes the add form\'s rules, reads back as stored, and names a supply that exists', () => {
    const supplies = new Set(LUBEC_SUPPLIES.map((s) => s.id))
    for (const x of LUBEC_STOCK) {
      expect(draftProblem(x), x.name).toBeNull()
      const { sid: _sid, tags: _tags, ...item } = x
      expect(parseLubecItem({ ...item, id: 'i', carrier: 'backpack' }, 'i'), x.name).toEqual({ ...item, id: 'i', carrier: 'backpack' })
      for (const supply of [x.takes, x.fits].filter(Boolean)) expect(supplies.has(supply as string), `${x.name} takes ${supply}`).toBe(true)
    }
  })

  it('holds no catalog: the module offers the 20 and nothing else to pick from', () => {
    const lists = Object.entries(stockModule).filter(([, value]) => Array.isArray(value))
    expect(lists.map(([name]) => name).sort()).toEqual(['LUBEC_COPY_FIELDS', 'LUBEC_STOCK'])
    expect(LUBEC_COPY_FIELDS.every((f) => typeof f === 'string')).toBe(true)
  })
})

describe('picking from stock (Rule T2)', () => {
  it('copies what the item is, never its stock id, its search words or a place', () => {
    const copy = lubecCopyOf({ ...stock('flashlight'), id: 'x', carrier: 'hands', slot: 1, check: 'pass' })
    expect(copy).toEqual({
      kind: 'holder', name: 'Flashlight', size: 1, weight: 'normal', qty: 1, note: 'Two D batteries. About four hours of light.',
      capacity: 2, loaded: 2, takes: 'dcell', hold: 'load', art: 'flashlight', shape: 'tall',
    })
  })

  it('makes a copy that later changes to the stock never touch', () => {
    const source = structuredClone(stock('gloves'))
    const copy = lubecCopyOf(source)
    source.locs?.push('head')
    ;(source.armor as Record<string, number>).cut = 9
    source.name = 'Mittens'
    expect(copy).toMatchObject({ name: 'Leather work gloves', locs: ['hand-L', 'hand-R'], armor: { cut: 1, pierce: 0, blunt: 1, gun: 0 } })
  })
})

describe('one entry for each design (Rule T3)', () => {
  it('sees two entries as one design when they differ only in what the form fills in by default, or in rounds loaded', () => {
    const revolver = lubecCopyOf(stock('revolver'))
    expect(lubecSameDesign(revolver, { ...revolver, loaded: 6, exclusive: false, per: 1, note: '', wounds: ['gun'] })).toBe(false)
    expect(lubecSameDesign({ ...revolver, note: '' }, { ...revolver, loaded: 6, exclusive: false, per: 1 })).toBe(false)
    expect(lubecSameDesign({ ...revolver, loaded: 3 }, { ...revolver, loaded: 6, exclusive: false, per: 1 })).toBe(true)
    expect(lubecSameDesign({ ...revolver, note: '' }, { ...revolver, note: undefined })).toBe(true)
    expect(lubecSameDesign({ wounds: ['cut', 'pierce'] }, { wounds: ['pierce', 'cut'] })).toBe(true)
    expect(lubecSameDesign({ ...revolver, impact: 2 }, revolver)).toBe(false)
  })

  it('leaves out unchanged copies of the game\'s stock and exact repeats, newest first', () => {
    const bat = lubecCopyOf(stock('bat'))
    const heavyBat = { ...bat, weight: 'heavy' as const, name: 'Heavy bat' }
    const rope = { kind: 'thing' as const, name: 'Rope ladder', size: 2 as const, weight: 'normal' as const, qty: 1, note: '' }
    expect(lubecCampaignStock([bat, heavyBat, rope, { ...heavyBat }, { ...bat, loaded: 0 }])).toEqual([heavyBat, rope])
  })
})

describe('finding stock', () => {
  it('matches the name or the search words, in any case, and every entry for a blank search', () => {
    expect(lubecStockMatching(LUBEC_STOCK, 'TORCH').map((x) => x.sid)).toEqual(['flashlight'])
    expect(lubecStockMatching(LUBEC_STOCK, ' ammo ').map((x) => x.sid)).toEqual(['rounds38', 'shells'])
    expect(lubecStockMatching(LUBEC_STOCK, '  ')).toHaveLength(20)
  })

  it('suggests up to six, those of the kind being made first, and none for a blank name', () => {
    expect(lubecStockSuggestions(LUBEC_STOCK, '', 'thing')).toEqual([])
    expect(lubecStockSuggestions(LUBEC_STOCK, 'o', 'weapon')).toHaveLength(6)
    expect(lubecStockSuggestions(LUBEC_STOCK, 'flash', 'consumable').map((x) => x.sid)).toEqual(['dcell', 'flashlight'])
    expect(lubecStockSuggestions(LUBEC_STOCK, 'flash', 'holder').map((x) => x.sid)).toEqual(['flashlight', 'dcell'])
  })
})
