import { describe, expect, it } from 'vitest'
import type { CharacterGeneralItem, CharacterInventoryItem } from '../../types/app'
import { shouldAdoptIncomingInventory } from './inventorySync'

const makeGeneralItem = (id: string, name: string): CharacterGeneralItem => ({
  id,
  kind: 'general',
  typeId: id,
  typeName: name,
  name,
  costGp: 0,
  equipped: false,
  notes: '',
  qty: 1,
  stack: { stackable: false },
})

describe('shouldAdoptIncomingInventory', () => {
  it('adopts remote inventory changes when there is no local inventory dirtiness', () => {
    const localInventory: CharacterInventoryItem[] = [makeGeneralItem('rope', 'Rope')]
    const incomingInventory: CharacterInventoryItem[] = [
      makeGeneralItem('rope', 'Rope'),
      makeGeneralItem('torch', 'Torch'),
    ]

    const result = shouldAdoptIncomingInventory({
      hasPendingWrite: false,
      isLocallyDirtyInventory: false,
      incomingInventory,
      lastPersistedInventoryJson: JSON.stringify(localInventory),
    })

    expect(result.shouldAdopt).toBe(true)
  })

  it('does not adopt remote inventory when this client has unsaved local inventory changes', () => {
    const incomingInventory: CharacterInventoryItem[] = [makeGeneralItem('torch', 'Torch')]

    const result = shouldAdoptIncomingInventory({
      hasPendingWrite: false,
      isLocallyDirtyInventory: true,
      incomingInventory,
      lastPersistedInventoryJson: '[]',
    })

    expect(result.shouldAdopt).toBe(false)
  })

  it('does not adopt remote inventory while a character write is pending', () => {
    const incomingInventory: CharacterInventoryItem[] = [makeGeneralItem('torch', 'Torch')]

    const result = shouldAdoptIncomingInventory({
      hasPendingWrite: true,
      isLocallyDirtyInventory: false,
      incomingInventory,
      lastPersistedInventoryJson: '[]',
    })

    expect(result.shouldAdopt).toBe(false)
  })
})
