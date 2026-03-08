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
  kind: 'general' | 'weapon' | 'ammunition' | 'armour' | 'custom'
  weaponId?: string
  armourId?: string
  packedLabel?: string
}

type CharacterInventoryItemBase = {
  id: string
  name: string
  kind: 'weapon' | 'armour' | 'ammunition' | 'general' | 'gold' | 'custom'
  costGp: number
  equipped: boolean
  notes: string
}

export type CharacterWeaponItem = CharacterInventoryItemBase & {
  kind: 'weapon'
  weaponId: string
  isMagic: boolean
  damageDiceCount: string
  damageDiceSides: string
  bonus: string
  rangeShort: string
  rangeMedium: string
  rangeLong: string
  twoHanded: boolean
}

export type CharacterArmourItem = CharacterInventoryItemBase & {
  kind: 'armour'
  armourId: string
  isMagic: boolean
  ac: string
  bonus: string
}

export type CharacterGoldItem = CharacterInventoryItemBase & {
  kind: 'gold'
  amount: number
}

export type CharacterAmmunitionItem = CharacterInventoryItemBase & {
  kind: 'ammunition'
  qty: number
}

export type CharacterGeneralItem = CharacterInventoryItemBase & { kind: 'general' }
export type CharacterCustomItem = CharacterInventoryItemBase & { kind: 'custom' }

export type CharacterInventoryItem =
  | CharacterWeaponItem
  | CharacterArmourItem
  | CharacterGoldItem
  | CharacterAmmunitionItem
  | CharacterGeneralItem
  | CharacterCustomItem

export type CharacterSheetDetails = {
  abilityScores: Record<string, string>
  rolledAbilityScores: Record<string, string> | null
  abilityScoresRolled: boolean
  hpBaseRoll: number | null
  inventory: CharacterInventoryItem[]
  // Legacy fields (optional for migration)
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
