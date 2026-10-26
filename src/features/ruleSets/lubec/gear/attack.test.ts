/**
 * Attack and Fire (spec 5.6 and 12.3): a firearm in hand uses one round, an
 * empty one stops for the empty-weapon prompt, and a melee or thrown weapon
 * uses none. A weapon not in hand cannot attack.
 */
import { describe, expect, it } from 'vitest'
import { lubecSpendRound } from './attack'
import { emptyLubecGear, type LubecGear, type LubecItem } from './gearRecord'

const weapon = (extra: Partial<LubecItem>): LubecItem =>
  ({ id: 'w', kind: 'weapon', name: 'Weapon', note: '', size: 1, weight: 'normal', qty: 1, carrier: 'hands', slot: 0, ...extra })

const gearOf = (...items: LubecItem[]): LubecGear => ({ ...emptyLubecGear(), items })

const revolver = weapon({ id: 'r', name: '.38 revolver', mode: 'firearm', capacity: 6, loaded: 6, takes: 'a38', wounds: ['gun'] })
const bat = weapon({ id: 'b', name: 'Baseball bat', size: 2, mode: 'melee', reach: 'long', wounds: ['blunt'] })
const walkie = weapon({ id: 'k', kind: 'thing', name: 'Walkie-talkie', slot: 1 })

describe('Attack and Fire', () => {
  it('uses one round of a firearm, and touches nothing else', () => {
    const fired = { ...revolver, loaded: 5 }
    expect(lubecSpendRound(gearOf(revolver, walkie), 'r')).toEqual({ ok: true, gear: gearOf(fired, walkie), weapon: fired })
  })

  it('fires the last round', () => {
    const last = { ...revolver, loaded: 1 }
    expect(lubecSpendRound(gearOf(last), 'r')).toMatchObject({ ok: true, weapon: { loaded: 0 } })
  })

  it('stops an empty firearm, for the empty-weapon prompt', () => {
    expect(lubecSpendRound(gearOf({ ...revolver, loaded: 0 }), 'r')).toEqual({ ok: false, why: 'empty' })
    expect(lubecSpendRound(gearOf(weapon({ id: 'r', mode: 'firearm', capacity: 2 })), 'r')).toEqual({ ok: false, why: 'empty' })
  })

  it('uses no round for a melee or thrown weapon', () => {
    const gear = gearOf(bat)
    expect(lubecSpendRound(gear, 'b')).toEqual({ ok: true, gear, weapon: bat })
    const rock = weapon({ id: 't', mode: 'thrown', wounds: ['blunt'] })
    expect(lubecSpendRound(gearOf(rock), 't')).toEqual({ ok: true, gear: gearOf(rock), weapon: rock })
  })

  it('refuses a weapon that is not in hand', () => {
    expect(lubecSpendRound(gearOf({ ...revolver, carrier: 'backpack', pocket: 0 }), 'r')).toEqual({ ok: false, why: 'not-in-hand' })
  })

  it('refuses a weapon that has left the sheet, or a thing that is not a weapon', () => {
    expect(lubecSpendRound(gearOf(revolver), 'gone')).toEqual({ ok: false, why: 'gone' })
    expect(lubecSpendRound(gearOf(walkie), 'k')).toEqual({ ok: false, why: 'gone' })
  })
})
