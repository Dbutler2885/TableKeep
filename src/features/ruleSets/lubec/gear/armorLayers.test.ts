/**
 * Armor layers (Rules A1 and A3), against the prototype's checks: the
 * snowmobile suit on the torso, and mittens over the leather work gloves.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecGear, type LubecItem } from './gearRecord'
import { layerProblem, layersUsed, lubecFullParts, wornOn } from './armorLayers'
import { LOC_KEYS, RULES } from './gearRules'

const armor = (id: string, name: string, locs: string[], extra: Partial<LubecItem> = {}) =>
  ({ id, kind: 'armor', carrier: 'worn', name, size: 1, qty: 1, weight: 'normal', note: '', locs, ...extra })

const gloves = armor('i12', 'Leather work gloves', ['hand-L', 'hand-R'])
const mittens = armor('i40', 'Mittens', ['hand-L', 'hand-R'])
const suit = armor('i20', 'Snowmobile suit', ['torso', 'waist'], { exclusive: true, size: 4 })
const sweater = armor('i41', 'Wool sweater', ['torso'])
const helmet = armor('i13', 'Hockey helmet', ['head'], { size: 2 })

describe('armor layers (Rules A1 and A3)', () => {
  it('lists the worn pieces on a part, and never one kept elsewhere', () => {
    const gear = parseLubecGear({ items: [gloves, { ...mittens, carrier: 'backpack', pocket: 0 }] })
    expect(wornOn(gear, 'hand-L').map((i) => i.name)).toEqual(['Leather work gloves'])
    expect(wornOn(gear, 'hand-L', 'i12')).toEqual([])
    expect(wornOn(parseLubecGear({ items: [{ ...gloves, locs: undefined }] }), 'hand-L')).toEqual([])
  })

  it('counts one layer for ordinary armor and every layer for exclusive armor', () => {
    const gear = parseLubecGear({ items: [gloves, suit] })
    expect(layersUsed(gear, 'hand-L')).toBe(1)
    expect(layersUsed(gear, 'torso')).toBe(3)
    expect(layersUsed(gear, 'waist')).toBe(2)
    expect(layersUsed(parseLubecGear({ items: [suit, sweater] }), 'torso')).toBe(3)
  })

  it('lets armor on while every part it covers has a free layer', () => {
    const gear = parseLubecGear({ items: [gloves] })
    expect(layerProblem(gear, mittens)).toBeNull()
    expect(layerProblem(gear, { name: 'Nothing much' })).toBeNull()
  })

  it('refuses ordinary armor with no free layer', () => {
    const gear = parseLubecGear({ items: [gloves, mittens] })
    expect(layerProblem(gear, armor('i42', 'Oven mitt', ['hand-L']))).toBe('No free layer on the left hand: 2 of 2 taken by Leather work gloves, Mittens. Take something off first.')
    expect(layerProblem(parseLubecGear({ items: [suit] }), sweater)).toBe('No free layer on the torso: 3 of 3 taken by Snowmobile suit. Take something off first.')
  })

  it('refuses exclusive armor unless the part is bare', () => {
    const gear = parseLubecGear({ items: [sweater] })
    expect(layerProblem(gear, suit)).toBe('Snowmobile suit is exclusive and needs the torso bare, but Wool sweater is there. Take it off first.')
  })

  it('sets the piece being moved aside', () => {
    const gear = parseLubecGear({ items: [gloves, mittens] })
    expect(layerProblem(gear, mittens, 'i40')).toBeNull()
  })

  it('holds each location to its layer limit', () => {
    expect(RULES.layers).toEqual({ head: 2, neck: 2, torso: 3, upperarm: 3, forearm: 2, hand: 2, waist: 2, groin: 2, thigh: 3, shin: 2, feet: 2 })
    expect(LOC_KEYS).toHaveLength(17)
    const piled = parseLubecGear({ items: [helmet, { ...helmet, id: 'i14' }, { ...helmet, id: 'i15' }] })
    expect(layersUsed(piled, 'head')).toBe(2)
    expect(layersUsed(parseLubecGear({ items: [sweater, { ...sweater, id: 'i42' }] }), 'torso')).toBe(2)
  })

  it('refuses a third helmet with no free layer on the head', () => {
    const gear = parseLubecGear({ items: [helmet, { ...helmet, id: 'i14' }] })
    expect(layerProblem(gear, { ...helmet, id: 'i15' })).toBe('No free layer on the head: 2 of 2 taken by Hockey helmet, Hockey helmet. Take something off first.')
  })

  it('counts paired parts one side at a time', () => {
    const left = armor('i43', 'Oven mitt', ['hand-L'])
    const gear = parseLubecGear({ items: [left, { ...left, id: 'i44' }] })
    expect(layersUsed(gear, 'hand-L')).toBe(2)
    expect(layersUsed(gear, 'hand-R')).toBe(0)
    expect(layerProblem(gear, armor('i45', 'Mitten', ['hand-R']))).toBeNull()
    expect(layerProblem(gear, gloves)).toBe('No free layer on the left hand: 2 of 2 taken by Oven mitt, Oven mitt. Take something off first.')
  })

  it('names the parts already full, in body order, less the piece being edited', () => {
    const gear = parseLubecGear({ items: [suit, gloves, mittens] })
    expect(lubecFullParts(gear, ['hand-R', 'head', 'torso', 'hand-L'])).toEqual(['torso', 'hand-L', 'hand-R'])
    expect(lubecFullParts(gear, ['hand-L', 'hand-R'], 'i40')).toEqual([])
    expect(lubecFullParts(gear, [])).toEqual([])
  })
})
