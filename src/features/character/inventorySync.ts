import type { CharacterInventoryItem, CharacterSheetDetails } from '../../types/app'
import { stableStringify } from './characterFactories'

export function inventoryFromDetails(
  details: CharacterSheetDetails,
  migrateToInventory: (details: CharacterSheetDetails) => CharacterInventoryItem[],
): CharacterInventoryItem[] {
  return details.inventory ? (details.inventory as CharacterInventoryItem[]) : migrateToInventory(details)
}

type IncomingInventorySyncParams = {
  hasPendingWrite: boolean
  isLocallyDirtyInventory: boolean
  incomingInventory: CharacterInventoryItem[]
  lastPersistedInventoryJson?: string
}

export function shouldAdoptIncomingInventory({
  hasPendingWrite,
  isLocallyDirtyInventory,
  incomingInventory,
  lastPersistedInventoryJson,
}: IncomingInventorySyncParams) {
  const incomingInventoryJson = stableStringify(incomingInventory)
  if (hasPendingWrite) {
    return { shouldAdopt: false, incomingInventoryJson }
  }
  if (isLocallyDirtyInventory) {
    return { shouldAdopt: false, incomingInventoryJson }
  }
  return {
    shouldAdopt: incomingInventoryJson !== lastPersistedInventoryJson,
    incomingInventoryJson,
  }
}
