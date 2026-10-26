/** The item card's facts, in the prototype's words and order. */
import { describe, expect, it } from 'vitest'
import { emptyLubecGear, type LubecGear, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { LUBEC_SUPPLIES } from '../../ruleSets/lubec/gear/supplies'
import { cardEyebrow, cardTitle, lubecCardFacts } from './cardFacts'

const T = (id: string, extra: Partial<LubecItem> = {}): LubecItem =>
  ({ id, kind: 'thing', name: id, note: '', size: 1, weight: 'normal', qty: 1, carrier: 'backpack', pocket: 0, ...extra })

const gearOf = (...items: LubecItem[]): LubecGear => ({ ...emptyLubecGear(), items })

const factsOf = (item: LubecItem, gear = gearOf(item)) => lubecCardFacts(gear, item, LUBEC_SUPPLIES).map((f) => [f.term, f.text, f.step].filter(Boolean))

describe('the card\'s head', () => {
  it('names the kind and where it is, and how many unless it counts down', () => {
    expect(cardEyebrow(T('Rope', { kind: 'weapon', carrier: 'hands', slot: 1 }))).toBe('Weapon / Right hand')
    expect(cardTitle(T('Marbles', { qty: 12 }))).toBe('Marbles ×12')
    expect(cardTitle(T('Sandwich', { kind: 'consumable', qty: 2 }))).toBe('Sandwich')
    expect(cardTitle(T('Rope'))).toBe('Rope')
  })
})

describe('the card\'s facts', () => {
  it('gives a plain thing its size, weight and place', () => {
    expect(factsOf(T('Rope'))).toEqual([['Size', 'Normal, 1 slot'], ['Weight', 'Normal'], ['Where', 'Backpack, main pocket']])
  })

  it('says a small thing takes no slot in a bag, but takes the slot it is held in', () => {
    expect(factsOf(T('Key', { size: 0, pocket: null }))[0]).toEqual(['Size', 'Small, takes no slot in a bag'])
    expect(factsOf(T('Key', { size: 0, carrier: 'body', slot: 0 }))[0]).toEqual(['Size', 'Small; held or on the body it takes that slot'])
  })

  it('says a big thing takes both hands, and an 8-slot thing encumbers only on you (Rule E3)', () => {
    expect(factsOf(T('Oar', { size: 2 }))[0]).toEqual(['Size', 'Bulky, 2 slots; takes both hands to hold'])
    expect(factsOf(T('Canoe', { size: 8, carrier: 'hands', slot: 0 }))).toContainEqual(['Encumbering', "Yes. Speed −20 while it's on you."])
    expect(factsOf(T('Canoe', { size: 8, carrier: 'shed' }))).toContainEqual(['Encumbering', 'Only on you.'])
  })

  it('says what a heavy thing\'s recorded Strength roll does on you, and nothing anywhere else (Rules E1 and E2)', () => {
    const weight = (extra: Partial<LubecItem>) => factsOf(T('Anvil', { weight: 'heavy', carrier: 'hands', slot: 0, ...extra }))[1][1]
    expect(weight({})).toBe('Heavy, so it takes both hands to hold. Strength roll not recorded.')
    expect(weight({ check: 'fail' })).toBe('Heavy, so it takes both hands to hold. Strength failed: Speed −20.')
    expect(weight({ check: 'pass' })).toBe('Heavy, so it takes both hands to hold. Strength passed: no penalty.')
    expect(weight({ weight: 'extra', check: 'pass' })).toBe('Extra heavy, so it takes both hands to hold. Strength passed: Speed −20, always.')
    expect(weight({ carrier: 'car', check: 'fail' })).toBe('Heavy, so it takes both hands to hold. No effect while it stays here.')
  })

  it('says how many fit in a stack, and which of its batch it is (Rule S3)', () => {
    const a = T('a', { kind: 'consumable', name: 'Sandwich', qty: 2, per: 2, batch: 'b' })
    const b = T('b', { kind: 'consumable', name: 'Sandwich', qty: 1, per: 2, batch: 'b', pocket: 1 })
    expect(factsOf(b, gearOf(a, b))).toContainEqual(['Stack', '2 fit in one slot. This is 2 of 2 stacks, 3 in all.'])
    expect(factsOf(T('c', { size: 2, per: 3, qty: 3 }))).toContainEqual(['Stack', '3 fit in 2 slots.'])
    expect(factsOf(T('d', { per: 1 })).map(([term]) => term)).not.toContain('Stack')
  })

  it('steps a consumable\'s count, and names the supply a loose one is and what it fits (Rules K4 and L1)', () => {
    const light = T('light', { kind: 'holder', name: 'Flashlight', hold: 'load', takes: 'dcell', capacity: 2, loaded: 2 })
    const cells = T('cells', { kind: 'consumable', name: 'D batteries', qty: 2, per: 4, fits: 'dcell', pocket: 1 })
    expect(factsOf(cells, gearOf(light, cells))).toEqual([
      ['Size', 'Normal, 1 slot'], ['Weight', 'Normal'], ['Stack', '4 fit in one slot.'], ['Left', '2', 'qty'],
      ['Supply', 'D batteries / fits Flashlight'], ['Where', 'Backpack, front pocket, left'],
    ])
    expect(factsOf(T('Gum', { kind: 'consumable', qty: 3 }))).toContainEqual(['Left', '3', 'qty'])
    expect(factsOf(T('Marbles', { qty: 12 }))).toContainEqual(['How many', '12'])
  })

  it('steps a holder\'s contents, and says how much more of its supply is on you (Rule K5)', () => {
    const light = T('light', { kind: 'holder', name: 'Flashlight', hold: 'load', takes: 'dcell', capacity: 2, loaded: 1 })
    const cells = T('cells', { kind: 'consumable', qty: 3, fits: 'dcell', pocket: 1 })
    expect(factsOf(light, gearOf(light, cells)).slice(2, 4)).toEqual([['Loaded', '1 of 2', 'loaded'], ['Holds', 'D batteries / 3 more on you']])
    const canteen = T('canteen', { kind: 'holder', hold: 'fill', takes: 'water', capacity: 4, loaded: 4 })
    expect(factsOf(canteen).slice(2, 4)).toEqual([['In it', '4 of 4', 'loaded'], ['Holds', 'Water']])
    const box = T('box', { kind: 'holder', hold: 'box', takes: 'a38', capacity: 50, loaded: 0 })
    expect(factsOf(box).slice(2, 4)).toEqual([['Inside', '0 of 50', 'loaded'], ['Holds', '.38 rounds']])
    expect(factsOf(T('jar', { kind: 'holder' })).slice(2, 4)).toEqual([['Loaded', '0 of 0', 'loaded'], ['Holds', 'no supply / 0 more on you']])
  })

  it('says what armor stops, where, in how many layers, and what it costs a gloved hand (Rules A1, A2 and E6)', () => {
    const gloves = T('gloves', { kind: 'armor', armor: { cut: 1, pierce: 0, blunt: 1, gun: 0 }, locs: ['hand-L', 'hand-R'] })
    expect(factsOf(gloves).slice(2, 6)).toEqual([
      ['Armor', 'Cutting −1, Piercing 0, Blunt −1, Gunshot 0, off Impact on each part it covers'],
      ['Covers', 'Hands'], ['Layers', 'Ordinary: one layer at each place'], ['Handle', '−10 on each covered hand while worn'],
    ])
    expect(factsOf({ ...gloves, exclusive: true })).toContainEqual(['Handle', '−20 on each covered hand while worn'])
    const suit = T('suit', { kind: 'armor', exclusive: true, locs: ['torso'], carrier: 'worn' })
    expect(factsOf(suit).slice(2)).toEqual([
      ['Armor', 'None (it only takes layers)'], ['Covers', 'Torso'], ['Layers', 'Exclusive: every layer where it covers'], ['Where', 'Worn: torso'],
    ])
    const bare = T('bare', { kind: 'armor' })
    expect(lubecCardFacts(gearOf(bare), bare, LUBEC_SUPPLIES)).toContainEqual({ term: 'Covers', text: '' })
  })
})
