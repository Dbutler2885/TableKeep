// Pure store rules — cart validation and item materialization.
// No React, no Firebase.

import type {
  CharacterStoreCartEntry as StoreCartEntry,
  CharacterInventoryItem,
  CharacterAmmunitionItem,
  CharacterConsumableItem,
  CharacterGeneralItem,
} from '../../types/app'
import { DEFAULT_STACK_POLICY } from '../items/itemDefaults'
import { OSE_STORE_ITEMS } from './storeCatalog'
import { ammoCatalogById } from './ammoCatalog'
import { consumableCatalogById } from './consumableCatalog'
import { generalCatalogById } from './generalCatalog'
import { makeWeaponItem, makeArmourItem, makeId } from './characterFactories'
import {
  applyWeaponTemplateToItem,
  applyArmourTemplateToItem,
  isWeaponTemplateAllowedForClass,
  isArmourTemplateAllowedForClass,
} from './inventoryRules'

// ---------------------------------------------------------------------------
// Cart materialization
// ---------------------------------------------------------------------------

export type MaterializeResult =
  | { ok: true; items: CharacterInventoryItem[] }
  | { ok: false; error: string }

export const materializeCartEntries = (
  cart: StoreCartEntry[],
  className: string,
): MaterializeResult => {
  const newItems: CharacterInventoryItem[] = []

  for (const entry of cart) {
    for (let count = 0; count < entry.qty; count += 1) {
      if (entry.kind === 'weapon' && entry.weaponId) {
        if (!isWeaponTemplateAllowedForClass(entry.weaponId, className)) {
          return { ok: false, error: `Class restriction prevents ${entry.name}.` }
        }
        newItems.push(applyWeaponTemplateToItem(makeWeaponItem(), entry.weaponId))
      } else if (entry.kind === 'armour' && entry.armourId) {
        if (!isArmourTemplateAllowedForClass(entry.armourId, className)) {
          return { ok: false, error: `Class restriction prevents ${entry.name}.` }
        }
        newItems.push(applyArmourTemplateToItem(makeArmourItem(), entry.armourId))
      } else if (entry.kind === 'ammunition') {
        const storeItem = OSE_STORE_ITEMS.find((s) => s.id === entry.key || s.name === entry.name)
        const ammoTemplate = storeItem ? ammoCatalogById[storeItem.id] ?? ammoCatalogById[storeItem.id.replace('ammo-', '')] : null
        newItems.push({
          id: makeId(),
          kind: 'ammunition',
          typeId: ammoTemplate?.id ?? 'custom',
          typeName: ammoTemplate?.name ?? (entry.packedLabel ?? entry.name),
          name: entry.name,
          costGp: entry.costGp,
          equipped: false,
          notes: '',
          description: ammoTemplate?.description ?? '',
          qty: ammoTemplate?.qty ?? 1,
          stack: DEFAULT_STACK_POLICY.ammunition,
        } as CharacterAmmunitionItem)
      } else if (entry.kind === 'consumable') {
        const storeItem = OSE_STORE_ITEMS.find((s) => s.id === entry.key || s.name === entry.name)
        const conTemplate = storeItem ? consumableCatalogById[storeItem.id.replace('gear-', 'con-')] : null
        newItems.push({
          id: makeId(),
          kind: 'consumable',
          typeId: conTemplate?.id ?? 'custom',
          typeName: conTemplate?.name ?? entry.name,
          name: entry.name,
          costGp: entry.costGp,
          equipped: false,
          notes: entry.packedLabel ?? '',
          description: conTemplate?.description ?? '',
          qty: conTemplate?.qty ?? 1,
          stack: DEFAULT_STACK_POLICY.consumable,
          useMode: conTemplate?.useMode ?? 'consume',
          effectText: conTemplate?.effectText ?? undefined,
        } as CharacterConsumableItem)
      } else {
        const storeItem = OSE_STORE_ITEMS.find((s) => s.id === entry.key || s.name === entry.name)
        const genTemplate = storeItem ? generalCatalogById[storeItem.id] : null
        newItems.push({
          id: makeId(),
          kind: 'general',
          typeId: genTemplate?.id ?? 'custom',
          typeName: genTemplate?.name ?? entry.name,
          name: entry.name,
          costGp: entry.costGp,
          equipped: false,
          notes: entry.packedLabel ?? '',
          description: genTemplate?.description ?? '',
          qty: 1,
          stack: DEFAULT_STACK_POLICY.general,
        } as CharacterGeneralItem)
      }
    }
  }

  return { ok: true, items: newItems }
}

// ---------------------------------------------------------------------------
// Cart validation
// ---------------------------------------------------------------------------

export const validateStorePurchase = (
  cart: StoreCartEntry[],
  startingGold: number | null,
  committedStoreSpent: number,
  className: string,
  currentPackedCount: number,
  totalPackedSlots: number,
): string | null => {
  if (className === '-') return 'CLASS_REQUIRED'
  if (typeof startingGold !== 'number') return 'Roll starting gold before buying equipment.'
  if (cart.length === 0) return 'Your cart is empty.'
  const cartTotal = cart.reduce((sum, entry) => sum + entry.costGp * entry.qty, 0)
  const remaining = startingGold - committedStoreSpent - cartTotal
  if (remaining < 0) return 'Cart total exceeds remaining gold.'
  const requiredPacked = cart.reduce((sum, entry) => sum + entry.qty, 0)
  if (currentPackedCount + requiredPacked > totalPackedSlots) {
    const openSlots = Math.max(0, totalPackedSlots - currentPackedCount)
    return `Not enough open packed slots (${openSlots} open, ${requiredPacked} needed). Reorganize inventory to purchase these goods.`
  }
  return null
}
