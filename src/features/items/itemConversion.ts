import type {
  CampaignItem,
  CharacterAmmunitionItem,
  CharacterArmourItem,
  CharacterConsumableItem,
  CharacterGeneralItem,
  CharacterGoldItem,
  CharacterInventoryItem,
  CharacterWeaponItem,
} from '../../types/app'
import { DEFAULT_STACK_POLICY } from './itemDefaults'
import { goldChunksForAmount, makeGoldItem } from '../character/inventoryOverflow'

const defaultWeaponStats: CampaignItem['weaponStats'] = {
  damageDiceCount: '', damageDiceSides: '', attackBonus: '',
  damageBonus: '', rangeShort: '', rangeMedium: '', rangeLong: '', twoHanded: false,
}

const defaultArmourStats: CampaignItem['armourStats'] = { armourClass: '', shieldMod: '', magicMod: '', armourType: 'body' }

const defaultConsumableStats: CampaignItem['consumableStats'] = { useMode: 'consume', effectText: '' }

export function campaignItemToInventoryItem(item: CampaignItem): CharacterInventoryItem {
  const base = {
    id: crypto.randomUUID(),
    typeId: item.typeId,
    typeName: item.typeName,
    name: item.name || undefined,
    costGp: Number.parseFloat(item.gpValue) || 0,
    equipped: false,
    notes: item.notes,
    sourceItemId: item.id,
    description: item.description,
    specialRule: item.specialRule,
    portraitPath: item.portraitPath,
    portraitUrl: item.portraitUrl,
  }

  switch (item.type) {
    case 'weapon':
      return {
        ...base,
        kind: 'weapon',
        qty: 1,
        stack: DEFAULT_STACK_POLICY.weapon,
        isMagic: item.isMagic,
        damageDiceCount: item.weaponStats.damageDiceCount,
        damageDiceSides: item.weaponStats.damageDiceSides,
        attackBonus: item.weaponStats.attackBonus,
        damageBonus: item.weaponStats.damageBonus,
        rangeShort: item.weaponStats.rangeShort,
        rangeMedium: item.weaponStats.rangeMedium,
        rangeLong: item.weaponStats.rangeLong,
        twoHanded: item.weaponStats.twoHanded,
      } satisfies CharacterWeaponItem

    case 'armour':
      return {
        ...base,
        kind: 'armour',
        qty: 1,
        stack: DEFAULT_STACK_POLICY.armour,
        isMagic: item.isMagic,
        armourClass: item.armourStats.armourClass,
        shieldMod: item.armourStats.shieldMod,
        magicMod: item.armourStats.magicMod,
        armourType: item.armourStats.armourType,
      } satisfies CharacterArmourItem

    case 'ammunition':
      return {
        ...base,
        kind: 'ammunition',
        qty: Number.parseInt(item.qty, 10) || 1,
        stack: DEFAULT_STACK_POLICY.ammunition,
      } satisfies CharacterAmmunitionItem

    case 'consumable':
      return {
        ...base,
        kind: 'consumable',
        qty: Number.parseInt(item.qty, 10) || 1,
        stack: DEFAULT_STACK_POLICY.consumable,
        useMode: item.consumableStats.useMode,
        effectText: item.consumableStats.effectText || undefined,
      } satisfies CharacterConsumableItem

    case 'general':
      return {
        ...base,
        kind: 'general',
        qty: 1,
        stack: DEFAULT_STACK_POLICY.general,
      } satisfies CharacterGeneralItem

    case 'gold':
      throw new Error('Gold campaign items must use campaignGoldToInventoryChunks() instead of campaignItemToInventoryItem()')
  }
}

export function campaignGoldToInventoryChunks(goldAmount: number): CharacterGoldItem[] {
  return goldChunksForAmount(goldAmount).map((chunk) => makeGoldItem(chunk))
}

export function inventoryItemToCampaignItem(
  item: CharacterInventoryItem,
  overrides: {
    status: 'dropped' | 'authored'
    droppedByCharacterId?: string
    droppedByCharacterName?: string
  },
): CampaignItem {
  const base: Omit<CampaignItem, 'type' | 'isMagic' | 'weaponStats' | 'armourStats' | 'consumableStats'> = {
    id: crypto.randomUUID(),
    typeId: item.typeId,
    typeName: item.typeName,
    name: item.name ?? '',
    status: overrides.status,
    droppedByCharacterId: overrides.droppedByCharacterId,
    droppedByCharacterName: overrides.droppedByCharacterName,
    portraitPath: item.portraitPath,
    portraitUrl: item.portraitUrl ?? null,
    portraitFocusX: 50,
    portraitFocusY: 50,
    tokenIcon: { icon: 'pawn', color: '#bf2f2a', size: 34 },
    description: item.description ?? '',
    gpValue: String(item.costGp),
    qty: String(item.qty),
    specialRule: item.specialRule ?? '',
    notes: item.notes,
  }

  switch (item.kind) {
    case 'weapon': {
      const w = item as CharacterWeaponItem
      return {
        ...base,
        type: 'weapon',
        isMagic: w.isMagic,
        weaponStats: {
          damageDiceCount: w.damageDiceCount,
          damageDiceSides: w.damageDiceSides,
          attackBonus: w.attackBonus,
          damageBonus: w.damageBonus,
          rangeShort: w.rangeShort,
          rangeMedium: w.rangeMedium,
          rangeLong: w.rangeLong,
          twoHanded: w.twoHanded,
        },
        armourStats: defaultArmourStats,
        consumableStats: defaultConsumableStats,
      }
    }
    case 'armour': {
      const a = item as CharacterArmourItem
      return {
        ...base,
        type: 'armour',
        isMagic: a.isMagic,
        weaponStats: defaultWeaponStats,
        armourStats: { armourClass: a.armourClass, shieldMod: a.shieldMod, magicMod: a.magicMod, armourType: a.armourType },
        consumableStats: defaultConsumableStats,
      }
    }
    case 'ammunition': {
      return {
        ...base,
        type: 'ammunition',
        isMagic: false,
        weaponStats: defaultWeaponStats,
        armourStats: defaultArmourStats,
        consumableStats: defaultConsumableStats,
      }
    }
    case 'consumable': {
      const c = item as CharacterConsumableItem
      return {
        ...base,
        type: 'consumable',
        isMagic: false,
        weaponStats: defaultWeaponStats,
        armourStats: defaultArmourStats,
        consumableStats: { useMode: c.useMode, effectText: c.effectText ?? '' },
      }
    }
    case 'general':
      return {
        ...base,
        type: 'general',
        isMagic: false,
        weaponStats: defaultWeaponStats,
        armourStats: defaultArmourStats,
        consumableStats: defaultConsumableStats,
      }
    case 'gold':
      return {
        ...base,
        type: 'gold',
        isMagic: false,
        weaponStats: defaultWeaponStats,
        armourStats: defaultArmourStats,
        consumableStats: defaultConsumableStats,
        goldAmount: item.qty ?? 0,
      }
  }
}
