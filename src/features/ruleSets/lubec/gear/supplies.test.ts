/** Supplies (Rules L1 and L2): the game's list, a player's own, and what is on you of one. */
import { describe, expect, it } from 'vitest'
import { emptyLubecGear, type LubecItem } from './gearRecord'
import { LUBEC_SUPPLIES, lubecAmmoOnYou, lubecAmountIn, lubecLooseOf, lubecSupplies, lubecSupplyIn } from './supplies'

const item = (id: string, extra: Partial<LubecItem>): LubecItem =>
  ({ id, kind: 'thing', name: id, note: '', size: 1, weight: 'normal', qty: 1, carrier: 'backpack', pocket: 0, ...extra })

describe('supplies', () => {
  it('lists the game\'s supplies, then any a player made', () => {
    expect(LUBEC_SUPPLIES.map((s) => s.name)).toEqual(['.22 rounds', '.38 rounds', '12-gauge shells', '.30-06 rounds', 'Arrows', 'Slingshot shot', 'BBs', 'D batteries', 'Water', 'Lamp oil'])
    const made = { id: 's1', name: 'Film' }
    expect(lubecSupplies({ supplies: [made] }).at(-1)).toEqual(made)
    expect(lubecSupplies(emptyLubecGear())).toHaveLength(10)
  })

  it('reads a supply\'s loose shape: its own, null when it can\'t be loose, and one to a slot for one the list doesn\'t know', () => {
    expect(lubecLooseOf(LUBEC_SUPPLIES, 'dcell')).toEqual([1, 4])
    expect(lubecLooseOf(LUBEC_SUPPLIES, 'water')).toBeNull()
    expect(lubecLooseOf(LUBEC_SUPPLIES, 'a38')).toEqual([0, 1])
    expect(lubecLooseOf(LUBEC_SUPPLIES, 'nope')).toEqual([0, 1])
  })

  it('reads a loose stack and a box the same way, and anything else as no supply', () => {
    expect([lubecSupplyIn(item('a', { kind: 'consumable', fits: 'dcell' })), lubecAmountIn(item('a', { kind: 'consumable', qty: 3 }))]).toEqual(['dcell', 3])
    expect([lubecSupplyIn(item('b', { kind: 'holder', hold: 'box', takes: 'a38' })), lubecAmountIn(item('b', { kind: 'holder', loaded: 12 }))]).toEqual(['a38', 12])
    expect([lubecSupplyIn(item('c', { kind: 'holder', hold: 'load', takes: 'dcell' })), lubecAmountIn(item('c', { kind: 'holder' }))]).toEqual([undefined, 0])
  })

  it('counts a supply on you, loose or boxed, but not in a carrier and not what is already in the thing', () => {
    const light = item('light', { kind: 'holder', hold: 'load', takes: 'dcell', capacity: 2, loaded: 2 })
    const gear = { ...emptyLubecGear(), items: [
      light,
      item('loose', { kind: 'consumable', fits: 'dcell', qty: 3 }),
      item('held', { kind: 'consumable', fits: 'dcell', qty: 1, carrier: 'hands', slot: 0 }),
      item('stored', { kind: 'consumable', fits: 'dcell', qty: 8, carrier: 'duffel' }),
      item('rounds', { kind: 'holder', hold: 'box', takes: 'a38', loaded: 50 }),
    ] }
    expect(lubecAmmoOnYou(gear, light)).toBe(4)
  })
})
