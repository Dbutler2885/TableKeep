/** The words the card, the stock picker and the form show, against the prototype's. */
import { describe, expect, it } from 'vitest'
import { emptyLubecGear, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { LUBEC_STOCK } from '../../ruleSets/lubec/gear/stock'
import { LUBEC_SUPPLIES } from '../../ruleSets/lubec/gear/supplies'
import { supplyNameIn } from './gearLabels'
import { armorAll, armorSome, destOf, lubecDestinations, selectValue, stockLine, suggestLine, weightHint } from './itemLabels'

const supplyName = supplyNameIn(LUBEC_SUPPLIES)
const stock = (sid: string) => LUBEC_STOCK.find((x) => x.sid === sid) as (typeof LUBEC_STOCK)[number]

describe('a stock entry\'s line', () => {
  it('says each kind\'s own numbers', () => {
    expect(LUBEC_STOCK.map((x) => stockLine(x, supplyName))).toEqual([
      '1 slot / Loaded: D batteries, holds 2',
      '1 slot / Filled: Water, holds 4',
      '1 slot', '1 slot', '1 slot', '1 slot', 'Small',
      '2 slots / Blunt Force / Impact + 1 + Str',
      'Small / no table yet / Impact + 0 + Str',
      '1 slot / Gunshot / Impact + 1, holds 6',
      '4 slots / Gunshot / Impact + 2, holds 2',
      'Cut −1, Pierce −1, Blunt −2 / Head',
      'Cut −1, Blunt −1 / Hands',
      'Cut −1, Blunt −2 / Torso, Upper arms',
      'Cut −1, Blunt −1 / Torso, Upper arms, Forearms, Waist, Groin, Thighs, Shins',
      '1 slot / A box: .38 rounds, holds 50',
      '1 slot / A box: 12-gauge shells, holds 25',
      '1 slot / ×2, 4 fit in a slot, D batteries',
      '1 slot / ×1, 2 fit in a slot',
      '1 slot / ×1, 2 fit in a slot',
    ])
  })

  it('reads a weapon\'s negative Impact and an armor with no numbers, and a consumable with no count to a slot', () => {
    expect(stockLine({ ...stock('bat'), impact: -2, table: undefined }, supplyName)).toBe('2 slots / Impact − 2 + Str')
    expect(stockLine({ ...stock('helmet'), armor: undefined, locs: undefined }, supplyName)).toBe('No armor / ')
    expect(stockLine({ ...stock('sandwich'), per: undefined, qty: 3 }, supplyName)).toBe('1 slot / ×3')
    expect(stockLine({ ...stock('flashlight'), hold: undefined }, supplyName)).toBe('1 slot / Loaded: D batteries, holds 2')
    expect(stockLine({ ...stock('bat'), impact: undefined }, supplyName)).toContain('Impact + 0')
  })

  it('names the kind before the line in the suggestions', () => {
    expect(suggestLine(stock('rope'), supplyName)).toBe('Thing / 1 slot')
  })
})

describe('armor numbers', () => {
  it('names every kind for the card, and only those it stops for a short label', () => {
    expect(armorAll(stock('gloves'))).toBe('Cutting −1, Piercing 0, Blunt −1, Gunshot 0')
    expect(armorSome(() => 0)).toEqual([])
  })
})

describe('the weight hint', () => {
  it('says what each weight does', () => {
    expect(['normal', 'heavy', 'extra'].map((w) => weightHint(w as never))).toEqual([
      'Normal: no effect.',
      'Heavy: takes both hands to hold. Roll Strength when it comes onto you. Fail: Speed −20.',
      "Extra heavy: takes both hands to hold. Roll Strength. Pass: Speed −20, always. Fail: you can't carry it.",
    ])
  })
})

describe('"Put it"', () => {
  const T = (id: string, extra: Partial<LubecItem>): LubecItem =>
    ({ id, kind: 'thing', name: id, note: '', size: 1, weight: 'normal', qty: 1, carrier: 'backpack', pocket: 0, ...extra })

  it('offers each place on you with what is free in it', () => {
    const gear = { ...emptyLubecGear(), items: [T('a', { size: 2 }), T('b', { pocket: 1 }), T('c', { carrier: 'hands', slot: 0, pocket: undefined })] }
    expect(lubecDestinations(gear, 'thing')).toEqual([
      { value: 'backpack#0', label: 'Backpack: main pocket (3 of 5 free)' },
      { value: 'backpack#1', label: 'Backpack: front left (0 of 1 free)' },
      { value: 'backpack#2', label: 'Backpack: front right (1 of 1 free)' },
      { value: 'backpack#small', label: 'Backpack: small stuff (no slot)' },
      { value: 'hands', label: 'Hands (1 free)' },
      { value: 'body', label: 'Body (2 free)' },
    ])
  })

  it('offers armor "Wear it" first, and nothing else (Rule W5)', () => {
    expect(lubecDestinations(emptyLubecGear(), 'armor')[0]).toEqual({ value: 'worn', label: 'Wear it' })
    expect(lubecDestinations(emptyLubecGear(), 'armor')).toHaveLength(7)
    expect(lubecDestinations(emptyLubecGear(), 'weapon').map((d) => d.value)).not.toContain('worn')
  })

  it('reads a place as its choice, and an item\'s place as one the form can ask for again', () => {
    expect(['hands#1', 'body', 'backpack', 'backpack#2', 'backpack#small'].map(selectValue)).toEqual(['hands', 'body', 'backpack#0', 'backpack#2', 'backpack#small'])
    expect([
      T('a', {}), T('b', { pocket: null, size: 0 }), T('c', { carrier: 'hands', slot: 1 }), T('d', { carrier: 'worn', pocket: undefined }),
    ].map(destOf)).toEqual(['backpack#0', 'backpack#small', 'hands#1', 'worn'])
  })
})
