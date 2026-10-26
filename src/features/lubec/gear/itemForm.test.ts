/** The add and edit form's fields: opening, copying from stock, the size and place rules, and the draft it makes. */
import { describe, expect, it } from 'vitest'
import { LUBEC_STOCK } from '../../ruleSets/lubec/gear/stock'
import type { LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import {
  lubecBothHandsByRule,
  lubecCountOf,
  lubecDraftOf,
  lubecFieldPage,
  lubecFieldsFromStock,
  lubecFieldsOf,
  lubecFormPages,
  lubecNewFields,
  lubecPictureShown,
  lubecTogglePart,
  lubecWithDest,
  lubecWithKind,
  lubecWithMode,
  lubecWithSize,
} from './itemForm'

const stock = (sid: string) => LUBEC_STOCK.find((x) => x.sid === sid) as (typeof LUBEC_STOCK)[number]

describe('opening the form', () => {
  it('opens a new item as a 1-slot Thing at the place it was opened, or Small from small stuff', () => {
    expect(lubecNewFields('hands')).toMatchObject({ kind: 'thing', size: 1, weight: 'normal', qty: '1', per: '1', dest: 'hands', picture: null, stock: null })
    expect(lubecNewFields('backpack#small').size).toBe(0)
    expect(lubecNewFields('worn')).toMatchObject({ kind: 'armor', dest: 'worn', locs: [] })
    expect(lubecDraftOf({ ...lubecNewFields('backpack#0'), name: ' Rope ', note: ' Long. ' })).toEqual({ kind: 'thing', name: 'Rope', note: 'Long.', size: 1, weight: 'normal', qty: 1, per: 1 })
  })

  it('fills the edit form from the item, and makes the same item back', () => {
    const revolver: LubecItem = { ...stock('revolver'), id: 'r', carrier: 'hands', slot: 0, stock: '.38 revolver', loaded: 4 }
    const fields = lubecFieldsOf(revolver, 'hands')
    expect(fields).toMatchObject({ kind: 'weapon', mode: 'firearm', impact: '1', wCapacity: '6', wLoaded: '4', wTakes: 'a38', table: 'gunshot', stock: '.38 revolver', picture: { art: 'revolver', shape: 'wide' } })
    expect(lubecDraftOf(fields)).toEqual({
      kind: 'weapon', name: '.38 revolver', note: 'Six shots, double action.', size: 1, weight: 'normal', qty: 1, per: 1,
      art: 'revolver', shape: 'wide', stock: '.38 revolver', mode: 'firearm', impact: 1, table: 'gunshot', wounds: ['gun'], capacity: 6, loaded: 4, takes: 'a38',
    })
  })

  it('reads an item that stores less than the form asks with the form\'s own values', () => {
    const bare = lubecFieldsOf({ id: 'x', kind: 'weapon', name: 'Stick', note: '', size: 1, weight: 'normal', qty: 1, carrier: 'body', slot: 0 }, 'body')
    expect(bare).toMatchObject({ mode: 'melee', impact: '0', table: 'blunt', wounds: ['blunt'], reach: 'long', wCapacity: '6', wLoaded: '0', hCapacity: '2', hLoaded: '2', picture: null, stock: null })
  })
})

describe('copying from stock (Rule T2)', () => {
  it('copies the entry into the form, naming the stock it came from', () => {
    const fields = lubecFieldsFromStock(lubecNewFields('backpack#0'), stock('helmet'))
    expect(fields).toMatchObject({ kind: 'armor', name: 'Hockey helmet', size: 2, locs: ['head'], exclusive: false, stock: 'Hockey helmet', armor: { cut: '1', pierce: '1', blunt: '2', gun: '0' } })
    expect(lubecDraftOf(fields)).toMatchObject({ kind: 'armor', qty: 1, locs: ['head'], exclusive: false, armor: { cut: 1, pierce: 1, blunt: 2, gun: 0 } })
    expect('per' in lubecDraftOf(fields)).toBe(false)
  })

  it('moves a small entry to small stuff and a bigger one out of it', () => {
    expect(lubecFieldsFromStock(lubecNewFields('backpack#1'), stock('compass')).dest).toBe('backpack#small')
    expect(lubecFieldsFromStock(lubecNewFields('backpack#small'), stock('rope')).dest).toBe('backpack#0')
    expect(lubecFieldsFromStock(lubecNewFields('hands'), stock('compass')).dest).toBe('hands')
  })

  it('keeps armor worn, and takes anything else picked while "Wear it" is chosen to the main pocket', () => {
    expect(lubecFieldsFromStock(lubecNewFields('worn'), stock('helmet')).dest).toBe('worn')
    expect(lubecFieldsFromStock(lubecNewFields('worn'), stock('rope')).dest).toBe('backpack#0')
  })

  it('fills a holder full unless the entry says how full it is', () => {
    expect(lubecFieldsFromStock(lubecNewFields('backpack#0'), stock('canteen'))).toMatchObject({ hold: 'fill', hCapacity: '4', hLoaded: '4', hTakes: 'water' })
    const { loaded: _loaded, ...unfilled } = stock('flashlight')
    expect(lubecFieldsFromStock(lubecNewFields('backpack#0'), unfilled)).toMatchObject({ hCapacity: '2', hLoaded: '2' })
  })

  it('keeps a drawing that does not ship, but shows it as none', () => {
    const fields = lubecFieldsFromStock(lubecNewFields('backpack#0'), stock('walkie'))
    expect(fields.picture).toEqual({ art: 'walkie', shape: 'tall' })
    expect(lubecPictureShown(fields.picture)).toBe(false)
    expect(lubecPictureShown(lubecFieldsFromStock(fields, stock('rope')).picture)).toBe(true)
    expect(lubecPictureShown(null)).toBe(false)
    expect(lubecDraftOf(fields)).toMatchObject({ art: 'walkie', shape: 'tall' })
  })
})

describe('the form\'s own rules', () => {
  it('sends a small thing to small stuff and brings a bigger one back (size first)', () => {
    expect(lubecWithSize(lubecNewFields('backpack#1'), 0).dest).toBe('backpack#small')
    expect(lubecWithSize(lubecNewFields('backpack#small'), 2)).toMatchObject({ size: 2, dest: 'backpack#0' })
    expect(lubecWithSize(lubecNewFields('body'), 0).dest).toBe('body')
  })

  it('makes a thing Small for small stuff, and 1 slot for a pocket (place first)', () => {
    expect(lubecWithDest(lubecNewFields('backpack#0'), 'backpack#small').size).toBe(0)
    expect(lubecWithDest(lubecWithSize(lubecNewFields('backpack#0'), 0), 'backpack#2')).toMatchObject({ size: 1, dest: 'backpack#2' })
    expect(lubecWithDest(lubecWithSize(lubecNewFields('backpack#0'), 0), 'hands')).toMatchObject({ size: 0, dest: 'hands' })
  })

  it('sets the table and the wound with melee, firearm or thrown', () => {
    expect(lubecWithMode(lubecNewFields('hands'), 'firearm')).toMatchObject({ mode: 'firearm', table: 'gunshot', wounds: ['gun'] })
    expect(lubecWithMode(lubecNewFields('hands'), 'melee')).toMatchObject({ mode: 'melee', table: 'blunt', wounds: ['blunt'] })
    expect(lubecWithMode(lubecNewFields('hands'), 'thrown')).toMatchObject({ mode: 'thrown', table: 'blunt', wounds: ['blunt'] })
  })

  it('gives both hands by the hands rule to anything bigger than one slot or heavier than normal', () => {
    expect(lubecBothHandsByRule({ size: 1, weight: 'normal' })).toBe(false)
    expect(lubecBothHandsByRule({ size: 0, weight: 'normal' })).toBe(false)
    expect(lubecBothHandsByRule({ size: 2, weight: 'normal' })).toBe(true)
    expect(lubecBothHandsByRule({ size: 1, weight: 'heavy' })).toBe(true)
  })

  it('leaves "Wear it" for a kind that is not armor, and keeps any other place', () => {
    expect(lubecWithKind(lubecNewFields('worn'), 'thing')).toMatchObject({ kind: 'thing', dest: 'backpack#0' })
    expect(lubecWithKind(lubecNewFields('worn'), 'armor').dest).toBe('worn')
    expect(lubecWithKind(lubecNewFields('hands'), 'weapon')).toMatchObject({ kind: 'weapon', dest: 'hands' })
  })

  it('picks and unpicks parts, and both sides at once', () => {
    let f = lubecTogglePart(lubecNewFields('worn'), 'head')
    expect(f.locs).toEqual(['head'])
    f = lubecTogglePart({ ...f, bothSides: true }, 'hand-L')
    expect(f.locs).toEqual(['head', 'hand-L', 'hand-R'])
    f = lubecTogglePart(f, 'hand-R')
    expect(f.locs).toEqual(['head'])
    expect(lubecTogglePart({ ...f, bothSides: true }, 'head').locs).toEqual([])
    expect(lubecTogglePart({ ...f, bothSides: false, locs: ['hand-L'] }, 'hand-R').locs).toEqual(['hand-L', 'hand-R'])
  })

  it('reads the count as the prototype does: at most 999, and at least one to a slot', () => {
    expect(lubecCountOf({ qty: '12.6', per: '0' })).toEqual({ qty: 13, per: 1 })
    expect(lubecCountOf({ qty: 'x', per: '5000' })).toEqual({ qty: 0, per: 999 })
  })
})

describe('the draft', () => {
  const base = lubecNewFields('backpack#0')

  it('makes a melee weapon with its reach, and a firearm with its rounds, held to its size', () => {
    const melee = lubecDraftOf({ ...base, kind: 'weapon', name: 'Bat', reach: 'short', impact: '2.4' })
    expect(melee).toMatchObject({ mode: 'melee', impact: 2, table: 'blunt', wounds: ['blunt'], reach: 'short' })
    expect('capacity' in melee).toBe(false)
    const gun = lubecDraftOf({ ...lubecWithMode({ ...base, kind: 'weapon', name: 'Gun' }, 'firearm'), wCapacity: '0', wLoaded: '9' })
    expect(gun).toMatchObject({ capacity: 1, loaded: 1 })
    expect('takes' in gun).toBe(false)
  })

  it('makes a thrown weapon with neither reach nor rounds', () => {
    const rock = lubecDraftOf({ ...lubecWithMode({ ...base, kind: 'weapon', name: 'Rock', impact: '1' }, 'thrown'), reach: 'short', wTakes: 'a38' })
    expect(rock).toEqual({ kind: 'weapon', name: 'Rock', note: '', size: 1, weight: 'normal', qty: 1, per: 1, mode: 'thrown', impact: 1, table: 'blunt', wounds: ['blunt'] })
  })

  it('writes a minimum Strength only when one is typed, never below 0', () => {
    const weapon = { ...base, kind: 'weapon' as const, name: 'Sledgehammer' }
    expect('minStrength' in lubecDraftOf({ ...weapon, minStrength: ' ' })).toBe(false)
    expect(lubecDraftOf({ ...weapon, minStrength: '60' })).toMatchObject({ minStrength: 60 })
    expect(lubecDraftOf({ ...weapon, minStrength: '-5' })).toMatchObject({ minStrength: 0 })
  })

  it('writes "both hands" only for a weapon the hands rule would give one hand', () => {
    const weapon = { ...base, kind: 'weapon' as const, name: 'Slingshot', hands: 2 as const }
    expect(lubecDraftOf(weapon)).toMatchObject({ hands: 2 })
    expect('hands' in lubecDraftOf({ ...weapon, hands: 1 })).toBe(false)
    expect('hands' in lubecDraftOf({ ...weapon, size: 2 })).toBe(false)
    expect('hands' in lubecDraftOf({ ...weapon, weight: 'heavy' })).toBe(false)
  })

  it('fills the minimum Strength and the hands from the item, and empty when it has none', () => {
    const slingshot: LubecItem = { id: 's', kind: 'weapon', name: 'Slingshot', note: '', size: 1, weight: 'normal', qty: 1, carrier: 'body', slot: 0, mode: 'thrown', minStrength: 20, hands: 2 }
    expect(lubecFieldsOf(slingshot, 'body')).toMatchObject({ mode: 'thrown', minStrength: '20', hands: 2 })
    expect(lubecFieldsOf({ ...slingshot, minStrength: undefined, hands: undefined }, 'body')).toMatchObject({ minStrength: '', hands: 1 })
  })

  it('makes armor of one, in the order of the body, its numbers held between 0 and 9', () => {
    const armor = lubecDraftOf({ ...base, kind: 'armor', name: 'Pads', qty: '4', locs: ['torso', 'head'], armor: { cut: '12', pierce: '-1', blunt: '2', gun: '' }, exclusive: true })
    expect(armor).toMatchObject({ qty: 1, locs: ['head', 'torso'], exclusive: true, armor: { cut: 9, pierce: 0, blunt: 2, gun: 0 } })
  })

  it('makes a consumable that goes into a gun only when one is picked, and a holder held to its size', () => {
    expect('fits' in lubecDraftOf({ ...base, kind: 'consumable', name: 'Gum' })).toBe(false)
    expect(lubecDraftOf({ ...base, kind: 'consumable', name: 'Cells', fits: 'dcell', qty: '3', per: '4' })).toMatchObject({ fits: 'dcell', qty: 3, per: 4 })
    expect(lubecDraftOf({ ...base, kind: 'holder', name: 'Jug', hold: 'fill', hCapacity: '3', hLoaded: '7', hTakes: 'water' })).toMatchObject({ hold: 'fill', capacity: 3, loaded: 3, takes: 'water', qty: 1 })
    expect('takes' in lubecDraftOf({ ...base, kind: 'holder', name: 'Jug' })).toBe(false)
  })

  it('leaves out "per" for a small thing, and never writes an undefined field', () => {
    const small = lubecDraftOf({ ...lubecNewFields('backpack#small'), name: 'Key', qty: '3' })
    expect(small).toEqual({ kind: 'thing', name: 'Key', note: '', size: 0, weight: 'normal', qty: 3 })
    expect(Object.values(lubecDraftOf({ ...base, kind: 'weapon', name: 'x' })).includes(undefined)).toBe(false)
  })
})

describe('the form\'s pages on a phone', () => {
  it('has the item, its kind\'s own page and where it goes; a Thing has no page of its own', () => {
    expect(lubecFormPages('thing')).toEqual([['top', 'Item'], ['bottom', 'Where']])
    expect(lubecFormPages('holder')).toEqual([['top', 'Item'], ['kind', 'Holder'], ['bottom', 'Where']])
  })

  it('turns to the page a refused field is on', () => {
    expect(['name', 'qty', 'per', 'wounds', 'takes', 'locs'].map((f) => lubecFieldPage(f as never))).toEqual(['top', 'top', 'top', 'kind', 'kind', 'kind'])
  })
})
