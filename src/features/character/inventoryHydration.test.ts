import { describe, expect, it, vi } from 'vitest'
import type { CharacterGeneralItem, CharacterSheetDetails } from '../../types/app'
import { stableStringify } from './characterFactories'
import { incomingInventoryFromDetails, seedInventoryFromDetails } from './inventoryHydration'
import { SPELL_BOOK_TYPE_ID } from './spellCatalog'

const generalItem = (id: string, name: string, typeId = id): CharacterGeneralItem => ({
  id,
  kind: 'general',
  typeId,
  typeName: name,
  name,
  costGp: 0,
  equipped: false,
  notes: '',
  qty: 1,
  stack: 'none',
})

const rope = generalItem('rope', 'Rope')
const book = generalItem('book', 'Spell book', SPELL_BOOK_TYPE_ID)
const migrated = generalItem('migrated', 'Migrated')

const details = (fields: Partial<CharacterSheetDetails>) => fields as CharacterSheetDetails
const migrateToInventory = vi.fn(() => [migrated])

describe('seedInventoryFromDetails', () => {
  it('shows a stored inventory as it is, matching what was stored', () => {
    expect(seedInventoryFromDetails('Fighter', details({ inventory: [rope] }), migrateToInventory)).toEqual({
      inventory: [rope],
      persistedInventoryJson: stableStringify([rope]),
      isLocallyDirty: false,
    })
  })

  it('turns an old-format sheet into items, which it counts as stored', () => {
    expect(seedInventoryFromDetails('Fighter', details({}), migrateToInventory)).toEqual({
      inventory: [migrated],
      persistedInventoryJson: stableStringify([migrated]),
      isLocallyDirty: false,
    })
  })

  it('adds a missing spell book for an arcane caster and counts it as a local edit', () => {
    const seeded = seedInventoryFromDetails('Magic-User', details({ inventory: [rope] }), migrateToInventory)
    expect(seeded.inventory).toEqual([rope, expect.objectContaining({ kind: 'general', typeId: SPELL_BOOK_TYPE_ID })])
    expect(seeded.persistedInventoryJson).toBe(stableStringify([rope]))
    expect(seeded.isLocallyDirty).toBe(true)
  })

  it('keeps an arcane caster\'s stored spell book', () => {
    expect(seedInventoryFromDetails('Elf', details({ inventory: [book] }), migrateToInventory)).toEqual({
      inventory: [book],
      persistedInventoryJson: stableStringify([book]),
      isLocallyDirty: false,
    })
  })
})

describe('incomingInventoryFromDetails', () => {
  it('takes a stored inventory as it is', () => {
    expect(incomingInventoryFromDetails(details({ inventory: [rope] }), migrateToInventory)).toEqual([rope])
  })

  it('turns an old-format sheet into items, without adding a spell book', () => {
    expect(incomingInventoryFromDetails(details({}), migrateToInventory)).toEqual([migrated])
  })
})
