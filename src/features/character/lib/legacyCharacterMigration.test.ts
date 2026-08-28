import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterSheetDetails } from '../../../types/app'
import { migrateToInventory } from './legacyCharacterMigration'

const baseDetails = (): CharacterSheetDetails => ({
  abilityScores: {}, rolledAbilityScores: null, abilityScoresRolled: false, hpBaseRoll: null,
  inventory: [], thaco: '', saveScores: null, adventureScores: null, adventureSeedClass: '',
  thiefSkills: null, startingGold: null, storeSpent: 0, storeCart: [], alignment: '', title: '',
})

describe('legacy character migration', () => {
  beforeEach(() => {
    let id = 0
    vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`)
  })
  afterEach(() => vi.restoreAllMocks())

  it('migrates weapons and armour, including custom fallbacks and shield derivation', () => {
    const details = baseDetails()
    details.weapons = [
      { id: 'w1', name: 'Sword', weaponId: 'sword', isMagic: false, damageDiceCount: '1', damageDiceSides: '8', bonus: '', rangeShort: '', rangeMedium: '', rangeLong: '', twoHanded: false, equipped: true, notes: '' },
      { id: '', name: 'Odd blade', weaponId: '', isMagic: true, damageDiceCount: '', damageDiceSides: '', bonus: '+1', rangeShort: '', rangeMedium: '', rangeLong: '', twoHanded: false, equipped: false, notes: '' },
    ]
    details.armour = [
      { id: 'a1', name: 'Shield', armourId: 'shield', isMagic: false, ac: '', bonus: '', equipped: true, notes: '' },
      { id: 'a2', name: 'Plate', armourId: 'plate-mail', isMagic: true, ac: '3', bonus: '+1', equipped: true, notes: '' },
    ]
    const items = migrateToInventory(details)
    expect(items.find((item) => item.id === 'w1')?.typeId).toBe('sword')
    expect(items.find((item) => item.name === 'Odd blade')?.typeId).toBe('custom')
    expect(items.find((item) => item.id === 'a1')).toMatchObject({ kind: 'armour', shieldMod: '-1' })
    expect(items.find((item) => item.id === 'a2')).toMatchObject({ kind: 'armour', armourClass: '3', magicMod: '+1' })
  })

  it('preserves current gold and string migration edge cases', () => {
    const details = baseDetails()
    details.packedItems = ['Gold: 17 gp', 'Rope', 'not gold', '', '   ']
    details.storeGoldSlotIndices = [2]
    details.equippedItems = ['Gold: 2 gp', 'Sword belt', '', '  ']
    const items = migrateToInventory(details)
    expect(items.some((item) => item.kind === 'gold' && item.qty === 17)).toBe(true)
    expect(items.some((item) => item.typeName === 'Rope' && !item.equipped)).toBe(true)
    expect(items.some((item) => item.typeName === 'Sword belt' && item.equipped)).toBe(true)
    expect(items.some((item) => item.typeName === 'not gold')).toBe(false)
    expect(items).toHaveLength(3)
  })

  it('accepts entirely absent legacy arrays', () => {
    expect(migrateToInventory(baseDetails())).toEqual([])
  })
})
