import { describe, expect, it } from 'vitest'
import { oseLegacyShapes } from './legacyShapes'
import demoCleric from './fixtures/demo-cleric.json'
import demoFighter from './fixtures/demo-fighter.json'
import demoMagicUser from './fixtures/demo-magic-user.json'
import demoThief from './fixtures/demo-thief.json'
import legacy from './fixtures/legacy.json'

describe('the old shapes of a stored OSE character', () => {
  it.each([
    ['old-lists', ['oldListsWithoutInventory', 'rowsWithoutIds']],
    ['text-rows', ['oldListsWithoutInventory']],
    ['legacy-gold', ['oldListsWithoutInventory', 'legacyGold']],
    ['no-inventory', []],
    ['empty-non-arcane-inventory', ['oldListsBesideInventory', 'emptyInventory']],
    ['empty-arcane-inventory', ['oldListsBesideInventory', 'emptyInventory', 'casterWithoutSpellBook']],
    ['old-lists-beside-inventory', ['oldListsBesideInventory', 'legacyGold']],
    ['rows-without-ids', ['rowsWithoutIds']],
    ['manual-ac-flag', ['manualAcFlag']],
    ['caster-without-book', ['oldListsWithoutInventory', 'casterWithoutSpellBook']],
    ['caster-old-spell-book-row', ['oldListsWithoutInventory', 'casterWithoutSpellBook']],
    ['caster-old-spell-book-in-inventory', ['casterWithoutSpellBook']],
    ['caster-inventory-without-book', ['casterWithoutSpellBook']],
  ] as const)('names the shapes of the %s fixture', (fixture, shapes) => {
    expect(oseLegacyShapes(legacy[fixture].data)).toEqual(shapes)
  })

  it('finds no old shape in the four demo characters', () => {
    for (const fixture of [demoCleric, demoFighter, demoMagicUser, demoThief]) {
      expect(oseLegacyShapes(fixture.data)).toEqual([])
    }
  })

  it('names a character with no details, and only that', () => {
    expect(oseLegacyShapes({ class: 'Elf' })).toEqual(['noDetails'])
    expect(oseLegacyShapes({ class: 'Elf', details: 'text' })).toEqual(['noDetails'])
  })

  it('finds legacy gold by slot index and in equipped rows', () => {
    expect(oseLegacyShapes({ details: { storeGoldSlotIndices: [2] } })).toContain('legacyGold')
    expect(oseLegacyShapes({ details: { equippedItems: [' Gold: 3 gp '] } })).toContain('legacyGold')
    expect(oseLegacyShapes({ details: { packedItems: ['Golden idol', 7] } })).not.toContain('legacyGold')
  })

  it('counts an arcane caster with a typed spell book as having one', () => {
    const book = { id: 'b', kind: 'general', typeId: 'spell-book', name: 'Spell Book' }
    expect(oseLegacyShapes({ class: 'Elf', details: { inventory: [book] } })).toEqual([])
    expect(oseLegacyShapes({ class: 'Elf', details: { inventory: [{ ...book, kind: 'weapon' }] } })).toEqual(['casterWithoutSpellBook'])
  })

  it('looks for rows without ids in a present inventory, not in the old lists beside it', () => {
    const details = { inventory: [{ id: 'a' }], weapons: [{ name: 'Old' }] }
    expect(oseLegacyShapes({ details })).toEqual(['oldListsBesideInventory'])
  })
})
