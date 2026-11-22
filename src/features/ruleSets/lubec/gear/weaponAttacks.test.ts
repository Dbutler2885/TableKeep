import { describe, expect, it } from 'vitest'
import { parseLubecItem } from './gearRecord'
import { LUBEC_ATTACK_TYPES, lubecWeaponAttacks } from './weaponAttacks'

const weapon = (extra = {}) => parseLubecItem({ kind: 'weapon', ...extra }, 'w')

describe('data-driven weapon attacks', () => {
  it('offers the prototype Punch and Kick metadata for Fisticuffs', () => {
    expect(lubecWeaponAttacks(null)).toEqual([
      { id: 'punch', name: 'Punch', start: 'punch', wound: 'fisticuffs', armor: 'blunt', str: true, skill: 'fighting', melee: true, impact: 0 },
      { id: 'kick', name: 'Kick', start: 'kick', groundedStart: 'kickDown', wound: 'fisticuffs', armor: 'blunt', str: true, skill: 'fighting', melee: true, feet: true, impact: 0 },
    ])
    expect(LUBEC_ATTACK_TYPES.throwEdge).toMatchObject({ start: 'thrown', wound: 'cutting', armor: 'cut', str: true, skill: 'throwing' })
  })

  it('offers only the checked melee uses, preserving the grounded blunt start', () => {
    const choices = lubecWeaponAttacks(weapon({ wounds: ['cut', 'pierce', 'blunt', 'gun'], impact: 2 }))
    expect(choices).toEqual([
      { id: 'slash', ...LUBEC_ATTACK_TYPES.slash, impact: 2 }, { id: 'stab', ...LUBEC_ATTACK_TYPES.stab, impact: 2 },
      { id: 'swing', ...LUBEC_ATTACK_TYPES.swing, impact: 2 }, { id: 'shoot', ...LUBEC_ATTACK_TYPES.shoot, impact: 2 },
    ])
    expect(lubecWeaponAttacks(weapon()).map((choice) => choice.id)).toEqual(['swing'])
    expect(lubecWeaponAttacks(parseLubecItem({}, 'thing'))).toEqual([])
  })

  it.each([
    ['blunt', 'thrown'], ['cut', 'cutting'], ['pierce', 'piercing'], ['gun', 'gunshot'],
  ])('adds one fixed %s Throw with separate negative Impact and the correct wound table', (wound, table) => {
    const choices = lubecWeaponAttacks(weapon({ mode: 'melee', wounds: ['cut', 'pierce'], impact: 3, canThrow: true, thrownImpact: -1, thrownWound: wound }))
    expect(choices.map((choice) => choice.name)).toEqual(['Slash', 'Stab', 'Throw'])
    expect(choices.at(-1)).toEqual({ ...LUBEC_ATTACK_TYPES.throw, id: 'throw', impact: -1, armor: wound, wound: table })
  })

  it('uses ordinary thrown damage, a table override, and default damage when optional fields are absent', () => {
    expect(lubecWeaponAttacks(weapon({ mode: 'thrown', impact: -2, wounds: ['blunt'], table: 'dodgeball' }))).toEqual([{ ...LUBEC_ATTACK_TYPES.throw, id: 'throw', impact: -2, wound: 'dodgeball' }])
    expect(lubecWeaponAttacks(weapon({ mode: 'thrown' }))[0]).toMatchObject({ impact: 0, armor: 'blunt', wound: 'thrown' })
    expect(lubecWeaponAttacks(weapon({ mode: 'melee', canThrow: true })).at(-1)).toMatchObject({ impact: 0, armor: 'blunt', wound: 'thrown' })
  })

  it('shoots without Strength or Handle Defense, respecting the firearm table override', () => {
    expect(lubecWeaponAttacks(weapon({ mode: 'firearm' }))).toEqual([{ ...LUBEC_ATTACK_TYPES.shoot, id: 'shoot', impact: 0 }])
    expect(lubecWeaponAttacks(weapon({ mode: 'firearm', impact: 3, table: 'custom' }))[0]).toMatchObject({ wound: 'custom', impact: 3 })
  })
})
