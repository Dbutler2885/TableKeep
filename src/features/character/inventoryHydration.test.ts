import { describe, expect, it } from 'vitest'
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
  stack: { stackable: false },
})

const rope = generalItem('rope', 'Rope')
const book = generalItem('book', 'Spell book', SPELL_BOOK_TYPE_ID)

const details = (fields: Partial<CharacterSheetDetails>) => fields as CharacterSheetDetails

// Converting an old-format sheet and adding a missing spell book are OSE's
// step's now (`ruleSets/ose/characterMigrations.test.ts`); hydration takes the
// items the step left.
describe('seedInventoryFromDetails', () => {
  it('shows a stored inventory as it is, matching what was stored', () => {
    expect(seedInventoryFromDetails(details({ inventory: [rope, book] }))).toEqual({
      inventory: [rope, book],
      persistedInventoryJson: stableStringify([rope, book]),
    })
  })

  it('shows a sheet without items as having none, and adds no spell book', () => {
    const legacy = details({ weapons: [{ id: 'w1', name: 'Sword' }] } as Partial<CharacterSheetDetails>)
    expect(seedInventoryFromDetails(legacy)).toEqual({ inventory: [], persistedInventoryJson: '[]' })
  })
})

describe('incomingInventoryFromDetails', () => {
  it('takes a stored inventory as it is', () => {
    expect(incomingInventoryFromDetails(details({ inventory: [rope] }))).toEqual([rope])
  })

  it('takes a sheet without items as having none', () => {
    expect(incomingInventoryFromDetails(details({}))).toEqual([])
  })
})
