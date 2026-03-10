export type Role = 'gm' | 'player'

export type AppTab = 'character' | 'maps' | 'monsters' | 'items' | 'npcs' | 'notes' | 'rules'

export type Campaign = {
  id: string
  name: string
  status: string
}

export type TokenIconConfig = {
  icon: 'pawn' | 'custom'
  color: string
  size: number
  customImageUrl?: string
  customImageName?: string
}

export type CharacterWeaponRow = {
  id: string
  weaponId: string
  isMagic: boolean
  name: string
  damageDiceCount: string
  damageDiceSides: string
  bonus: string
  rangeShort: string
  rangeMedium: string
  rangeLong: string
  twoHanded: boolean
  equipped: boolean
  notes: string
}

export type CharacterArmourRow = {
  id: string
  armourId: string
  isMagic: boolean
  name: string
  ac: string
  bonus: string
  equipped: boolean
  notes: string
}

export type CharacterStoreCartEntry = {
  key: string
  name: string
  costGp: number
  qty: number
  kind: 'general' | 'weapon' | 'ammunition' | 'armour' | 'consumable'
  weaponId?: string
  armourId?: string
  packedLabel?: string
}

// --- Item system core types ---

export type ItemKind = 'weapon' | 'armour' | 'ammunition' | 'consumable' | 'general' | 'gold'
export type GlobalItemAction = 'equip' | 'unequip' | 'drop' | 'give' | 'sell'
export type ConsumableUseMode = 'consume' | 'use'
export type StackPolicy =
  | { stackable: false }
  | { stackable: true; maxStack: number }

// --- Campaign item (GM-authored template) ---

export type CampaignItemType = 'weapon' | 'armour' | 'ammunition' | 'consumable' | 'general'

export type CampaignItem = {
  id: string
  name: string
  type: CampaignItemType
  typeId: string
  typeName: string
  status: 'authored' | 'dropped'
  droppedByCharacterId?: string
  droppedByCharacterName?: string
  portraitUrl: string | null
  portraitFocusX: number
  portraitFocusY: number
  tokenIcon: TokenIconConfig
  description: string
  gpValue: string
  qty: string
  isMagic: boolean
  weaponStats: {
    damageDiceCount: string
    damageDiceSides: string
    attackBonus: string
    damageBonus: string
    rangeShort: string
    rangeMedium: string
    rangeLong: string
    twoHanded: boolean
  }
  armourStats: { armourClass: string; shieldMod: string; magicMod: string; armourType: 'body' | 'shield' }
  consumableStats: { useMode: ConsumableUseMode; effectText: string }
  specialRule: string
  notes: string
}

// --- Character inventory item (live instance) ---

type CharacterInventoryItemBase = {
  id: string
  kind: ItemKind
  typeId: string
  typeName: string
  name?: string
  costGp: number
  equipped: boolean
  notes: string
  sourceItemId?: string
  description?: string
  specialRule?: string
  portraitUrl?: string | null
  qty: number
  stack: StackPolicy
}

export type CharacterWeaponItem = CharacterInventoryItemBase & {
  kind: 'weapon'
  isMagic: boolean
  damageDiceCount: string
  damageDiceSides: string
  attackBonus: string
  damageBonus: string
  rangeShort: string
  rangeMedium: string
  rangeLong: string
  twoHanded: boolean
}

export type CharacterArmourItem = CharacterInventoryItemBase & {
  kind: 'armour'
  isMagic: boolean
  armourClass: string
  shieldMod: string
  magicMod: string
  armourType: 'body' | 'shield'
}

export type CharacterGoldItem = CharacterInventoryItemBase & {
  kind: 'gold'
}

export type CharacterAmmunitionItem = CharacterInventoryItemBase & {
  kind: 'ammunition'
  ammoFamily?: string
  compatibleWeaponTypeIds?: string[]
  consumePerUse?: number
}

export type CharacterConsumableItem = CharacterInventoryItemBase & {
  kind: 'consumable'
  useMode: ConsumableUseMode
  effectText?: string
}

export type CharacterGeneralItem = CharacterInventoryItemBase & { kind: 'general' }

export type CharacterInventoryItem =
  | CharacterWeaponItem
  | CharacterArmourItem
  | CharacterGoldItem
  | CharacterAmmunitionItem
  | CharacterConsumableItem
  | CharacterGeneralItem

export type CharacterSheetDetails = {
  abilityScores: Record<string, string>
  rolledAbilityScores: Record<string, string> | null
  abilityScoresRolled: boolean
  hpBaseRoll: number | null
  inventory: CharacterInventoryItem[]
  // Legacy fields (optional, used by migrateToInventory on first load)
  equippedItems?: string[]
  packedItems?: string[]
  weapons?: CharacterWeaponRow[]
  armour?: CharacterArmourRow[]
  storeGoldSlotIndices?: number[]
  thaco: string
  saveScores: Record<string, string> | null
  adventureScores: Record<string, string> | null
  adventureSeedClass: string
  thiefSkills: Record<string, string> | null
  acManualOverride: boolean
  startingGold: number | null
  storeSpent: number
  storeCart: CharacterStoreCartEntry[]
  alignment: string
  title: string
}

export type CharacterRecord = {
  id: string
  name: string
  ownerUserId: string
  ownerUsername?: string | null
  creationMode: 'new' | 'established'
  creationModeExplicit: boolean
  creationStatus: 'draft' | 'active'
  className: string
  level: number
  hpCurrent: number
  hpMax: number
  ac: number
  xp: number
  portraitUrl: string | null
  portraitFocusX: number
  portraitFocusY: number
  tokenIcon: TokenIconConfig
  details?: CharacterSheetDetails | null
}
