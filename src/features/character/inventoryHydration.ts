import type { CharacterInventoryItem, CharacterSheetDetails } from '../../types/app'
import { ensureSpellBookInInventory, stableStringify } from './characterFactories'
import { inventoryFromDetails } from './inventorySync'

type MigrateToInventory = (details: CharacterSheetDetails) => CharacterInventoryItem[]

export type SeededInventory = {
  /** The items the sheet shows. */
  inventory: CharacterInventoryItem[]
  /** The items the stored sheet holds, as the sheet last persisted them. */
  persistedInventoryJson: string
  /** Whether the items shown differ from the stored ones, so they save with the next write. */
  isLocallyDirty: boolean
}

/**
 * The items the sheet hydrates the first time it seeds a character.
 *
 * Backfill/self-heal: arcane spellcasters created before they were wired for
 * spellbooks are missing the spell book item (and thus its shop-like UI), so
 * it is injected here. The persisted value stays the stored one, so the healed
 * inventory reads as locally dirty and persists next time the character is
 * selected.
 */
export function seedInventoryFromDetails(
  className: string,
  details: CharacterSheetDetails,
  migrateToInventory: MigrateToInventory,
): SeededInventory {
  const storedInventory = inventoryFromDetails(details, migrateToInventory)
  const inventory = ensureSpellBookInInventory(className, storedInventory)
  const persistedInventoryJson = stableStringify(storedInventory)
  return { inventory, persistedInventoryJson, isLocallyDirty: stableStringify(inventory) !== persistedInventoryJson }
}

/** The items the sheet would take in from a later snapshot of a character it has seeded. */
export function incomingInventoryFromDetails(
  details: CharacterSheetDetails,
  migrateToInventory: MigrateToInventory,
): CharacterInventoryItem[] {
  return inventoryFromDetails(details, migrateToInventory)
}
