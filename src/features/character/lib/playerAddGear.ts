import type { CharacterInventoryItem } from '../../../types/app'
import { DEFAULT_STACK_POLICY } from '../../items/itemDefaults'
import { ammoCatalogById } from '../ammoCatalog'
import { armourCatalogById } from '../armourCatalog'
import { makeArmourItem, makeId, makeWeaponItem } from '../characterFactories'
import { consumableCatalogById } from '../consumableCatalog'
import { generalCatalogById } from '../generalCatalog'
import type { AddItemModalState } from '../hooks/useInventoryDomain'
import { armourTypeFromTemplateId, parseArmourTemplateValues, parseDamageDice, parseRangeBands } from '../inventoryRules'
import { weaponCatalogById } from '../weaponCatalog'

export const applyPlayerAddTemplate = (
  current: AddItemModalState,
  kind: 'general' | 'weapon' | 'armour' | 'ammunition',
  templateId: string,
): AddItemModalState => {
  if (kind === 'weapon') {
    const template = weaponCatalogById[templateId]
    if (!template) return current
    const parsed = parseDamageDice(template.damage)
    const range = parseRangeBands(template.range)
    return { ...current, kind, typeId: templateId, typeName: template.name, name: '', costGp: String(template.costGp), description: '', damageDiceCount: parsed.damageDiceCount, damageDiceSides: parsed.damageDiceSides, rangeShort: range.rangeShort, rangeMedium: range.rangeMedium, rangeLong: range.rangeLong, slow: template.qualities.includes('Slow'), twoHanded: template.twoHanded, isMagic: false, attackBonus: '', damageBonus: '', notes: '' }
  }
  if (kind === 'armour') {
    const template = armourCatalogById[templateId]
    if (!template) return current
    const parsed = parseArmourTemplateValues(template.ac)
    return { ...current, kind, typeId: templateId, typeName: template.name, name: '', costGp: String(template.costGp), description: '', armourClass: parsed.armourClass, shieldMod: parsed.shieldMod, magicMod: '', armourType: armourTypeFromTemplateId(template.id), isMagic: false, notes: '' }
  }
  if (kind === 'ammunition') {
    const template = ammoCatalogById[templateId]
    if (!template) return current
    return { ...current, kind: 'ammunition', typeId: templateId, typeName: template.name, name: '', costGp: String(template.costGp), description: template.description, qty: String(template.qty), notes: '' }
  }
  const general = generalCatalogById[templateId]
  const consumable = consumableCatalogById[templateId]
  const template = general ?? consumable
  if (!template) return current
  return { ...current, kind, typeId: templateId, typeName: template.name, name: '', costGp: String(template.costGp), description: template.description, qty: consumable ? String(consumable.qty) : '1', effectText: consumable?.effectText ?? '', notes: '' }
}

export const playerAddPreviewItem = (modal: AddItemModalState | null): CharacterInventoryItem | null => {
  if (!modal || !modal.typeId || modal.typeId === 'custom') return null
  if (modal.kind === 'weapon') return makeWeaponItem({ typeId: modal.typeId, typeName: modal.typeName, costGp: Number.parseFloat(modal.costGp) || 0, description: modal.description, damageDiceCount: modal.damageDiceCount, damageDiceSides: modal.damageDiceSides, rangeShort: modal.rangeShort, rangeMedium: modal.rangeMedium, rangeLong: modal.rangeLong, slow: modal.slow, twoHanded: modal.twoHanded })
  if (modal.kind === 'armour') return makeArmourItem({ typeId: modal.typeId, typeName: modal.typeName, costGp: Number.parseFloat(modal.costGp) || 0, description: modal.description, armourClass: modal.armourClass, shieldMod: modal.shieldMod, magicMod: modal.magicMod, armourType: modal.armourType })
  if (modal.kind === 'ammunition') {
    const template = ammoCatalogById[modal.typeId]
    return { id: makeId(), kind: 'ammunition', typeId: modal.typeId, typeName: modal.typeName, costGp: Number.parseFloat(modal.costGp) || 0, equipped: false, notes: '', qty: template ? template.qty : (Number.parseInt(modal.qty, 10) || 1), stack: DEFAULT_STACK_POLICY.ammunition, description: modal.description }
  }
  const consumable = consumableCatalogById[modal.typeId]
  if (consumable) {
    const isOil = consumable.id === 'con-oil'
    return { id: makeId(), kind: 'consumable', typeId: modal.typeId, typeName: modal.typeName, costGp: Number.parseFloat(modal.costGp) || 0, equipped: false, notes: '', qty: consumable.qty, stack: isOil ? { stackable: false } as const : DEFAULT_STACK_POLICY.consumable, description: modal.description, effectText: consumable.effectText || undefined, ...(isOil ? { amountRemaining: consumable.fuelCapacity ?? 24 } : {}) }
  }
  return { id: makeId(), kind: 'general', typeId: modal.typeId, typeName: modal.typeName, costGp: Number.parseFloat(modal.costGp) || 0, equipped: false, notes: '', qty: 1, stack: DEFAULT_STACK_POLICY.general, description: modal.description }
}
