/** Personal carriers: B's presets, the add-carrier dialog's submit rules, and carrying one by special dispensation (Rule C3). */
import { describe, expect, it } from 'vitest'
import { lubecAddCarrier, lubecCarried, lubecCarrierProblem, lubecCarrierTypeLabel, lubecCarry, LUBEC_CARRIER_TYPES, LUBEC_LIST_MODE_OVER } from './carriers'
import { emptyLubecGear, type LubecGear } from './gearRecord'
import { lubecGearModifiers } from '../modifiers'
import { place } from './placement'

const pocket = (name: string, slots: number, max: number) => ({ name, slots, max })

describe('the carrier presets', () => {
  it('are B\'s eleven, in its order, ending with "Something else"', () => {
    expect(LUBEC_CARRIER_TYPES.map((t) => t.label)).toEqual([
      'School bag', 'Duffel bag', 'Strap or sling', 'Bike basket', 'School locker', 'Bedroom chest',
      'Hidden stash box', 'Family car', 'Boat or skiff', 'Shed or garage', 'Something else',
    ])
    expect(LUBEC_CARRIER_TYPES.find((t) => t.id === 'car')?.pockets).toEqual([['Trunk and back seat', 200, 8], ['Glove box', 2, 1]])
    expect(LUBEC_LIST_MODE_OVER).toBe(24)
  })

  it('name a carrier\'s preset, or show an unknown one as it is stored', () => {
    expect([lubecCarrierTypeLabel('strap'), lubecCarrierTypeLabel('wagon')]).toEqual(['Strap or sling', 'wagon'])
  })
})

describe('adding a carrier', () => {
  it('refuses a carrier with B\'s words, in B\'s order', () => {
    expect(lubecCarrierProblem({ type: 'other', name: '  ', pockets: [pocket('Main', 0, 1)] })).toBe('Give it a name.')
    expect(lubecCarrierProblem({ type: 'other', name: 'Crate', pockets: [pocket('Main', Number.NaN, 1)] })).toBe('Every pocket needs at least one slot.')
    expect(lubecCarrierProblem({ type: 'other', name: 'Crate', pockets: [pocket('Main', 2, 4)] })).toBe("A pocket's largest thing can't be bigger than the pocket.")
    expect(lubecCarrierProblem({ type: 'other', name: 'Crate', pockets: [pocket('Main', 4, 4)] })).toBeNull()
  })

  it('adds it to the personal carriers with a trimmed name, and refuses without changing the gear', () => {
    const gear = emptyLubecGear()
    const added = lubecAddCarrier(gear, { type: 'duffel', name: ' Duffel bag ', pockets: [pocket('Main', 8, 8)] }, 'c1')
    expect(added).toEqual({ ok: true, carrier: { id: 'c1', name: 'Duffel bag', type: 'duffel', pockets: [pocket('Main', 8, 8)] }, gear: { ...gear, carriers: [{ id: 'c1', name: 'Duffel bag', type: 'duffel', pockets: [pocket('Main', 8, 8)] }] } })
    expect(lubecAddCarrier(gear, { type: 'other', name: '', pockets: [pocket('Main', 6, 4)] }, 'c2')).toEqual({ ok: false, msg: 'Give it a name.' })
  })
})

describe('Rule C3: carrying a carrier', () => {
  const duffel = { id: 'duffel', name: 'Duffel bag', type: 'duffel', pockets: [pocket('Main', 8, 8)] }
  const gear: LubecGear = {
    ...emptyLubecGear(),
    carriers: [duffel, { ...duffel, id: 'chest', name: 'Bedroom chest' }],
    items: [
      { id: 'anvil', kind: 'thing', name: 'Small anvil', note: '', size: 1, weight: 'heavy', qty: 1, carrier: 'chest', pocket: 0, check: 'fail' },
      { id: 'canoe', kind: 'thing', name: 'Canoe', note: '', size: 8, weight: 'extra', qty: 1, carrier: 'duffel', pocket: 0, check: 'pass' },
    ],
  }

  it('carries one and puts it down, leaving the others alone', () => {
    const carried = lubecCarry(gear, 'duffel', true)
    expect(lubecCarried(carried).map((c) => c.id)).toEqual(['duffel'])
    expect(carried.carriers[1]).toBe(gear.carriers[1])
    expect(lubecCarried(lubecCarry(carried, 'duffel', false))).toEqual([])
  })

  it('never lets what is in a carrier slow you, carried or not', () => {
    expect(lubecGearModifiers(gear)).toEqual([])
    expect(lubecGearModifiers(lubecCarry(gear, 'duffel', true))).toEqual([])
  })

  it('holds things by the pocket rules', () => {
    expect(place(gear, 'duffel#0', { kind: 'thing', name: 'Rope', note: '', size: 1, weight: 'normal', qty: 1 })).toEqual({ ok: false, msg: 'Main is full: 0 of 8 free, and this needs 1.' })
    expect(place(gear, 'chest', { kind: 'thing', name: 'Rope', note: '', size: 4, weight: 'normal', qty: 1 })).toEqual({ ok: true, carrier: 'chest', pocket: 0 })
  })
})
