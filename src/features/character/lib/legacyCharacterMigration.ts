import type { CharacterInventoryItem, CharacterSheetDetails } from '../../../types/app'
import { DEFAULT_STACK_POLICY } from '../../items/itemDefaults'
import { makeArmourItem, makeId, makeWeaponItem } from '../characterFactories'
import { makeGoldItem } from '../inventoryOverflow'

export const migrateToInventory = (details: CharacterSheetDetails): CharacterInventoryItem[] => {
  const items: CharacterInventoryItem[] = []

  // Migrate weapons
  if (details.weapons) {
    for (const w of details.weapons) {
      items.push(makeWeaponItem({
        id: w.id || makeId(),
        name: w.name,
        typeId: w.weaponId || 'custom',
        typeName: '',
        isMagic: w.isMagic,
        damageDiceCount: w.damageDiceCount,
        damageDiceSides: w.damageDiceSides,
        attackBonus: w.bonus,
        damageBonus: '',
        rangeShort: w.rangeShort,
        rangeMedium: w.rangeMedium,
        rangeLong: w.rangeLong,
        twoHanded: w.twoHanded,
        equipped: w.equipped,
        notes: w.notes,
      }))
    }
  }

  // Migrate armour
  if (details.armour) {
    for (const a of details.armour) {
      items.push(makeArmourItem({
        id: a.id || makeId(),
        name: a.name,
        typeId: a.armourId || 'custom',
        typeName: '',
        isMagic: a.isMagic,
        armourClass: a.ac,
        shieldMod: a.armourId === 'shield' ? '-1' : '',
        magicMod: a.bonus,
        equipped: a.equipped,
        notes: a.notes,
      }))
    }
  }

  // Migrate packed items (strings)
  const goldSlotSet = new Set(details.storeGoldSlotIndices ?? [])
  if (details.packedItems) {
    for (let i = 0; i < details.packedItems.length; i++) {
      const text = (details.packedItems[i] ?? '').trim()
      if (!text) continue
      const goldMatch = text.match(/^Gold:\s*(\d+)\s*gp$/i)
      if (goldMatch || goldSlotSet.has(i)) {
        const amount = goldMatch ? Number.parseInt(goldMatch[1], 10) : 0
        if (amount > 0) items.push(makeGoldItem(amount))
      } else {
        items.push({
          id: makeId(),
          kind: 'general',
          typeId: 'custom',
          typeName: text,
          name: text,
          costGp: 0,
          equipped: false,
          notes: '',
          qty: 1,
          stack: DEFAULT_STACK_POLICY.general,
        })
      }
    }
  }

  // Migrate equipped items (strings)
  if (details.equippedItems) {
    for (const text of details.equippedItems) {
      const trimmed = (text ?? '').trim()
      if (!trimmed) continue
      if (/^Gold:\s*\d+\s*gp$/i.test(trimmed)) continue // skip gold in equipped
      items.push({
        id: makeId(),
        kind: 'general',
        typeId: 'custom',
        typeName: trimmed,
        name: trimmed,
        costGp: 0,
        equipped: true,
        notes: '',
        qty: 1,
        stack: DEFAULT_STACK_POLICY.general,
      })
    }
  }

  return items
}
