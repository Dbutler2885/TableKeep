/**
 * Gloves (Rule E6, spec 5.4 and 12.3): slot 0 is `hand-L` and slot 1
 * `hand-R`, 10 Handle a layer, exclusive armor counts every layer, and two
 * hands take the worse, not the sum. Then the attack's Handle as terms.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecGear, type LubecItem } from './gearRecord'
import { LUBEC_HAND_LOCS, lubecAttackHandle, lubecHandPenalty } from './handPenalty'

const armor = (id: string, name: string, locs: string[], extra: Partial<LubecItem> = {}) =>
  ({ id, kind: 'armor', carrier: 'worn', name, size: 1, qty: 1, weight: 'normal', note: '', locs, ...extra })

const gloves = armor('g', 'Leather work gloves', ['hand-L', 'hand-R'])
const mittens = armor('m', 'Mittens', ['hand-L', 'hand-R'])
const leftMitt = armor('l', 'Oven mitt', ['hand-L'])
const gauntlet = armor('x', 'Welding gauntlet', ['hand-R'], { exclusive: true })
const gearOf = (...items: Record<string, unknown>[]) => parseLubecGear({ items })

describe('the glove penalty', () => {
  it('ties hand slot 0 to the left hand and slot 1 to the right on the body map', () => {
    expect(LUBEC_HAND_LOCS).toEqual(['hand-L', 'hand-R'])
    const gear = gearOf(leftMitt)
    expect([lubecHandPenalty(gear, 'left'), lubecHandPenalty(gear, 'right')]).toEqual([10, 0])
  })

  it('takes 10 a layer', () => {
    expect(lubecHandPenalty(gearOf(), 'left')).toBe(0)
    expect(lubecHandPenalty(gearOf(gloves), 'left')).toBe(10)
    expect(lubecHandPenalty(gearOf(gloves, mittens), 'right')).toBe(20)
  })

  it('counts every layer of the hand for exclusive armor', () => {
    expect(lubecHandPenalty(gearOf(gauntlet), 'right')).toBe(20)
  })

  it('takes the worse hand for both hands, not the sum', () => {
    expect(lubecHandPenalty(gearOf(leftMitt), 'both')).toBe(10)
    expect(lubecHandPenalty(gearOf(leftMitt, gauntlet), 'both')).toBe(20)
    expect(lubecHandPenalty(gearOf(gloves), 'both')).toBe(10)
  })

  it('counts no armor kept off the hands', () => {
    expect(lubecHandPenalty(gearOf({ ...gloves, carrier: 'backpack', pocket: 0 }), 'left')).toBe(0)
  })
})

describe("the attack's Handle", () => {
  const wielder = { strength: 45, handle: 55 }
  const bat = { minStrength: 60 }

  it('is Effective Handle alone when nothing takes any off', () => {
    expect(lubecAttackHandle(wielder, gearOf(), { weapon: {}, hands: 'left' })).toEqual({
      terms: [{ term: 'handle', value: 55 }], total: 55, cannotHandle: false,
    })
    expect(lubecAttackHandle(wielder, gearOf(), { weapon: null, hands: 'both' }).terms).toEqual([{ term: 'handle', value: 55 }])
  })

  it('takes off the minimum Strength penalty and the gloves, in that order', () => {
    expect(lubecAttackHandle(wielder, gearOf(gloves), { weapon: bat, hands: 'both' })).toEqual({
      terms: [{ term: 'handle', value: 55 }, { term: 'min-strength', value: 20 }, { term: 'gloves', value: 10 }], total: 25, cannotHandle: false,
    })
  })

  it("follows the table's number for the weapon", () => {
    expect(lubecAttackHandle(wielder, gearOf(), { weapon: { ...bat, handlePenaltyOverride: 0 }, hands: 'left' }).terms).toEqual([{ term: 'handle', value: 55 }])
  })

  it('cannot be handled at 0 or less', () => {
    const r = lubecAttackHandle({ strength: 4, handle: 30 }, gearOf(gauntlet), { weapon: bat, hands: 'right' })
    expect([r.total, r.cannotHandle]).toEqual([-50, true])
  })

  it('comes to nothing while a term is a hole, and says nothing of handling it', () => {
    const noStrength = lubecAttackHandle({ strength: null, handle: 55 }, gearOf(), { weapon: bat, hands: 'left' })
    expect(noStrength).toEqual({ terms: [{ term: 'handle', value: 55 }, { term: 'min-strength', value: null }], total: null, cannotHandle: false })
    expect(lubecAttackHandle({ strength: 45, handle: null }, gearOf(gloves), { weapon: null, hands: 'left' }).total).toBeNull()
  })
})
