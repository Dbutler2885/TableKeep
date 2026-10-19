import type { CharacterInventoryItem, CharacterSheetDetails } from '../../types/app'
import { stableStringify } from './characterFactories'

export type SeededInventory = {
  /** The items the sheet shows. */
  inventory: CharacterInventoryItem[]
  /** The items the stored sheet holds, as the sheet last persisted them. */
  persistedInventoryJson: string
}

/**
 * The items a sheet holds, as stored. OSE's steps have already turned an
 * old-format sheet into items and given an arcane caster its spell book
 * before the sheet reads it, so hydration converts and adds nothing itself.
 */
const storedItems = (details: CharacterSheetDetails): CharacterInventoryItem[] => details.inventory ?? []

/** The items the sheet hydrates the first time it seeds a character, which are the stored ones. */
export function seedInventoryFromDetails(details: CharacterSheetDetails): SeededInventory {
  const inventory = storedItems(details)
  return { inventory, persistedInventoryJson: stableStringify(inventory) }
}

/** The items the sheet would take in from a later snapshot of a character it has seeded. */
export function incomingInventoryFromDetails(details: CharacterSheetDetails): CharacterInventoryItem[] {
  return storedItems(details)
}
