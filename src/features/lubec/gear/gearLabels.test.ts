/** The words the On you view shows, as B's subLine, whereText, syncCount and toast write them. */
import { describe, expect, it } from 'vitest'
import type { LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { addedToast, countNote, heavyClass, largeClass, qtyText, subLine, supplyNameIn, uprightClass, weightTagText, whereText } from './gearLabels'

const item = (extra: Partial<LubecItem>): LubecItem => ({ id: 'i', kind: 'thing', name: 'Rope', note: '', size: 1, weight: 'normal', qty: 1, carrier: 'backpack', pocket: 0, ...extra })
const supplyName = (id: string | undefined) => (id === 'water' ? 'Water' : 'no supply')

describe('the On you words', () => {
  it('say what is loaded, left or how many under an item\'s name', () => {
    expect(subLine(item({ kind: 'weapon', mode: 'firearm', capacity: 6, loaded: 0 }), supplyName)).toBe('0 of 6 loaded')
    expect(subLine(item({ kind: 'holder', hold: 'load', capacity: 2, loaded: 2 }), supplyName)).toBe('2 of 2 loaded')
    expect(subLine(item({ kind: 'holder', hold: 'box', capacity: 50, loaded: 12 }), supplyName)).toBe('12 of 50 inside')
    expect(subLine(item({ kind: 'holder', hold: 'fill', takes: 'water', capacity: 4, loaded: 3 }), supplyName)).toBe('Water, 3 of 4')
    expect(subLine(item({ kind: 'holder', hold: 'fill', takes: 'water', capacity: 4, loaded: 0 }), supplyName)).toBe('Empty')
    expect(subLine(item({ kind: 'consumable', qty: 2 }), supplyName)).toBe('2 left')
    expect(subLine(item({ qty: 3 }), supplyName)).toBe('×3')
    expect(subLine(item({}), supplyName)).toBe('')
    expect(qtyText(item({ qty: 1 }))).toBe('')
  })

  it('tag a heavy or extra heavy item', () => {
    expect([weightTagText(item({})), weightTagText(item({ weight: 'heavy' })), weightTagText(item({ weight: 'extra' }))]).toEqual([null, 'Heavy', 'Extra heavy'])
    expect([heavyClass(item({})), heavyClass(item({ weight: 'extra' }))]).toEqual(['', ' heavy'])
  })

  it('name a supply from its id, or say there is none', () => {
    const supplyNamed = supplyNameIn([{ id: 'oil', name: 'Lamp oil' }])
    expect([supplyNamed('oil'), supplyNamed('water'), supplyNamed(undefined)]).toEqual(['Lamp oil', 'no supply', 'no supply'])
  })

  it('mark a 4-slot box large, and a 2-slot thing standing one box above the other upright', () => {
    expect([largeClass(item({ size: 4 })), largeClass(item({ size: 2 }))]).toEqual([' large', ''])
    expect([uprightClass(item({ size: 2 }), [0, 2]), uprightClass(item({ size: 2 }), [0, 1]), uprightClass(item({ size: 1 }), [4])]).toEqual([' upright', '', ''])
  })

  it('say where an item on you is', () => {
    expect(whereText(item({}))).toBe('Backpack, main pocket')
    expect(whereText(item({ pocket: 2 }))).toBe('Backpack, front pocket, right')
    expect(whereText(item({ pocket: null, size: 0 }))).toBe('Backpack, small stuff')
    expect(whereText(item({ carrier: 'hands', slot: 1 }))).toBe('Right hand')
    expect(whereText(item({ carrier: 'hands', slot: 0, size: 2 }))).toBe('Both hands')
    expect(whereText(item({ carrier: 'body', slot: 0 }))).toBe('Body slot')
  })

  it('confirm an add in one line', () => {
    expect(addedToast(item({}), 1)).toBe('Rope: Backpack, main pocket.')
    expect(addedToast(item({}), 3)).toBe('Rope: 3 stacks, backpack, main pocket.')
  })

  it('count stacks in plain words', () => {
    expect(countNote(12, 1, 0)).toEqual({ text: 'Small things take no slot in a bag, however many.', warn: false })
    expect(countNote(1, 1, 1)).toEqual({ text: 'One stack: 1 slot.', warn: false })
    expect(countNote(11, 2, 1)).toEqual({ text: '11 in all makes 6 stacks, each taking 1 slot: 6 slots in all. The last stack holds 1.', warn: false })
    expect(countNote(4, 2, 2)).toEqual({ text: '4 in all makes 2 stacks, each taking 2 slots: 4 slots in all.', warn: false })
    expect(countNote(41, 1, 1)).toEqual({ text: 'That makes 41 stacks. Keep it to 40 or fewer, or fit more in each slot.', warn: true })
  })
})
