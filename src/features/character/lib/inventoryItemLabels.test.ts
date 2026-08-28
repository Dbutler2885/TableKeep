import { describe, expect, it } from 'vitest'
import { makeArmourItem, makeWeaponItem } from '../characterFactories'
import { armourStatsLabel, formatWeaponEffectConditionLabel, formatWeaponEffectLine, weaponCoreStatsLabel, weaponStatsLabel } from './inventoryItemLabels'

describe('inventory item labels', () => {
  it.each([
    [{ damageDiceCount: '1', damageDiceSides: '8' }, '1d8 Mel'],
    [{ rangeShort: '5', rangeMedium: '10', rangeLong: '15' }, '5/10/15'],
    [{ damageDiceCount: '1', damageDiceSides: '6', rangeShort: '10', rangeMedium: '20', rangeLong: '30' }, '1d6 10/20/30'],
    [{}, ''],
  ])('formats weapon core stats', (overrides, expected) => {
    expect(weaponCoreStatsLabel(makeWeaponItem(overrides))).toBe(expected)
  })

  it('normalizes bonuses and weapon flags', () => {
    expect(weaponStatsLabel(makeWeaponItem({ attackBonus: '+2', slow: true, twoHanded: true }))).toBe(' | +2 | Slow | 2H')
  })

  it('formats shield and body armour independently', () => {
    expect(armourStatsLabel(makeArmourItem({ armourType: 'shield', shieldMod: '-1', magicMod: '+1' }))).toBe('AC -1 | Magic +1')
    expect(armourStatsLabel(makeArmourItem({ armourType: 'body', armourClass: '5' }))).toBe('AC 5')
  })

  it('formats every effect condition family and trigger', () => {
    const base = { id: 'e', trigger: 'on_hit' as const, outcomeType: 'damage_bonus' as const, outcomeValue: '+2', notes: '' }
    expect(formatWeaponEffectConditionLabel({ ...base, conditionType: 'none', conditionValues: [] })).toBe('')
    expect(formatWeaponEffectConditionLabel({ ...base, conditionType: 'alignment', conditionValues: ['chaos'] })).toBe('vs Chaos')
    expect(formatWeaponEffectConditionLabel({ ...base, conditionType: 'armour_state', conditionValues: ['natural_armour'] })).toBe('vs Natural Armour')
    expect(formatWeaponEffectConditionLabel({ ...base, conditionType: 'creature_type', conditionValues: ['green-dragon'] })).toBe('vs Green Dragon')
    expect(formatWeaponEffectConditionLabel({ ...base, conditionType: 'custom', conditionValues: ['in_water'] })).toBe('In Water')
    expect(formatWeaponEffectLine(makeWeaponItem(), { ...base, conditionType: 'none', conditionValues: [] })).toBe('On hit: +2 to damage')
  })
})
