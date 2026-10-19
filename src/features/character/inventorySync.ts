import type { CharacterInventoryItem } from '../../types/app'
import { stableStringify } from './characterFactories'

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
