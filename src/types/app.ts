export type Role = 'gm' | 'player'

// --- Session notes types ---

export type SessionScene = {
  name: string
  summary: string
  details: string[]
}

export type SessionNpcMention = {
  npcKey: string
  name: string
  title: string
  action: 'new' | 'update'
  facts: string[]
  linkedNpcId: string | null
}

export type SessionCalendarEntry = {
  key: string
  action: 'new' | 'update'
  label: string
  dayComplete: boolean
  entries: string[]
}

export type SessionNoteGeneratedSnapshot = {
  title: string
  summaryMarkdown: string
  overallSummary: string
  scenes: SessionScene[]
  npcMentions: SessionNpcMention[]
  cliffhangers: string[]
  calendar: SessionCalendarEntry[]
}

export type SessionNote = {
  id: string
  title: string
  sessionNumber: number | null
  sourceType: 'api' | 'manual'
  createdAt: unknown
  updatedAt: unknown
  summaryMarkdown: string
  overallSummary: string
  scenes: SessionScene[]
  npcMentions: SessionNpcMention[]
  cliffhangers: string[]
  calendar: SessionCalendarEntry[]
  generatedSnapshot: SessionNoteGeneratedSnapshot | null
  hasHumanEdits: boolean
  editedAt: unknown
  editedBy: string | null
}

export type AppTab = 'character' | 'maps' | 'monsters' | 'items' | 'npcs' | 'tables' | 'notes' | 'calendar' | 'rules'

// --- Tables system types ---

export type TableQty =
  | { fixed: number }
  | { count: number; sides: number; modifier?: number }

export type TableBlock =
  | { type: 'monster'; monsterId: string; qty?: TableQty }
  | { type: 'npc'; npcId: string; qty?: TableQty }
  | { type: 'item'; itemId: string; qty?: TableQty }
  | { type: 'table'; tableId: string }
  | { type: 'text'; content: string }

export type TableRow = {
  rangeMin: number
  rangeMax: number
  blocks: TableBlock[]
}

export type TableRecord = {
  id: string
  name: string
  tags: string[]
  dice: { count: number; sides: number }
  rows: TableRow[]
  createdAt: unknown
  updatedAt: unknown
}

export type CoinDenomination = 'cp' | 'sp' | 'ep' | 'gp' | 'pp'

export type ResolvedBlock =
  | { type: 'monster'; monsterId: string; resolvedQty: number }
  | { type: 'npc'; npcId: string; resolvedQty: number }
  | { type: 'item'; itemId: string; resolvedQty: number }
  | { type: 'table'; tableId: string }
  | { type: 'text'; content: string }
  | { type: 'coins'; denomination: CoinDenomination; amount: number }
  | { type: 'treasure'; subtype: 'gem' | 'jewellery'; gpValue: number; description?: string }
  | { type: 'magicItem'; category: string; name: string; catalogRef?: string }

export type RollStep = {
  tableId: string
  tableName: string
  rollValue: number
  resolvedBlocks: ResolvedBlock[]
}

export type RollHistoryEntry = {
  id: string
  timestamp: unknown
  steps: RollStep[]
  complete: boolean
}

export type Campaign = {
  id: string
  name: string
  status: string
  groupId?: string | null
  slug?: string
  system?: string
  gmUserId?: string | null
  enabledTabs?: AppTab[]
  theme?: string
}

export type GroupMemberRole = 'member' | 'admin'

export type InviteCode = {
  token: string
  groupId: string
  groupName: string
  createdBy: string
  createdByName: string
  createdAt: number
  expiresAt: number
  redeemedBy: string | null
  redeemedAt: number | null
  revoked: boolean
}

export type GroupRecord = {
  id: string
  name: string
  slug: string
  activeCampaignId: string | null
  activeCampaign: Campaign | null
  drafts: Campaign[]
  inactiveCampaigns: Campaign[]
  memberRole: GroupMemberRole
  source: 'legacy' | 'group'
}

export type TokenIconConfig = {
  icon: 'pawn' | 'custom'
  color: string
  size: number
  customImagePath?: string
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

export type ItemKind = 'weapon' | 'armour' | 'ammunition' | 'consumable' | 'general' | 'gold' | 'treasure'
export type GlobalItemAction = 'equip' | 'unequip' | 'drop' | 'give' | 'sell'
export type ConsumableUseMode = 'consume' | 'use'
export type StackPolicy =
  | { stackable: false }
  | { stackable: true; maxStack: number }

export type WeaponEffectTrigger = 'passive' | 'on_hit' | 'on_crit' | 'versus_target'
export type WeaponEffectConditionType = 'none' | 'alignment' | 'armour_state' | 'creature_type' | 'custom'
export type WeaponEffectOutcomeType =
  | 'attack_bonus'
  | 'damage_bonus'
  | 'replace_damage'
  | 'extra_damage'
  | 'roll_table'
  | 'grant_trait'
  | 'show_text'

export type WeaponEffect = {
  id: string
  trigger: WeaponEffectTrigger
  conditionType: WeaponEffectConditionType
  conditionValues: string[]
  outcomeType: WeaponEffectOutcomeType
  outcomeValue: string
  notes: string
}

export type WeaponRollTableEntry = {
  id: string
  roll: string
  text: string
}

export type WeaponRollTable = {
  id: string
  name: string
  dieSides: string
  entries: WeaponRollTableEntry[]
}

// --- Campaign item (GM-authored template) ---

export type CampaignItemType = 'weapon' | 'armour' | 'ammunition' | 'consumable' | 'general' | 'gold' | 'treasure'

export type CampaignItem = {
  id: string
  name: string
  type: CampaignItemType
  typeId: string
  typeName: string
  status: 'authored' | 'dropped'
  droppedByCharacterId?: string
  droppedByCharacterName?: string
  portraitPath?: string
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
    slow: boolean
    twoHanded: boolean
  }
  weaponEffects: WeaponEffect[]
  weaponRollTables: WeaponRollTable[]
  armourStats: { armourClass: string; shieldMod: string; magicMod: string; armourType: 'body' | 'shield' }
  consumableStats: { useMode: ConsumableUseMode; effectText: string }
  specialRule: string
  notes: string
  goldAmount?: number
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
  portraitPath?: string
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
  slow: boolean
  twoHanded: boolean
  weaponEffects?: WeaponEffect[]
  weaponRollTables?: WeaponRollTable[]
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
  spent?: number
}

export type CharacterConsumableItem = CharacterInventoryItemBase & {
  kind: 'consumable'
  useMode?: ConsumableUseMode
  effectText?: string
  lit?: boolean
  turnsRemaining?: number
  amountRemaining?: number
}

export type CharacterGeneralItem = CharacterInventoryItemBase & {
  kind: 'general'
  lit?: boolean
  turnsRemaining?: number
}

export type CharacterTreasureItem = CharacterInventoryItemBase & {
  kind: 'treasure'
}

export type CharacterSpell = {
  id: string
  name: string
  level: number
  description: string
  rangeText?: string
  durationText?: string
  targetText?: string
  areaText?: string
  savingThrowText?: string
  reversible?: boolean
  tags?: string[]
  mechanics?: {
    durationRounds?: number
    durationTurns?: number
    durationText?: string
    saveType?: string
  }
}

export type CharacterInventoryItem =
  | CharacterWeaponItem
  | CharacterArmourItem
  | CharacterGoldItem
  | CharacterAmmunitionItem
  | CharacterConsumableItem
  | CharacterGeneralItem
  | CharacterTreasureItem

export type TransferableInventoryItem = Exclude<CharacterInventoryItem, CharacterGoldItem>

export type PendingTransfer = {
  id: string
  itemSnapshot: TransferableInventoryItem
  itemId: string
  itemKind: Exclude<ItemKind, 'gold'>
  itemName: string
  fromCharacterId: string
  fromCharacterName: string
  fromUserId: string
  toCharacterId: string
  toCharacterName: string
  toUserId: string
  createdAt: unknown
}

export type NpcRecord = {
  id: string
  name: string
  title: string
  visibleToPlayers: boolean
  tags: string[]
  portraitPath?: string
  portraitUrl: string | null
  portraitFocusX: number
  portraitFocusY: number
  tokenIcon: TokenIconConfig
  playerDescription: string
  playerNotes: string
}

export type NpcPrivateRecord = {
  id: string
  gmNotes: string
}

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
  startingGold: number | null
  storeSpent: number
  storeCart: CharacterStoreCartEntry[]
  spellBookSpellIds?: string[]
  memorizedSpellIds?: string[]
  alignment: string
  title: string
  languagesText?: string
  unencumberingItemsText?: string
  otherNotesText?: string
}

export type ItemApprovalAction = 'create' | 'sell' | 'learn_spell' | 'ability_reroll'

export type ItemApprovalRequest = {
  id: string
  action: ItemApprovalAction
  campaignId: string
  characterId: string
  characterName: string
  requestedByUserId: string
  requestedByUsername: string
  item?: CharacterInventoryItem
  spellIds?: string[]
  spellNames?: string[]
  status: 'pending' | 'approved' | 'rejected'
  createdAt: unknown
  resolvedAt?: unknown
}

export type CharacterRecord = {
  id: string
  name: string
  ownerUserId: string
  ownerUsername?: string | null
  creationMode: 'new' | 'established'
  creationModeExplicit: boolean
  creationStatus: 'draft' | 'established_draft' | 'active'
  className: string
  level: number
  hpCurrent: number
  hpMax: number
  ac: number
  xp: number
  portraitPath?: string
  portraitUrl: string | null
  portraitFocusX: number
  portraitFocusY: number
  tokenIcon: TokenIconConfig
  details?: CharacterSheetDetails | null
}
