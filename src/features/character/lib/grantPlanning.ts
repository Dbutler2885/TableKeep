import type { CharacterInventoryItem } from '../../../types/app'
import { DEFAULT_STACK_POLICY } from '../../items/itemDefaults'
import { ammoCatalogById } from '../ammoCatalog'
import { makeArmourItem, makeId, makeWeaponItem } from '../characterFactories'
import { consumableCatalogById } from '../consumableCatalog'
import { generalCatalogById } from '../generalCatalog'
import { applyArmourTemplateToItem, applyWeaponTemplateToItem } from '../inventoryRules'
import { OSE_STORE_ITEMS } from '../storeCatalog'
import type { GrantTemplateEntry } from './characterTabTypes'

export const makeInventoryItemFromTemplateEntry = (entry: GrantTemplateEntry): CharacterInventoryItem => {
  if (entry.kind === 'weapon' && entry.weaponId) return applyWeaponTemplateToItem(makeWeaponItem(), entry.weaponId)
  if (entry.kind === 'armour' && entry.armourId) return applyArmourTemplateToItem(makeArmourItem(), entry.armourId)
  if (entry.kind === 'ammunition') {
    const storeItem = OSE_STORE_ITEMS.find((item) => item.id === entry.key)
    const ammo = storeItem ? ammoCatalogById[storeItem.id] ?? ammoCatalogById[storeItem.id.replace('ammo-', '')] : null
    return { id: makeId(), kind: 'ammunition', typeId: ammo?.id ?? 'custom', typeName: ammo?.name ?? entry.name, name: entry.name, costGp: entry.costGp, equipped: false, notes: '', description: ammo?.description ?? '', qty: ammo?.qty ?? 1, stack: DEFAULT_STACK_POLICY.ammunition }
  }
  if (entry.kind === 'consumable') {
    const storeItem = OSE_STORE_ITEMS.find((item) => item.id === entry.key)
    const consumable = storeItem ? consumableCatalogById[storeItem.id.replace('gear-', 'con-')] : null
    const isOil = consumable?.id === 'con-oil'
    return { id: makeId(), kind: 'consumable', typeId: consumable?.id ?? 'custom', typeName: consumable?.name ?? entry.name, costGp: entry.costGp, equipped: false, notes: '', description: consumable?.description ?? '', qty: consumable?.qty ?? 1, stack: isOil ? { stackable: false } as const : DEFAULT_STACK_POLICY.consumable, effectText: consumable?.effectText ?? undefined, ...(isOil ? { amountRemaining: consumable?.fuelCapacity ?? 24 } : {}) }
  }
  const storeItem = OSE_STORE_ITEMS.find((item) => item.id === entry.key)
  const general = storeItem ? generalCatalogById[storeItem.id] : null
  return { id: makeId(), kind: 'general', typeId: general?.id ?? 'custom', typeName: general?.name ?? entry.name, name: entry.name, costGp: general?.costGp ?? entry.costGp, equipped: false, notes: '', description: general?.description ?? '', qty: 1, stack: DEFAULT_STACK_POLICY.general }
}

export const amountForTarget = (total: number, split: boolean, targetCount: number, targetIndex: number): number => {
  if (!split || targetCount <= 0) return total
  const normalizedTotal = Math.max(0, Math.floor(total))
  const base = Math.floor(normalizedTotal / targetCount)
  const remainder = normalizedTotal % targetCount
  return base + (targetIndex < remainder ? 1 : 0)
}
