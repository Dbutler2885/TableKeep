/** A weapon's lines on the card and its attack buttons, in the prototype's words, with the minimum Strength lines of spec 5.4. */
import { describe, expect, it } from 'vitest'
import { emptyLubecGear, type LubecGear, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { LUBEC_SUPPLIES } from '../../ruleSets/lubec/gear/supplies'
import { lubecCardFacts } from './cardFacts'
import { attackRefusalText, attackToast, impactText, lubecAttackButtons } from './weaponFacts'

const W = (extra: Partial<LubecItem> = {}): LubecItem =>
  ({ id: 'w', kind: 'weapon', name: 'Weapon', note: '', size: 1, weight: 'normal', qty: 1, carrier: 'hands', slot: 0, mode: 'melee', impact: 0, wounds: ['blunt'], ...extra })

const gearOf = (...items: LubecItem[]): LubecGear => ({ ...emptyLubecGear(), items })

const wayne = { strength: 45, handle: 55 }

const factsOf = (item: LubecItem, wielder = wayne, gear = gearOf(item)) =>
  lubecCardFacts(gear, item, LUBEC_SUPPLIES, wielder).map(({ term, ...rest }) => ({ term, ...rest }))

const factOf = (item: LubecItem, term: string, wielder = wayne) => factsOf(item, wielder).find((f) => f.term === term)

const bat = W({ name: 'Baseball bat', size: 2, impact: 1, table: 'blunt', reach: 'long' })
const revolver = W({ name: "Grandpa's revolver", mode: 'firearm', impact: 1, table: 'gunshot', wounds: ['gun'], capacity: 6, loaded: 6, takes: 'a38' })
const sledgehammer = W({ name: 'Sledgehammer', size: 2, impact: 2, table: 'blunt', reach: 'long', minStrength: 60 })

describe('a weapon\'s lines', () => {
  it('reads a melee weapon in B\'s order, with the Strength roll in its Impact and no number for it', () => {
    expect(factsOf(bat).map((f) => [f.term, f.text])).toEqual([
      ['Size', 'Bulky, 2 slots; takes both hands to hold'],
      ['Weight', 'Normal'],
      ['Type', "Melee, long: can't be used on the ground"],
      ['Impact', 'Quality + 1 base + Strength roll'],
      ['Wounds', 'Blunt. Armor counts that number.'],
      ['Table', 'Blunt Force'],
      ['Where', 'Both hands'],
    ])
  })

  it('reads a firearm with no Strength, its rounds stepped by hand and its supply on you', () => {
    const box = W({ id: 'b', kind: 'holder', name: 'Box of .38 rounds', hold: 'box', takes: 'a38', capacity: 50, loaded: 12, carrier: 'backpack', pocket: 1, slot: undefined })
    const facts = factsOf(revolver, wayne, gearOf(revolver, box))
    expect(facts.find((f) => f.term === 'Type')?.text).toBe('Firearm. Handle Defense does not reduce it.')
    expect(facts.find((f) => f.term === 'Impact')?.text).toBe('Quality + 1 base')
    expect(facts.find((f) => f.term === 'Loaded')).toEqual({ term: 'Loaded', text: '6 of 6', step: 'loaded' })
    expect(facts.find((f) => f.term === 'Takes')?.text).toBe('.38 rounds / 12 more on you')
  })

  it('reads a short melee weapon, a thrown one and a negative base', () => {
    expect(factOf(W({ reach: 'short' }), 'Type')?.text).toBe('Melee, short: works in a ground grapple')
    expect(factOf(W({ mode: 'thrown' }), 'Type')?.text).toBe('Thrown. Strength adds, as in melee.')
    expect(impactText(W({ mode: 'thrown', impact: -1 }))).toBe('Quality − 1 base + Strength roll')
  })

  it('names every way it wounds, and a weapon with none stored wounds as its mode does', () => {
    expect(factOf(W({ wounds: ['cut', 'pierce'] }), 'Wounds')?.text).toBe("Cutting or Piercing, by how it's used. Armor counts that number.")
    expect(factOf(W({ mode: 'firearm', wounds: [] }), 'Wounds')?.text).toBe('Gunshot. Armor counts that number.')
  })

  it('says a knife has no table yet, and leaves the table out where none is stored', () => {
    expect(factOf(W({ table: 'none' }), 'Table')?.text).toBe('No table yet (there is no cutting table)')
    expect(factOf(W({ table: 'odd' }), 'Table')?.text).toBe('odd')
    expect(factOf(W(), 'Table')).toBeUndefined()
  })
})

describe('the minimum Strength lines', () => {
  it('show only for a weapon with a minimum, or one the table has given a number', () => {
    expect(factOf(bat, 'Penalty')).toBeUndefined()
    expect(factOf({ ...bat, handlePenaltyOverride: 10 }, 'Penalty')?.text).toBe('Handle −10, the table says. Worked out: none.')
    expect(factOf({ ...bat, handlePenaltyOverride: 10 }, 'Strength')).toBeUndefined()
  })

  it('give the penalty and the weapon\'s Handle, with the empty "Table says" box', () => {
    expect(factOf(sledgehammer, 'Strength')).toEqual({ term: 'Strength', text: 'Needs 60. Yours is 45.' })
    expect(factOf(sledgehammer, 'Penalty')).toEqual({ term: 'Penalty', text: 'Handle −20.', tableSays: null })
    expect(factOf(sledgehammer, 'Handle')).toEqual({ term: 'Handle', text: '35 with it (55 − 20).' })
  })

  it('say there is no penalty when Strength is enough', () => {
    expect(factOf(sledgehammer, 'Penalty', { strength: 62, handle: 55 })?.text).toBe('None.')
    expect(factOf(sledgehammer, 'Handle', { strength: 62, handle: 55 })?.text).toBe('55.')
  })

  it("say so when the table's number replaces the worked-out one", () => {
    const told = { ...sledgehammer, handlePenaltyOverride: 10 }
    expect(factOf(told, 'Penalty')).toEqual({ term: 'Penalty', text: 'Handle −10, the table says. Worked out: −20.', tableSays: 10 })
    expect(factOf(told, 'Handle')?.text).toBe('45 with it (55 − 10).')
  })

  it('say "Cannot handle this" in the failure tone once the Handle reaches 0', () => {
    expect(factOf(sledgehammer, 'Handle', { strength: 24, handle: 40 })).toEqual({ term: 'Handle', text: 'Cannot handle this: 40 − 40 = 0.', tone: 'failure' })
    expect(factOf(W({ minStrength: 80 }), 'Handle', { strength: 24, handle: 50 })?.text).toBe('Cannot handle this: 50 − 60 = −10.')
  })

  it('give no number while Strength is a hole, and show the missing mark', () => {
    const hole = { strength: null, handle: 55 }
    expect(factOf(sledgehammer, 'Strength', hole)).toEqual({ term: 'Strength', text: 'Needs 60. Yours is', missing: true })
    expect(factOf(sledgehammer, 'Penalty', hole)).toEqual({ term: 'Penalty', text: '', missing: true, tableSays: null })
    expect(factOf(sledgehammer, 'Handle', hole)).toEqual({ term: 'Handle', text: '', missing: true })
  })

  it("take the table's number even while Strength is a hole", () => {
    const told = { ...sledgehammer, handlePenaltyOverride: 10 }
    expect(factOf(told, 'Penalty', { strength: null, handle: 55 })?.text).toBe('Handle −10, the table says.')
    expect(factOf(told, 'Handle', { strength: null, handle: 55 })?.text).toBe('45 with it (55 − 10).')
  })
})

describe('the attack buttons', () => {
  it('fire a firearm, attack with melee and throw a thrown weapon, in hand', () => {
    expect(lubecAttackButtons(revolver)).toEqual([{ label: 'Fire', disabled: false }])
    expect(lubecAttackButtons(bat)).toEqual([{ label: 'Attack', disabled: false }])
    expect(lubecAttackButtons(W({ mode: 'thrown' }))).toEqual([{ label: 'Throw', disabled: false }])
  })

  it('give one button for each way a weapon wounds', () => {
    expect(lubecAttackButtons(W({ wounds: ['cut', 'pierce'] })).map((b) => b.label)).toEqual(['Slash', 'Stab'])
    expect(lubecAttackButtons(W({ wounds: ['blunt', 'gun'] })).map((b) => b.label)).toEqual(['Hit', 'Fire'])
  })

  it('ask for it to be taken in hand first, and give a thing that is no weapon none', () => {
    expect(lubecAttackButtons({ ...bat, carrier: 'backpack', pocket: 0 })).toEqual([{ label: 'Attack: take it in hand first', disabled: true }])
    expect(lubecAttackButtons(W({ kind: 'thing' }))).toEqual([])
  })

  it('say to roll it at the table, a firearm with the rounds it has left', () => {
    expect(attackToast({ ...revolver, loaded: 5 })).toBe('Fired. 5 of 6 left. Roll it at the table.')
    expect(attackToast(bat)).toBe('Roll it at the table.')
  })

  it('say why an attack stopped', () => {
    expect(attackRefusalText(revolver, 'empty')).toBe("Grandpa's revolver isn't loaded.")
    expect(attackRefusalText(bat, 'not-in-hand')).toBe('Take the baseball bat in hand first.')
  })
})
