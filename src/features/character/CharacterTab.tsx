import { Fragment, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, ChevronLeft, Plus, ShoppingBag, Sparkles, Star, X } from 'lucide-react'
import { doc, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import type {
  CampaignItem,
  CharacterRecord,
  CharacterSpell,
  CharacterSheetDetails,
  CharacterStoreCartEntry as StoreCartEntry,
  CharacterInventoryItem,
  CharacterWeaponItem,
  CharacterArmourItem,
  CharacterGoldItem,
  CharacterConsumableItem,
  Role,
} from '../../types/app'
import { DEFAULT_STACK_POLICY } from '../items/itemDefaults'
import { campaignItemToInventoryItem } from '../items/itemConversion'
import { useItems } from '../items/useItems'
import { useItemApprovals } from './useItemApprovals'
import { EntityMediaEditor } from '../common/EntityMediaEditor'
import { ConfirmModal } from '../common/ConfirmModal'
import { OSE_WEAPON_CATALOG, weaponCatalogById } from './weaponCatalog'
import { OSE_ARMOUR_CATALOG, armourCatalogById } from './armourCatalog'
import { OSE_GENERAL_CATALOG, generalCatalogById } from './generalCatalog'
import { OSE_AMMO_CATALOG, ammoCatalogById } from './ammoCatalog'
import { OSE_CONSUMABLE_CATALOG, consumableCatalogById } from './consumableCatalog'
import { OSE_STORE_ITEMS, STORE_CATEGORY_LABELS } from './storeCatalog'
import {
  ARCANE_SPELL_CATALOG,
  DIVINE_SPELL_CATALOG,
  SPELL_BOOK_TYPE_ID,
  arcaneSpellById,
} from './spellCatalog'
import type { StoreCategoryId } from './storeCatalog'
import {
  type AbilityCode,
  type AbilityScores,
  type SaveScores,
  type AdventureScores,
  type ThiefSkillScores,
  emptyAbilityScores,
  loweringCandidateCodes,
  adventureDefaultsByClass,
  defaultThiefSkills,
  abilityModifier,
  formatModifier,
  conModifierByScore,
  formatTableModifier,
  openStuckDoorByStr,
  meleeModifierByStr,
  dexAcModByDex,
  dexMissileModByDex,
  wisMagicSaveModifierByScore,
  primeRequisiteCodesForClass,
  clampInSix,
  saveScoresForClassLevel,
  thacoForClassLevel,
  classHitDieByClass,
} from './characterRules'
import {
  resolveArmourType,
  applyWeaponTemplateToItem,
  applyArmourTemplateToItem,
  isWeaponTemplateAllowedForClass,
  isArmourTemplateAllowedForClass,
  parseDamageDice,
  parseRangeBands,
  parseArmourTemplateValues,
  armourTypeFromTemplateId,
} from './inventoryRules'
import { makeId, makeWeaponItem, makeArmourItem } from './characterFactories'
import { computeAvailablePackedSlots, computeOverflow, goldChunksForAmount, makeGoldItem } from './inventoryOverflow'
import { useResponsiveCharacterLayout } from './useResponsiveCharacterLayout'
import { useCharacterPersistenceSync } from './useCharacterPersistenceSync'
import { useCharacterCreationFlow } from './useCharacterCreationFlow'
import { useSpellbookDomain } from './useSpellbookDomain'
import { useInventoryDomain } from './useInventoryDomain'
import { useStoreDomain } from './useStoreDomain'
import { CharacterListPane } from './CharacterListPane'
import { computeGrantedXp, nextLevelXpFor, primeRequisiteXpBonusPercent, projectCharacterProgress } from './xpProgression'

type CharacterTabProps = {
  campaignId: string
  currentUserId: string
  currentUsername: string
  role: Role | null
  characters: CharacterRecord[]
  charactersLoading: boolean
  currentCharacterId: string | null
  setCurrentCharacter: (characterId: string) => Promise<void>
  selectedCharacterId: string
  setSelectedCharacterId: (id: string) => void
  selectedCharacter: CharacterRecord | null
  updateCharacter: (characterId: string, updates: Partial<CharacterRecord>) => void
  deleteCharacter: (characterId: string) => void
  hasPendingWrite: (id: string) => boolean
}

type AdventureEditableCode = 'FG' | 'FT' | 'HT' | 'LD' | 'SD'
type ThiefSkillCode = 'CS' | 'TR' | 'HN' | 'HS' | 'MS' | 'OL' | 'PP' | 'RL'
type GrantTemplateEntry = {
  key: string
  name: string
  costGp: number
  qty: number
  kind: 'general' | 'weapon' | 'ammunition' | 'armour' | 'consumable'
  weaponId?: string
  armourId?: string
  packedLabel?: string
}
type ClassFeature = {
  id: string
  name: string
  unlockedAt: number
  summary: string
  summaryLinks?: Array<{
    word: string
    url: string
  }>
}


const abilityRows = [
  { code: 'STR', note: 'Melee atk./dmg., open doors' },
  { code: 'INT', note: 'Languages, literacy' },
  { code: 'WIS', note: 'Saves vs magic' },
  { code: 'DEX', note: 'Missile atk., AC, initiative' },
  { code: 'CON', note: 'Hit points' },
  { code: 'CHA', note: 'Reactions, retainers, loyalty' },
]

const saveRows = [
  { code: 'D', note: 'Death, poison' },
  { code: 'W', note: 'Magic wands' },
  { code: 'P', note: 'Paralysis, petrification' },
  { code: 'B', note: 'Breath attacks' },
  { code: 'S', note: 'Spells, rods, staves' },
  { code: '±', note: 'WIS mod to saves vs magic' },
]

const adventureRows = [
  { code: 'FG', note: 'Forage in the wild' },
  { code: 'FT', note: 'Find room trap' },
  { code: 'HT', note: 'Hunt in the wild' },
  { code: 'LD', note: 'Listen at door' },
  { code: 'OD', note: 'Open stuck door' },
  { code: 'SD', note: 'Find secret door' },
]
const thiefSkillRows: { code: ThiefSkillCode; note: string }[] = [
  { code: 'CS', note: 'Climb sheer surfaces' },
  { code: 'TR', note: 'Find/remove treasure traps' },
  { code: 'HN', note: 'Hear noise' },
  { code: 'HS', note: 'Hide in shadows' },
  { code: 'MS', note: 'Move silently' },
  { code: 'OL', note: 'Open locks' },
  { code: 'PP', note: 'Pick pockets' },
  { code: 'RL', note: 'Read languages' },
]

const classOptions = [
  '-',
  'Cleric',
  'Dwarf',
  'Elf',
  'Fighter',
  'Halfling',
  'Magic-User',
  'Thief',
]
const classFeaturesByClass: Record<string, ClassFeature[]> = {
  Cleric: [
    { id: 'turn-undead', name: 'Turn Undead', unlockedAt: 1, summary: 'Attempt to repel or destroy undead (2d6 turn roll; may turn or destroy).' },
    { id: 'use-divine-items', name: 'Use Divine Magic Items', unlockedAt: 2, summary: 'Can use cleric scrolls and items restricted to divine spellcasters.' },
    {
      id: 'magical-research',
      name: 'Magical Research',
      unlockedAt: 1,
      summary: 'May research new divine spells or deity-related magical effects.',
      summaryLinks: [
        {
          word: 'research',
          url: 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Magical_Research',
        },
      ],
    },
    { id: 'religious-obligation', name: 'Religious Obligation', unlockedAt: 1, summary: 'Must remain faithful to deity/alignment tenets to avoid penalties.' },
    {
      id: 'divine-spellcasting',
      name: 'Divine Spellcasting',
      unlockedAt: 2,
      summary: 'Begins at level 2; memorizes cleric spells. Requires a holy symbol to use divine powers.',
      summaryLinks: [
        {
          word: 'cleric spells',
          url: 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Cleric_Spells',
        },
        {
          word: 'holy symbol',
          url: 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Adventuring_Gear',
        },
      ],
    },
    { id: 'create-magic-items', name: 'Create Magic Items', unlockedAt: 9, summary: 'Can create magic items starting at level 9.' },
    { id: 'establish-stronghold', name: 'Establish Stronghold', unlockedAt: 9, summary: 'May build a temple/stronghold; favored deity may reduce costs and grant followers.' },
  ],
  Dwarf: [
    {
      id: 'infravision',
      name: 'Infravision',
      unlockedAt: 1,
      summary: 'Can see in darkness up to 60 feet.',
    },
  ],
  Elf: [
    {
      id: 'arcane-spellcasting',
      name: 'Arcane Spellcasting',
      unlockedAt: 1,
      summary: 'Casts arcane spells from the magic-user spell list. Uses a spell book to memorize spells.',
      summaryLinks: [
        {
          word: 'magic-user spell list',
          url: 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Magic-User_Spells',
        },
        {
          word: 'spells',
          url: 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Spells',
        },
      ],
    },
    {
      id: 'magical-research',
      name: 'Magical Research',
      unlockedAt: 1,
      summary: 'May perform arcane magical research at any level.',
      summaryLinks: [
        {
          word: 'research',
          url: 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Magical_Research',
        },
      ],
    },
    {
      id: 'use-arcane-items',
      name: 'Use Arcane Magic Items',
      unlockedAt: 1,
      summary: 'May use arcane scrolls and magic wands.',
    },
    {
      id: 'infravision',
      name: 'Infravision',
      unlockedAt: 1,
      summary: 'Can see in darkness up to 60 feet.',
    },
    {
      id: 'ghoul-paralysis-immunity',
      name: 'Immunity to Ghoul Paralysis',
      unlockedAt: 1,
      summary: 'Completely immune to the paralysis caused by ghouls.',
    },
  ],
  Fighter: [
    {
      id: 'stronghold',
      name: 'Stronghold',
      unlockedAt: 1,
      summary: 'Any time a fighter wishes (and has sufficient money), they can build a castle or stronghold and control the surrounding lands.',
      summaryLinks: [
        {
          word: 'build',
          url: 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Construction',
        },
        {
          word: 'castle or stronghold',
          url: 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Structures',
        },
        {
          word: 'control the surrounding lands',
          url: 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Domain_Management',
        },
      ],
    },
  ],
  Halfling: [
    {
      id: 'defensive-bonus',
      name: 'Defensive Bonus',
      unlockedAt: 1,
      summary: '+2 AC vs large opponents (creatures larger than human-sized).',
    },
    {
      id: 'hiding',
      name: 'Hiding',
      unlockedAt: 1,
      summary: '90% chance to hide in woods or undergrowth. 2-in-6 chance to hide in dungeons with cover if motionless and silent.',
    },
    {
      id: 'missile-attack-bonus',
      name: 'Missile Attack Bonus',
      unlockedAt: 1,
      summary: '+1 to attack rolls with all missile weapons.',
    },
    {
      id: 'stronghold',
      name: 'Stronghold',
      unlockedAt: 1,
      summary: 'May build a halfling community (shire) when they have sufficient money. The leader of the community is called the Sheriff.',
    },
  ],
  'Magic-User': [
    {
      id: 'arcane-spellcasting',
      name: 'Arcane Spellcasting',
      unlockedAt: 1,
      summary: 'Casts arcane spells from the magic-user spell list. Uses a spell book to memorize spells. Begins play with one spell in the spell book.',
    },
    {
      id: 'magical-research',
      name: 'Magical Research',
      unlockedAt: 1,
      summary: 'May conduct magical research at any level to invent spells or magical effects.',
    },
    {
      id: 'use-arcane-items',
      name: 'Use Arcane Magic Items',
      unlockedAt: 1,
      summary: 'May use scrolls of spells on the magic-user spell list. May use items restricted to arcane spellcasters (e.g., wands).',
    },
    {
      id: 'weapon-armour-restriction',
      name: 'Weapon and Armour Restriction',
      unlockedAt: 1,
      summary: 'May use daggers only. Cannot wear armour or use shields.',
    },
  ],
  Thief: [
    {
      id: 'back-stab',
      name: 'Back-stab',
      unlockedAt: 1,
      summary: 'When attacking an unaware opponent from behind, a thief receives a +4 bonus to hit and doubles any damage dealt.',
    },
    {
      id: 'combat',
      name: 'Combat',
      unlockedAt: 1,
      summary: 'Valuing stealth above all, thieves can only wear leather armour and cannot use shields. They can use any weapon.',
    },
    {
      id: 'read-languages',
      name: 'Read Languages',
      unlockedAt: 4,
      summary: 'A thief of 4th level or higher can read non-magical text in any language (including dead languages and basic codes) with 80% probability. If the roll fails, the thief may not try to read the same text again before gaining an experience level.',
    },
    {
      id: 'thief-skills',
      name: 'Thief Skills',
      unlockedAt: 1,
      summary: 'See the Thief Skills section for the skill breakdown and apply points.',
    },
  ],
}

const levelUpFlavorByClass: Record<string, string> = {
  Cleric: 'Your faith deepens, and divine authority grows with your experience.',
  Dwarf: 'Your hard-earned craft and battle discipline make you even tougher underground.',
  Elf: 'Your ancient training sharpens both steel and spell.',
  Fighter: 'Your battlefield instincts sharpen, and your martial edge grows deadlier.',
  Halfling: 'Your luck and precision carry you safely through impossible danger.',
  'Magic-User': 'Arcane patterns become clearer as your command of magic expands.',
  Thief: 'Your timing, nerve, and finesse improve with every risky score.',
}

const levelUpChecklistForClass = (className: string, hitDie: number | null): string[] => {
  const steps = [`Roll 1d${hitDie ?? '?'} for hit points and add that to your HP total.`]
  if (className === 'Cleric') {
    steps.push('Review your cleric spell access and update what is memorized for the day.')
    return steps
  }
  if (className === 'Magic-User') {
    steps.push('Review spell slots and adjust memorized spells for your new level.')
    steps.push('Check your spell book for what can now be prepared or transcribed.')
    return steps
  }
  if (className === 'Thief') {
    steps.push('Review thief skills and assign any newly available progression points.')
    return steps
  }
  if (className === 'Fighter') {
    steps.push('Review attack profile and class combat benefits unlocked at this level.')
    return steps
  }
  if (className === 'Dwarf' || className === 'Elf' || className === 'Halfling') {
    steps.push('Review race-class abilities that scale with level and update sheet details.')
    return steps
  }
  return steps
}

const alignmentOptions = ['Law', 'Neutrality', 'Chaos']
const packedSlotThresholds = [18, 16, 13, 9, 6, 4]
const packedSlotLabels = ['STR 18+', 'STR 16+', 'STR 13+', 'STR 9+', 'STR 6+', 'STR 4+']
const equippedRowCount = 9
const packedStrengthSlotCount = packedSlotLabels.length
const packedMovementBands = [
  { label: "120' (40')", slotCount: 7, baseMove: 120 },
  { label: "90' (30')", slotCount: 2, baseMove: 90 },
  { label: "60' (20')", slotCount: 2, baseMove: 60 },
  { label: "30' (10')", slotCount: 2, baseMove: 30 },
]
const packedRowCount = packedStrengthSlotCount + packedMovementBands.reduce((sum, band) => sum + band.slotCount, 0)
const defaultTokenIcon = {
  icon: 'pawn' as const,
  color: '#bf2f2a',
  size: 34,
}

const renderSpellDescriptionBody = (spell: CharacterSpell): ReactNode[] => {
  const lines = spell.description
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const blocks: ReactNode[] = []
  let bulletBuffer: string[] = []
  let key = 0

  const flushBullets = () => {
    if (bulletBuffer.length === 0) return
    const bullets = bulletBuffer
    bulletBuffer = []
    blocks.push(
      <ul key={`spell-detail-bullets-${key++}`} className="character-spell-detail-list">
        {bullets.map((bullet, index) => (
          <li key={`spell-detail-bullet-${index}`}>{bullet}</li>
        ))}
      </ul>,
    )
  }

  for (const line of lines) {
    if (line.startsWith('- ')) {
      bulletBuffer.push(line.slice(2).trim())
      continue
    }
    flushBullets()
    blocks.push(
      <p key={`spell-detail-paragraph-${key++}`} className="character-spell-detail-paragraph">
        {line}
      </p>,
    )
  }
  flushBullets()
  return blocks
}


const migrateToInventory = (details: CharacterSheetDetails): CharacterInventoryItem[] => {
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



export function CharacterTab({
  campaignId,
  currentUserId,
  currentUsername,
  role,
  characters,
  charactersLoading,
  currentCharacterId,
  setCurrentCharacter,
  selectedCharacterId,
  setSelectedCharacterId,
  selectedCharacter,
  updateCharacter,
  deleteCharacter,
  hasPendingWrite,
}: CharacterTabProps) {
  const {
    isMobile, setMobileCharacterView,
    activePage, setActivePage,
    showListPane, showDetailPane,
    isIntermediateMobileLayout, useIntermediateLayout,
  } = useResponsiveCharacterLayout()
  const [abilityScoresByCharacterId, setAbilityScoresByCharacterId] = useState<Record<string, AbilityScores>>({})
  const [rolledAbilityScoresByCharacterId, setRolledAbilityScoresByCharacterId] = useState<Record<string, AbilityScores>>({})
  const [abilityScoresRolledByCharacterId, setAbilityScoresRolledByCharacterId] = useState<Record<string, boolean>>({})
  const [hpBaseRollByCharacterId, setHpBaseRollByCharacterId] = useState<Record<string, number>>({})
  const [inventoryByCharacterId, setInventoryByCharacterId] = useState<Record<string, CharacterInventoryItem[]>>({})
  const [spellBookSpellIdsByCharacterId, setSpellBookSpellIdsByCharacterId] = useState<Record<string, string[]>>({})
  const [memorizedSpellIdsByCharacterId, setMemorizedSpellIdsByCharacterId] = useState<Record<string, string[]>>({})
  const [thacoByCharacterId, setThacoByCharacterId] = useState<Record<string, string>>({})
  const [saveScoresByCharacterId, setSaveScoresByCharacterId] = useState<Record<string, SaveScores>>({})
  const [adventureScoresByCharacterId, setAdventureScoresByCharacterId] = useState<Record<string, AdventureScores>>({})
  const [adventureSeedClassByCharacterId, setAdventureSeedClassByCharacterId] = useState<Record<string, string>>({})
  const [thiefSkillsByCharacterId, setThiefSkillsByCharacterId] = useState<Record<string, ThiefSkillScores>>({})
  const [acManualOverrideByCharacterId, setAcManualOverrideByCharacterId] = useState<Record<string, boolean>>({})
  const [createCharacterModalOpen, setCreateCharacterModalOpen] = useState(false)
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false)
  const [finalizeError, setFinalizeError] = useState<string | null>(null)
  const [holySymbolRequiredOpen, setHolySymbolRequiredOpen] = useState(false)
  const [storeOpen, setStoreOpen] = useState(false)
  const [storeCloseConfirmOpen, setStoreCloseConfirmOpen] = useState(false)
  const [storeCategory, setStoreCategory] = useState<StoreCategoryId>('adventuring')
  const [storeError, setStoreError] = useState<string | null>(null)
  const [startingGoldByCharacterId, setStartingGoldByCharacterId] = useState<Record<string, number>>({})
  const [storeSpentByCharacterId, setStoreSpentByCharacterId] = useState<Record<string, number>>({})
  const [storeCartByCharacterId, setStoreCartByCharacterId] = useState<Record<string, StoreCartEntry[]>>({})
  const [customStoreName, setCustomStoreName] = useState('')
  const [customStoreCost, setCustomStoreCost] = useState('')
  const [customStoreDescription, setCustomStoreDescription] = useState('')
  const [storeClassRequiredOpen, setStoreClassRequiredOpen] = useState(false)
  const [reallocationClassRequiredOpen, setReallocationClassRequiredOpen] = useState(false)
  const [hpClassRequiredOpen, setHpClassRequiredOpen] = useState(false)
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ id: string, name: string } | null>(null)
  const [itemDetailId, setItemDetailId] = useState<string | null>(null)
  const [addItemModal, setAddItemModal] = useState<{
    equipped: boolean
    kind: 'general' | 'weapon' | 'armour' | 'ammunition' | 'consumable'
    typeName: string
    name: string
    costGp: string
    notes: string
    description: string
    typeId: string
    damageDiceCount: string
    damageDiceSides: string
    rangeShort: string
    rangeMedium: string
    rangeLong: string
    twoHanded: boolean
    isMagic: boolean
    attackBonus: string
    damageBonus: string
    armourClass: string
    shieldMod: string
    magicMod: string
    armourType: 'body' | 'shield'
    qty: string
    useMode: 'consume' | 'use'
    effectText: string
  } | null>(null)
  const [dropConfirmItemId, setDropConfirmItemId] = useState<string | null>(null)
  const [sellConfirmItemId, setSellConfirmItemId] = useState<string | null>(null)
  const [goldSpendAmount, setGoldSpendAmount] = useState<string>('')
  const [goldSpendConfirmAmount, setGoldSpendConfirmAmount] = useState<number | null>(null)
  const [overflowFeedback, setOverflowFeedback] = useState<string | null>(null)
  const [overflowWriting, setOverflowWriting] = useState(false)
  const [alignmentByCharacterId, setAlignmentByCharacterId] = useState<Record<string, string>>({})
  const [titleByCharacterId, setTitleByCharacterId] = useState<Record<string, string>>({})
  const [grantMode, setGrantMode] = useState(false)
  const [grantTargetIds, setGrantTargetIds] = useState<Record<string, boolean>>({})
  const [grantXpBase, setGrantXpBase] = useState('')
  const [grantXpSplitBetweenTargets, setGrantXpSplitBetweenTargets] = useState(false)
  const [grantGoldGp, setGrantGoldGp] = useState('')
  const [grantGoldSplitBetweenTargets, setGrantGoldSplitBetweenTargets] = useState(false)
  const [grantNote, setGrantNote] = useState('')
  const [grantCampaignItemId, setGrantCampaignItemId] = useState('')
  const [grantCampaignEntries, setGrantCampaignEntries] = useState<Array<{ itemId: string; name: string; qty: number }>>([])
  const [grantTemplateItemId, setGrantTemplateItemId] = useState('')
  const [grantTemplateEntries, setGrantTemplateEntries] = useState<GrantTemplateEntry[]>([])
  const [grantBusy, setGrantBusy] = useState(false)
  const [grantFeedback, setGrantFeedback] = useState<string | null>(null)
  const [levelUpModalOpen, setLevelUpModalOpen] = useState(false)
  const [levelUpHpRoll, setLevelUpHpRoll] = useState<number | null>(null)
  const [levelUpApplying, setLevelUpApplying] = useState(false)
  const [levelUpError, setLevelUpError] = useState<string | null>(null)

  const { rejections, submitRequest, submitSpellLearnRequest, dismissRejection } = useItemApprovals(campaignId, role, currentUserId)
  const { items: campaignItems } = useItems(campaignId)
  const [approvalPendingFeedback, setApprovalPendingFeedback] = useState<string | null>(null)

  // Auto-clear approval pending feedback after 5 seconds
  useEffect(() => {
    if (!approvalPendingFeedback) return
    const timer = setTimeout(() => setApprovalPendingFeedback(null), 5000)
    return () => clearTimeout(timer)
  }, [approvalPendingFeedback])

  const { seededCharacterIdsRef, justSeededRef, lastPersistedDetailsJsonRef } = useCharacterPersistenceSync({
    selectedCharacterId,
    characters,
    hasPendingWrite,
    updateCharacter,
    migrateToInventory,
    stateMaps: {
      abilityScoresByCharacterId,
      rolledAbilityScoresByCharacterId,
      abilityScoresRolledByCharacterId,
      hpBaseRollByCharacterId,
      inventoryByCharacterId,
      spellBookSpellIdsByCharacterId,
      memorizedSpellIdsByCharacterId,
      thacoByCharacterId,
      saveScoresByCharacterId,
      adventureScoresByCharacterId,
      adventureSeedClassByCharacterId,
      thiefSkillsByCharacterId,
      acManualOverrideByCharacterId,
      startingGoldByCharacterId,
      storeSpentByCharacterId,
      storeCartByCharacterId,
      alignmentByCharacterId,
      titleByCharacterId,
    },
    stateSetters: {
      setAbilityScoresByCharacterId,
      setRolledAbilityScoresByCharacterId,
      setAbilityScoresRolledByCharacterId,
      setHpBaseRollByCharacterId,
      setInventoryByCharacterId,
      setSpellBookSpellIdsByCharacterId,
      setMemorizedSpellIdsByCharacterId,
      setThacoByCharacterId,
      setSaveScoresByCharacterId,
      setAdventureScoresByCharacterId,
      setAdventureSeedClassByCharacterId,
      setThiefSkillsByCharacterId,
      setAcManualOverrideByCharacterId,
      setStartingGoldByCharacterId,
      setStoreSpentByCharacterId,
      setStoreCartByCharacterId,
      setAlignmentByCharacterId,
      setTitleByCharacterId,
    },
  })

  // Auto-clear overflow feedback after 5 seconds
  useEffect(() => {
    if (!overflowFeedback) return
    const timer = setTimeout(() => setOverflowFeedback(null), 5000)
    return () => clearTimeout(timer)
  }, [overflowFeedback])

  const sortedCharacters = useMemo(
    () => [...characters].sort((a, b) => a.name.localeCompare(b.name)),
    [characters],
  )
  const authoredCampaignItems = useMemo(
    () => campaignItems.filter((item) => item.status === 'authored'),
    [campaignItems],
  )
  const grantTemplateSelectable = useMemo(
    () => OSE_STORE_ITEMS.filter((item) =>
      item.kind === 'general' || item.kind === 'weapon' || item.kind === 'armour' || item.kind === 'ammunition' || item.kind === 'consumable',
    ),
    [],
  )
  const selectedGrantTargetIds = useMemo(
    () => sortedCharacters.filter((c) => grantTargetIds[c.id]).map((c) => c.id),
    [sortedCharacters, grantTargetIds],
  )
  const parsedGrantBaseXp = Math.max(0, Number.parseInt(grantXpBase, 10) || 0)
  const parsedGrantGoldGp = Math.max(0, Number.parseInt(grantGoldGp, 10) || 0)

  const effectiveSelected =
    selectedCharacter ?? sortedCharacters.find((character) => character.id === selectedCharacterId) ?? null

  useEffect(() => {
    setLevelUpModalOpen(false)
    setLevelUpHpRoll(null)
    setLevelUpError(null)
  }, [effectiveSelected?.id])

  useEffect(() => {
    if (sortedCharacters.length === 0) return
    if (!effectiveSelected) {
      setSelectedCharacterId(sortedCharacters[0].id)
    }
  }, [effectiveSelected, setSelectedCharacterId, sortedCharacters])
  const canCreateCharacter = role === 'gm' || role === 'player'
  const canEditSelected = !!effectiveSelected
  const canGrant = role === 'gm'
  const canSetCurrentCharacter = role === 'player'
    && !!effectiveSelected
    && effectiveSelected.ownerUserId === currentUserId
  const canDeleteCharacter = (character: CharacterRecord) => role === 'gm' || character.ownerUserId === currentUserId

  const exitGrantMode = () => {
    setGrantMode(false)
    setGrantTargetIds({})
  }

  const toggleGrantTarget = (characterId: string, checked: boolean) => {
    setGrantTargetIds((current) => ({
      ...current,
      [characterId]: checked,
    }))
  }

  const clearGrantDraft = () => {
    setGrantXpBase('')
    setGrantXpSplitBetweenTargets(false)
    setGrantGoldGp('')
    setGrantGoldSplitBetweenTargets(false)
    setGrantNote('')
    setGrantCampaignEntries([])
    setGrantTemplateEntries([])
    setGrantCampaignItemId('')
    setGrantTemplateItemId('')
  }

  const upsertGrantCampaignEntry = (item: CampaignItem) => {
    setGrantCampaignEntries((current) => {
      const idx = current.findIndex((entry) => entry.itemId === item.id)
      if (idx < 0) return [...current, { itemId: item.id, name: item.typeName || item.name, qty: 1 }]
      const next = [...current]
      next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
      return next
    })
  }

  const upsertGrantTemplateEntry = (itemId: string) => {
    const source = OSE_STORE_ITEMS.find((item) => item.id === itemId)
    if (!source) return
    const kind = source.kind
    if (!(kind === 'general' || kind === 'weapon' || kind === 'armour' || kind === 'ammunition' || kind === 'consumable')) return
    setGrantTemplateEntries((current) => {
      const key = source.id
      const idx = current.findIndex((entry) => entry.key === key)
      if (idx < 0) {
        return [...current, {
          key,
          name: source.name,
          costGp: source.costGp,
          qty: 1,
          kind,
          weaponId: source.weaponId,
          armourId: source.armourId,
          packedLabel: source.name,
        }]
      }
      const next = [...current]
      next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
      return next
    })
  }

  const updateSelectedCharacter = (updates: Partial<CharacterRecord>) => {
    if (!effectiveSelected) return
    updateCharacter(effectiveSelected.id, updates)
  }

  const selectedAbilityScores = effectiveSelected
    ? (abilityScoresByCharacterId[effectiveSelected.id] ?? emptyAbilityScores())
    : emptyAbilityScores()
  const selectedRolledAbilityScores = effectiveSelected
    ? rolledAbilityScoresByCharacterId[effectiveSelected.id] ?? null
    : null
  const hasRolledAbilityScores = !!(effectiveSelected && abilityScoresRolledByCharacterId[effectiveSelected.id])
  const primeRequisiteCodes = primeRequisiteCodesForClass(effectiveSelected?.className ?? '')
  const loweringCodes = loweringCandidateCodes.filter((code) => !primeRequisiteCodes.includes(code))
  const selectedPrimeXpModifierPercent = effectiveSelected
    ? primeRequisiteXpBonusPercent(effectiveSelected.className, selectedAbilityScores)
    : 0
  const selectedNextLevelXp = effectiveSelected
    ? nextLevelXpFor(effectiveSelected.className, effectiveSelected.level)
    : null
  const selectedXpToNextLevel = effectiveSelected && selectedNextLevelXp !== null
    ? Math.max(0, selectedNextLevelXp - effectiveSelected.xp)
    : null
  const primeRequisiteLabel = primeRequisiteCodes.length > 0
    ? primeRequisiteCodes.join('/')
    : '-'
  const selectedStrRaw = selectedAbilityScores.STR
  const selectedDexRaw = selectedAbilityScores.DEX
  const selectedChaRaw = selectedAbilityScores.CHA
  const selectedConRaw = selectedAbilityScores.CON
  const selectedStr = Number.parseInt(selectedStrRaw, 10)
  const selectedDex = Number.parseInt(selectedDexRaw, 10)
  const selectedCha = Number.parseInt(selectedChaRaw, 10)
  const selectedCon = Number.parseInt(selectedConRaw, 10)
  const selectedInventory = effectiveSelected
    ? (inventoryByCharacterId[effectiveSelected.id] ?? [])
    : []
  const selectedGoldTotal = selectedInventory
    .filter((i): i is CharacterGoldItem => i.kind === 'gold')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy data may still have `amount`
    .reduce((sum, g) => sum + (g.qty ?? (g as any).amount ?? 0), 0)
  const parsedGoldSpendAmount = Number.parseInt(goldSpendAmount, 10) || 0
  const selectedWeapons = selectedInventory.filter((i): i is CharacterWeaponItem => i.kind === 'weapon')
  const selectedArmour = selectedInventory.filter((i): i is CharacterArmourItem => i.kind === 'armour')
  const equippedBodyArmour = selectedArmour.find((a) => a.equipped && resolveArmourType(a) === 'body') ?? null
  const equippedShield = selectedArmour.find((a) => a.equipped && resolveArmourType(a) === 'shield') ?? null
  const equippedItems = selectedInventory.filter((i) => i.equipped)
  const packedItems = selectedInventory.filter((i) => !i.equipped)
  const selectedClassName = effectiveSelected?.className ?? '-'
  const selectedLevel = effectiveSelected?.level ?? 1
  const unlockedClassFeatures = (classFeaturesByClass[selectedClassName] ?? [])
    .filter((feature) => selectedLevel >= feature.unlockedAt)
    .sort((a, b) => a.unlockedAt - b.unlockedAt)
  const isGuidedCreation = effectiveSelected?.creationStatus === 'draft'
  const isEstablishedDraft = effectiveSelected?.creationStatus === 'established_draft'
  const isInFinalizationFlow = isGuidedCreation || isEstablishedDraft
  const canEditClassAndAlignment = !!effectiveSelected && canEditSelected && isInFinalizationFlow
  const canMemorizeSpell = !!effectiveSelected && !isInFinalizationFlow
  const requiresSpellLearnApproval = role !== 'gm' && !isInFinalizationFlow
  const requiresApprovalNow = role !== 'gm' && !isEstablishedDraft
  const canEditAbilityScores = !!effectiveSelected
    && canEditSelected
    && (isGuidedCreation || effectiveSelected.creationMode === 'established')
  const selectedStartingGold = effectiveSelected ? (startingGoldByCharacterId[effectiveSelected.id] ?? null) : null
  const hasRolledStartingGold = typeof selectedStartingGold === 'number'
  const selectedStoreCart = effectiveSelected ? (storeCartByCharacterId[effectiveSelected.id] ?? []) : []
  const selectedCommittedStoreSpent = effectiveSelected ? (storeSpentByCharacterId[effectiveSelected.id] ?? 0) : 0
  const selectedStoreCartTotal = selectedStoreCart.reduce((sum, entry) => sum + entry.costGp * entry.qty, 0)
  const selectedStoreRemaining = (selectedStartingGold ?? 0) - selectedCommittedStoreSpent - selectedStoreCartTotal
  const visibleStoreItems = OSE_STORE_ITEMS.filter((item) => item.category === storeCategory)
  const canClassEquipArmour = selectedClassName !== 'Magic-User'
  const renderFeatureSummary = (feature: ClassFeature): ReactNode => {
    const links = feature.summaryLinks ?? []
    if (links.length === 0) return feature.summary

    let parts: ReactNode[] = [feature.summary]
    links.forEach((link, linkIndex) => {
      const targetWord = link.word.trim()
      if (!targetWord) return
      let replaced = false
      parts = parts.flatMap((part, partIndex) => {
        if (typeof part !== 'string' || replaced) return [part]
        const lowerPart = part.toLowerCase()
        const lowerWord = targetWord.toLowerCase()
        const matchIndex = lowerPart.indexOf(lowerWord)
        if (matchIndex < 0) return [part]
        replaced = true
        const before = part.slice(0, matchIndex)
        const match = part.slice(matchIndex, matchIndex + targetWord.length)
        const after = part.slice(matchIndex + targetWord.length)
        const mapped: ReactNode[] = []
        if (before) mapped.push(before)
        mapped.push(
          <a
            key={`feature-link-${feature.id}-${linkIndex}-${partIndex}`}
            className="character-class-feature-link"
            href={link.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            {match}
          </a>,
        )
        if (after) mapped.push(after)
        return mapped
      })
    })
    return <>{parts}</>
  }
  const weaponTypeLabel = (weapon: CharacterWeaponItem) => {
    return weapon.typeName || 'Weapon'
  }
  const weaponCoreStatsLabel = (weapon: CharacterWeaponItem) => {
    const count = (weapon.damageDiceCount ?? '').trim()
    const sides = (weapon.damageDiceSides ?? '').trim()
    const short = (weapon.rangeShort ?? '').trim()
    const medium = (weapon.rangeMedium ?? '').trim()
    const long = (weapon.rangeLong ?? '').trim()
    const hasDamage = count.length > 0 && sides.length > 0
    const hasRange = short.length > 0 && medium.length > 0 && long.length > 0
    if (!hasDamage && !hasRange) return ''
    if (hasDamage && hasRange) return `${count}d${sides} @ ${short}/${medium}/${long}`
    if (hasDamage) return `${count}d${sides} @ melee`
    return `${short}/${medium}/${long}`
  }
  const weaponStatsLabel = (weapon: CharacterWeaponItem) => {
    const stats: string[] = []
    stats.push(weaponCoreStatsLabel(weapon))
    const template = weapon.typeId && weapon.typeId !== 'custom' ? weaponCatalogById[weapon.typeId] : null
    if (template) stats.push(`${template.costGp}gp`)
    const bonus = (weapon.attackBonus ?? '').trim()
    if (bonus) stats.push(`+${bonus.replace(/^\+/, '')}`)
    if (weapon.twoHanded) stats.push('2H')
    return stats.join(' | ')
  }
  const renderWeaponSlotLabel = (weapon: CharacterWeaponItem): ReactNode => {
    const name = (weapon.name ?? '').trim()
    const stats = weaponStatsLabel(weapon)
    return (
      <span className="weapon-slot-label">
        <strong>{weaponTypeLabel(weapon)}</strong>
        {name ? <><span> </span><em>{name}</em></> : null}
        {weapon.isMagic ? <span className="weapon-slot-magic">(M)</span> : null}
        {stats ? <span> - {stats}</span> : null}
      </span>
    )
  }
  const armourTypeLabel = (armour: CharacterArmourItem) => armour.typeName || 'Armour'
  const armourStatsLabel = (armour: CharacterArmourItem) => {
    const stats: string[] = []
    const armourClass = (armour.armourClass ?? '').trim()
    const shieldMod = (armour.shieldMod ?? '').trim()
    if (armour.armourType === 'shield') {
      if (shieldMod) stats.push(`AC ${shieldMod}`)
    } else if (armourClass) {
      stats.push(`AC ${armourClass}`)
    }
    const template = armour.typeId && armour.typeId !== 'custom' ? armourCatalogById[armour.typeId] : null
    if (template) stats.push(`${template.costGp}gp`)
    const magic = (armour.magicMod ?? '').trim()
    if (magic) stats.push(`Magic ${magic}`)
    return stats.join(' | ')
  }
  const renderArmourSlotLabel = (armour: CharacterArmourItem): ReactNode => {
    const name = (armour.name ?? '').trim()
    const stats = armourStatsLabel(armour)
    return (
      <span className="weapon-slot-label">
        <strong>{armourTypeLabel(armour)}</strong>
        {name ? <><span> </span><em>{name}</em></> : null}
        {armour.isMagic ? <span className="weapon-slot-magic">(M)</span> : null}
        {stats ? <span> - {stats}</span> : null}
      </span>
    )
  }
  // Build slot rendering arrays from unified inventory
  const toggleItemEquip = (item: CharacterInventoryItem, checked: boolean) => {
    if (item.kind === 'weapon') {
      updateWeaponRow(item.id, { equipped: checked })
    } else if (item.kind === 'armour') {
      updateArmourRow(item.id, { equipped: checked })
    } else {
      updateInventoryItem(item.id, { equipped: checked })
    }
  }
  const itemSlotLabel = (item: CharacterInventoryItem): ReactNode => {
    if (item.kind === 'weapon') return renderWeaponSlotLabel(item as CharacterWeaponItem)
    if (item.kind === 'armour') return renderArmourSlotLabel(item as CharacterArmourItem)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- old gold data may still have `amount` instead of `qty`
    if (item.kind === 'gold') return `Gold: ${item.qty ?? (item as any).amount ?? 0} gp`
    const label = item.typeName || item.name || 'Item'
    const qty = item.qty ?? 1
    return qty > 1 ? `${label} (${qty})` : label
  }
  const equippedSlotItems = equippedItems.map((item) => ({
    item,
    label: itemSlotLabel(item),
    onToggle: (checked: boolean) => toggleItemEquip(item, checked),
    isGold: item.kind === 'gold',
  }))
  const packedSlotItems = packedItems.map((item) => ({
    item,
    label: itemSlotLabel(item),
    onToggle: (checked: boolean) => toggleItemEquip(item, checked),
    isGold: item.kind === 'gold',
  }))
  const packedSlotUnlockedByIndex = Array.from({ length: packedRowCount }, (_, index) =>
    index < packedStrengthSlotCount ? (!Number.isNaN(selectedStr) && selectedStr >= packedSlotThresholds[index]) : true,
  )
  const availablePackedSlotIndices = packedSlotUnlockedByIndex
    .map((unlocked, index) => (unlocked ? index : -1))
    .filter((index) => index >= 0)
  const selectedStoreRequiredPacked = selectedStoreCart.reduce((sum, entry) => sum + entry.qty, 0)
  const selectedStoreOpenPackedSlots = Math.max(0, availablePackedSlotIndices.length - packedItems.length)
  const storeCartExceedsPackedSlots = selectedStoreRequiredPacked > selectedStoreOpenPackedSlots
  const selectedThacoRaw = effectiveSelected ? (thacoByCharacterId[effectiveSelected.id] ?? '') : ''
  const selectedThaco = Number.parseInt(selectedThacoRaw, 10)
  const selectedSaveScores = effectiveSelected
    ? (saveScoresByCharacterId[effectiveSelected.id] ?? { D: '', W: '', P: '', B: '', S: '' })
    : { D: '', W: '', P: '', B: '', S: '' }
  const selectedAdventureScores = effectiveSelected
    ? (adventureScoresByCharacterId[effectiveSelected.id] ?? adventureDefaultsByClass(effectiveSelected.className))
    : adventureDefaultsByClass('-')
  const selectedThiefSkills = effectiveSelected
    ? (thiefSkillsByCharacterId[effectiveSelected.id] ?? defaultThiefSkills())
    : defaultThiefSkills()
  const isHalfling = effectiveSelected?.className === 'Halfling'
  const thiefLevel = Math.max(1, effectiveSelected?.level ?? 1)
  const thiefTotalExpertisePoints = 4 + Math.max(0, thiefLevel - 1) * 2
  const thiefSpentExpertisePoints = thiefSkillRows.reduce((sum, row) => {
    const score = Number.parseInt(selectedThiefSkills[row.code], 10)
    if (Number.isNaN(score)) return sum
    return sum + Math.max(0, score - 1)
  }, 0)
  const thiefRemainingExpertisePoints = Math.max(0, thiefTotalExpertisePoints - thiefSpentExpertisePoints)

  const derivedDexInitModifier = Number.isNaN(selectedDex) ? 0 : abilityModifier(selectedDex)
  const derivedDexAcModifierNumber = Number.isNaN(selectedDex) ? null : dexAcModByDex(selectedDex)
  const derivedDexAcAdjustment = derivedDexAcModifierNumber === null ? 0 : -derivedDexAcModifierNumber
  const derivedDexAcModifier = derivedDexAcModifierNumber === null ? '' : formatModifier(derivedDexAcAdjustment)
  const derivedUnarmouredAc = derivedDexAcModifierNumber === null ? '' : String(9 + derivedDexAcAdjustment)
  const bodyArmourClass = Number.parseInt(equippedBodyArmour?.armourClass ?? '', 10)
  const shieldAcMod = Number.parseInt(equippedShield?.shieldMod ?? '', 10)
  const bodyMagicMod = Number.parseInt(equippedBodyArmour?.magicMod ?? '', 10)
  const shieldMagicMod = Number.parseInt(equippedShield?.magicMod ?? '', 10)
  const computedAc =
    (Number.isNaN(bodyArmourClass) ? 9 : bodyArmourClass)
    + derivedDexAcAdjustment
    + (Number.isNaN(shieldAcMod) ? 0 : shieldAcMod)
    + (Number.isNaN(bodyMagicMod) ? 0 : bodyMagicMod)
    + (Number.isNaN(shieldMagicMod) ? 0 : shieldMagicMod)
  const derivedInitModifierNumber = Number.isNaN(selectedDex) ? null : derivedDexInitModifier + (isHalfling ? 1 : 0)
  const derivedInitModifier = derivedInitModifierNumber === null ? '' : formatModifier(derivedInitModifierNumber)
  const derivedReactionModifier = Number.isNaN(selectedCha) ? '' : formatModifier(abilityModifier(selectedCha))
  const derivedOpenStuckDoor = Number.isNaN(selectedStr) ? '' : String(openStuckDoorByStr(selectedStr))
  const derivedMeleeModifier = Number.isNaN(selectedStr) ? '' : formatTableModifier(meleeModifierByStr(selectedStr))
  const derivedDexMissileModifier = Number.isNaN(selectedDex) ? 0 : dexMissileModByDex(selectedDex)
  const derivedMissileModifierNumber = Number.isNaN(selectedDex) ? null : derivedDexMissileModifier + (isHalfling ? 1 : 0)
  const derivedMissileModifier = derivedMissileModifierNumber === null ? '' : formatTableModifier(derivedMissileModifierNumber)
  const derivedConModifierNumber = Number.isNaN(selectedCon) ? 0 : conModifierByScore(selectedCon)
  const derivedConModifier = Number.isNaN(selectedCon) ? '' : formatTableModifier(derivedConModifierNumber)
  const canSelectedLevelUp = !!effectiveSelected
    && !isInFinalizationFlow
    && selectedNextLevelXp !== null
    && effectiveSelected.xp >= selectedNextLevelXp
  const selectedHitDie = classHitDieByClass[selectedClassName] ?? null
  const levelUpHpGain = levelUpHpRoll === null
    ? null
    : Math.max(1, levelUpHpRoll)
  const levelUpTargetLevel = effectiveSelected ? effectiveSelected.level + 1 : null
  const selectedHasPendingWrite = effectiveSelected ? hasPendingWrite(effectiveSelected.id) : false
  const levelUpNewFeatures = levelUpTargetLevel === null
    ? []
    : (classFeaturesByClass[selectedClassName] ?? []).filter((feature) => feature.unlockedAt === levelUpTargetLevel)
  const levelUpFlavor = levelUpFlavorByClass[selectedClassName] ?? 'Your experience pays off as your capabilities expand.'
  const levelUpChecklist = levelUpChecklistForClass(selectedClassName, selectedHitDie)
  const derivedWisMagicSaveModifierNumber = Number.isNaN(Number.parseInt(selectedAbilityScores.WIS, 10))
    ? null
    : wisMagicSaveModifierByScore(Number.parseInt(selectedAbilityScores.WIS, 10))
  const derivedWisMagicSaveModifier =
    derivedWisMagicSaveModifierNumber === null ? '' : formatTableModifier(derivedWisMagicSaveModifierNumber)
  const displayedSaveScores: SaveScores = {
    ...selectedSaveScores,
    W:
      derivedWisMagicSaveModifierNumber === null || Number.isNaN(Number.parseInt(selectedSaveScores.W, 10))
        ? selectedSaveScores.W
        : String(Number.parseInt(selectedSaveScores.W, 10) - derivedWisMagicSaveModifierNumber),
    S:
      derivedWisMagicSaveModifierNumber === null || Number.isNaN(Number.parseInt(selectedSaveScores.S, 10))
        ? selectedSaveScores.S
        : String(Number.parseInt(selectedSaveScores.S, 10) - derivedWisMagicSaveModifierNumber),
  }
  const abilityTradePointsGained = selectedRolledAbilityScores
    ? Math.floor(
      loweringCodes.reduce((sum, code) => {
        const base = Number.parseInt(selectedRolledAbilityScores[code], 10)
        const current = Number.parseInt(selectedAbilityScores[code], 10)
        if (Number.isNaN(base) || Number.isNaN(current)) return sum
        return sum + Math.max(0, base - current)
      }, 0) / 2,
    )
    : 0
  const abilityTradePointsSpent = selectedRolledAbilityScores
    ? primeRequisiteCodes.reduce((sum, code) => {
      const base = Number.parseInt(selectedRolledAbilityScores[code], 10)
      const current = Number.parseInt(selectedAbilityScores[code], 10)
      if (Number.isNaN(base) || Number.isNaN(current)) return sum
      return sum + Math.max(0, current - base)
    }, 0)
    : 0
  const availableAbilityTradePoints = Math.max(0, abilityTradePointsGained - abilityTradePointsSpent)
  // Count packed items in the movement band zone (exclude STR-gated slots)
  const packedItemCount = packedItems.length
  const strSlotsFilled = Math.min(packedItemCount, packedStrengthSlotCount)
  const filledPackedItemCount = Math.max(0, packedItemCount - strSlotsFilled)
  let runningSlots = 0
  const currentMovementBand =
    packedMovementBands.find((band) => {
      runningSlots += band.slotCount
      return filledPackedItemCount <= runningSlots
    }) ?? packedMovementBands[packedMovementBands.length - 1]
  const currentPackedMovement = currentMovementBand.label
  const currentBaseMove = currentMovementBand.baseMove
  const derivedOverlandMove = currentBaseMove / 5
  const derivedExplorationMove = currentBaseMove
  const derivedEncounterMove = currentBaseMove / 3

  const addCharacter = (creationMode: 'new' | 'established') => {
    if (!canCreateCharacter) return
    const nextCharacter: CharacterRecord = {
      id: makeId(),
      name: 'New Character',
      ownerUserId: currentUserId,
      ownerUsername: currentUsername,
      creationMode,
      creationModeExplicit: true,
      creationStatus: creationMode === 'new' ? 'draft' : 'established_draft',
      className: '-',
      level: 1,
      hpCurrent: 0,
      hpMax: 0,
      ac: 10,
      xp: 0,
      portraitUrl: null,
      portraitFocusX: 50,
      portraitFocusY: 50,
      tokenIcon: defaultTokenIcon,
    }
    setSelectedCharacterId(nextCharacter.id)
    if (isMobile) setMobileCharacterView('detail')
    void setDoc(doc(db, 'campaigns', campaignId, 'characters', nextCharacter.id), {
      name: nextCharacter.name,
      ownerUserId: nextCharacter.ownerUserId,
      ownerUsername: nextCharacter.ownerUsername ?? null,
      creationMode: nextCharacter.creationMode,
      creationModeExplicit: nextCharacter.creationModeExplicit,
      creationStatus: nextCharacter.creationStatus,
      class: nextCharacter.className,
      level: nextCharacter.level,
      hpCurrent: nextCharacter.hpCurrent,
      hpMax: nextCharacter.hpMax,
      ac: nextCharacter.ac,
      xp: nextCharacter.xp,
      portraitUrl: nextCharacter.portraitUrl,
      portraitFocusX: nextCharacter.portraitFocusX,
      portraitFocusY: nextCharacter.portraitFocusY,
      tokenIcon: nextCharacter.tokenIcon,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  const validateDraftCharacter = () => {
    if (!effectiveSelected) return 'No character selected.'
    if (effectiveSelected.className === '-') return 'Choose a class before finalizing.'
    if (!hasRolledAbilityScores) return 'Roll ability scores before finalizing.'
    if (!hasRolledHp) return 'Roll hit points before finalizing.'
    if (effectiveSelected.hpMax <= 0) return 'Set maximum hit points before finalizing.'
    if (effectiveSelected.className === 'Cleric') {
      const hasHolySymbol = selectedInventory.some((item) =>
        (item.name ?? '').toLowerCase().includes('holy symbol'),
      )
      if (!hasHolySymbol) return 'HOLY_SYMBOL_REQUIRED'
    }
    return null
  }

  const requestFinalizeCharacter = () => {
    if (!effectiveSelected || !canEditSelected || !isInFinalizationFlow) return
    if (isGuidedCreation) {
      const validationError = validateDraftCharacter()
      if (validationError) {
        if (validationError === 'HOLY_SYMBOL_REQUIRED') {
          setHolySymbolRequiredOpen(true)
        } else {
          setFinalizeError(validationError)
        }
        return
      }
    }
    setFinalizeError(null)
    setFinalizeConfirmOpen(true)
  }

  const finalizeCharacter = () => {
    if (!effectiveSelected || !canEditSelected || !isInFinalizationFlow) return
    updateSelectedCharacter({ creationStatus: 'active' })
    setFinalizeConfirmOpen(false)
    setFinalizeError(null)
  }

  const openLevelUpModal = () => {
    if (!canSelectedLevelUp || !canEditSelected || selectedHasPendingWrite) return
    setLevelUpHpRoll(null)
    setLevelUpError(null)
    setLevelUpModalOpen(true)
  }

  const closeLevelUpModal = () => {
    if (levelUpApplying) return
    setLevelUpModalOpen(false)
    setLevelUpHpRoll(null)
    setLevelUpError(null)
  }

  const rollLevelUpHitPoints = () => {
    if (!selectedHitDie || selectedHitDie <= 0) {
      setLevelUpError('No valid class hit die available for this character.')
      return
    }
    setLevelUpError(null)
    setLevelUpHpRoll(1 + Math.floor(Math.random() * selectedHitDie))
  }

  const applyLevelUp = () => {
    if (!effectiveSelected || !canSelectedLevelUp) return
    if (levelUpHpGain === null) {
      setLevelUpError('Roll hit points before applying level up.')
      return
    }
    const nextLevel = effectiveSelected.level + 1
    const nextSaveScores = saveScoresForClassLevel(effectiveSelected.className, nextLevel)
    const nextThaco = thacoForClassLevel(effectiveSelected.className, nextLevel)
    setLevelUpApplying(true)
    if (nextSaveScores) {
      setSaveScoresByCharacterId((current) => ({
        ...current,
        [effectiveSelected.id]: nextSaveScores,
      }))
    }
    if (nextThaco !== null) {
      setThacoByCharacterId((current) => ({
        ...current,
        [effectiveSelected.id]: String(nextThaco),
      }))
    }
    updateSelectedCharacter({
      level: nextLevel,
      hpMax: Math.max(0, effectiveSelected.hpMax) + levelUpHpGain,
      hpCurrent: Math.max(0, effectiveSelected.hpCurrent) + levelUpHpGain,
    })
    setLevelUpApplying(false)
    closeLevelUpModal()
  }

  const updateAbilityScore = (code: AbilityCode, value: string) => {
    if (!effectiveSelected) return
    if (!canEditAbilityScores) return
    if (!isGuidedCreation) {
      if (value.trim().length === 0) {
        setAbilityScoresByCharacterId((current) => ({
          ...current,
          [effectiveSelected.id]: {
            ...selectedAbilityScores,
            [code]: '',
          },
        }))
        return
      }
      const nextValue = Number.parseInt(value, 10)
      if (!Number.isFinite(nextValue) || nextValue < 1 || nextValue > 18) return
      setAbilityScoresByCharacterId((current) => ({
        ...current,
        [effectiveSelected.id]: {
          ...selectedAbilityScores,
          [code]: String(nextValue),
        },
      }))
      return
    }
    if (selectedClassName === '-') {
      setReallocationClassRequiredOpen(true)
      return
    }
    const nextValue = Number.parseInt(value, 10)
    const nextGuidedScores = tryBuildGuidedScores(code, nextValue)
    if (!nextGuidedScores) return
    setAbilityScoresByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: nextGuidedScores,
    }))
  }

  const applyClassDerivedData = (characterId: string, className: string) => {
    const classLevel = characterId === effectiveSelected?.id ? (effectiveSelected.level ?? 1) : 1
    const saveProfile = saveScoresForClassLevel(className, classLevel)
    if (saveProfile) {
      setSaveScoresByCharacterId((current) => ({
        ...current,
        [characterId]: saveProfile,
      }))
    }
    const nextThaco = thacoForClassLevel(className, classLevel)
    if (nextThaco !== null) {
      setThacoByCharacterId((current) => ({
        ...current,
        [characterId]: String(nextThaco),
      }))
    }
  }

  const {
    tryBuildGuidedScores,
    rollAbilityScores,
    hasRolledHp,
    canFreeRerollHp,
    requestRollHitPoints: _requestRollHitPoints,
  } = useCharacterCreationFlow({
    effectiveSelected,
    selectedCharacterId,
    selectedClassName,
    selectedAbilityScores,
    selectedRolledAbilityScores,
    primeRequisiteCodes,
    hasRolledAbilityScores,
    canEditSelected,
    isGuidedCreation,
    isInFinalizationFlow,
    computedAc,
    derivedConModifierNumber,
    selectedWeapons,
    selectedArmour,
    canClassEquipArmour,
    seededCharacterIdsRef,
    justSeededRef,
    hpBaseRollByCharacterId,
    saveScoresByCharacterId,
    thacoByCharacterId,
    adventureScoresByCharacterId,
    adventureSeedClassByCharacterId,
    thiefSkillsByCharacterId,
    acManualOverrideByCharacterId,
    setAbilityScoresByCharacterId,
    setRolledAbilityScoresByCharacterId,
    setAbilityScoresRolledByCharacterId,
    setHpBaseRollByCharacterId,
    setSaveScoresByCharacterId,
    setThacoByCharacterId,
    setAdventureScoresByCharacterId,
    setAdventureSeedClassByCharacterId,
    setThiefSkillsByCharacterId,
    setInventoryByCharacterId,
    updateSelectedCharacter,
  })

  const requestRollHitPoints = () => _requestRollHitPoints(setHpClassRequiredOpen)

  const {
    spellBookSelectedSpellId, setSpellBookSelectedSpellId,
    spellBookAddModalOpen, setSpellBookAddModalOpen,
    spellBookAddTabLevel, setSpellBookAddTabLevel,
    spellBookPendingAddIds, setSpellBookPendingAddIds,
    spellBookExpandedSpellId, setSpellBookExpandedSpellId,
    divinePrepareModalOpen, setDivinePrepareModalOpen,
    divinePrepareTabLevel, setDivinePrepareTabLevel,
    divinePrepareExpandedSpellId, setDivinePrepareExpandedSpellId,
    divinePreparedDraftIds,
    setMemorizedSpellDetailId,
    spellBookFeedback,
    selectedSpellBookSpellIds,
    selectedSpellBookSpells, selectedMemorizedSpells,
    accessibleSpellLevels, canOpenSpellBookAddModal, canOpenDivinePrepareModal,
    preparedSpellLevels, preparedSlotsPerDay, memorizedCountsByLevel, divinePreparedDraftSpells, divineDraftCountsByLevel, divineDraftCountsBySpellId,
    pendingSpellObjects, memorizedSpellDetail,
    memorizeSpell, removeSpellFromBook, consumeMemorizedSpell, openDivinePrepareModal, prepareDivineSpell, removePreparedDivineSpell, clearPreparedDivineSpells, commitPreparedDivineSpells,
    openSpellBookAddModal, queueSpellForBook, removePendingSpell, commitPendingSpellsToBook,
  } = useSpellbookDomain({
    effectiveSelected,
    selectedClassName,
    selectedLevel,
    selectedInventory,
    isInFinalizationFlow,
    canEditSelected,
    canMemorizeSpell,
    requiresSpellLearnApproval,
    currentUsername,
    itemDetailId,
    spellBookSpellIdsByCharacterId,
    memorizedSpellIdsByCharacterId,
    setSpellBookSpellIdsByCharacterId,
    setMemorizedSpellIdsByCharacterId,
    setInventoryByCharacterId,
    submitSpellLearnRequest,
  })

  useEffect(() => {
    setFinalizeError(null)
    setFinalizeConfirmOpen(false)
  }, [effectiveSelected?.id, effectiveSelected?.creationStatus])

  useEffect(() => {
    if (!isGuidedCreation && storeOpen) {
      setStoreOpen(false)
      setStoreError(null)
    }
  }, [isGuidedCreation, storeOpen])

  useEffect(() => {
    if (canGrant) return
    if (!grantMode) return
    setGrantMode(false)
    setGrantTargetIds({})
  }, [canGrant, grantMode])

  // Clear justSeeded AFTER all init effects have run (effect order matters —
  // this must be defined after the init effects so they can see justSeeded as true)
  useEffect(() => {
    if (!selectedCharacterId) return
    justSeededRef.current.delete(selectedCharacterId)
  })

  const {
    updateInventoryItem,
    updateWeaponRow,
    updateArmourRow,
    openAddItemModal,
    saveAddItem,
    dropItem,
    sellItem,
    spendGold,
    setInventoryGold,
    addItemsToInventory,
    setInventoryGoldForCharacter,
  } = useInventoryDomain({
    campaignId,
    currentUsername,
    effectiveSelected,
    canEditSelected,
    selectedClassName,
    canClassEquipArmour,
    selectedInventory,
    availablePackedSlotCount: availablePackedSlotIndices.length,
    requiresApprovalNow,
    isGuidedCreation,
    overflowWriting,
    addItemModal,
    setInventoryByCharacterId,
    setAddItemModal,
    setOverflowWriting,
    setOverflowFeedback,
    setItemDetailId,
    setDropConfirmItemId,
    setSellConfirmItemId,
    setGoldSpendAmount,
    setApprovalPendingFeedback,
    submitRequest,
  })

  const {
    decrementCartEntry,
    incrementCartEntry,
    removeCartEntry,
    clearCart,
    rollStartingGold,
    handleStoreBuy,
    handleBuyCustomStoreItem,
    applyStorePurchases,
    refundItem,
  } = useStoreDomain({
    effectiveSelected,
    canEditSelected,
    selectedClassName,
    hasRolledStartingGold,
    selectedStoreRemaining,
    selectedStoreCart,
    selectedStoreCartTotal,
    selectedStartingGold,
    selectedCommittedStoreSpent,
    packedItemsCount: packedItems.length,
    availablePackedSlotCount: availablePackedSlotIndices.length,
    isGuidedCreation,
    selectedInventory,
    customStoreName,
    customStoreCost,
    customStoreDescription,
    storeSpentByCharacterId,
    setStoreCartByCharacterId,
    setStoreError,
    setStoreClassRequiredOpen,
    setCustomStoreName,
    setCustomStoreCost,
    setCustomStoreDescription,
    setStoreSpentByCharacterId,
    setStartingGoldByCharacterId,
    setStoreOpen,
    setInventoryByCharacterId,
    setInventoryGold,
    addItemsToInventory,
    setInventoryGoldForCharacter,
  })

  const makeInventoryItemFromTemplateEntry = (entry: GrantTemplateEntry): CharacterInventoryItem => {
    if (entry.kind === 'weapon' && entry.weaponId) {
      return applyWeaponTemplateToItem(makeWeaponItem(), entry.weaponId)
    }
    if (entry.kind === 'armour' && entry.armourId) {
      return applyArmourTemplateToItem(makeArmourItem(), entry.armourId)
    }
    if (entry.kind === 'ammunition') {
      const storeItem = OSE_STORE_ITEMS.find((item) => item.id === entry.key)
      const ammoTemplate = storeItem ? ammoCatalogById[storeItem.id] ?? ammoCatalogById[storeItem.id.replace('ammo-', '')] : null
      return {
        id: makeId(),
        kind: 'ammunition',
        typeId: ammoTemplate?.id ?? 'custom',
        typeName: ammoTemplate?.name ?? entry.name,
        name: entry.name,
        costGp: entry.costGp,
        equipped: false,
        notes: '',
        description: ammoTemplate?.description ?? '',
        qty: ammoTemplate?.qty ?? 1,
        stack: DEFAULT_STACK_POLICY.ammunition,
      }
    }
    if (entry.kind === 'consumable') {
      const storeItem = OSE_STORE_ITEMS.find((item) => item.id === entry.key)
      const conTemplate = storeItem ? consumableCatalogById[storeItem.id.replace('gear-', 'con-')] : null
      return {
        id: makeId(),
        kind: 'consumable',
        typeId: conTemplate?.id ?? 'custom',
        typeName: conTemplate?.name ?? entry.name,
        name: entry.name,
        costGp: entry.costGp,
        equipped: false,
        notes: '',
        description: conTemplate?.description ?? '',
        qty: conTemplate?.qty ?? 1,
        stack: DEFAULT_STACK_POLICY.consumable,
        useMode: conTemplate?.useMode ?? 'consume',
        effectText: conTemplate?.effectText ?? undefined,
      }
    }
    const storeItem = OSE_STORE_ITEMS.find((item) => item.id === entry.key)
    const genTemplate = storeItem ? generalCatalogById[storeItem.id] : null
    return {
      id: makeId(),
      kind: 'general',
      typeId: genTemplate?.id ?? 'custom',
      typeName: genTemplate?.name ?? entry.name,
      name: entry.name,
      costGp: genTemplate?.costGp ?? entry.costGp,
      equipped: false,
      notes: '',
      description: genTemplate?.description ?? '',
      qty: 1,
      stack: DEFAULT_STACK_POLICY.general,
    }
  }

  const amountForTarget = (total: number, split: boolean, targetCount: number, targetIndex: number): number => {
    if (!split || targetCount <= 0) return total
    const normalizedTotal = Math.max(0, Math.floor(total))
    const base = Math.floor(normalizedTotal / targetCount)
    const remainder = normalizedTotal % targetCount
    return base + (targetIndex < remainder ? 1 : 0)
  }

  const grantPreviewByCharacterId = useMemo(() => {
    const preview = new Map<string, ReturnType<typeof projectCharacterProgress>>()
    const targets = sortedCharacters.filter((character) => grantTargetIds[character.id])
    for (let index = 0; index < targets.length; index += 1) {
      const character = targets[index]
      const scores = abilityScoresByCharacterId[character.id] ?? emptyAbilityScores()
      const xpForTarget = amountForTarget(parsedGrantBaseXp, grantXpSplitBetweenTargets, targets.length, index)
      preview.set(character.id, projectCharacterProgress(character, scores, xpForTarget))
    }
    return preview
  }, [sortedCharacters, grantTargetIds, abilityScoresByCharacterId, parsedGrantBaseXp, grantXpSplitBetweenTargets])

  const applyGrantToSelectedTargets = async () => {
    if (!canGrant || grantBusy) return
    const targetIds = selectedGrantTargetIds
    if (targetIds.length === 0) {
      setGrantFeedback('Select at least one target.')
      return
    }
    if (parsedGrantBaseXp <= 0 && parsedGrantGoldGp <= 0 && grantCampaignEntries.length === 0 && grantTemplateEntries.length === 0) {
      setGrantFeedback('Add XP, gp, or items before granting.')
      return
    }

    const campaignEntriesResolved = grantCampaignEntries
      .map((entry) => ({ entry, item: authoredCampaignItems.find((item) => item.id === entry.itemId) ?? null }))
      .filter((row): row is { entry: { itemId: string; name: string; qty: number }; item: CampaignItem } => row.item !== null)

    setGrantBusy(true)
    setGrantFeedback(null)
    try {
      const overflowMessages: string[] = []
      for (let targetIndex = 0; targetIndex < targetIds.length; targetIndex += 1) {
        const targetId = targetIds[targetIndex]
        const target = sortedCharacters.find((character) => character.id === targetId)
        if (!target) continue
        const charRef = doc(db, 'campaigns', campaignId, 'characters', targetId)
        const overflowGoldDocId = crypto.randomUUID()
        const xpForTarget = amountForTarget(parsedGrantBaseXp, grantXpSplitBetweenTargets, targetIds.length, targetIndex)
        const goldForTarget = amountForTarget(parsedGrantGoldGp, grantGoldSplitBetweenTargets, targetIds.length, targetIndex)

        await runTransaction(db, async (tx) => {
          const snap = await tx.get(charRef)
          if (!snap.exists()) throw new Error(`Target not found: ${target.name}`)

          const data = snap.data() as CharacterRecord
          const existingDetails = (data.details && typeof data.details === 'object')
            ? data.details as CharacterSheetDetails
            : null
          const currentInventory = existingDetails?.inventory ?? []
          const abilityScores = (existingDetails?.abilityScores as AbilityScores | undefined) ?? emptyAbilityScores()

          let campaignGoldGrant = 0
          const itemsToAdd: CharacterInventoryItem[] = []
          for (const row of campaignEntriesResolved) {
            for (let i = 0; i < row.entry.qty; i += 1) {
              if (row.item.type === 'gold') {
                const sourceGold = typeof row.item.goldAmount === 'number'
                  ? row.item.goldAmount
                  : (Number.parseInt(row.item.gpValue, 10) || 0)
                campaignGoldGrant += sourceGold
              } else {
                itemsToAdd.push(campaignItemToInventoryItem(row.item))
              }
            }
          }
          for (const entry of grantTemplateEntries) {
            for (let i = 0; i < entry.qty; i += 1) {
              itemsToAdd.push(makeInventoryItemFromTemplateEntry(entry))
            }
          }

          const goldGrantTotal = goldForTarget + campaignGoldGrant
          const existingGold = currentInventory
            .filter((item): item is CharacterGoldItem => item.kind === 'gold')
            .reduce((sum, item) => sum + (item.qty ?? 0), 0)

          const nonGoldCurrent = currentInventory.filter((item) => item.kind !== 'gold')
          const nonGoldIncoming = itemsToAdd.filter((item) => item.kind !== 'gold')
          const nextGoldChunks = goldChunksForAmount(Math.max(0, existingGold + goldGrantTotal))
          const nextGoldItems = nextGoldChunks.map((chunk) => makeGoldItem(chunk))
          const candidateInventory = [...nonGoldCurrent, ...nonGoldIncoming, ...nextGoldItems]

          const strScore = Number.parseInt(abilityScores.STR ?? '', 10)
          const availableSlots = computeAvailablePackedSlots(strScore)
          const overflow = computeOverflow(candidateInventory, availableSlots, targetId, target.name)
          if (overflow.feedbackMessage) {
            overflowMessages.push(`${target.name}: ${overflow.feedbackMessage}`)
          }

          for (const droppedItem of overflow.droppedItems) {
            const droppedRef = doc(db, 'campaigns', campaignId, 'items', droppedItem.id)
            tx.set(droppedRef, { ...droppedItem, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
          }
          if (overflow.droppedGoldAmount > 0) {
            const overflowGoldRef = doc(db, 'campaigns', campaignId, 'items', overflowGoldDocId)
            tx.set(overflowGoldRef, {
              id: overflowGoldRef.id,
              name: `Dropped Gold (${overflow.droppedGoldAmount} gp)`,
              type: 'gold',
              typeId: 'gold',
              typeName: 'Gold',
              status: 'dropped',
              droppedByCharacterId: targetId,
              droppedByCharacterName: target.name,
              portraitUrl: null,
              portraitFocusX: 50,
              portraitFocusY: 50,
              tokenIcon: { icon: 'pawn', color: '#bf2f2a', size: 34 },
              description: '',
              gpValue: '0',
              qty: '1',
              isMagic: false,
              weaponStats: { damageDiceCount: '', damageDiceSides: '', attackBonus: '', damageBonus: '', rangeShort: '', rangeMedium: '', rangeLong: '', twoHanded: false },
              armourStats: { armourClass: '', shieldMod: '', magicMod: '', armourType: 'body' },
              consumableStats: { useMode: 'consume', effectText: '' },
              specialRule: '',
              notes: '',
              goldAmount: overflow.droppedGoldAmount,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
          }

          const bonusPercent = projectCharacterProgress(target, abilityScores, xpForTarget).bonusPercent
          const grantedXp = computeGrantedXp(xpForTarget, bonusPercent)
          const nextXp = Math.max(0, (data.xp ?? target.xp ?? 0) + grantedXp.awardedXp)
          tx.set(charRef, {
            xp: nextXp,
            details: {
              ...(existingDetails ?? {}),
              inventory: overflow.keptInventory,
            },
            updatedAt: serverTimestamp(),
          }, { merge: true })
        })
      }

      const parts = [
        `Granted to ${targetIds.length} character${targetIds.length === 1 ? '' : 's'}`,
      ]
      if (parsedGrantBaseXp > 0) parts.push(`${parsedGrantBaseXp} base XP`)
      if (parsedGrantGoldGp > 0) parts.push(`${parsedGrantGoldGp} gp`)
      if (grantXpSplitBetweenTargets && parsedGrantBaseXp > 0) parts.push('XP split')
      if (grantGoldSplitBetweenTargets && parsedGrantGoldGp > 0) parts.push('gp split')
      if (grantCampaignEntries.length > 0 || grantTemplateEntries.length > 0) parts.push('items')
      const overflowSummary = overflowMessages.length > 0 ? ` | Overflow: ${overflowMessages.join(' / ')}` : ''
      setGrantFeedback(`${parts.join(' • ')}${overflowSummary}`)
      clearGrantDraft()
      setGrantTargetIds({})
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setGrantFeedback(`Grant failed: ${message}`)
    } finally {
      setGrantBusy(false)
    }
  }

  const renderAdventuringSkillsSection = () => (
    <section className="monster-section-block">
      <h3 className="monster-section-title">Adventuring Skills</h3>
      <div className="character-sheet-rows">
        {adventureRows.map((row) => (
          <div key={row.code} className="character-sheet-row in-six">
            <span className="character-sheet-code">{row.code}</span>
            <div className="character-in-six-field">
              {row.code === 'OD' ? (
                <input type="text" value={derivedOpenStuckDoor} readOnly />
              ) : (
                <input
                  type="number"
                  step={1}
                  min={1}
                  max={6}
                  value={selectedAdventureScores[row.code as AdventureEditableCode]}
                  onChange={(event) => {
                    if (!effectiveSelected) return
                    const nextValue = clampInSix(event.target.value)
                    setAdventureScoresByCharacterId((current) => ({
                      ...current,
                      [effectiveSelected.id]: {
                        ...(current[effectiveSelected.id] ?? adventureDefaultsByClass(effectiveSelected.className)),
                        [row.code]: nextValue,
                      },
                    }))
                  }}
                  disabled={!canEditSelected}
                />
              )}
              <span className="character-in-six-suffix">-in-6</span>
            </div>
            <small>{row.note}</small>
          </div>
        ))}
      </div>
    </section>
  )

  const renderThiefSkillsSection = () => (effectiveSelected?.className === 'Thief' ? (
    <section className="monster-section-block">
      <div className="section-head">
        <h3 className="monster-section-title">Thief Skills</h3>
        <span className="character-roll-points">{thiefRemainingExpertisePoints} points</span>
      </div>
      <div className="character-sheet-rows">
        {thiefSkillRows.map((row) => (
          <div key={row.code} className="character-sheet-row in-six">
            <span className="character-sheet-code">{row.code}</span>
            <div className="character-in-six-field">
              <input
                type="number"
                step={1}
                min={1}
                max={5}
                value={selectedThiefSkills[row.code]}
                onChange={(event) => {
                  if (!effectiveSelected) return
                  const raw = event.target.value
                  if (raw.trim().length === 0) return
                  const parsed = Number.parseInt(raw, 10)
                  if (Number.isNaN(parsed)) return
                  const nextScore = Math.min(5, Math.max(1, parsed))
                  const currentScoreRaw = Number.parseInt(selectedThiefSkills[row.code], 10)
                  const currentScore = Number.isNaN(currentScoreRaw) ? 1 : Math.min(5, Math.max(1, currentScoreRaw))
                  const delta = nextScore - currentScore
                  if (delta > thiefRemainingExpertisePoints) return
                  setThiefSkillsByCharacterId((current) => ({
                    ...current,
                    [effectiveSelected.id]: {
                      ...(current[effectiveSelected.id] ?? defaultThiefSkills()),
                      [row.code]: String(nextScore),
                    },
                  }))
                }}
                disabled={!canEditSelected}
              />
              <span className="character-in-six-suffix">-in-6</span>
            </div>
            <small>{row.note}</small>
          </div>
        ))}
      </div>
    </section>
  ) : null)

  const renderLanguagesSection = () => (
    <section className="monster-section-block">
      <h3 className="monster-section-title">Languages</h3>
      <textarea
        className="character-sheet-textarea short"
        defaultValue=""
        disabled={!canEditSelected}
      />
    </section>
  )

  const renderClassFeaturesSection = () => (
    <section className="monster-section-block">
      <div className="character-asw-head-row">
        <h3 className="monster-section-title">Class Features</h3>
        <p>Auto-filled from class and level.</p>
      </div>
      {unlockedClassFeatures.length === 0 ? (
        <p className="character-enc-help">No class features configured for this class yet.</p>
      ) : (
        <div className="character-sheet-rows">
          {unlockedClassFeatures.map((feature) => (
            <div key={feature.id} className="character-sheet-row character-class-feature-row">
              <span className="character-sheet-code">L{feature.unlockedAt}</span>
              <strong className="character-class-feature-name">{feature.name}</strong>
              <small>{renderFeatureSummary(feature)}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  )

  return (
    <div className="maps-layout monsters-layout characters-layout">
      {showListPane ? (
        <CharacterListPane
          role={role}
          canCreateCharacter={canCreateCharacter}
          charactersLoading={charactersLoading}
          sortedCharacters={sortedCharacters}
          effectiveSelectedId={effectiveSelected?.id ?? null}
          currentCharacterId={currentCharacterId}
          canDeleteCharacter={canDeleteCharacter}
          onCreateCharacter={() => setCreateCharacterModalOpen(true)}
          onSelectCharacter={(characterId) => {
            if (grantMode) {
              setGrantMode(false)
            }
            setSelectedCharacterId(characterId)
            if (isMobile) setMobileCharacterView('detail')
          }}
          onDeleteCharacter={(character) => {
            setDeleteConfirmTarget({ id: character.id, name: character.name || 'character' })
          }}
          showGrantCard={canGrant}
          isGrantMode={grantMode}
          selectedGrantTargetIds={selectedGrantTargetIds}
          onEnterGrantMode={() => {
            setGrantMode(true)
            setActivePage('core')
            if (isMobile) setMobileCharacterView('detail')
          }}
          onToggleGrantTarget={toggleGrantTarget}
        />
      ) : null}

      {showDetailPane ? (
        <div className="monsters-detail characters-detail">
          <div className="monsters-detail-inner characters-detail-inner">
            {!isMobile && (effectiveSelected || grantMode) ? (
              <div className="character-sheet-page-tabs top">
                <div className="character-sheet-tab-bar">
                  <button
                    type="button"
                    className={activePage === 'core' ? 'character-sheet-tab active' : 'character-sheet-tab'}
                    onClick={() => setActivePage('core')}
                  >
                    Core Sheet
                  </button>
                  <button
                    type="button"
                    className={activePage === 'encumbrance' ? 'character-sheet-tab active' : 'character-sheet-tab'}
                    onClick={() => setActivePage('encumbrance')}
                  >
                    Items
                  </button>
                </div>
                <div className="character-sheet-tab-actions">
                  {canSetCurrentCharacter && effectiveSelected && !grantMode ? (
                    <button
                      type="button"
                      className={currentCharacterId === effectiveSelected.id ? 'character-current-action active' : 'character-current-action'}
                      onClick={() => void setCurrentCharacter(effectiveSelected.id)}
                      aria-label="Set as current character"
                    >
                      <Star size={14} />
                      <span>Current Character</span>
                    </button>
                  ) : null}
                  {isInFinalizationFlow && canEditSelected && !grantMode ? (
                    <button
                      type="button"
                      className="character-current-action"
                      onClick={requestFinalizeCharacter}
                      aria-label="Finalize character"
                    >
                      <Check size={14} />
                      <span>Finalize Character</span>
                    </button>
                  ) : null}
                  {canSelectedLevelUp && !grantMode ? (
                    <button
                      type="button"
                      className="character-current-action character-levelup-action"
                      onClick={openLevelUpModal}
                      disabled={!canEditSelected || selectedHasPendingWrite}
                      aria-label="Level up character"
                    >
                      <Sparkles size={14} />
                      <span>Level Up</span>
                    </button>
                  ) : null}
                  {grantMode ? (
                    <button
                      type="button"
                      className="character-current-action"
                      onClick={exitGrantMode}
                      aria-label="Exit grant mode"
                    >
                      <ChevronLeft size={14} />
                      <span>Exit Grant</span>
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {isMobile ? (
              <div className="monster-detail-header-row">
                {effectiveSelected || grantMode ? (
                  <button
                    type="button"
                    className="back-link monster-mobile-back"
                    onClick={() => {
                      if (grantMode) {
                        exitGrantMode()
                      } else {
                        setMobileCharacterView('list')
                      }
                    }}
                    aria-label="Back to character list"
                  >
                    <ChevronLeft size={16} />
                  </button>
                ) : <span />}
                {canSetCurrentCharacter && effectiveSelected && !grantMode ? (
                  <button
                    type="button"
                    className={currentCharacterId === effectiveSelected.id ? 'character-current-action active' : 'character-current-action'}
                    onClick={() => void setCurrentCharacter(effectiveSelected.id)}
                    aria-label="Set as current character"
                  >
                    <Star size={14} />
                    <span>Current Character</span>
                  </button>
                ) : <span />}
                {isInFinalizationFlow && canEditSelected && !grantMode ? (
                  <button
                    type="button"
                    className="character-current-action"
                    onClick={requestFinalizeCharacter}
                    aria-label="Finalize character"
                  >
                    <Check size={14} />
                    <span>Finalize</span>
                  </button>
                ) : null}
                {canSelectedLevelUp && !grantMode ? (
                  <button
                    type="button"
                    className="character-current-action character-levelup-action"
                    onClick={openLevelUpModal}
                    disabled={!canEditSelected || selectedHasPendingWrite}
                    aria-label="Level up character"
                  >
                    <Sparkles size={14} />
                    <span>Level Up</span>
                  </button>
                ) : null}
              </div>
            ) : null}

            {finalizeError ? <p className="error">{finalizeError}</p> : null}

            {grantMode ? (
              <div className="monster-editor-grid character-editor-grid">
                <section className="character-sheet">
                  <div className="character-sheet-main-grid">
                    <div className="character-sheet-left">
                      <section className="monster-section-block">
                        <div className="section-head">
                          <h3 className="monster-section-title">Grant Builder</h3>
                          <span className="character-roll-points">{selectedGrantTargetIds.length} selected</span>
                        </div>
                        <p className="character-enc-help">Build a grant package, then check target characters in the sidebar.</p>
                        {grantFeedback ? <p className="error">{grantFeedback}</p> : null}
                        <div className="character-sheet-two-col">
                          <label className="character-header-field">
                            <span className="character-header-tag">Base XP</span>
                            <input
                              type="number"
                              min={0}
                              value={grantXpBase}
                              onChange={(event) => setGrantXpBase(event.target.value)}
                              disabled={grantBusy}
                            />
                            <span className="character-inline-checkbox">
                              <input
                                type="checkbox"
                                checked={grantXpSplitBetweenTargets}
                                onChange={(event) => setGrantXpSplitBetweenTargets(event.target.checked)}
                                disabled={grantBusy}
                              />
                              <small>Split between targets</small>
                            </span>
                          </label>
                          <label className="character-header-field">
                            <span className="character-header-tag">Gold (gp)</span>
                            <input
                              type="number"
                              min={0}
                              value={grantGoldGp}
                              onChange={(event) => setGrantGoldGp(event.target.value)}
                              disabled={grantBusy}
                            />
                            <span className="character-inline-checkbox">
                              <input
                                type="checkbox"
                                checked={grantGoldSplitBetweenTargets}
                                onChange={(event) => setGrantGoldSplitBetweenTargets(event.target.checked)}
                                disabled={grantBusy}
                              />
                              <small>Split between targets</small>
                            </span>
                          </label>
                        </div>
                        <label className="character-header-field">
                          <span className="character-header-tag">Note</span>
                          <input
                            type="text"
                            value={grantNote}
                            onChange={(event) => setGrantNote(event.target.value)}
                            placeholder="Optional reason/context"
                            disabled={grantBusy}
                          />
                        </label>
                      </section>

                      <section className="monster-section-block">
                        <h3 className="monster-section-title">Grant Items</h3>
                        <div className="character-sheet-two-col">
                          <label className="character-header-field">
                            <span className="character-header-tag">Campaign Items</span>
                            <select value={grantCampaignItemId} onChange={(event) => setGrantCampaignItemId(event.target.value)} disabled={grantBusy}>
                              <option value="">Select item...</option>
                              {authoredCampaignItems.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.typeName || item.name} ({item.type})
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            className="monster-example-btn"
                            disabled={!grantCampaignItemId || grantBusy}
                            onClick={() => {
                              const item = authoredCampaignItems.find((entry) => entry.id === grantCampaignItemId)
                              if (!item) return
                              upsertGrantCampaignEntry(item)
                            }}
                          >
                            Add Campaign Item
                          </button>
                        </div>

                        <div className="character-sheet-two-col">
                          <label className="character-header-field">
                            <span className="character-header-tag">OSE Templates</span>
                            <select value={grantTemplateItemId} onChange={(event) => setGrantTemplateItemId(event.target.value)} disabled={grantBusy}>
                              <option value="">Select template...</option>
                              {grantTemplateSelectable.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name} ({item.kind})
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            className="monster-example-btn"
                            disabled={!grantTemplateItemId || grantBusy}
                            onClick={() => upsertGrantTemplateEntry(grantTemplateItemId)}
                          >
                            Add Template
                          </button>
                        </div>

                        {(grantCampaignEntries.length > 0 || grantTemplateEntries.length > 0) ? (
                          <div className="character-sheet-rows">
                            {grantCampaignEntries.map((entry) => (
                              <div key={`campaign-${entry.itemId}`} className="character-sheet-row">
                                <strong>{entry.name}</strong>
                                <div className="character-ability-adjust">
                                  <button
                                    type="button"
                                    className="character-ability-adjust-btn"
                                    onClick={() => setGrantCampaignEntries((current) => current.map((row) =>
                                      row.itemId === entry.itemId ? { ...row, qty: Math.max(1, row.qty - 1) } : row,
                                    ))}
                                  >
                                    -
                                  </button>
                                  <input type="text" value={String(entry.qty)} readOnly />
                                  <button
                                    type="button"
                                    className="character-ability-adjust-btn"
                                    onClick={() => setGrantCampaignEntries((current) => current.map((row) =>
                                      row.itemId === entry.itemId ? { ...row, qty: row.qty + 1 } : row,
                                    ))}
                                  >
                                    +
                                  </button>
                                  <button
                                    type="button"
                                    className="monster-example-btn"
                                    onClick={() => setGrantCampaignEntries((current) => current.filter((row) => row.itemId !== entry.itemId))}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ))}
                            {grantTemplateEntries.map((entry) => (
                              <div key={`template-${entry.key}`} className="character-sheet-row">
                                <strong>{entry.name}</strong>
                                <small>{entry.kind}</small>
                                <div className="character-ability-adjust">
                                  <button
                                    type="button"
                                    className="character-ability-adjust-btn"
                                    onClick={() => setGrantTemplateEntries((current) => current.map((row) =>
                                      row.key === entry.key ? { ...row, qty: Math.max(1, row.qty - 1) } : row,
                                    ))}
                                  >
                                    -
                                  </button>
                                  <input type="text" value={String(entry.qty)} readOnly />
                                  <button
                                    type="button"
                                    className="character-ability-adjust-btn"
                                    onClick={() => setGrantTemplateEntries((current) => current.map((row) =>
                                      row.key === entry.key ? { ...row, qty: row.qty + 1 } : row,
                                    ))}
                                  >
                                    +
                                  </button>
                                  <button
                                    type="button"
                                    className="monster-example-btn"
                                    onClick={() => setGrantTemplateEntries((current) => current.filter((row) => row.key !== entry.key))}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : <p className="character-enc-help">No grant items selected yet.</p>}
                      </section>
                    </div>

                    <div className="character-sheet-right">
                      <section className="monster-section-block">
                        <div className="section-head">
                          <h3 className="monster-section-title">Targets</h3>
                          <button
                            type="button"
                            className="monster-example-btn"
                            onClick={() => setGrantTargetIds(Object.fromEntries(sortedCharacters.map((character) => [character.id, true])))}
                            disabled={grantBusy || sortedCharacters.length === 0}
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            className="monster-example-btn"
                            onClick={() => setGrantTargetIds({})}
                            disabled={grantBusy || selectedGrantTargetIds.length === 0}
                          >
                            Clear
                          </button>
                        </div>
                        {selectedGrantTargetIds.length === 0 ? <p className="character-enc-help">Choose targets from sidebar checkboxes.</p> : (
                          <div className="character-sheet-rows">
                            {selectedGrantTargetIds.map((id, targetIndex) => {
                              const character = sortedCharacters.find((entry) => entry.id === id)
                              if (!character) return null
                              const preview = grantPreviewByCharacterId.get(id)
                              const targetGold = amountForTarget(
                                parsedGrantGoldGp,
                                grantGoldSplitBetweenTargets,
                                selectedGrantTargetIds.length,
                                targetIndex,
                              )
                              return (
                                <div key={id} className="character-sheet-row character-grant-target-row">
                                  <strong>{character.name}</strong>
                                  {parsedGrantBaseXp > 0 ? (
                                    <>
                                      <small>
                                        XP {character.xp.toLocaleString()}
                                        {preview
                                          ? ` + ${preview.awardedXp.toLocaleString()} (${preview.bonusPercent > 0 ? '+' : ''}${preview.bonusPercent}% XP modifier)`
                                          : ''}
                                      </small>
                                      <small>
                                        L{character.level}
                                        {preview ? ` -> L${Math.max(character.level, preview.projectedLevel)}` : ''}
                                      </small>
                                    </>
                                  ) : null}
                                  {parsedGrantGoldGp > 0 ? (
                                    <small>
                                      Gold +{targetGold.toLocaleString()} gp
                                      {grantGoldSplitBetweenTargets ? ' (split)' : ''}
                                    </small>
                                  ) : null}
                                  {parsedGrantBaseXp <= 0 && parsedGrantGoldGp <= 0 ? (
                                    <small>Items only grant</small>
                                  ) : null}
                                </div>
                              )
                            })}
                          </div>
                        )}
                        <div className="character-sheet-tab-actions character-grant-actions">
                          <button
                            type="button"
                            className="character-current-action"
                            onClick={applyGrantToSelectedTargets}
                            disabled={grantBusy || selectedGrantTargetIds.length === 0}
                          >
                            <ShoppingBag size={14} />
                            <span>{grantBusy ? 'Granting...' : 'Grant to Selected'}</span>
                          </button>
                          <button
                            type="button"
                            className="character-current-action"
                            onClick={() => {
                              clearGrantDraft()
                              setGrantTargetIds({})
                            }}
                            disabled={grantBusy}
                          >
                            <X size={14} />
                            <span>Clear Draft</span>
                          </button>
                        </div>
                      </section>
                    </div>
                  </div>
                </section>
              </div>
            ) : !effectiveSelected ? (
              <p>Select a character from the list.</p>
            ) : (
              <div className="monster-editor-grid character-editor-grid">
                {activePage === 'core' ? (
                  <section className={isGuidedCreation ? 'character-sheet guided-creation' : 'character-sheet'}>
                    <div
                      className={
                        useIntermediateLayout
                          ? `character-sheet-main-grid intermediate${isIntermediateMobileLayout ? ' mobile-intermediate' : ''}`
                          : 'character-sheet-main-grid'
                      }
                    >
                      <div className="character-sheet-left">
                        <div className="character-sheet-header-grid">
                          <label className="character-header-field character-header-field-name">
                            <span className="character-header-tag">Name</span>
                            <input
                              type="text"
                              value={effectiveSelected.name}
                              onChange={(event) => updateSelectedCharacter({ name: event.target.value })}
                              disabled={!canEditSelected}
                            />
                          </label>
                          <label className="character-header-field character-header-field-title">
                            <span className="character-header-tag">Title</span>
                            <input
                              type="text"
                              value={titleByCharacterId[effectiveSelected.id] ?? ''}
                              onChange={(event) => {
                                setTitleByCharacterId((current) => ({
                                  ...current,
                                  [effectiveSelected.id]: event.target.value,
                                }))
                              }}
                              disabled={!canEditSelected}
                            />
                          </label>
                          <div className="character-header-compact-row">
                            <label className="character-header-field character-header-field-level">
                              <span className="character-header-tag">Level</span>
                              <input
                                type="number"
                                min={1}
                                max={14}
                                value={String(effectiveSelected.level)}
                                readOnly
                                disabled
                              />
                            </label>
                            <label className="character-header-field character-header-field-class">
                              <span className="character-header-tag">Class</span>
                              <select
                                value={effectiveSelected.className}
                                onChange={(event) => {
                                  if (!canEditClassAndAlignment) return
                                  const nextClass = event.target.value
                                  const classChanged = nextClass !== effectiveSelected.className
                                  const hasRolledForSelected = typeof hpBaseRollByCharacterId[effectiveSelected.id] === 'number'
                                  if (classChanged && hasRolledForSelected && isGuidedCreation) {
                                    setHpBaseRollByCharacterId((current) => {
                                      const next = { ...current }
                                      delete next[effectiveSelected.id]
                                      return next
                                    })
                                    updateSelectedCharacter({ className: nextClass, hpCurrent: 0, hpMax: 0 })
                                  } else {
                                    updateSelectedCharacter({ className: nextClass })
                                  }
                                  if (effectiveSelected) applyClassDerivedData(effectiveSelected.id, nextClass)
                                }}
                                disabled={!canEditClassAndAlignment}
                              >
                                {classOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                                {!classOptions.includes(effectiveSelected.className) ? (
                                  <option value={effectiveSelected.className}>{effectiveSelected.className}</option>
                                ) : null}
                              </select>
                            </label>
                          </div>
                          <label className="character-header-field character-header-field-align">
                            <span className="character-header-tag">Align</span>
                            <select
                              value={alignmentByCharacterId[effectiveSelected.id] ?? 'Neutrality'}
                              disabled={!canEditClassAndAlignment}
                              onChange={(event) => {
                                if (!canEditClassAndAlignment) return
                                setAlignmentByCharacterId((current) => ({
                                  ...current,
                                  [effectiveSelected.id]: event.target.value,
                                }))
                              }}
                            >
                              {alignmentOptions.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        {isMobile && !useIntermediateLayout ? (
                          <section className="monster-section-block">
                            <h3 className="monster-section-title">Portrait</h3>
                            <div className="character-media-wrap">
                              <EntityMediaEditor
                                entityName={effectiveSelected.name || 'character'}
                                portraitUrl={effectiveSelected.portraitUrl}
                                portraitFocusX={effectiveSelected.portraitFocusX}
                                portraitFocusY={effectiveSelected.portraitFocusY}
                                tokenIcon={effectiveSelected.tokenIcon}
                                onChange={(updates) => updateSelectedCharacter(updates)}
                                portraitAltLabel="Character portrait"
                                tokenButtonAriaLabel="Edit character token icon"
                                removePortraitMessage="Remove the portrait image from this character?"
                              />
                            </div>
                          </section>
                        ) : null}
                        <div className="character-sheet-two-col">
                          <section className="monster-section-block">
                            <div className="section-head">
                              <h3 className="monster-section-title">Ability Scores</h3>
                              {isGuidedCreation ? (
                                <button
                                  type="button"
                                  className="monster-example-btn"
                                  onClick={rollAbilityScores}
                                  disabled={!canEditSelected || hasRolledAbilityScores}
                                >
                                  {hasRolledAbilityScores ? 'Rolled' : 'Roll'}
                                </button>
                              ) : null}
                              {isGuidedCreation && hasRolledAbilityScores ? (
                                <span className="character-roll-points">Points: {availableAbilityTradePoints}</span>
                              ) : null}
                            </div>
                            <div className="character-sheet-rows">
                              {abilityRows.map((row) => (
                                <div key={row.code} className="character-sheet-row">
                                  <span className="character-sheet-code">{row.code}</span>
                                  {isGuidedCreation ? (
                                    (() => {
                                      const abilityCode = row.code as AbilityCode
                                      const currentValue = Number.parseInt(selectedAbilityScores[abilityCode], 10)
                                      const classChosen = selectedClassName !== '-'
                                      const canDecrease = canEditSelected
                                        && hasRolledAbilityScores
                                        && classChosen
                                        && Number.isFinite(currentValue)
                                        && tryBuildGuidedScores(abilityCode, currentValue - 1) !== null
                                      const canIncrease = canEditSelected
                                        && hasRolledAbilityScores
                                        && classChosen
                                        && Number.isFinite(currentValue)
                                        && tryBuildGuidedScores(abilityCode, currentValue + 1) !== null
                                      return (
                                        <div className="character-ability-adjust">
                                          {canEditSelected && hasRolledAbilityScores && !classChosen ? (
                                            <button
                                              type="button"
                                              className="character-ability-adjust-btn"
                                              onClick={() => setReallocationClassRequiredOpen(true)}
                                              aria-label="Choose class before reallocation"
                                            >
                                              -
                                            </button>
                                          ) : canDecrease ? (
                                            <button
                                              type="button"
                                              className="character-ability-adjust-btn"
                                              onClick={() => updateAbilityScore(abilityCode, String(currentValue - 1))}
                                              aria-label={`Decrease ${abilityCode}`}
                                            >
                                              -
                                            </button>
                                          ) : <span />}
                                          <input
                                            type="number"
                                            step={1}
                                            min={1}
                                            max={18}
                                            className="character-ability-score-input"
                                            value={selectedAbilityScores[abilityCode]}
                                            onChange={(event) => updateAbilityScore(abilityCode, event.target.value)}
                                            disabled
                                            readOnly
                                          />
                                          {canEditSelected && hasRolledAbilityScores && !classChosen ? (
                                            <button
                                              type="button"
                                              className="character-ability-adjust-btn"
                                              onClick={() => setReallocationClassRequiredOpen(true)}
                                              aria-label="Choose class before reallocation"
                                            >
                                              +
                                            </button>
                                          ) : canIncrease ? (
                                            <button
                                              type="button"
                                              className="character-ability-adjust-btn"
                                              onClick={() => updateAbilityScore(abilityCode, String(currentValue + 1))}
                                              aria-label={`Increase ${abilityCode}`}
                                            >
                                              +
                                            </button>
                                          ) : <span />}
                                        </div>
                                      )
                                    })()
                                  ) : (
                                    <input
                                      type="number"
                                      step={1}
                                      min={1}
                                      max={18}
                                      className="character-ability-score-input"
                                      value={selectedAbilityScores[row.code as AbilityCode]}
                                      onChange={(event) => updateAbilityScore(row.code as AbilityCode, event.target.value)}
                                      disabled={!canEditAbilityScores}
                                      placeholder="-"
                                    />
                                  )}
                                  <small>{row.note}</small>
                                </div>
                              ))}
                            </div>
                          </section>

                          <section className="monster-section-block">
                            <h3 className="monster-section-title">Saving Throws</h3>
                            <div className="character-sheet-rows">
                              {saveRows.map((row) => (
                                <div key={row.code} className="character-sheet-row">
                                  <span className="character-sheet-code">{row.code}</span>
                                  <input
                                    type="text"
                                    value={
                                      row.code === 'D' || row.code === 'W' || row.code === 'P' || row.code === 'B' || row.code === 'S'
                                        ? displayedSaveScores[row.code]
                                        : derivedWisMagicSaveModifier
                                    }
                                    readOnly
                                  />
                                  <small>{row.note}</small>
                                </div>
                              ))}
                            </div>
                          </section>
                        </div>

                        <div className={isIntermediateMobileLayout ? 'character-combat-attack-wrap character-mobile-intermediate-pair' : 'character-combat-attack-wrap'}>
                          <section className="monster-section-block">
                            <div className="section-head">
                              <h3 className="monster-section-title">Combat</h3>
                              {isGuidedCreation ? (
                                <button
                                  type="button"
                                  className="monster-example-btn"
                                  onClick={requestRollHitPoints}
                                  disabled={!canEditSelected || (hasRolledHp && !canFreeRerollHp)}
                                >
                                  {!hasRolledHp ? 'Roll HP' : canFreeRerollHp ? 'Re-roll HP' : 'HP Rolled'}
                                </button>
                              ) : null}
                            </div>
                            <div className="character-combat-layout">
                              <div className="character-combat-column">
                                <div className="character-combat-major-row">
                                  <span className="character-combat-tag">HP</span>
                                  <input
                                    type="number"
                                    value={String(effectiveSelected.hpCurrent)}
                                    onChange={(event) =>
                                      updateSelectedCharacter({ hpCurrent: Number(event.target.value || 0) })
                                    }
                                    disabled={!canEditSelected || isGuidedCreation}
                                  />
                                  <small>Hit points</small>
                                </div>
                                <div className="character-combat-side-row">
                                  <span className="character-combat-tag">Max</span>
                                  <input
                                    type="number"
                                    value={String(effectiveSelected.hpMax)}
                                    onChange={(event) => updateSelectedCharacter({ hpMax: Number(event.target.value || 0) })}
                                    disabled={!canEditSelected || isGuidedCreation}
                                  />
                                  <small>Maximum hit points</small>
                                </div>
                                <div className="character-combat-side-row">
                                  <span className="character-combat-tag">±</span>
                                  <input type="text" value={derivedConModifier} readOnly />
                                  <small>CON modifier to hit points</small>
                                </div>
                              </div>

                              <div className="character-combat-column">
                                <div className="character-combat-major-row">
                                  <span className="character-combat-tag">AC</span>
                                  <input
                                    type="number"
                                    value={String(effectiveSelected.ac)}
                                    onChange={(event) => {
                                      if (!effectiveSelected) return
                                      setAcManualOverrideByCharacterId((current) => ({
                                        ...current,
                                        [effectiveSelected.id]: true,
                                      }))
                                      updateSelectedCharacter({ ac: Number(event.target.value || 0) })
                                    }}
                                    disabled={!canEditSelected}
                                  />
                                  <small>Armour Class</small>
                                </div>
                                <div className="character-combat-side-row">
                                  <span className="character-combat-tag">Un</span>
                                  <input type="text" value={derivedUnarmouredAc} readOnly />
                                  <small>Unarmoured AC: 9 [10] + DEX AC adjustment</small>
                                </div>
                                <div className="character-combat-side-row">
                                  <span className="character-combat-tag">±</span>
                                  <input type="text" value={derivedDexAcModifier} readOnly />
                                  <small>DEX adjustment to Armour Class (descending)</small>
                                </div>
                              </div>
                            </div>
                          </section>

                          <section className="monster-section-block">
                            <h3 className="monster-section-title">Attack Rolls</h3>
                            <div className="character-attack-mod-list">
                              <div className="character-attack-mod-row">
                                <div className="character-attack-mod-cell">
                                  <span className="character-combat-tag">Mel</span>
                                  <input type="text" value={derivedMeleeModifier} readOnly />
                                </div>
                                <small>STR mod to melee att./dmg.</small>
                              </div>
                              <div className="character-attack-mod-row">
                                <div className="character-attack-mod-cell">
                                  <span className="character-combat-tag">Mis</span>
                                  <input type="text" value={derivedMissileModifier} readOnly />
                                </div>
                                <small>DEX mod to missile attacks (+1 halfling bonus)</small>
                              </div>
                            </div>
                            <div className="character-attack-thaco-row">
                              <div className="character-attack-mod-cell character-thaco-cell">
                                <span className="character-combat-tag">THAC0</span>
                                <input
                                  type="number"
                                  step={1}
                                  value={selectedThacoRaw}
                                  onChange={(event) => {
                                    if (!effectiveSelected) return
                                    setThacoByCharacterId((current) => ({
                                      ...current,
                                      [effectiveSelected.id]: event.target.value,
                                    }))
                                  }}
                                  disabled={!canEditSelected}
                                />
                              </div>
                              <p>Descending AC matrix (DAC)</p>
                            </div>
                            <div className="character-attack-matrix-grid">
                              {Array.from({ length: 10 }, (_, idx) => 9 - idx).map((armorClass) => {
                                const requiredRoll = Number.isNaN(selectedThaco) ? '' : String(selectedThaco - armorClass)
                                return (
                                  <Fragment key={`dac-${armorClass}`}>
                                    <span className="character-attack-ac-label">{armorClass}</span>
                                    <span className="character-attack-roll-value">{requiredRoll}</span>
                                  </Fragment>
                                )
                              })}
                            </div>
                            <p className="character-attack-help">
                              Descending AC: Look up attack roll in matrix to determine hit Armour Class.
                            </p>
                          </section>
                        </div>

                        <section className="monster-section-block">
                          <div className="character-encounter-movement-grid">
                            <section className="monster-section-block">
                              <h3 className="monster-section-title">Encounters</h3>
                              <div className="character-encounter-grid">
                                <div className="character-encounter-row">
                                  <span className="character-combat-tag">Init</span>
                                  <input type="text" value={derivedInitModifier} readOnly />
                                  <small>DEX modifier to initiative (+1 halfling bonus, optional)</small>
                                </div>
                                <div className="character-encounter-row">
                                  <span className="character-combat-tag">±</span>
                                  <input type="text" value={derivedReactionModifier} readOnly />
                                  <small>CHA modifier to reaction rolls</small>
                                </div>
                              </div>
                            </section>

                            <section className="monster-section-block">
                              <div className="character-section-head-with-note">
                                <h3 className="monster-section-title">Movement</h3>
                                <p>Base mv. rate = 120, unless encumbered</p>
                              </div>
                              <div className="character-encounter-grid">
                                <div className="character-encounter-row">
                                  <span className="character-combat-tag">Ov</span>
                                  <input type="number" step={1} value={String(derivedOverlandMove)} readOnly />
                                  <small>Overland: ⅕ base mv. rate (miles/day)</small>
                                </div>
                                <div className="character-encounter-row">
                                  <span className="character-combat-tag">Ex</span>
                                  <input type="number" step={1} value={String(derivedExplorationMove)} readOnly />
                                  <small>Exploration: base mv. rate (feet/turn)</small>
                                </div>
                                <div className="character-encounter-row">
                                  <span className="character-combat-tag">En</span>
                                  <input type="number" step={1} value={String(derivedEncounterMove)} readOnly />
                                  <small>Encounter: ⅓ base mv. rate (feet/round)</small>
                                </div>
                              </div>
                            </section>
                          </div>
                        </section>

                        {useIntermediateLayout && !isIntermediateMobileLayout ? (
                          <div className="character-sheet-two-col">
                            {renderAdventuringSkillsSection()}
                            {renderThiefSkillsSection()}
                          </div>
                        ) : null}

                        {isIntermediateMobileLayout ? (
                          <div className="character-mobile-intermediate-pair">
                            {renderAdventuringSkillsSection()}
                            {renderClassFeaturesSection()}
                          </div>
                        ) : (
                          renderClassFeaturesSection()
                        )}

                        {isIntermediateMobileLayout ? renderThiefSkillsSection() : null}

                        {useIntermediateLayout ? renderLanguagesSection() : null}

                      </div>

                      <div className="character-sheet-right">
                        {!isMobile || useIntermediateLayout ? (
                          <section className="monster-section-block">
                            <h3 className="monster-section-title">Portrait</h3>
                            <div className="character-media-wrap">
                              <EntityMediaEditor
                                entityName={effectiveSelected.name || 'character'}
                                portraitUrl={effectiveSelected.portraitUrl}
                                portraitFocusX={effectiveSelected.portraitFocusX}
                                portraitFocusY={effectiveSelected.portraitFocusY}
                                tokenIcon={effectiveSelected.tokenIcon}
                                onChange={(updates) => updateSelectedCharacter(updates)}
                                portraitAltLabel="Character portrait"
                                tokenButtonAriaLabel="Edit character token icon"
                                removePortraitMessage="Remove the portrait image from this character?"
                              />
                            </div>
                          </section>
                        ) : null}

                        {!useIntermediateLayout ? renderAdventuringSkillsSection() : null}

                        {!useIntermediateLayout ? renderThiefSkillsSection() : null}

                        {!useIntermediateLayout ? renderLanguagesSection() : null}
                      </div>
                    </div>
                  </section>
                ) : (
                  <section className="character-sheet character-enc-page">
                    <div className="character-store-head">
                      <p className="character-enc-note">
                        Item-based encumbrance: Optional rule. See Carcass Crawler issue #2 from Necrotic Gnome.
                      </p>
                      {isGuidedCreation ? (
                        <button
                          type="button"
                          className="character-store-open-btn"
                          onClick={() => {
                            if (selectedClassName === '-') {
                              setStoreClassRequiredOpen(true)
                              return
                            }
                            setStoreError(null)
                            setStoreOpen(true)
                          }}
                        >
                          <ShoppingBag size={14} />
                          Buy Equipment
                        </button>
                      ) : null}
                    </div>

                    <div className="character-enc-items-grid">
                      <div className="character-enc-left-col">
                        <section className="monster-section-block character-enc-unencumbering">
                        <h3 className="monster-section-title">Unencumbering Items</h3>
                        <textarea className="character-sheet-textarea short" defaultValue="" disabled={!canEditSelected} />
                        <p className="character-enc-help">
                          Clothing, necklaces, rings, etc. Not encumbering unless carried in large numbers (referee&apos;s
                          judgement).
                        </p>
                        </section>

                        <section className="monster-section-block character-enc-equipped">
                        <h3 className="monster-section-title">Equipped Items</h3>
                        <div className="character-item-rows equipped">
                          {equippedSlotItems.map((entry, index) => (
                            <div key={entry.item.id} className="character-item-row">
                              <div className="character-item-row-inner">
                                <input
                                  type="checkbox"
                                  className="character-item-slot-check"
                                  checked
                                  onChange={() => toggleItemEquip(entry.item, false)}
                                  disabled={!canEditSelected}
                                  aria-label={`Unequip slot ${index + 1}`}
                                />
                                <button
                                  type="button"
                                  className="character-item-auto-slot character-item-detail-btn"
                                  onClick={() => setItemDetailId(entry.item.id)}
                                >
                                  {entry.label}
                                </button>
                                {isGuidedCreation && canEditSelected && entry.item.kind !== 'gold' ? (
                                  <button
                                    type="button"
                                    className="monster-example-btn"
                                    onClick={() => refundItem(entry.item.id)}
                                  >
                                    Sell
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ))}
                          {Array.from({ length: Math.max(0, equippedRowCount - equippedSlotItems.length) }, (_, emptyIndex) => (
                            <div key={`equipped-empty-${emptyIndex}`} className="character-item-row">
                              <div className="character-item-row-inner">
                                <span className="character-item-input" />
                              </div>
                            </div>
                          ))}
                        </div>
                        {equippedSlotItems.length > equippedRowCount ? (
                          <p className="error">Too many equipped items for available equipped slots.</p>
                        ) : null}
                        <p className="character-enc-help">
                          Anything held, actively in use, or ready to use at short notice: armour worn, shields or
                          weapons held, sheathed weapons, items worn on the belt.
                        </p>
                        </section>

                        {selectedClassName === 'Magic-User' || selectedClassName === 'Cleric' || selectedMemorizedSpells.length > 0 ? (
                          <section className="monster-section-block character-enc-memorized">
                            <div className="section-head">
                              <h3 className="monster-section-title">Prepared Spells</h3>
                              {selectedClassName === 'Cleric' ? (
                                <button
                                  type="button"
                                  className="monster-example-btn"
                                  onClick={openDivinePrepareModal}
                                  disabled={!canOpenDivinePrepareModal}
                                >
                                  Pray to Prepare
                                </button>
                              ) : null}
                            </div>
                            {selectedMemorizedSpells.length === 0 ? (
                              <p className="character-enc-help">No prepared spells.</p>
                            ) : (
                              <div className="character-memorized-spells-list">
                                {selectedMemorizedSpells.map((spell, index) => (
                                  <div key={`${spell.id}-${index}`} className="character-memorized-spell-row">
                                    <button
                                      type="button"
                                      className="character-memorized-spell-open"
                                      onClick={() => setMemorizedSpellDetailId(spell.id)}
                                    >
                                      <strong>{spell.name}</strong>
                                      <small>Level {spell.level}</small>
                                    </button>
                                    <button
                                      type="button"
                                      className="monster-example-btn"
                                      onClick={() => consumeMemorizedSpell(spell.id)}
                                      disabled={!canEditSelected}
                                    >
                                      Use
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <p className="character-enc-help">
                              Slots:
                              {preparedSlotsPerDay.map((limit, levelIndex) => (
                                <Fragment key={`slot-cap-${levelIndex}`}>
                                  {' '}L{levelIndex + 1} {memorizedCountsByLevel[levelIndex + 1] ?? 0}/{limit}
                                </Fragment>
                              ))}
                            </p>
                          </section>
                        ) : null}
                      </div>

                      <section className="monster-section-block character-enc-packed">
                        <h3 className="monster-section-title">Packed Items</h3>
                        <div className="character-item-rows packed">
                          {(() => {
                            let packedCursor = 0
                            const renderPackedSlot = (slotIndex: number, unlocked: boolean, slotLabel?: string) => {
                              const slotItem = packedCursor < packedSlotItems.length && unlocked
                                ? packedSlotItems[packedCursor]
                                : null
                              if (slotItem) packedCursor += 1
                              return (
                                <label
                                  key={`packed-slot-${slotIndex}`}
                                  className={`character-item-row${unlocked ? '' : ' locked'}`}
                                >
                                  {slotItem ? (
                                    <div className="character-item-row-inner">
                                      {!slotItem.isGold ? (
                                        <input
                                          type="checkbox"
                                          className="character-item-slot-check"
                                          checked={false}
                                          onChange={() => {
                                            if (equippedSlotItems.length >= equippedRowCount) return
                                            toggleItemEquip(slotItem.item, true)
                                          }}
                                          disabled={!canEditSelected || slotItem.isGold}
                                          aria-label={`Equip slot ${slotIndex + 1}`}
                                        />
                                      ) : null}
                                      <button
                                        type="button"
                                        className="character-item-auto-slot character-item-detail-btn"
                                        onClick={() => setItemDetailId(slotItem.item.id)}
                                      >
                                        {slotItem.label}
                                      </button>
                                      {isGuidedCreation && canEditSelected && !slotItem.isGold ? (
                                        <button
                                          type="button"
                                          className="monster-example-btn"
                                          onClick={() => refundItem(slotItem.item.id)}
                                        >
                                          Sell
                                        </button>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <div className="character-item-row-inner">
                                      {isGuidedCreation ? (
                                        <span className="character-item-input" />
                                      ) : (
                                        <button
                                          type="button"
                                          className="character-item-add-btn"
                                          onClick={() => openAddItemModal(false)}
                                          disabled={!canEditSelected || !unlocked}
                                          aria-label={`Add packed item to slot ${slotIndex + 1}`}
                                        >
                                          <Plus size={14} />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  {slotLabel && !unlocked ? <span className="character-item-slot-label">{slotLabel}</span> : null}
                                </label>
                              )
                            }

                            return (
                              <>
                                {Array.from({ length: packedStrengthSlotCount }, (_, index) => {
                                  const threshold = packedSlotThresholds[index]
                                  const unlocked = !Number.isNaN(selectedStr) && selectedStr >= threshold
                                  return renderPackedSlot(index, unlocked, packedSlotLabels[index])
                                })}
                                {packedMovementBands.map((band, bandIndex) => {
                                  const bandOffset = packedMovementBands
                                    .slice(0, bandIndex)
                                    .reduce((sum, entry) => sum + entry.slotCount, 0)
                                  const bandStartIndex = packedStrengthSlotCount + bandOffset
                                  return (
                                    <Fragment key={`packed-band-${band.label}`}>
                                      <div className="character-item-divider">
                                        <span>{band.label}</span>
                                      </div>
                                      {Array.from({ length: band.slotCount }, (_, rowOffset) =>
                                        renderPackedSlot(bandStartIndex + rowOffset, true),
                                      )}
                                    </Fragment>
                                  )
                                })}
                              </>
                            )
                          })()}
                        </div>
                        {packedItems.length > availablePackedSlotIndices.length ? (
                          <p className="error">Too many packed items for available packed slots.</p>
                        ) : null}
                        {overflowFeedback ? (
                          <p className="character-overflow-feedback">{overflowFeedback}</p>
                        ) : null}
                        {approvalPendingFeedback ? (
                          <p className="character-overflow-feedback">{approvalPendingFeedback}</p>
                        ) : null}
                        {rejections
                          .filter((r) => r.characterId === effectiveSelected?.id)
                          .map((r) => (
                            <p key={r.id} className="error character-approval-rejection">
                              {r.action === 'sell'
                                ? `GM did not approve selling ${r.item?.typeName ?? 'item'}`
                                : r.action === 'learn_spell'
                                  ? `GM did not approve spell transcription${r.spellNames?.length ? ` (${r.spellNames.join(', ')})` : ''}`
                                  : `GM did not approve your item creation${r.item?.typeName ? ` (${r.item.typeName})` : ''}`}
                              <button
                                type="button"
                                className="monster-example-btn"
                                style={{ marginLeft: 8 }}
                                onClick={() => void dismissRejection(r.id)}
                              >
                                Dismiss
                              </button>
                            </p>
                          ))}
                        <p className="character-enc-help">
                          <strong>Current movement:</strong> {currentPackedMovement}
                        </p>
                        <p className="character-enc-help">
                          All other equipment, packed into sacks, backpacks, etc. In combat, retrieving a packed item
                          optionally takes one round. STR modifier (optional): Optionally, remove slots at the top of
                          the list based on the character&apos;s STR score. If not using this optional rule: Remove the top
                          3 slots.
                        </p>
                      </section>
                    </div>

                    <section className="monster-section-block">
                      <h3 className="monster-section-title">Other Notes</h3>
                      <p className="character-enc-help centered">Spells, mounts, retainers, areas explored, clues.</p>
                      <textarea className="character-sheet-textarea" defaultValue="" disabled={!canEditSelected} />
                    </section>

                    <section className="character-enc-xp-strip">
                      <div className="character-enc-xp-primary">
                        <span className="character-enc-xp-tag">XP</span>
                        <div className="character-enc-xp-input-wrap">
                          <small>Experience points</small>
                          <input
                            type="number"
                            step={1}
                            value={String(effectiveSelected.xp)}
                            onChange={(event) => updateSelectedCharacter({ xp: Number(event.target.value || 0) })}
                            disabled={!canEditSelected}
                          />
                        </div>
                      </div>

                      <div className="character-enc-xp-side">
                        <div className="character-enc-xp-side-row">
                          <span className="character-enc-xp-tag">Next</span>
                          <input
                            type="text"
                            value={selectedNextLevelXp === null ? 'Max' : selectedNextLevelXp.toLocaleString()}
                            readOnly
                            disabled
                          />
                          <small>
                            {selectedXpToNextLevel === null
                              ? 'Class level cap reached'
                              : `${selectedXpToNextLevel.toLocaleString()} XP remaining`}
                          </small>
                        </div>
                        <div className="character-enc-xp-side-row">
                          <span className="character-enc-xp-tag">%</span>
                          <input
                            type="text"
                            value={`${selectedPrimeXpModifierPercent > 0 ? '+' : ''}${selectedPrimeXpModifierPercent}%`}
                            readOnly
                            disabled
                          />
                          <small>Prime requisite modifier ({primeRequisiteLabel})</small>
                        </div>
                      </div>
                    </section>
                  </section>
                )}

                {isMobile ? (
                  <div className="character-sheet-page-tabs bottom">
                    <button
                      type="button"
                      className={activePage === 'core' ? 'character-sheet-tab active' : 'character-sheet-tab'}
                      onClick={() => setActivePage('core')}
                    >
                      Core
                    </button>
                    <button
                      type="button"
                      className={activePage === 'encumbrance' ? 'character-sheet-tab active' : 'character-sheet-tab'}
                      onClick={() => setActivePage('encumbrance')}
                    >
                      Items
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
      {storeOpen && effectiveSelected ? (
        <div className="store-modal-overlay" role="dialog" aria-modal="true">
          <div className="store-modal">
            <div className="store-modal-head">
              <div>
                <h3>Store</h3>
                <p>Buy starting equipment for this draft character.</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  if (selectedStoreCart.length > 0) {
                    setStoreCloseConfirmOpen(true)
                    return
                  }
                  setStoreOpen(false)
                }}
                aria-label="Close store"
              >
                <X size={14} />
              </button>
            </div>

            <div className="store-wallet">
              {hasRolledStartingGold ? (
                <>
                  <p className="store-wallet-compact">
                    <strong>{selectedStoreRemaining}</strong>/{selectedStartingGold} gp
                  </p>
                </>
              ) : (
                <button type="button" className="store-buy-btn" onClick={rollStartingGold} disabled={!canEditSelected}>
                  Roll 3d6 x 10
                </button>
              )}
            </div>

            <div className="store-modal-body">
              <div className="store-catalog">
                <div className="store-category-tabs">
                  {(Object.keys(STORE_CATEGORY_LABELS) as StoreCategoryId[]).map((categoryId) => (
                    <button
                      key={categoryId}
                      type="button"
                      className={storeCategory === categoryId ? 'store-category-btn active' : 'store-category-btn'}
                      onClick={() => setStoreCategory(categoryId)}
                    >
                      {STORE_CATEGORY_LABELS[categoryId]}
                    </button>
                  ))}
                </div>

                <div className="store-catalog-content">
                  {storeCategory === 'other' ? (
                    <div className="store-custom-panel">
                      <h4>Custom equipment</h4>
                      <p>
                        For items not listed, use this to add referee-approved equipment and cost.
                      </p>
                      <label>
                        Name
                        <input
                          type="text"
                          value={customStoreName}
                          onChange={(event) => setCustomStoreName(event.target.value)}
                          placeholder="e.g. Silver whistle"
                        />
                      </label>
                      <label>
                        Cost (gp)
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={customStoreCost}
                          onChange={(event) => setCustomStoreCost(event.target.value)}
                          placeholder="0"
                        />
                      </label>
                      <label>
                        Description (optional)
                        <input
                          type="text"
                          value={customStoreDescription}
                          onChange={(event) => setCustomStoreDescription(event.target.value)}
                          placeholder="short note"
                        />
                      </label>
                      <button
                        type="button"
                        className="store-buy-btn"
                        onClick={handleBuyCustomStoreItem}
                        disabled={!canEditSelected}
                      >
                        Add to Packed Items
                      </button>
                    </div>
                  ) : (
                    <div className="store-items-grid">
                      {visibleStoreItems.map((item) => (
                        <article key={item.id} className="store-item-card">
                          <div className="store-item-head">
                            <strong>{item.name}</strong>
                            <span>{item.costGp} gp</span>
                          </div>
                          <p>{item.description}</p>
                          {item.kind === 'weapon' && item.weaponId && !isWeaponTemplateAllowedForClass(item.weaponId, selectedClassName) ? (
                            <p className="store-item-note">Class restriction</p>
                          ) : null}
                          {item.kind === 'armour' && item.armourId && !isArmourTemplateAllowedForClass(item.armourId, selectedClassName) ? (
                            <p className="store-item-note">Class restriction</p>
                          ) : null}
                          <button
                            type="button"
                            className="store-buy-btn"
                            onClick={() => handleStoreBuy(item)}
                            disabled={!canEditSelected}
                          >
                            Buy
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <aside className="store-tally store-cart">
                <div className="store-tally-head">
                  <h4>Cart / Purchases</h4>
                  <span>{selectedStoreCartTotal} gp total</span>
                </div>
                {selectedStoreCart.length === 0 ? (
                  <p className="store-tally-empty">No purchases yet.</p>
                ) : (
                  <div className="store-tally-list">
                    {selectedStoreCart.map((line) => (
                      <div key={line.key} className="store-tally-row">
                        <span>{line.name}</span>
                        <div className="store-tally-qty-controls">
                          <button type="button" className="store-qty-btn" onClick={() => decrementCartEntry(line.key)}>-</button>
                          <span>x{line.qty}</span>
                          <button type="button" className="store-qty-btn" onClick={() => incrementCartEntry(line.key)}>+</button>
                        </div>
                        <strong>{line.qty * line.costGp} gp</strong>
                        <button type="button" className="store-remove-btn" onClick={() => removeCartEntry(line.key)}>Remove</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="store-cart-actions">
                  <button
                    type="button"
                    className="store-buy-btn"
                    onClick={applyStorePurchases}
                    disabled={!canEditSelected || storeCartExceedsPackedSlots}
                  >
                    Apply Purchases
                  </button>
                  <button type="button" className="store-buy-btn" onClick={clearCart} disabled={!canEditSelected || selectedStoreCart.length === 0}>
                    Clear Cart
                  </button>
                </div>
                <p className={storeCartExceedsPackedSlots ? 'error' : 'store-item-note'}>
                  Packed slots: {selectedStoreOpenPackedSlots} open / {selectedStoreRequiredPacked} needed
                </p>
                {storeCartExceedsPackedSlots ? (
                  <p className="error">Not enough packed slots. Reorganize inventory to purchase these goods.</p>
                ) : null}
              </aside>
            </div>

            {storeError ? <p className="error">{storeError}</p> : null}
          </div>
        </div>
      ) : null}
      {createCharacterModalOpen ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-modal character-create-modal">
            <h3>Create Character</h3>
            <p>Is this a brand new character or an established one?</p>
            <div className="character-create-modal-actions">
              <button
                type="button"
                onClick={() => {
                  addCharacter('new')
                  setCreateCharacterModalOpen(false)
                }}
              >
                New
              </button>
              <button
                type="button"
                onClick={() => {
                  addCharacter('established')
                  setCreateCharacterModalOpen(false)
                }}
              >
                Established
              </button>
            </div>
            <div className="confirm-actions">
              <button type="button" onClick={() => setCreateCharacterModalOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <ConfirmModal
        open={storeCloseConfirmOpen}
        title="Discard cart?"
        message="You have unapplied purchases in your cart. Close store and discard them?"
        confirmLabel="Discard"
        onConfirm={() => {
          clearCart()
          setStoreCloseConfirmOpen(false)
          setStoreOpen(false)
        }}
        onCancel={() => setStoreCloseConfirmOpen(false)}
      />
      {(() => {
        const detailItem = itemDetailId ? selectedInventory.find((i) => i.id === itemDetailId) ?? null : null
        if (!detailItem) return null
        const isSpellBookDetailItem = detailItem.kind === 'general' && detailItem.typeId === SPELL_BOOK_TYPE_ID
        const selectedSpellBookSpell = spellBookSelectedSpellId ? arcaneSpellById[spellBookSelectedSpellId] : null
        const itemKindLabel = detailItem.kind === 'weapon' ? 'Weapon'
          : detailItem.kind === 'armour' ? 'Armour'
          : detailItem.kind === 'ammunition' ? 'Ammunition'
          : detailItem.kind === 'gold' ? 'Gold'
          : detailItem.kind === 'consumable' ? 'Consumable'
          : 'General'
        return (
          <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={() => setItemDetailId(null)}>
            <div className="confirm-modal item-detail-modal" onClick={(e) => e.stopPropagation()}>
              <div className="item-detail-meta">
                <span className="item-detail-kind">{itemKindLabel}</span>
                {detailItem.costGp > 0 ? <span>{detailItem.costGp} gp</span> : null}
                <span>{detailItem.equipped ? 'Equipped' : 'Packed'}</span>
              </div>
              {detailItem.kind === 'gold' ? (
                <div className="item-detail-weapon-form">
                  <h3>Gold: {selectedGoldTotal} gp</h3>
                  {canEditSelected ? (
                    <label className="item-detail-field">
                      <span className="item-detail-field-label">Spend Amount</span>
                      <div className="character-inline-unit-field">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={goldSpendAmount}
                          onChange={(e) => setGoldSpendAmount(e.target.value)}
                          placeholder="0"
                        />
                        <span>gp</span>
                      </div>
                    </label>
                  ) : null}
                </div>
              ) : detailItem.kind === 'weapon' ? (() => {
                const w = detailItem as CharacterWeaponItem
                const template = w.typeId && w.typeId !== 'custom' ? weaponCatalogById[w.typeId] : null
                return (
                  <div className="item-detail-weapon-form">
                    <label className="character-weapon-primary-field">
                      Template
                      <select
                        value={w.typeId || 'custom'}
                        onChange={(e) => updateWeaponRow(w.id, { typeId: e.target.value })}
                        disabled={!canEditSelected}
                      >
                        <option value="custom">Custom</option>
                        {OSE_WEAPON_CATALOG.map((weapon) => (
                          <option
                            key={weapon.id}
                            value={weapon.id}
                            disabled={!isWeaponTemplateAllowedForClass(weapon.id, selectedClassName)}
                          >
                            {`${weapon.name} (${weapon.costGp} gp)`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="character-weapon-primary-field">
                      Name
                      <input
                        type="text"
                        value={w.name ?? ''}
                        onChange={(e) => updateWeaponRow(w.id, { name: e.target.value })}
                        disabled={!canEditSelected}
                        placeholder="Optional"
                      />
                    </label>
                    {w.typeId === 'custom' ? (
                      <label className="character-weapon-primary-field">
                        Type
                        <input
                          type="text"
                          value={w.typeName ?? ''}
                          onChange={(e) => updateWeaponRow(w.id, { typeName: e.target.value })}
                          disabled={!canEditSelected}
                          placeholder="e.g. Bec de corbin"
                        />
                      </label>
                    ) : null}
                    <div className="character-weapon-mobile-grid">
                      <label className="character-weapon-edit-field">
                        Dmg
                        <div className="character-weapon-damage-inputs">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={w.damageDiceCount ?? ''}
                            onChange={(e) => updateWeaponRow(w.id, { damageDiceCount: e.target.value })}
                            disabled={!canEditSelected}
                          />
                          <select
                            value={w.damageDiceSides ?? ''}
                            onChange={(e) => updateWeaponRow(w.id, { damageDiceSides: e.target.value })}
                            disabled={!canEditSelected}
                          >
                            <option value="">-</option>
                            <option value="4">d4</option>
                            <option value="6">d6</option>
                            <option value="8">d8</option>
                            <option value="10">d10</option>
                            <option value="12">d12</option>
                            <option value="20">d20</option>
                          </select>
                        </div>
                      </label>
                      <label className="character-weapon-edit-field character-weapon-range-field">
                        Range
                        <div className="character-weapon-triplet-inputs">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={w.rangeShort ?? ''}
                            onChange={(e) => updateWeaponRow(w.id, { rangeShort: e.target.value })}
                            disabled={!canEditSelected}
                          />
                          <span>/</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={w.rangeMedium ?? ''}
                            onChange={(e) => updateWeaponRow(w.id, { rangeMedium: e.target.value })}
                            disabled={!canEditSelected}
                          />
                          <span>/</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={w.rangeLong ?? ''}
                            onChange={(e) => updateWeaponRow(w.id, { rangeLong: e.target.value })}
                            disabled={!canEditSelected}
                          />
                        </div>
                      </label>
                      {template ? (
                        <label className="character-weapon-edit-field">
                          Cost
                          <div className="character-inline-unit-field">
                            <input type="text" value={template.costGp} readOnly disabled />
                            <span>gp</span>
                          </div>
                        </label>
                      ) : null}
                    </div>
                    <label className="character-weapon-card-check">
                      <input
                        type="checkbox"
                        checked={w.twoHanded}
                        onChange={(e) => updateWeaponRow(w.id, { twoHanded: e.target.checked })}
                        disabled={!canEditSelected || (!!w.typeId && w.typeId !== 'custom') || selectedClassName === 'Halfling'}
                      />
                      Two-handed
                    </label>
                    <div className="character-weapon-magic-row">
                      <label className="character-weapon-card-check">
                        <input
                          type="checkbox"
                          checked={w.isMagic}
                          onChange={(e) => updateWeaponRow(w.id, { isMagic: e.target.checked })}
                          disabled={!canEditSelected}
                        />
                        Magic
                      </label>
                      {w.isMagic ? (
                        <label className="character-weapon-magic-bonus character-weapon-edit-field">
                          Bonus
                          <input
                            type="number"
                            step={1}
                            value={w.attackBonus ?? ''}
                            onChange={(e) => updateWeaponRow(w.id, { attackBonus: e.target.value })}
                            disabled={!canEditSelected}
                          />
                        </label>
                      ) : null}
                    </div>
                    <label className="character-weapon-edit-field">
                      Notes
                      <textarea
                        value={w.notes}
                        onChange={(e) => updateWeaponRow(w.id, { notes: e.target.value })}
                        disabled={!canEditSelected}
                        placeholder="Description, magic properties, etc."
                      />
                    </label>
                  </div>
                )
              })() : detailItem.kind === 'armour' ? (() => {
                const a = detailItem as CharacterArmourItem
                const template = a.typeId && a.typeId !== 'custom' ? armourCatalogById[a.typeId] : null
                return (
                  <div className="item-detail-weapon-form">
                    <label className="character-weapon-primary-field">
                      Template
                      <select
                        value={a.typeId || 'custom'}
                        onChange={(e) => updateArmourRow(a.id, { typeId: e.target.value })}
                        disabled={!canEditSelected || !canClassEquipArmour}
                      >
                        <option value="custom">Custom</option>
                        {OSE_ARMOUR_CATALOG.map((armour) => (
                          <option
                            key={armour.id}
                            value={armour.id}
                            disabled={!isArmourTemplateAllowedForClass(armour.id, selectedClassName)}
                          >
                            {`${armour.name} (${armour.costGp} gp)`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="character-weapon-primary-field">
                      Name
                      <input
                        type="text"
                        value={a.name ?? ''}
                        onChange={(e) => updateArmourRow(a.id, { name: e.target.value })}
                        disabled={!canEditSelected}
                        placeholder="Optional"
                      />
                    </label>
                    {a.typeId === 'custom' ? (
                      <label className="character-weapon-primary-field">
                        Type
                        <input
                          type="text"
                          value={a.typeName ?? ''}
                          onChange={(e) => updateArmourRow(a.id, { typeName: e.target.value })}
                          disabled={!canEditSelected}
                          placeholder="e.g. Brigandine"
                        />
                      </label>
                    ) : null}
                    <div className="character-weapon-mobile-grid">
                      <label className="character-weapon-edit-field">
                        {a.armourType === 'shield' ? 'Shield Mod' : 'Armour Class'}
                        <input
                          type="number"
                          step={1}
                          value={a.armourType === 'shield' ? (a.shieldMod ?? '') : (a.armourClass ?? '')}
                          onChange={(e) =>
                            updateArmourRow(
                              a.id,
                              a.armourType === 'shield'
                                ? { shieldMod: e.target.value }
                                : { armourClass: e.target.value },
                            )}
                          disabled={!canEditSelected}
                        />
                      </label>
                      <label className="character-weapon-edit-field">
                        Type
                        <select
                          value={a.armourType}
                          onChange={(e) => updateArmourRow(a.id, { armourType: e.target.value as 'body' | 'shield' })}
                          disabled={!canEditSelected}
                        >
                          <option value="body">Body Armour</option>
                          <option value="shield">Shield</option>
                        </select>
                      </label>
                      {template ? (
                        <label className="character-weapon-edit-field">
                          Cost
                          <div className="character-inline-unit-field">
                            <input type="text" value={template.costGp} readOnly disabled />
                            <span>gp</span>
                          </div>
                        </label>
                      ) : null}
                    </div>
                    <div className="character-weapon-magic-row">
                      <label className="character-weapon-card-check">
                        <input
                          type="checkbox"
                          checked={a.isMagic}
                          onChange={(e) => updateArmourRow(a.id, { isMagic: e.target.checked })}
                          disabled={!canEditSelected}
                        />
                        Magic
                      </label>
                      {a.isMagic ? (
                        <label className="character-weapon-magic-bonus character-weapon-edit-field">
                          Mod
                          <input
                            type="number"
                            step={1}
                            value={a.magicMod ?? ''}
                            onChange={(e) => updateArmourRow(a.id, { magicMod: e.target.value })}
                            disabled={!canEditSelected}
                          />
                        </label>
                      ) : null}
                    </div>
                    <label className="character-weapon-edit-field">
                      Notes
                      <textarea
                        value={a.notes}
                        onChange={(e) => updateArmourRow(a.id, { notes: e.target.value })}
                        disabled={!canEditSelected}
                        placeholder="Description, magic properties, etc."
                      />
                    </label>
                  </div>
                )
              })() : isSpellBookDetailItem ? (
                <div className="character-spellbook-panel">
                  <div className="character-spellbook-head">
                    <h3>Spell Book</h3>
                    <p>Spells currently written in this book.</p>
                  </div>
                  {selectedSpellBookSpells.length === 0 ? (
                    <p className="character-enc-help">No spells in this spell book yet.</p>
                  ) : (
                    <div className="character-spellbook-list">
                      {selectedSpellBookSpells.map((spell) => (
                        <article
                          key={spell.id}
                          className={spellBookSelectedSpellId === spell.id ? 'character-spellbook-row active' : 'character-spellbook-row'}
                        >
                          <button
                            type="button"
                            className="character-spellbook-select"
                            onClick={() => setSpellBookSelectedSpellId(spell.id)}
                          >
                            <div className="character-spellbook-select-head">
                              <strong>{spell.name}</strong>
                              {spellBookSelectedSpellId === spell.id ? (
                                <span className="character-spellbook-selected-tag">Selected</span>
                              ) : null}
                            </div>
                            <small>Level {spell.level}</small>
                            {spell.rangeText || spell.durationText ? (
                              <small className="character-spellbook-meta">
                                {spell.rangeText ? `Range: ${spell.rangeText}` : null}
                                {spell.rangeText && spell.durationText ? ' | ' : null}
                                {spell.durationText ? `Duration: ${spell.durationText}` : null}
                              </small>
                            ) : null}
                          </button>
                          {isInFinalizationFlow && canEditSelected ? (
                            <button
                              type="button"
                              className="monster-example-btn"
                              onClick={() => removeSpellFromBook(spell.id)}
                            >
                              Remove
                            </button>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  )}
                  {spellBookFeedback ? <p className="character-overflow-feedback">{spellBookFeedback}</p> : null}
                  {selectedSpellBookSpell ? (
                    <p className="character-enc-help">Selected for memorization: <strong>{selectedSpellBookSpell.name}</strong></p>
                  ) : (
                    <p className="character-enc-help">Select a spell from the list, then click Memorize.</p>
                  )}
                  <div className="character-spellbook-actions">
                    <button
                      type="button"
                      className="store-buy-btn"
                      onClick={openSpellBookAddModal}
                      disabled={!canOpenSpellBookAddModal}
                    >
                      Add Spells
                    </button>
                  </div>
                  {isInFinalizationFlow ? (
                    <p className="character-enc-help">Finalize character to enable memorization.</p>
                  ) : null}
                </div>
              ) : (
                <>
                  <label className="item-detail-field">
                    <span className="item-detail-field-label">Type</span>
                    <input
                      type="text"
                      value={detailItem.typeName ?? ''}
                      onChange={(e) => updateInventoryItem(detailItem.id, { typeName: e.target.value })}
                      disabled={!canEditSelected}
                    />
                  </label>
                  <label className="item-detail-field">
                    <span className="item-detail-field-label">Name (Optional)</span>
                    <input
                      type="text"
                      value={detailItem.name ?? ''}
                      onChange={(e) => updateInventoryItem(detailItem.id, { name: e.target.value })}
                      disabled={!canEditSelected}
                    />
                  </label>
                  {(detailItem.kind === 'ammunition' || detailItem.kind === 'consumable') ? (
                    <label className="item-detail-field">
                      <span className="item-detail-field-label">Qty</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={detailItem.qty}
                        onChange={(e) => updateInventoryItem(detailItem.id, { qty: Number(e.target.value) || 0 })}
                        disabled={!canEditSelected}
                      />
                    </label>
                  ) : null}
                  {detailItem.kind === 'consumable' ? (
                    <>
                      <label className="item-detail-field">
                        <span className="item-detail-field-label">Use Mode</span>
                        <select
                          value={(detailItem as CharacterConsumableItem).useMode}
                          onChange={(e) => updateInventoryItem(detailItem.id, { useMode: e.target.value as 'consume' | 'use' })}
                          disabled={!canEditSelected}
                        >
                          <option value="consume">Consume (drink, eat, apply)</option>
                          <option value="use">Use (light, activate, burn)</option>
                        </select>
                      </label>
                      <label className="item-detail-field">
                        <span className="item-detail-field-label">Effect</span>
                        <textarea
                          className="item-detail-notes"
                          value={(detailItem as CharacterConsumableItem).effectText ?? ''}
                          onChange={(e) => updateInventoryItem(detailItem.id, { effectText: e.target.value })}
                          disabled={!canEditSelected}
                          placeholder="Optional effect description"
                          rows={2}
                        />
                      </label>
                    </>
                  ) : null}
                  <label className="item-detail-field">
                    <span className="item-detail-field-label">Notes</span>
                    <textarea
                      className="item-detail-notes"
                      value={detailItem.notes}
                      onChange={(e) => updateInventoryItem(detailItem.id, { notes: e.target.value })}
                      disabled={!canEditSelected}
                      placeholder="Description, magic properties, etc."
                      rows={3}
                    />
                  </label>
                </>
              )}
              <div className="confirm-actions">
                {canEditSelected && detailItem.kind === 'gold' ? (
                  <button
                    type="button"
                    className="confirm-danger"
                    onClick={() => setGoldSpendConfirmAmount(parsedGoldSpendAmount)}
                    disabled={
                      parsedGoldSpendAmount <= 0
                      || parsedGoldSpendAmount > selectedGoldTotal
                    }
                  >
                    Spend
                  </button>
                ) : null}
                {detailItem.kind !== 'gold' && !isSpellBookDetailItem ? (
                  <button
                    type="button"
                    onClick={() => {
                      toggleItemEquip(detailItem, !detailItem.equipped)
                      setItemDetailId(null)
                    }}
                    disabled={!canEditSelected}
                  >
                    {detailItem.equipped ? 'Unequip' : 'Equip'}
                  </button>
                ) : null}
                {canEditSelected && detailItem.kind !== 'gold' && !isSpellBookDetailItem ? (
                  <button
                    type="button"
                    className="confirm-danger"
                    onClick={() => setDropConfirmItemId(detailItem.id)}
                  >
                    Drop
                  </button>
                ) : null}
                {canEditSelected && detailItem.kind !== 'gold' && !isSpellBookDetailItem ? (
                  <button
                    type="button"
                    className="confirm-danger"
                    onClick={() => {
                      if (isGuidedCreation) {
                        refundItem(detailItem.id)
                        setItemDetailId(null)
                      } else {
                        setSellConfirmItemId(detailItem.id)
                      }
                    }}
                  >
                    {detailItem.costGp > 0 ? `Sell (${detailItem.costGp} gp)` : 'Remove'}
                  </button>
                ) : null}
                {isSpellBookDetailItem ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedSpellBookSpell?.id) return
                      memorizeSpell(selectedSpellBookSpell.id)
                    }}
                    disabled={!selectedSpellBookSpell?.id || !canEditSelected || !canMemorizeSpell}
                  >
                    Memorize
                  </button>
                ) : null}
                <button type="button" onClick={() => setItemDetailId(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      })()}
      {spellBookAddModalOpen && selectedClassName === 'Magic-User' ? (
        <div className="store-modal-overlay spellbook-add-overlay" role="dialog" aria-modal="true">
          <div className="store-modal character-spell-add-modal">
            <div className="store-modal-head">
              <div>
                <h3>Add Spells</h3>
                <p>Select spells to write into the spell book.</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  setSpellBookAddModalOpen(false)
                  setSpellBookPendingAddIds([])
                  setSpellBookExpandedSpellId(null)
                }}
                aria-label="Close add spells"
              >
                <X size={14} />
              </button>
            </div>

            <div className="store-modal-body">
              <div className="character-spell-add-main">
                <div className="store-category-tabs">
                  {accessibleSpellLevels.map((level) => (
                    <button
                      key={`spell-level-tab-${level}`}
                      type="button"
                      className={spellBookAddTabLevel === level ? 'store-category-btn active' : 'store-category-btn'}
                      onClick={() => setSpellBookAddTabLevel(level)}
                    >
                      Level {level}
                    </button>
                  ))}
                </div>

                <div className="store-grid-wrap">
                  <div className="store-item-grid">
                    {ARCANE_SPELL_CATALOG
                      .filter((spell) => spell.level === spellBookAddTabLevel)
                      .map((spell) => {
                        const alreadyInBook = selectedSpellBookSpellIds.includes(spell.id)
                        const pending = spellBookPendingAddIds.includes(spell.id)
                        const expanded = spellBookExpandedSpellId === spell.id
                        return (
                          <article
                            key={spell.id}
                            className={expanded ? 'store-item-card spell-card-expanded' : 'store-item-card'}
                            onClick={() => setSpellBookExpandedSpellId(expanded ? null : spell.id)}
                          >
                            <header>
                              <h4>{spell.name}</h4>
                              <span>Level {spell.level}</span>
                            </header>
                            {spell.rangeText || spell.durationText ? (
                              <p className="spell-card-meta">
                                {spell.rangeText ? `Range: ${spell.rangeText}` : null}
                                {spell.rangeText && spell.durationText ? ' | ' : null}
                                {spell.durationText ? `Duration: ${spell.durationText}` : null}
                              </p>
                            ) : null}
                            <p className={expanded ? 'spell-card-description expanded' : 'spell-card-description'}>
                              {spell.description}
                            </p>
                            <button
                              type="button"
                              className="store-buy-btn"
                              onClick={(event) => {
                                event.stopPropagation()
                                if (pending) {
                                  removePendingSpell(spell.id)
                                } else {
                                  queueSpellForBook(spell.id)
                                }
                              }}
                              disabled={alreadyInBook}
                            >
                              {alreadyInBook ? 'In Spell Book' : pending ? 'Remove' : 'Add Spell'}
                            </button>
                          </article>
                        )
                      })}
                  </div>
                </div>
              </div>

              <aside className="store-tally store-cart">
                <div className="store-tally-head">
                  <h4>Selected Spells</h4>
                  <span>{spellBookPendingAddIds.length} selected</span>
                </div>
                {pendingSpellObjects.length === 0 ? (
                  <p className="store-tally-empty">No spells selected yet.</p>
                ) : (
                  <div className="store-tally-list">
                    {pendingSpellObjects.map((spell) => (
                      <div key={`pending-${spell.id}`} className="store-tally-row">
                        <span>{spell.name}</span>
                        <strong>Lvl {spell.level}</strong>
                        <button
                          type="button"
                          className="store-remove-btn"
                          onClick={() => removePendingSpell(spell.id)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="store-cart-actions">
                  <button
                    type="button"
                    className="store-buy-btn"
                    onClick={commitPendingSpellsToBook}
                  >
                    Add Spells
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      ) : null}
      {divinePrepareModalOpen && selectedClassName === 'Cleric' ? (
        <div className="store-modal-overlay spellbook-add-overlay" role="dialog" aria-modal="true">
          <div className="store-modal character-spell-add-modal">
            <div className="store-modal-head">
              <div>
                <h3>Pray to Prepare</h3>
                <p>Select divine spells to prepare for the day.</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  setDivinePrepareModalOpen(false)
                  setDivinePrepareExpandedSpellId(null)
                }}
                aria-label="Close prepare spells"
              >
                <X size={14} />
              </button>
            </div>

            <div className="store-modal-body">
              <div className="character-spell-add-main">
                <div className="store-category-tabs">
                  {preparedSpellLevels.map((level) => (
                    <button
                      key={`divine-level-tab-${level}`}
                      type="button"
                      className={divinePrepareTabLevel === level ? 'store-category-btn active' : 'store-category-btn'}
                      onClick={() => setDivinePrepareTabLevel(level)}
                    >
                      Level {level}
                    </button>
                  ))}
                </div>

                <div className="store-grid-wrap">
                  <div className="store-item-grid">
                    {DIVINE_SPELL_CATALOG
                      .filter((spell) => spell.level === divinePrepareTabLevel)
                      .map((spell) => {
                        const expanded = divinePrepareExpandedSpellId === spell.id
                        const preparedCount = divineDraftCountsBySpellId[spell.id] ?? 0
                        const slotsAtLevel = preparedSlotsPerDay[Math.max(0, spell.level - 1)] ?? 0
                        const usedAtLevel = divineDraftCountsByLevel[spell.level] ?? 0
                        const canPrepare = usedAtLevel < slotsAtLevel
                        return (
                          <article
                            key={spell.id}
                            className={expanded ? 'store-item-card spell-card-expanded' : 'store-item-card'}
                            onClick={() => setDivinePrepareExpandedSpellId(expanded ? null : spell.id)}
                          >
                            <header>
                              <h4>{spell.name}</h4>
                              <span>Level {spell.level}</span>
                            </header>
                            {spell.rangeText || spell.durationText ? (
                              <p className="spell-card-meta">
                                {spell.rangeText ? `Range: ${spell.rangeText}` : null}
                                {spell.rangeText && spell.durationText ? ' | ' : null}
                                {spell.durationText ? `Duration: ${spell.durationText}` : null}
                              </p>
                            ) : null}
                            <p className={expanded ? 'spell-card-description expanded' : 'spell-card-description'}>
                              {spell.description}
                            </p>
                            <div className="section-head-actions">
                              <button
                                type="button"
                                className="store-buy-btn"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  prepareDivineSpell(spell.id)
                                }}
                                disabled={!canPrepare}
                              >
                                Prepare
                              </button>
                              {preparedCount > 0 ? (
                                <button
                                  type="button"
                                  className="monster-example-btn"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    removePreparedDivineSpell(spell.id)
                                  }}
                                >
                                  Remove 1
                                </button>
                              ) : null}
                            </div>
                            <p className="store-item-note">
                              Prepared: {preparedCount} | Slots L{spell.level}: {usedAtLevel}/{slotsAtLevel}
                            </p>
                          </article>
                        )
                      })}
                    {DIVINE_SPELL_CATALOG.filter((spell) => spell.level === divinePrepareTabLevel).length === 0 ? (
                      <p className="store-tally-empty">No cleric spells loaded for this level yet.</p>
                    ) : null}
                  </div>
                </div>
              </div>
              <aside className="store-tally store-cart">
                <div className="store-tally-head">
                  <h4>Prepared Spells</h4>
                  <span>{divinePreparedDraftIds.length} prepared</span>
                </div>
                {Object.keys(divineDraftCountsBySpellId).length === 0 ? (
                  <p className="store-tally-empty">No spells prepared yet.</p>
                ) : (
                  <div className="store-tally-list">
                    {Object.entries(divineDraftCountsBySpellId)
                      .map(([spellId, count]) => ({
                        spell: divinePreparedDraftSpells.find((entry) => entry.id === spellId) ?? null,
                        count,
                      }))
                      .filter((row): row is { spell: (typeof DIVINE_SPELL_CATALOG)[number]; count: number } => !!row.spell)
                      .sort((a, b) => a.spell.level - b.spell.level || a.spell.name.localeCompare(b.spell.name))
                      .map((row) => (
                        <div key={`prepared-${row.spell.id}`} className="store-tally-row">
                          <span>{row.spell.name}</span>
                          <strong>Lvl {row.spell.level} x{row.count}</strong>
                          <button
                            type="button"
                            className="store-remove-btn"
                            onClick={() => removePreparedDivineSpell(row.spell.id)}
                          >
                            Remove 1
                          </button>
                        </div>
                      ))}
                  </div>
                )}
                <div className="store-cart-actions">
                  <button
                    type="button"
                    className="store-buy-btn"
                    onClick={commitPreparedDivineSpells}
                  >
                    Prepare
                  </button>
                  <button
                    type="button"
                    className="store-buy-btn"
                    onClick={clearPreparedDivineSpells}
                    disabled={divinePreparedDraftIds.length === 0}
                  >
                    Clear All Prepared
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      ) : null}
      {memorizedSpellDetail ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={() => setMemorizedSpellDetailId(null)}>
          <div className="confirm-modal character-spell-detail-modal" onClick={(event) => event.stopPropagation()}>
            <div className="character-spell-detail-head">
              <h3>{memorizedSpellDetail.name}</h3>
              <p>Prepared spell details</p>
            </div>
            <div className="character-spell-detail-stat-grid">
              <div className="character-spell-detail-stat">
                <span>Level</span>
                <strong>{memorizedSpellDetail.level}</strong>
              </div>
              {memorizedSpellDetail.rangeText ? (
                <div className="character-spell-detail-stat">
                  <span>Range</span>
                  <strong>{memorizedSpellDetail.rangeText}</strong>
                </div>
              ) : null}
              {memorizedSpellDetail.durationText ? (
                <div className="character-spell-detail-stat">
                  <span>Duration</span>
                  <strong>{memorizedSpellDetail.durationText}</strong>
                </div>
              ) : null}
              {memorizedSpellDetail.targetText ? (
                <div className="character-spell-detail-stat">
                  <span>Target</span>
                  <strong>{memorizedSpellDetail.targetText}</strong>
                </div>
              ) : null}
              {memorizedSpellDetail.areaText ? (
                <div className="character-spell-detail-stat">
                  <span>Area</span>
                  <strong>{memorizedSpellDetail.areaText}</strong>
                </div>
              ) : null}
              {memorizedSpellDetail.savingThrowText ? (
                <div className="character-spell-detail-stat">
                  <span>Save</span>
                  <strong>{memorizedSpellDetail.savingThrowText}</strong>
                </div>
              ) : null}
            </div>
            <div className="character-spell-detail-body">
              {renderSpellDescriptionBody(memorizedSpellDetail)}
            </div>
            <div className="confirm-actions">
              <button type="button" onClick={() => setMemorizedSpellDetailId(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {addItemModal ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={() => setAddItemModal(null)}>
          <div className="confirm-modal item-detail-modal add-item-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add Item</h3>
            <div className="add-item-kind-picker">
              {(['general', 'weapon', 'armour', 'ammunition', 'consumable'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={addItemModal.kind === k ? 'active' : ''}
                  onClick={() =>
                    setAddItemModal({
                      ...addItemModal,
                      kind: k,
                      typeId: 'custom',
                      typeName: addItemModal.kind === k ? addItemModal.typeName : '',
                      name: addItemModal.kind === k ? addItemModal.name : '',
                    })
                  }
                >
                  {k === 'ammunition' ? 'Ammo' : k.charAt(0).toUpperCase() + k.slice(1)}
                </button>
              ))}
            </div>
            {addItemModal.kind === 'weapon' ? (
              <div className="item-detail-weapon-form">
                <label className="character-weapon-primary-field">
                  Template
                  <select
                    value={addItemModal.typeId || 'custom'}
                    onChange={(e) => {
                      const wId = e.target.value
                      if (wId === 'custom') {
                        setAddItemModal({ ...addItemModal, typeId: 'custom', typeName: '' })
                      } else {
                        const t = weaponCatalogById[wId]
                        if (t) {
                          const parsed = parseDamageDice(t.damage)
                          const range = parseRangeBands(t.range)
                          setAddItemModal({
                            ...addItemModal,
                            typeId: wId,
                            typeName: t.name,
                            costGp: String(t.costGp),
                            damageDiceCount: parsed.damageDiceCount,
                            damageDiceSides: parsed.damageDiceSides,
                            rangeShort: range.rangeShort,
                            rangeMedium: range.rangeMedium,
                            rangeLong: range.rangeLong,
                            twoHanded: t.twoHanded,
                          })
                        }
                      }
                    }}
                  >
                    <option value="custom">Custom</option>
                    {OSE_WEAPON_CATALOG.map((weapon) => (
                      <option
                        key={weapon.id}
                        value={weapon.id}
                        disabled={!isWeaponTemplateAllowedForClass(weapon.id, selectedClassName)}
                      >
                        {`${weapon.name} (${weapon.costGp} gp)`}
                      </option>
                    ))}
                  </select>
                </label>
                {addItemModal.typeId === 'custom' ? (
                  <label className="character-weapon-primary-field">
                    Type
                    <input
                      type="text"
                      value={addItemModal.typeName}
                      onChange={(e) => setAddItemModal({ ...addItemModal, typeName: e.target.value })}
                      placeholder="e.g. Bec de corbin"
                    />
                  </label>
                ) : null}
                <label className="character-weapon-primary-field">
                  Name
                  <input
                    type="text"
                    value={addItemModal.name}
                    onChange={(e) => setAddItemModal({ ...addItemModal, name: e.target.value })}
                    placeholder="Optional"
                  />
                </label>
                <div className="character-weapon-mobile-grid">
                  <label className="character-weapon-edit-field">
                    Dmg
                    <div className="character-weapon-damage-inputs">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={addItemModal.damageDiceCount}
                        onChange={(e) => setAddItemModal({ ...addItemModal, damageDiceCount: e.target.value })}
                      />
                      <select
                        value={addItemModal.damageDiceSides}
                        onChange={(e) => setAddItemModal({ ...addItemModal, damageDiceSides: e.target.value })}
                      >
                        <option value="">-</option>
                        <option value="4">d4</option>
                        <option value="6">d6</option>
                        <option value="8">d8</option>
                        <option value="10">d10</option>
                        <option value="12">d12</option>
                        <option value="20">d20</option>
                      </select>
                    </div>
                  </label>
                  <label className="character-weapon-edit-field character-weapon-range-field">
                    Range
                    <div className="character-weapon-triplet-inputs">
                      <input type="number" min={0} step={1} value={addItemModal.rangeShort} onChange={(e) => setAddItemModal({ ...addItemModal, rangeShort: e.target.value })} />
                      <span>/</span>
                      <input type="number" min={0} step={1} value={addItemModal.rangeMedium} onChange={(e) => setAddItemModal({ ...addItemModal, rangeMedium: e.target.value })} />
                      <span>/</span>
                      <input type="number" min={0} step={1} value={addItemModal.rangeLong} onChange={(e) => setAddItemModal({ ...addItemModal, rangeLong: e.target.value })} />
                    </div>
                  </label>
                  <label className="character-weapon-edit-field">
                    Cost
                    <div className="character-inline-unit-field">
                      <input type="text" value={addItemModal.costGp} onChange={(e) => setAddItemModal({ ...addItemModal, costGp: e.target.value })} />
                      <span>gp</span>
                    </div>
                  </label>
                </div>
                <label className="character-weapon-card-check">
                  <input
                    type="checkbox"
                    checked={addItemModal.twoHanded}
                    onChange={(e) => setAddItemModal({ ...addItemModal, twoHanded: e.target.checked })}
                  />
                  Two-handed
                </label>
                <div className="character-weapon-magic-row">
                  <label className="character-weapon-card-check">
                    <input
                      type="checkbox"
                      checked={addItemModal.isMagic}
                      onChange={(e) => setAddItemModal({ ...addItemModal, isMagic: e.target.checked })}
                    />
                    Magic
                  </label>
                  {addItemModal.isMagic ? (
                    <label className="character-weapon-magic-bonus character-weapon-edit-field">
                      Bonus
                      <input
                        type="number"
                        step={1}
                        value={addItemModal.attackBonus}
                        onChange={(e) => setAddItemModal({ ...addItemModal, attackBonus: e.target.value })}
                      />
                    </label>
                  ) : null}
                </div>
                <label className="character-weapon-edit-field">
                  Notes
                  <textarea
                    value={addItemModal.notes}
                    onChange={(e) => setAddItemModal({ ...addItemModal, notes: e.target.value })}
                    placeholder="Description, magic properties, etc."
                  />
                </label>
              </div>
            ) : addItemModal.kind === 'armour' ? (
              <div className="item-detail-weapon-form">
                <label className="character-weapon-primary-field">
                  Template
                  <select
                    value={addItemModal.typeId || 'custom'}
                    onChange={(e) => {
                      const aId = e.target.value
                      if (aId === 'custom') {
                        setAddItemModal({ ...addItemModal, typeId: 'custom', typeName: '' })
                      } else {
                        const t = armourCatalogById[aId]
                        if (t) {
                          const parsed = parseArmourTemplateValues(t.ac)
                          setAddItemModal({
                            ...addItemModal,
                            typeId: aId,
                            typeName: t.name,
                            costGp: String(t.costGp),
                            armourClass: parsed.armourClass,
                            shieldMod: parsed.shieldMod,
                            armourType: armourTypeFromTemplateId(t.id),
                          })
                        }
                      }
                    }}
                    disabled={!canClassEquipArmour}
                  >
                    <option value="custom">Custom</option>
                    {OSE_ARMOUR_CATALOG.map((armour) => (
                      <option
                        key={armour.id}
                        value={armour.id}
                        disabled={!isArmourTemplateAllowedForClass(armour.id, selectedClassName)}
                      >
                        {`${armour.name} (${armour.costGp} gp)`}
                      </option>
                    ))}
                  </select>
                </label>
                {addItemModal.typeId === 'custom' ? (
                  <label className="character-weapon-primary-field">
                    Type
                    <input
                      type="text"
                      value={addItemModal.typeName}
                      onChange={(e) => setAddItemModal({ ...addItemModal, typeName: e.target.value })}
                      placeholder="e.g. Brigandine"
                    />
                  </label>
                ) : null}
                <label className="character-weapon-primary-field">
                  Name
                  <input
                    type="text"
                    value={addItemModal.name}
                    onChange={(e) => setAddItemModal({ ...addItemModal, name: e.target.value })}
                    placeholder="Optional"
                  />
                </label>
                <div className="character-weapon-mobile-grid">
                  <label className="character-weapon-edit-field">
                    {addItemModal.armourType === 'shield' ? 'Shield Mod' : 'Armour Class'}
                    <input
                      type="number"
                      step={1}
                      value={addItemModal.armourType === 'shield' ? addItemModal.shieldMod : addItemModal.armourClass}
                      onChange={(e) =>
                        setAddItemModal({
                          ...addItemModal,
                          ...(addItemModal.armourType === 'shield'
                            ? { shieldMod: e.target.value }
                            : { armourClass: e.target.value }),
                        })}
                    />
                  </label>
                  <label className="character-weapon-edit-field">
                    Type
                    <select
                      value={addItemModal.armourType ?? 'body'}
                      onChange={(e) => setAddItemModal({ ...addItemModal, armourType: e.target.value as 'body' | 'shield' })}
                    >
                      <option value="body">Body Armour</option>
                      <option value="shield">Shield</option>
                    </select>
                  </label>
                  <label className="character-weapon-edit-field">
                    Cost
                    <div className="character-inline-unit-field">
                      <input type="text" value={addItemModal.costGp} onChange={(e) => setAddItemModal({ ...addItemModal, costGp: e.target.value })} />
                      <span>gp</span>
                    </div>
                  </label>
                </div>
                <div className="character-weapon-magic-row">
                  <label className="character-weapon-card-check">
                    <input
                      type="checkbox"
                      checked={addItemModal.isMagic}
                      onChange={(e) => setAddItemModal({ ...addItemModal, isMagic: e.target.checked })}
                    />
                    Magic
                  </label>
                  {addItemModal.isMagic ? (
                    <label className="character-weapon-magic-bonus character-weapon-edit-field">
                      Mod
                      <input
                        type="number"
                        step={1}
                        value={addItemModal.magicMod}
                        onChange={(e) => setAddItemModal({ ...addItemModal, magicMod: e.target.value })}
                      />
                    </label>
                  ) : null}
                </div>
                <label className="character-weapon-edit-field">
                  Notes
                  <textarea
                    value={addItemModal.notes}
                    onChange={(e) => setAddItemModal({ ...addItemModal, notes: e.target.value })}
                    placeholder="Description, magic properties, etc."
                  />
                </label>
              </div>
            ) : (
              <>
                {addItemModal.kind === 'general' ? (
                  <label className="item-detail-field">
                    <span className="item-detail-field-label">Template</span>
                    <select
                      value={addItemModal.typeId || 'custom'}
                      onChange={(e) => {
                        const gId = e.target.value
                        if (gId === 'custom') {
                          setAddItemModal({ ...addItemModal, typeId: 'custom', typeName: '', costGp: '', description: '' })
                        } else {
                          const t = generalCatalogById[gId]
                          if (t) setAddItemModal({ ...addItemModal, typeId: gId, typeName: t.name, costGp: String(t.costGp), description: t.description })
                        }
                      }}
                    >
                      <option value="custom">Custom</option>
                      {OSE_GENERAL_CATALOG.map((g) => (
                        <option key={g.id} value={g.id}>{`${g.name} (${g.costGp} gp)`}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {addItemModal.kind === 'ammunition' ? (
                  <label className="item-detail-field">
                    <span className="item-detail-field-label">Template</span>
                    <select
                      value={addItemModal.typeId || 'custom'}
                      onChange={(e) => {
                        const aId = e.target.value
                        if (aId === 'custom') {
                          setAddItemModal({ ...addItemModal, typeId: 'custom', typeName: '', costGp: '', description: '', qty: '1' })
                        } else {
                          const t = ammoCatalogById[aId]
                          if (t) setAddItemModal({ ...addItemModal, typeId: aId, typeName: t.name, costGp: String(t.costGp), description: t.description, qty: String(t.qty) })
                        }
                      }}
                    >
                      <option value="custom">Custom</option>
                      {OSE_AMMO_CATALOG.map((a) => (
                        <option key={a.id} value={a.id}>{`${a.name} (${a.costGp} gp)`}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {addItemModal.kind === 'consumable' ? (
                  <label className="item-detail-field">
                    <span className="item-detail-field-label">Template</span>
                    <select
                      value={addItemModal.typeId || 'custom'}
                      onChange={(e) => {
                        const cId = e.target.value
                        if (cId === 'custom') {
                          setAddItemModal({ ...addItemModal, typeId: 'custom', typeName: '', costGp: '', description: '', qty: '1', useMode: 'consume', effectText: '' })
                        } else {
                          const t = consumableCatalogById[cId]
                          if (t) setAddItemModal({ ...addItemModal, typeId: cId, typeName: t.name, costGp: String(t.costGp), description: t.description, qty: String(t.qty), useMode: t.useMode, effectText: t.effectText })
                        }
                      }}
                    >
                      <option value="custom">Custom</option>
                      {OSE_CONSUMABLE_CATALOG.map((c) => (
                        <option key={c.id} value={c.id}>{`${c.name} (${c.costGp} gp)`}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {addItemModal.typeId === 'custom' ? (
                  <label className="item-detail-field">
                    <span className="item-detail-field-label">Type</span>
                    <input
                      type="text"
                      value={addItemModal.typeName}
                      onChange={(e) => setAddItemModal({ ...addItemModal, typeName: e.target.value })}
                    />
                  </label>
                ) : null}
                <label className="item-detail-field">
                  <span className="item-detail-field-label">Name (Optional)</span>
                  <input
                    type="text"
                    value={addItemModal.name}
                    onChange={(e) => setAddItemModal({ ...addItemModal, name: e.target.value })}
                  />
                </label>
                <label className="item-detail-field">
                  <span className="item-detail-field-label">Cost</span>
                  <div className="character-inline-unit-field">
                    <input type="text" value={addItemModal.costGp} onChange={(e) => setAddItemModal({ ...addItemModal, costGp: e.target.value })} />
                    <span>gp</span>
                  </div>
                </label>
                {(addItemModal.kind === 'ammunition' || addItemModal.kind === 'consumable') ? (
                  <label className="item-detail-field">
                    <span className="item-detail-field-label">Qty</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={addItemModal.qty}
                      onChange={(e) => setAddItemModal({ ...addItemModal, qty: e.target.value })}
                    />
                  </label>
                ) : null}
                {addItemModal.kind === 'consumable' ? (
                  <>
                    <label className="item-detail-field">
                      <span className="item-detail-field-label">Use Mode</span>
                      <select
                        value={addItemModal.useMode}
                        onChange={(e) => setAddItemModal({ ...addItemModal, useMode: e.target.value as 'consume' | 'use' })}
                      >
                        <option value="consume">Consume (destroyed on use)</option>
                        <option value="use">Use (reusable)</option>
                      </select>
                    </label>
                    <label className="item-detail-field">
                      <span className="item-detail-field-label">Effect</span>
                      <textarea
                        className="item-detail-notes"
                        value={addItemModal.effectText}
                        onChange={(e) => setAddItemModal({ ...addItemModal, effectText: e.target.value })}
                        placeholder="Optional effect description"
                        rows={2}
                      />
                    </label>
                  </>
                ) : null}
                <label className="item-detail-field">
                  <span className="item-detail-field-label">Description</span>
                  <textarea
                    className="item-detail-notes"
                    value={addItemModal.description}
                    onChange={(e) => setAddItemModal({ ...addItemModal, description: e.target.value })}
                    placeholder="Optional item description"
                    rows={2}
                  />
                </label>
                <label className="item-detail-field">
                  <span className="item-detail-field-label">Notes</span>
                  <textarea
                    className="item-detail-notes"
                    value={addItemModal.notes}
                    onChange={(e) => setAddItemModal({ ...addItemModal, notes: e.target.value })}
                    placeholder="Optional notes"
                    rows={2}
                  />
                </label>
              </>
            )}
            <div className="confirm-actions">
              <button type="button" onClick={() => setAddItemModal(null)}>Cancel</button>
              <button type="button" onClick={saveAddItem}>{requiresApprovalNow ? 'Request' : 'Add'}</button>
            </div>
          </div>
        </div>
      ) : null}
      {levelUpModalOpen && effectiveSelected ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={closeLevelUpModal}>
          <div className="confirm-modal character-levelup-modal" onClick={(event) => event.stopPropagation()}>
            <header className="character-levelup-hero">
              <div className="character-levelup-kicker">
                <Star size={14} />
                <span>Level Up</span>
              </div>
              <h3 className="character-levelup-title">{effectiveSelected.name} Advances</h3>
              <p className="character-levelup-story">
                As a level {levelUpTargetLevel} {selectedClassName}, you should roll new hit points and review your
                updated class options.
              </p>
              <p className="character-levelup-flavor">{levelUpFlavor}</p>
              <div className="character-levelup-meta">
                <span className="character-levelup-pill">Level {effectiveSelected.level} to {levelUpTargetLevel}</span>
                <span className="character-levelup-pill">
                  XP {effectiveSelected.xp.toLocaleString()}
                  {selectedNextLevelXp !== null ? ` / ${selectedNextLevelXp.toLocaleString()}` : ''}
                </span>
              </div>
            </header>

            <div className="character-levelup-panes">
              <section className="character-levelup-panel">
                <h4 className="character-levelup-subhead">Checklist</h4>
                <ul className="character-levelup-list">
                  {levelUpChecklist.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </section>

              <section className="character-levelup-panel">
                <h4 className="character-levelup-subhead">Hit Point Roll</h4>
                <div className="character-levelup-grid">
                  <div className="character-levelup-row">
                    <span>Class HD</span>
                    <strong>{selectedHitDie ? `d${selectedHitDie}` : '-'}</strong>
                  </div>
                  <div className="character-levelup-row">
                    <span>HP gained this level</span>
                    <strong>{levelUpHpGain ?? '-'}</strong>
                  </div>
                </div>
                <div className="character-levelup-actions">
                  <button type="button" className="character-levelup-roll-btn" onClick={rollLevelUpHitPoints} disabled={levelUpApplying}>
                    Roll Hit Points
                  </button>
                </div>
                <p className="character-enc-help">This increase uses the hit die roll.</p>
              </section>
            </div>

            <section className="character-levelup-panel">
              <h4 className="character-levelup-subhead">New At This Level</h4>
              {levelUpNewFeatures.length > 0 ? (
                <ul className="character-levelup-list">
                  {levelUpNewFeatures.map((feature) => (
                    <li key={feature.id}>
                      <strong>{feature.name}.</strong> {feature.summary}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="character-enc-help">No new named feature unlocks at this exact level.</p>
              )}
            </section>
            {levelUpError ? <p className="error">{levelUpError}</p> : null}
            <div className="confirm-actions">
              <button type="button" onClick={closeLevelUpModal} disabled={levelUpApplying}>
                Cancel
              </button>
              <button
                type="button"
                className="confirm-danger"
                onClick={applyLevelUp}
                disabled={levelUpApplying || levelUpHpGain === null}
              >
                Apply Level Up
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <ConfirmModal
        open={goldSpendConfirmAmount !== null}
        title="Spend gold?"
        message={`Spend ${goldSpendConfirmAmount ?? 0} gp? You will have ${Math.max(0, selectedGoldTotal - (goldSpendConfirmAmount ?? 0))} gp remaining.`}
        confirmLabel="Spend"
        onConfirm={() => {
          if (goldSpendConfirmAmount !== null) spendGold(goldSpendConfirmAmount)
          setGoldSpendConfirmAmount(null)
        }}
        onCancel={() => setGoldSpendConfirmAmount(null)}
      />
      <ConfirmModal
        open={dropConfirmItemId !== null}
        title="Drop item?"
        message={`Drop ${selectedInventory.find((i) => i.id === dropConfirmItemId)?.name ?? 'this item'}? It will be moved to the campaign items list.`}
        confirmLabel="Drop"
        onConfirm={() => { if (dropConfirmItemId) void dropItem(dropConfirmItemId) }}
        onCancel={() => setDropConfirmItemId(null)}
      />
      <ConfirmModal
        open={sellConfirmItemId !== null}
        title="Sell item?"
        message={`Sell ${selectedInventory.find((i) => i.id === sellConfirmItemId)?.name ?? 'this item'} for ${selectedInventory.find((i) => i.id === sellConfirmItemId)?.costGp ?? 0} gp?`}
        confirmLabel="Sell"
        onConfirm={() => { if (sellConfirmItemId) sellItem(sellConfirmItemId) }}
        onCancel={() => setSellConfirmItemId(null)}
      />
      <ConfirmModal
        open={finalizeConfirmOpen}
        title="Finalize character?"
        message={isGuidedCreation
          ? 'This character will leave guided creation mode and use the normal sheet.'
          : 'This will finalize the imported established character. Item changes will require GM approval after this.'}
        confirmLabel="Finalize"
        onConfirm={finalizeCharacter}
        onCancel={() => setFinalizeConfirmOpen(false)}
      />
      <ConfirmModal
        open={holySymbolRequiredOpen}
        title="Holy Symbol Required"
        message="You need to purchase a Holy Symbol to finalize your character."
        confirmLabel="OK"
        onConfirm={() => setHolySymbolRequiredOpen(false)}
        onCancel={() => setHolySymbolRequiredOpen(false)}
      />
      <ConfirmModal
        open={reallocationClassRequiredOpen}
        title="Class Required"
        message="Please choose class before reallocation."
        confirmLabel="OK"
        onConfirm={() => setReallocationClassRequiredOpen(false)}
        onCancel={() => setReallocationClassRequiredOpen(false)}
      />
      <ConfirmModal
        open={storeClassRequiredOpen}
        title="Class Required"
        message="Please choose class before buying equipment."
        confirmLabel="OK"
        onConfirm={() => setStoreClassRequiredOpen(false)}
        onCancel={() => setStoreClassRequiredOpen(false)}
      />
      <ConfirmModal
        open={hpClassRequiredOpen}
        title="Class Required"
        message="To Roll for HP, set class to determine Hit Dice"
        confirmLabel="OK"
        onConfirm={() => setHpClassRequiredOpen(false)}
        onCancel={() => setHpClassRequiredOpen(false)}
      />
      <ConfirmModal
        open={deleteConfirmTarget !== null}
        title="Delete character?"
        message={`Are you sure you want to delete ${deleteConfirmTarget?.name ?? 'this character'}? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (!deleteConfirmTarget) return
          deleteCharacter(deleteConfirmTarget.id)
          seededCharacterIdsRef.current.delete(deleteConfirmTarget.id)
          delete lastPersistedDetailsJsonRef.current[deleteConfirmTarget.id]
          setDeleteConfirmTarget(null)
        }}
        onCancel={() => setDeleteConfirmTarget(null)}
      />
    </div>
  )
}
