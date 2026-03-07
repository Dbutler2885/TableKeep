import { Fragment, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, ChevronLeft, Minus, Pencil, Plus, ShoppingBag, Star, Trash2, UserRound, X } from 'lucide-react'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import type { CharacterRecord, Role } from '../../types/app'
import {
  CHARACTER_INTERMEDIATE_MAX_WIDTH,
  CHARACTER_MOBILE_INTERMEDIATE_MIN_WIDTH,
  CHARACTER_MOBILE_PORTRAIT_INTERMEDIATE_MIN_WIDTH,
  MOBILE_BREAKPOINT,
} from '../../constants/layout'
import { EntityMediaEditor } from '../common/EntityMediaEditor'
import { ConfirmModal } from '../common/ConfirmModal'
import { OSE_WEAPON_CATALOG, weaponCatalogById } from './weaponCatalog'
import { OSE_ARMOUR_CATALOG, armourCatalogById } from './armourCatalog'
import { OSE_STORE_ITEMS, STORE_CATEGORY_LABELS } from './storeCatalog'
import type { StoreCategoryId, StoreItem } from './storeCatalog'

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
}

type WeaponRow = {
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

type ArmourRow = {
  id: string
  armourId: string
  isMagic: boolean
  name: string
  ac: string
  bonus: string
  equipped: boolean
  notes: string
}

type AbilityCode = 'STR' | 'INT' | 'WIS' | 'DEX' | 'CON' | 'CHA'
type AbilityScores = Record<AbilityCode, string>
type SaveCode = 'D' | 'W' | 'P' | 'B' | 'S'
type SaveScores = Record<SaveCode, string>
type AdventureEditableCode = 'FG' | 'FT' | 'HT' | 'LD' | 'SD'
type AdventureScores = Record<AdventureEditableCode, string>
type ThiefSkillCode = 'CS' | 'TR' | 'HN' | 'HS' | 'MS' | 'OL' | 'PP' | 'RL'
type ThiefSkillScores = Record<ThiefSkillCode, string>
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

type StoreCartEntry = {
  key: string
  name: string
  costGp: number
  qty: number
  kind: 'general' | 'weapon' | 'ammunition' | 'armour' | 'custom'
  weaponId?: string
  armourId?: string
  packedLabel?: string
}

const emptyAbilityScores = (): AbilityScores => ({
  STR: '',
  INT: '',
  WIS: '',
  DEX: '',
  CON: '',
  CHA: '',
})

const abilityCodes: AbilityCode[] = ['STR', 'INT', 'WIS', 'DEX', 'CON', 'CHA']
const loweringCandidateCodes: AbilityCode[] = ['STR', 'INT', 'WIS']

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
const classHitDieByClass: Record<string, number> = {
  Cleric: 6,
  Dwarf: 8,
  Elf: 6,
  Fighter: 8,
  Halfling: 6,
  'Magic-User': 4,
  Thief: 4,
}
const classLevel1Saves: Record<string, SaveScores> = {
  Cleric: {
    D: '11',
    W: '12',
    P: '14',
    B: '16',
    S: '15',
  },
  Dwarf: {
    D: '8',
    W: '9',
    P: '10',
    B: '13',
    S: '12',
  },
  Elf: {
    D: '12',
    W: '13',
    P: '13',
    B: '15',
    S: '15',
  },
  Fighter: {
    D: '12',
    W: '13',
    P: '14',
    B: '15',
    S: '16',
  },
  Halfling: {
    D: '8',
    W: '9',
    P: '10',
    B: '13',
    S: '12',
  },
  'Magic-User': {
    D: '13',
    W: '14',
    P: '13',
    B: '16',
    S: '15',
  },
  Thief: {
    D: '13',
    W: '14',
    P: '13',
    B: '16',
    S: '15',
  },
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

const makeId = () => {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const makeWeaponRow = (): WeaponRow => ({
  id: makeId(),
  weaponId: '',
  isMagic: false,
  name: '',
  damageDiceCount: '',
  damageDiceSides: '',
  bonus: '',
  rangeShort: '',
  rangeMedium: '',
  rangeLong: '',
  twoHanded: false,
  equipped: false,
  notes: '',
})

const makeArmourRow = (): ArmourRow => ({
  id: makeId(),
  armourId: '',
  isMagic: false,
  name: '',
  ac: '',
  bonus: '',
  equipped: false,
  notes: '',
})

const adventureDefaultsByClass = (className: string): AdventureScores => {
  const defaults: AdventureScores = { FG: '1', FT: '1', HT: '1', LD: '1', SD: '1' }
  if (className === 'Dwarf') return { ...defaults, FT: '2', LD: '2' }
  if (className === 'Elf') return { ...defaults, LD: '2', SD: '2' }
  if (className === 'Halfling') return { ...defaults, LD: '2' }
  return defaults
}

const defaultThiefSkills = (): ThiefSkillScores => ({
  CS: '1',
  TR: '1',
  HN: '1',
  HS: '1',
  MS: '1',
  OL: '1',
  PP: '1',
  RL: '1',
})

const parseDamageDice = (value: string): { damageDiceCount: string; damageDiceSides: string } => {
  const match = value.trim().match(/^(\d+)\s*d\s*(\d+)$/i)
  if (!match) return { damageDiceCount: '', damageDiceSides: '' }
  return {
    damageDiceCount: match[1],
    damageDiceSides: match[2],
  }
}

const parseRangeBands = (value: string): { rangeShort: string; rangeMedium: string; rangeLong: string } => {
  const parts = value
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (parts.length !== 3) return { rangeShort: '', rangeMedium: '', rangeLong: '' }
  const parsed = parts.map((part) => {
    const match = part.match(/(\d+)(?!.*\d)/)
    return match?.[1] ?? ''
  })
  if (parsed.some((part) => part.length === 0)) return { rangeShort: '', rangeMedium: '', rangeLong: '' }
  return {
    rangeShort: parsed[0],
    rangeMedium: parsed[1],
    rangeLong: parsed[2],
  }
}

const parseArmourTemplateValues = (acValue: string): { ac: string; bonus: string } => {
  const trimmed = acValue.trim()
  const numeric = trimmed.match(/^-?\d+$/)
  if (numeric) return { ac: trimmed, bonus: '' }

  const bonus = trimmed.match(/^([+-]?\d+)\s*bonus$/i)
  if (bonus) {
    return {
      ac: '',
      bonus: bonus[1].replace(/^\+/, ''),
    }
  }

  return { ac: '', bonus: '' }
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
}: CharacterTabProps) {
  const [viewportWidth, setViewportWidth] = useState<number>(() => window.innerWidth)
  const [isMobile, setIsMobile] = useState<boolean>(() => window.innerWidth <= MOBILE_BREAKPOINT)
  const [mobileCharacterView, setMobileCharacterView] = useState<'list' | 'detail'>('list')
  const [activePage, setActivePage] = useState<'core' | 'encumbrance' | 'asw'>('core')
  const [abilityScoresByCharacterId, setAbilityScoresByCharacterId] = useState<Record<string, AbilityScores>>({})
  const [rolledAbilityScoresByCharacterId, setRolledAbilityScoresByCharacterId] = useState<Record<string, AbilityScores>>({})
  const [abilityScoresRolledByCharacterId, setAbilityScoresRolledByCharacterId] = useState<Record<string, boolean>>({})
  const [hpBaseRollByCharacterId, setHpBaseRollByCharacterId] = useState<Record<string, number>>({})
  const [equippedItemsByCharacterId, setEquippedItemsByCharacterId] = useState<Record<string, string[]>>({})
  const [packedItemsByCharacterId, setPackedItemsByCharacterId] = useState<Record<string, string[]>>({})
  const [weaponsByCharacterId, setWeaponsByCharacterId] = useState<Record<string, WeaponRow[]>>({})
  const [armourByCharacterId, setArmourByCharacterId] = useState<Record<string, ArmourRow[]>>({})
  const [thacoByCharacterId, setThacoByCharacterId] = useState<Record<string, string>>({})
  const [saveScoresByCharacterId, setSaveScoresByCharacterId] = useState<Record<string, SaveScores>>({})
  const [adventureScoresByCharacterId, setAdventureScoresByCharacterId] = useState<Record<string, AdventureScores>>({})
  const [adventureSeedClassByCharacterId, setAdventureSeedClassByCharacterId] = useState<Record<string, string>>({})
  const [thiefSkillsByCharacterId, setThiefSkillsByCharacterId] = useState<Record<string, ThiefSkillScores>>({})
  const [acManualOverrideByCharacterId, setAcManualOverrideByCharacterId] = useState<Record<string, boolean>>({})
  const [expandedWeaponCards, setExpandedWeaponCards] = useState<Record<string, boolean>>({})
  const [expandedArmourCards, setExpandedArmourCards] = useState<Record<string, boolean>>({})
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
  const [storeGoldSlotIndicesByCharacterId, setStoreGoldSlotIndicesByCharacterId] = useState<Record<string, number[]>>({})
  const [storeCartByCharacterId, setStoreCartByCharacterId] = useState<Record<string, StoreCartEntry[]>>({})
  const [customStoreName, setCustomStoreName] = useState('')
  const [customStoreCost, setCustomStoreCost] = useState('')
  const [customStoreDescription, setCustomStoreDescription] = useState('')
  const [storeClassRequiredOpen, setStoreClassRequiredOpen] = useState(false)
  const [reallocationClassRequiredOpen, setReallocationClassRequiredOpen] = useState(false)
  const [hpClassRequiredOpen, setHpClassRequiredOpen] = useState(false)
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ id: string, name: string } | null>(null)

  const sortedCharacters = useMemo(
    () => [...characters].sort((a, b) => a.name.localeCompare(b.name)),
    [characters],
  )

  const effectiveSelected =
    selectedCharacter ?? sortedCharacters.find((character) => character.id === selectedCharacterId) ?? null

  useEffect(() => {
    const updateMobileState = () => {
      const width = window.innerWidth
      setViewportWidth(width)
      const mobile = width <= MOBILE_BREAKPOINT
      setIsMobile(mobile)
      if (!mobile) setMobileCharacterView('list')
    }

    updateMobileState()
    window.addEventListener('resize', updateMobileState)
    return () => window.removeEventListener('resize', updateMobileState)
  }, [])

  useEffect(() => {
    if (sortedCharacters.length === 0) return
    if (!effectiveSelected) {
      setSelectedCharacterId(sortedCharacters[0].id)
    }
  }, [effectiveSelected, setSelectedCharacterId, sortedCharacters])

  const showListPane = !isMobile || mobileCharacterView === 'list'
  const showDetailPane = !isMobile || mobileCharacterView === 'detail'
  const isIntermediateLayout = !isMobile && viewportWidth <= CHARACTER_INTERMEDIATE_MAX_WIDTH
  const isPortraitMobileLayout = isMobile && viewportWidth >= CHARACTER_MOBILE_PORTRAIT_INTERMEDIATE_MIN_WIDTH
  const isIntermediateMobileLayout = isMobile && viewportWidth >= CHARACTER_MOBILE_INTERMEDIATE_MIN_WIDTH
  const useIntermediateLayout = isIntermediateLayout || isPortraitMobileLayout
  const canCreateCharacter = role === 'gm' || role === 'player'
  const canEditSelected = !!effectiveSelected
  const canSetCurrentCharacter = role === 'player'
    && !!effectiveSelected
    && effectiveSelected.ownerUserId === currentUserId
  const canDeleteCharacter = (character: CharacterRecord) => role === 'gm' || character.ownerUserId === currentUserId

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
  const primeRequisiteCodes: AbilityCode[] = (() => {
    const className = effectiveSelected?.className ?? ''
    if (className === 'Cleric') return ['WIS']
    if (className === 'Fighter') return ['STR']
    if (className === 'Magic-User') return ['INT']
    if (className === 'Thief') return ['DEX']
    if (className === 'Dwarf') return ['STR']
    if (className === 'Elf') return ['INT', 'STR']
    if (className === 'Halfling') return ['DEX', 'STR']
    return []
  })()
  const loweringCodes = loweringCandidateCodes.filter((code) => !primeRequisiteCodes.includes(code))
  const selectedStrRaw = selectedAbilityScores.STR
  const selectedDexRaw = selectedAbilityScores.DEX
  const selectedChaRaw = selectedAbilityScores.CHA
  const selectedConRaw = selectedAbilityScores.CON
  const selectedStr = Number.parseInt(selectedStrRaw, 10)
  const selectedDex = Number.parseInt(selectedDexRaw, 10)
  const selectedCha = Number.parseInt(selectedChaRaw, 10)
  const selectedCon = Number.parseInt(selectedConRaw, 10)
  const selectedEquippedItems = effectiveSelected
    ? (equippedItemsByCharacterId[effectiveSelected.id] ?? [])
    : []
  const selectedPackedItems = effectiveSelected
    ? (packedItemsByCharacterId[effectiveSelected.id] ?? [])
    : []
  const selectedWeapons = effectiveSelected ? (weaponsByCharacterId[effectiveSelected.id] ?? []) : []
  const selectedArmour = effectiveSelected ? (armourByCharacterId[effectiveSelected.id] ?? []) : []
  const selectedClassName = effectiveSelected?.className ?? '-'
  const selectedLevel = effectiveSelected?.level ?? 1
  const unlockedClassFeatures = (classFeaturesByClass[selectedClassName] ?? [])
    .filter((feature) => selectedLevel >= feature.unlockedAt)
    .sort((a, b) => a.unlockedAt - b.unlockedAt)
  const weaponRowCount = selectedWeapons.length
  const armourRowCount = selectedArmour.length
  const isGuidedCreation = effectiveSelected?.creationStatus === 'draft'
  const selectedStartingGold = effectiveSelected ? (startingGoldByCharacterId[effectiveSelected.id] ?? null) : null
  const hasRolledStartingGold = typeof selectedStartingGold === 'number'
  const selectedStoreCart = effectiveSelected ? (storeCartByCharacterId[effectiveSelected.id] ?? []) : []
  const selectedCommittedStoreSpent = effectiveSelected ? (storeSpentByCharacterId[effectiveSelected.id] ?? 0) : 0
  const selectedStoreCartTotal = selectedStoreCart.reduce((sum, entry) => sum + entry.costGp * entry.qty, 0)
  const selectedStoreRemaining = (selectedStartingGold ?? 0) - selectedCommittedStoreSpent - selectedStoreCartTotal
  const selectedStorePurchaseCountByName = selectedStoreCart.reduce((acc, entry) => {
    acc[entry.name] = (acc[entry.name] ?? 0) + entry.qty
    return acc
  }, {} as Record<string, number>)
  const visibleStoreItems = OSE_STORE_ITEMS.filter((item) => item.category === storeCategory && item.kind !== 'custom')
  const isWeaponTemplateAllowedForClass = (weaponId: string, className: string) => {
    if (!weaponId || weaponId === 'custom') return true
    const template = weaponCatalogById[weaponId]
    if (!template) return true
    if (className === 'Dwarf') {
      const dwarfDisallowedLargeWeapons = new Set(['long-bow', 'pole-arm', 'two-handed-sword'])
      return !dwarfDisallowedLargeWeapons.has(template.id)
    }
    if (className === 'Cleric') return template.qualities.includes('Blunt')
    if (className === 'Magic-User') return template.id === 'dagger'
    if (className === 'Halfling') return !template.twoHanded
    return true
  }
  const isArmourTemplateAllowedForClass = (armourId: string, className: string) => {
    if (className === 'Thief') return armourId === 'leather'
    if (className === 'Magic-User') return false
    if (!armourId || armourId === 'custom') return true
    return !!armourCatalogById[armourId]
  }
  const canClassEquipArmour = selectedClassName !== 'Magic-User'
  const weaponRestrictionNote =
    selectedClassName === 'Cleric'
      ? 'Clerics may only use blunt weapons.'
      : selectedClassName === 'Magic-User'
        ? 'Magic-Users may only use daggers.'
        : selectedClassName === 'Dwarf'
          ? 'Dwarves may only use small or normal-sized weapons.'
          : selectedClassName === 'Halfling'
            ? 'Halflings may only use one-handed weapons.'
            : null
  const armourRestrictionNote = selectedClassName === 'Magic-User' ? 'Magic-Users cannot equip armour.' : null
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
  const weaponTypeLabel = (weapon: WeaponRow) => {
    const template = weapon.weaponId && weapon.weaponId !== 'custom' ? weaponCatalogById[weapon.weaponId] : null
    return template?.name ?? 'Custom weapon'
  }
  const weaponCoreStatsLabel = (weapon: WeaponRow) => {
    const count = weapon.damageDiceCount.trim()
    const sides = weapon.damageDiceSides.trim()
    const short = weapon.rangeShort.trim()
    const medium = weapon.rangeMedium.trim()
    const long = weapon.rangeLong.trim()
    const hasDamage = count.length > 0 && sides.length > 0
    const hasRange = short.length > 0 && medium.length > 0 && long.length > 0
    if (!hasDamage && !hasRange) return ''
    if (hasDamage && hasRange) return `${count}d${sides} @ ${short}/${medium}/${long}`
    if (hasDamage) return `${count}d${sides} @ melee`
    return `${short}/${medium}/${long}`
  }
  const weaponStatsLabel = (weapon: WeaponRow) => {
    const stats: string[] = []
    stats.push(weaponCoreStatsLabel(weapon))
    const template = weapon.weaponId && weapon.weaponId !== 'custom' ? weaponCatalogById[weapon.weaponId] : null
    if (template) stats.push(`${template.costGp}gp`)
    const bonus = weapon.bonus.trim()
    if (bonus) stats.push(`+${bonus.replace(/^\+/, '')}`)
    if (weapon.twoHanded) stats.push('2H')
    return stats.join(' | ')
  }
  const renderWeaponSlotLabel = (weapon: WeaponRow): ReactNode => {
    const name = weapon.name.trim()
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
  const armourTypeLabel = (armour: ArmourRow) => {
    const template = armour.armourId && armour.armourId !== 'custom' ? armourCatalogById[armour.armourId] : null
    return template?.name ?? 'Custom armour'
  }
  const armourStatsLabel = (armour: ArmourRow) => {
    const stats: string[] = []
    const ac = armour.ac.trim()
    if (ac) stats.push(`AC ${ac}`)
    const template = armour.armourId && armour.armourId !== 'custom' ? armourCatalogById[armour.armourId] : null
    if (template) stats.push(`${template.costGp}gp`)
    const bonus = armour.bonus.trim()
    if (bonus) stats.push(`+${bonus.replace(/^\+/, '')}`)
    return stats.join(' | ')
  }
  const renderArmourSlotLabel = (armour: ArmourRow): ReactNode => {
    const name = armour.name.trim()
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
  const equippedWeaponItems = selectedWeapons
    .map((weapon, index) => ({ weapon, index }))
    .filter((entry) => entry.weapon.equipped)
  const equippedArmourItems = selectedArmour
    .map((armour, index) => ({ armour, index }))
    .filter((entry) => entry.armour.equipped)
  const equippedAutoItems = [
    ...equippedArmourItems.map((entry) => ({
      id: entry.armour.id,
      label: renderArmourSlotLabel(entry.armour),
      onToggle: (checked: boolean) => updateArmourRow(entry.index, { equipped: checked }),
    })),
    ...equippedWeaponItems.map((entry) => ({
      id: entry.weapon.id,
      label: renderWeaponSlotLabel(entry.weapon),
      onToggle: (checked: boolean) => updateWeaponRow(entry.index, { equipped: checked }),
    })),
  ]
  const packedWeaponItems = selectedWeapons
    .map((weapon, index) => ({ weapon, index }))
    .filter((entry) => !entry.weapon.equipped)
  const packedArmourItems = selectedArmour
    .map((armour, index) => ({ armour, index }))
    .filter((entry) => !entry.armour.equipped)
  const packedAutoItems = [
    ...packedArmourItems.map((entry) => ({
      id: entry.armour.id,
      label: renderArmourSlotLabel(entry.armour),
      onToggle: (checked: boolean) => updateArmourRow(entry.index, { equipped: checked }),
    })),
    ...packedWeaponItems.map((entry) => ({
      id: entry.weapon.id,
      label: renderWeaponSlotLabel(entry.weapon),
      onToggle: (checked: boolean) => updateWeaponRow(entry.index, { equipped: checked }),
    })),
  ]
  const packedSlotUnlockedByIndex = Array.from({ length: packedRowCount }, (_, index) =>
    index < packedStrengthSlotCount ? (!Number.isNaN(selectedStr) && selectedStr >= packedSlotThresholds[index]) : true,
  )
  const availablePackedSlotIndices = packedSlotUnlockedByIndex
    .map((unlocked, index) => (unlocked ? index : -1))
    .filter((index) => index >= 0)
  const packedAutoSlotByIndex = new Map<number, { label: ReactNode, onToggle: (checked: boolean) => void }>()
  packedAutoItems.forEach((item, itemIndex) => {
    const slotIndex = availablePackedSlotIndices[itemIndex]
    if (typeof slotIndex === 'number') {
      packedAutoSlotByIndex.set(slotIndex, { label: item.label, onToggle: item.onToggle })
    }
  })
  const displayedPackedItems = Array.from(
    { length: packedRowCount },
    (_, index) => (packedAutoSlotByIndex.has(index) ? '__AUTO__' : selectedPackedItems[index] ?? ''),
  )
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

  const abilityModifier = (score: number) => {
    if (score <= 3) return -2
    if (score <= 5) return -1
    if (score <= 8) return -1
    if (score <= 12) return 0
    if (score <= 15) return 1
    if (score <= 17) return 1
    return 2
  }

  const formatModifier = (value: number) => {
    if (value > 0) return `+${value}`
    return String(value)
  }

  const conModifierByScore = (score: number) => {
    if (score <= 3) return -3
    if (score <= 5) return -2
    if (score <= 8) return -1
    if (score <= 12) return 0
    if (score <= 15) return 1
    if (score <= 17) return 2
    return 3
  }

  const formatTableModifier = (value: number) => {
    if (value === 0) return 'None'
    if (value > 0) return `+${value}`
    return String(value)
  }

  const openStuckDoorByStr = (score: number) => {
    if (score <= 8) return 1
    if (score <= 12) return 2
    if (score <= 15) return 3
    if (score <= 17) return 4
    return 5
  }

  const meleeModifierByStr = (score: number) => {
    if (score <= 3) return -3
    if (score <= 5) return -2
    if (score <= 8) return -1
    if (score <= 12) return 0
    if (score <= 15) return 1
    if (score <= 17) return 2
    return 3
  }

  const missileModifierByDex = (score: number) => {
    if (score <= 3) return -3
    if (score <= 5) return -2
    if (score <= 8) return -1
    if (score <= 12) return 0
    if (score <= 15) return 1
    if (score <= 17) return 2
    return 3
  }

  const wisMagicSaveModifierByScore = (score: number) => {
    if (score <= 3) return -3
    if (score <= 5) return -2
    if (score <= 8) return -1
    if (score <= 12) return 0
    if (score <= 15) return 1
    if (score <= 17) return 2
    return 3
  }

  const derivedDexInitModifier = Number.isNaN(selectedDex) ? 0 : abilityModifier(selectedDex)
  const derivedInitModifierNumber = Number.isNaN(selectedDex) ? null : derivedDexInitModifier + (isHalfling ? 1 : 0)
  const derivedInitModifier = derivedInitModifierNumber === null ? '' : formatModifier(derivedInitModifierNumber)
  const derivedReactionModifier = Number.isNaN(selectedCha) ? '' : formatModifier(abilityModifier(selectedCha))
  const derivedOpenStuckDoor = Number.isNaN(selectedStr) ? '' : String(openStuckDoorByStr(selectedStr))
  const derivedMeleeModifier = Number.isNaN(selectedStr) ? '' : formatTableModifier(meleeModifierByStr(selectedStr))
  const derivedDexMissileModifier = Number.isNaN(selectedDex) ? 0 : missileModifierByDex(selectedDex)
  const derivedMissileModifierNumber = Number.isNaN(selectedDex) ? null : derivedDexMissileModifier + (isHalfling ? 1 : 0)
  const derivedMissileModifier = derivedMissileModifierNumber === null ? '' : formatTableModifier(derivedMissileModifierNumber)
  const derivedDexAcModifierNumber = Number.isNaN(selectedDex) ? null : missileModifierByDex(selectedDex)
  const derivedDexAcModifier = derivedDexAcModifierNumber === null ? '' : formatTableModifier(derivedDexAcModifierNumber)
  const derivedUnarmouredAc = derivedDexAcModifierNumber === null ? '' : String(9 - derivedDexAcModifierNumber)
  const derivedConModifierNumber = Number.isNaN(selectedCon) ? 0 : conModifierByScore(selectedCon)
  const derivedConModifier = Number.isNaN(selectedCon) ? '' : formatTableModifier(derivedConModifierNumber)
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
  const filledPackedItemCount = displayedPackedItems
    .slice(packedStrengthSlotCount)
    .filter((entry) => entry.trim().length > 0).length
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
      creationStatus: creationMode === 'new' ? 'draft' : 'active',
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
      const hasHolySymbol = [...selectedPackedItems, ...selectedEquippedItems].some((item) =>
        item.toLowerCase().includes('holy symbol'),
      )
      if (!hasHolySymbol) return 'HOLY_SYMBOL_REQUIRED'
    }
    return null
  }

  const requestFinalizeCharacter = () => {
    if (!effectiveSelected || !canEditSelected || !isGuidedCreation) return
    const validationError = validateDraftCharacter()
    if (validationError) {
      if (validationError === 'HOLY_SYMBOL_REQUIRED') {
        setHolySymbolRequiredOpen(true)
      } else {
        setFinalizeError(validationError)
      }
      return
    }
    setFinalizeError(null)
    setFinalizeConfirmOpen(true)
  }

  const finalizeCharacter = () => {
    if (!effectiveSelected || !canEditSelected || !isGuidedCreation) return
    updateSelectedCharacter({ creationStatus: 'active' })
    setFinalizeConfirmOpen(false)
    setFinalizeError(null)
  }

  const updateAbilityScore = (code: AbilityCode, value: string) => {
    if (!effectiveSelected) return
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
    const nextGuidedScores = buildGuidedAbilityScores(code, nextValue)
    if (!nextGuidedScores) return
    setAbilityScoresByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: nextGuidedScores,
    }))
  }

  const buildGuidedAbilityScores = (code: AbilityCode, nextValue: number): AbilityScores | null => {
    if (!selectedRolledAbilityScores || !Number.isFinite(nextValue)) return null
    const baseScores = selectedRolledAbilityScores
    const currentScores = selectedAbilityScores
    const nextScores: Record<AbilityCode, number> = {
      STR: Number.parseInt(currentScores.STR || baseScores.STR, 10),
      INT: Number.parseInt(currentScores.INT || baseScores.INT, 10),
      WIS: Number.parseInt(currentScores.WIS || baseScores.WIS, 10),
      DEX: Number.parseInt(currentScores.DEX || baseScores.DEX, 10),
      CON: Number.parseInt(currentScores.CON || baseScores.CON, 10),
      CHA: Number.parseInt(currentScores.CHA || baseScores.CHA, 10),
    }
    nextScores[code] = nextValue

    for (const abilityCode of abilityCodes) {
      const base = Number.parseInt(baseScores[abilityCode], 10)
      const current = nextScores[abilityCode]
      if (Number.isNaN(base) || Number.isNaN(current)) return null

      const isPrime = primeRequisiteCodes.includes(abilityCode)
      const canLowerForPoints = loweringCodes.includes(abilityCode)

      if (canLowerForPoints) {
        if (current > base) return null
        if (current < 9) return null
      } else if (!isPrime) {
        if (current !== base) return null
      }

      if (isPrime && current < base) return null
      if (current < 3 || current > 18) return null
    }

    const gained = Math.floor(
      loweringCodes.reduce((sum, abilityCode) => {
        const base = Number.parseInt(baseScores[abilityCode], 10)
        return sum + Math.max(0, base - nextScores[abilityCode])
      }, 0) / 2,
    )
    const spent = primeRequisiteCodes.reduce((sum, abilityCode) => {
      const base = Number.parseInt(baseScores[abilityCode], 10)
      return sum + Math.max(0, nextScores[abilityCode] - base)
    }, 0)
    if (spent > gained) return null

    return {
      STR: String(nextScores.STR),
      INT: String(nextScores.INT),
      WIS: String(nextScores.WIS),
      DEX: String(nextScores.DEX),
      CON: String(nextScores.CON),
      CHA: String(nextScores.CHA),
    }
  }

  const rollAbilityScores = () => {
    if (!effectiveSelected || !canEditSelected) return
    if (hasRolledAbilityScores) return
    const roll3d6 = () =>
      Array.from({ length: 3 }, () => Math.floor(Math.random() * 6) + 1).reduce((sum, value) => sum + value, 0)
    const nextScores: AbilityScores = {
      STR: String(roll3d6()),
      INT: String(roll3d6()),
      WIS: String(roll3d6()),
      DEX: String(roll3d6()),
      CON: String(roll3d6()),
      CHA: String(roll3d6()),
    }
    setAbilityScoresByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: nextScores,
    }))
    setRolledAbilityScoresByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: nextScores,
    }))
    setAbilityScoresRolledByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: true,
    }))
  }

  const classHitDie = classHitDieByClass[effectiveSelected?.className ?? ''] ?? null
  const selectedBaseHpRoll = effectiveSelected ? hpBaseRollByCharacterId[effectiveSelected.id] : undefined
  const hasRolledHp = typeof selectedBaseHpRoll === 'number'
  const canFreeRerollHp = hasRolledHp && selectedBaseHpRoll <= 2

  const rollHitPoints = () => {
    if (!effectiveSelected || !classHitDie) return
    const levelForHd = Math.min(3, Math.max(1, effectiveSelected.level))
    const baseRoll = Array.from({ length: levelForHd }, () => Math.floor(Math.random() * classHitDie) + 1).reduce(
      (sum, value) => sum + value,
      0,
    )
    const hpTotal = Math.max(1, baseRoll + derivedConModifierNumber * levelForHd)
    setHpBaseRollByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: baseRoll,
    }))
    updateSelectedCharacter({
      hpCurrent: hpTotal,
      hpMax: hpTotal,
    })
  }

  const applyClassDerivedData = (characterId: string, className: string) => {
    const saveProfile = classLevel1Saves[className]
    if (!saveProfile) return
    setSaveScoresByCharacterId((current) => ({
      ...current,
      [characterId]: saveProfile,
    }))
  }

  const clampInSix = (value: string) => {
    if (value.trim().length === 0) return ''
    const parsed = Number.parseInt(value, 10)
    if (Number.isNaN(parsed)) return ''
    return String(Math.min(6, Math.max(1, parsed)))
  }

  const requestRollHitPoints = () => {
    if (!canEditSelected) return
    if (!isGuidedCreation) return
    if (!classHitDie) {
      setHpClassRequiredOpen(true)
      return
    }
    if (hasRolledHp && !canFreeRerollHp) return
    rollHitPoints()
  }

  useEffect(() => {
    if (!effectiveSelected) return
    const baseRoll = hpBaseRollByCharacterId[effectiveSelected.id]
    if (typeof baseRoll !== 'number') return
    const levelForHd = Math.min(3, Math.max(1, effectiveSelected.level))
    const nextMax = Math.max(1, baseRoll + derivedConModifierNumber * levelForHd)
    const wasFullHp = effectiveSelected.hpCurrent >= effectiveSelected.hpMax
    const nextCurrent = wasFullHp ? nextMax : Math.min(effectiveSelected.hpCurrent, nextMax)
    if (effectiveSelected.hpCurrent === nextCurrent && effectiveSelected.hpMax === nextMax) return
    updateSelectedCharacter({
      hpCurrent: nextCurrent,
      hpMax: nextMax,
    })
  }, [
    effectiveSelected,
    hpBaseRollByCharacterId,
    derivedConModifierNumber,
  ])

  useEffect(() => {
    if (!effectiveSelected) return
    if (saveScoresByCharacterId[effectiveSelected.id]) return
    applyClassDerivedData(effectiveSelected.id, effectiveSelected.className)
  }, [effectiveSelected, saveScoresByCharacterId])

  useEffect(() => {
    if (!effectiveSelected) return
    if (effectiveSelected.level < 1 || effectiveSelected.level > 3) return
    if ((thacoByCharacterId[effectiveSelected.id] ?? '').trim().length > 0) return
    setThacoByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: '19',
    }))
  }, [effectiveSelected, thacoByCharacterId])

  useEffect(() => {
    if (!effectiveSelected) return
    const characterId = effectiveSelected.id
    const className = effectiveSelected.className
    const seededClass = adventureSeedClassByCharacterId[characterId]
    if (seededClass === className && adventureScoresByCharacterId[characterId]) return
    setAdventureScoresByCharacterId((current) => ({
      ...current,
      [characterId]: adventureDefaultsByClass(className),
    }))
    setAdventureSeedClassByCharacterId((current) => ({
      ...current,
      [characterId]: className,
    }))
  }, [effectiveSelected, adventureSeedClassByCharacterId, adventureScoresByCharacterId])

  useEffect(() => {
    if (!effectiveSelected) return
    if (effectiveSelected.className !== 'Thief') return
    if (thiefSkillsByCharacterId[effectiveSelected.id]) return
    setThiefSkillsByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: defaultThiefSkills(),
    }))
  }, [effectiveSelected, thiefSkillsByCharacterId])

  useEffect(() => {
    if (!effectiveSelected) return
    if (derivedDexAcModifierNumber === null) return
    if (acManualOverrideByCharacterId[effectiveSelected.id]) return
    const autoAc = 9 - derivedDexAcModifierNumber
    if (effectiveSelected.ac === autoAc) return
    updateSelectedCharacter({ ac: autoAc })
  }, [effectiveSelected, derivedDexAcModifierNumber, acManualOverrideByCharacterId])

  useEffect(() => {
    if (!effectiveSelected || selectedClassName !== 'Halfling') return
    const rows = weaponsByCharacterId[effectiveSelected.id] ?? []
    if (!rows.some((row) => row.twoHanded)) return
    setWeaponsByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: (current[effectiveSelected.id] ?? []).map((row) => ({ ...row, twoHanded: false })),
    }))
  }, [effectiveSelected, selectedClassName, weaponsByCharacterId])

  useEffect(() => {
    if (!effectiveSelected || canClassEquipArmour) return
    const rows = armourByCharacterId[effectiveSelected.id] ?? []
    if (!rows.some((row) => row.equipped)) return
    setArmourByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: (current[effectiveSelected.id] ?? []).map((row) => ({ ...row, equipped: false })),
    }))
  }, [effectiveSelected, canClassEquipArmour, armourByCharacterId])

  useEffect(() => {
    setFinalizeError(null)
    setFinalizeConfirmOpen(false)
  }, [effectiveSelected?.id, effectiveSelected?.creationStatus])

  useEffect(() => {
    if (isGuidedCreation && activePage === 'asw') {
      setActivePage('encumbrance')
    }
  }, [activePage, isGuidedCreation])

  useEffect(() => {
    if (!isGuidedCreation && storeOpen) {
      setStoreOpen(false)
      setStoreError(null)
    }
  }, [isGuidedCreation, storeOpen])

  const getWeaponRows = (current: Record<string, WeaponRow[]>, characterId: string, minCount = 1) => {
    const existing = current[characterId] ?? []
    if (existing.length >= minCount) return existing
    return [...existing, ...Array.from({ length: minCount - existing.length }, () => makeWeaponRow())]
  }

  const getArmourRows = (current: Record<string, ArmourRow[]>, characterId: string, minCount = 1) => {
    const existing = current[characterId] ?? []
    if (existing.length >= minCount) return existing
    return [...existing, ...Array.from({ length: minCount - existing.length }, () => makeArmourRow())]
  }

  const applyWeaponTemplate = (row: WeaponRow, weaponId: string): WeaponRow => {
    if (!weaponId || weaponId === 'custom') {
      return {
        ...row,
        weaponId,
        damageDiceCount: '',
        damageDiceSides: '',
        rangeShort: '',
        rangeMedium: '',
        rangeLong: '',
        twoHanded: false,
      }
    }
    const template = weaponCatalogById[weaponId]
    if (!template) return row
    const parsedDamage = parseDamageDice(template.damage)
    return {
      ...row,
      weaponId: template.id,
      ...parsedDamage,
      ...parseRangeBands(template.range),
      twoHanded: template.twoHanded,
    }
  }

  const updateWeaponRow = (rowIndex: number, updates: Partial<WeaponRow>) => {
    if (!effectiveSelected) return
    setWeaponsByCharacterId((current) => {
      const nextRows = [...getWeaponRows(current, effectiveSelected.id, rowIndex + 1)]
      const existing = nextRows[rowIndex] ?? makeWeaponRow()
      const shouldEquipExclusively = updates.equipped === true

      if (shouldEquipExclusively) {
        for (let index = 0; index < nextRows.length; index += 1) {
          const entry = nextRows[index] ?? makeWeaponRow()
          nextRows[index] = { ...entry, equipped: index === rowIndex }
        }
      }

      const merged = { ...nextRows[rowIndex], ...existing, ...updates }
      nextRows[rowIndex] = Object.prototype.hasOwnProperty.call(updates, 'weaponId')
        ? applyWeaponTemplate(merged, updates.weaponId ?? '')
        : merged
      if (selectedClassName === 'Halfling' && nextRows[rowIndex].twoHanded) {
        nextRows[rowIndex] = { ...nextRows[rowIndex], twoHanded: false, equipped: false }
      }
      if (!isWeaponTemplateAllowedForClass(nextRows[rowIndex].weaponId, selectedClassName)) {
        nextRows[rowIndex] = { ...nextRows[rowIndex], equipped: false }
      }
      return {
        ...current,
        [effectiveSelected.id]: nextRows,
      }
    })
  }

  const addWeaponRow = () => {
    if (!effectiveSelected || !canEditSelected) return
    const nextRow = makeWeaponRow()
    setWeaponsByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: [...(current[effectiveSelected.id] ?? []), nextRow],
    }))
    setExpandedWeaponCards((current) => ({ ...current, [`${effectiveSelected.id}:${nextRow.id}`]: false }))
  }

  const removeWeaponRow = (rowIndex: number) => {
    if (!effectiveSelected || !canEditSelected) return
    setWeaponsByCharacterId((current) => {
      const existing = current[effectiveSelected.id] ?? []
      if (existing.length === 0) return current

      const nextRows = existing.filter((_, index) => index !== rowIndex)
      const hasEquipped = nextRows.some((row) => row.equipped)
      if (!hasEquipped && nextRows.length > 0) {
        nextRows[0] = { ...nextRows[0], equipped: true }
      }

      return {
        ...current,
        [effectiveSelected.id]: nextRows,
      }
    })
  }

  const applyArmourTemplate = (row: ArmourRow, armourId: string): ArmourRow => {
    if (!armourId || armourId === 'custom') {
      return { ...row, armourId }
    }
    const template = armourCatalogById[armourId]
    if (!template) return row
    const parsedArmour = parseArmourTemplateValues(template.ac)
    return {
      ...row,
      armourId: template.id,
      ...parsedArmour,
    }
  }

  const updateArmourRow = (rowIndex: number, updates: Partial<ArmourRow>) => {
    if (!effectiveSelected) return
    setArmourByCharacterId((current) => {
      const nextRows = [...getArmourRows(current, effectiveSelected.id, rowIndex + 1)]
      const existing = nextRows[rowIndex] ?? makeArmourRow()
      const merged = { ...nextRows[rowIndex], ...existing, ...updates }
      nextRows[rowIndex] = updates.armourId
        ? applyArmourTemplate(merged, updates.armourId)
        : merged
      if (!canClassEquipArmour) {
        nextRows[rowIndex] = { ...nextRows[rowIndex], equipped: false }
      }
      if (!isArmourTemplateAllowedForClass(nextRows[rowIndex].armourId, selectedClassName)) {
        nextRows[rowIndex] = { ...nextRows[rowIndex], equipped: false }
      }
      return {
        ...current,
        [effectiveSelected.id]: nextRows,
      }
    })
  }

  const addArmourRow = () => {
    if (!effectiveSelected || !canEditSelected) return
    const nextRow = makeArmourRow()
    setArmourByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: [...(current[effectiveSelected.id] ?? []), nextRow],
    }))
    setExpandedArmourCards((current) => ({ ...current, [`${effectiveSelected.id}:${nextRow.id}`]: false }))
  }

  const upsertCartEntry = (nextEntry: Omit<StoreCartEntry, 'qty'>) => {
    if (!effectiveSelected) return
    setStoreCartByCharacterId((current) => {
      const existing = current[effectiveSelected.id] ?? []
      const index = existing.findIndex((entry) => entry.key === nextEntry.key)
      if (index < 0) {
        return {
          ...current,
          [effectiveSelected.id]: [...existing, { ...nextEntry, qty: 1 }],
        }
      }
      const next = [...existing]
      next[index] = { ...next[index], qty: next[index].qty + 1 }
      return {
        ...current,
        [effectiveSelected.id]: next,
      }
    })
  }

  const decrementCartEntry = (entryKey: string) => {
    if (!effectiveSelected) return
    setStoreCartByCharacterId((current) => {
      const existing = current[effectiveSelected.id] ?? []
      const index = existing.findIndex((entry) => entry.key === entryKey)
      if (index < 0) return current
      const next = [...existing]
      const target = next[index]
      if (target.qty <= 1) {
        return {
          ...current,
          [effectiveSelected.id]: next.filter((entry) => entry.key !== entryKey),
        }
      }
      next[index] = { ...target, qty: target.qty - 1 }
      return {
        ...current,
        [effectiveSelected.id]: next,
      }
    })
  }

  const incrementCartEntry = (entryKey: string) => {
    if (!effectiveSelected) return
    setStoreCartByCharacterId((current) => {
      const existing = current[effectiveSelected.id] ?? []
      const index = existing.findIndex((entry) => entry.key === entryKey)
      if (index < 0) return current
      const target = existing[index]
      if (selectedStoreRemaining < target.costGp) {
        setStoreError('Not enough gp remaining for this purchase.')
        return current
      }
      const next = [...existing]
      next[index] = { ...target, qty: target.qty + 1 }
      return {
        ...current,
        [effectiveSelected.id]: next,
      }
    })
  }

  const removeCartEntry = (entryKey: string) => {
    if (!effectiveSelected) return
    setStoreCartByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: (current[effectiveSelected.id] ?? []).filter((entry) => entry.key !== entryKey),
    }))
  }

  const clearCart = () => {
    if (!effectiveSelected) return
    setStoreCartByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: [],
    }))
  }

  const goldChunksForAmount = (amount: number) => {
    if (amount > 100) return [100, amount - 100]
    return [amount]
  }

  const setPackedGoldFromAmount = (amount: number): boolean => {
    if (!effectiveSelected) return false
    const characterId = effectiveSelected.id
    const chunks = goldChunksForAmount(Math.max(0, amount))
    let success = true
    let nextGoldIndices: number[] = []
    setPackedItemsByCharacterId((current) => {
      const rows = [...(current[characterId] ?? Array(packedRowCount).fill(''))]
      const existingGoldIndices = storeGoldSlotIndicesByCharacterId[characterId] ?? []
      existingGoldIndices.forEach((slotIndex) => {
        if (slotIndex >= 0 && slotIndex < rows.length) rows[slotIndex] = ''
      })
      const available = availablePackedSlotIndices.filter(
        (slotIndex) =>
          !packedAutoSlotByIndex.has(slotIndex)
          && (rows[slotIndex] ?? '').trim().length === 0,
      )
      if (available.length < chunks.length) {
        success = false
        return current
      }
      nextGoldIndices = chunks.map((chunk, index) => {
        const slotIndex = available[index]
        rows[slotIndex] = `Gold: ${chunk} gp`
        return slotIndex
      })
      return {
        ...current,
        [characterId]: rows,
      }
    })
    if (!success) return false
    setStoreGoldSlotIndicesByCharacterId((current) => ({
      ...current,
      [characterId]: nextGoldIndices,
    }))
    return true
  }

  const rollStartingGold = () => {
    if (!effectiveSelected || !canEditSelected) return
    const roll = () => Math.floor(Math.random() * 6) + 1
    const total = (roll() + roll() + roll()) * 10
    const applied = setPackedGoldFromAmount(total)
    if (!applied) {
      setStoreError('Not enough open packed slots for starting gold.')
      return
    }
    setStartingGoldByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: total,
    }))
    setStoreSpentByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: 0,
    }))
    clearCart()
    setStoreError(null)
  }

  const handleStoreBuy = (item: StoreItem) => {
    if (!effectiveSelected || !canEditSelected) return
    if (selectedClassName === '-') {
      setStoreClassRequiredOpen(true)
      return
    }
    if (!hasRolledStartingGold) {
      setStoreError('Roll starting gold before buying equipment.')
      return
    }
    if (selectedStoreRemaining < item.costGp) {
      setStoreError('Not enough gp remaining for this purchase.')
      return
    }

    if (item.kind === 'weapon' && item.weaponId) {
      if (!isWeaponTemplateAllowedForClass(item.weaponId, selectedClassName)) {
        setStoreError('This class cannot use that weapon.')
        return
      }
      upsertCartEntry({
        key: item.id,
        name: item.name,
        costGp: item.costGp,
        kind: item.kind,
        weaponId: item.weaponId,
        armourId: item.armourId,
        packedLabel: item.name,
      })
      setStoreError(null)
      return
    }

    if (item.kind === 'armour' && item.armourId) {
      if (!isArmourTemplateAllowedForClass(item.armourId, selectedClassName)) {
        setStoreError('This class cannot use that armour.')
        return
      }
      upsertCartEntry({
        key: item.id,
        name: item.name,
        costGp: item.costGp,
        kind: item.kind,
        weaponId: item.weaponId,
        armourId: item.armourId,
        packedLabel: item.name,
      })
      setStoreError(null)
      return
    }

    upsertCartEntry({
      key: item.id,
      name: item.name,
      costGp: item.costGp,
      kind: item.kind,
      packedLabel: item.name,
    })
    setStoreError(null)
  }

  const handleBuyCustomStoreItem = () => {
    if (!effectiveSelected || !canEditSelected) return
    if (selectedClassName === '-') {
      setStoreClassRequiredOpen(true)
      return
    }
    if (!hasRolledStartingGold) {
      setStoreError('Roll starting gold before buying equipment.')
      return
    }
    const trimmedName = customStoreName.trim()
    if (!trimmedName) {
      setStoreError('Enter a name for custom equipment.')
      return
    }
    const parsedCost = Number.parseInt(customStoreCost || '0', 10)
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      setStoreError('Custom equipment cost must be 0 gp or greater.')
      return
    }
    if (selectedStoreRemaining < parsedCost) {
      setStoreError('Not enough gp remaining for this purchase.')
      return
    }
    const label = customStoreDescription.trim().length > 0
      ? `${trimmedName} (${customStoreDescription.trim()})`
      : trimmedName
    upsertCartEntry({
      key: `custom:${trimmedName}:${parsedCost}:${customStoreDescription.trim()}`,
      name: trimmedName,
      costGp: parsedCost,
      kind: 'custom',
      packedLabel: label,
    })
    setStoreError(null)
    setCustomStoreName('')
    setCustomStoreCost('')
    setCustomStoreDescription('')
  }

  const applyStorePurchases = () => {
    if (!effectiveSelected || !canEditSelected) return
    if (selectedClassName === '-') {
      setStoreClassRequiredOpen(true)
      return
    }
    if (!hasRolledStartingGold) {
      setStoreError('Roll starting gold before buying equipment.')
      return
    }
    if (selectedStoreCart.length === 0) {
      setStoreError('Your cart is empty.')
      return
    }
    if (selectedStoreRemaining < 0) {
      setStoreError('Cart total exceeds remaining gold.')
      return
    }

    const cartTotal = selectedStoreCartTotal
    const requiredPacked = selectedStoreCart.reduce(
      (sum, entry) => sum + ((entry.kind === 'weapon' || entry.kind === 'armour') ? 0 : entry.qty),
      0,
    )
    const packedRows = [...(packedItemsByCharacterId[effectiveSelected.id] ?? Array(packedRowCount).fill(''))]
    const openSlots = availablePackedSlotIndices.filter(
      (slotIndex) =>
        !packedAutoSlotByIndex.has(slotIndex)
        && (packedRows[slotIndex] ?? '').trim().length === 0,
    )
    if (requiredPacked > openSlots.length) {
      setStoreError('Not enough open packed slots to apply cart purchases.')
      return
    }

    const nextWeaponRows = [...(weaponsByCharacterId[effectiveSelected.id] ?? [])]
    const nextArmourRows = [...(armourByCharacterId[effectiveSelected.id] ?? [])]
    let packedCursor = 0

    for (const entry of selectedStoreCart) {
      for (let count = 0; count < entry.qty; count += 1) {
        if (entry.kind === 'weapon' && entry.weaponId) {
          if (!isWeaponTemplateAllowedForClass(entry.weaponId, selectedClassName)) {
            setStoreError(`Class restriction prevents ${entry.name}.`)
            return
          }
          nextWeaponRows.push(applyWeaponTemplate(makeWeaponRow(), entry.weaponId))
          continue
        }
        if (entry.kind === 'armour' && entry.armourId) {
          if (!isArmourTemplateAllowedForClass(entry.armourId, selectedClassName)) {
            setStoreError(`Class restriction prevents ${entry.name}.`)
            return
          }
          nextArmourRows.push(applyArmourTemplate(makeArmourRow(), entry.armourId))
          continue
        }
        const slotIndex = openSlots[packedCursor]
        if (typeof slotIndex !== 'number') {
          setStoreError('Not enough open packed slots to apply cart purchases.')
          return
        }
        packedRows[slotIndex] = entry.packedLabel ?? entry.name
        packedCursor += 1
      }
    }

    setWeaponsByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: nextWeaponRows,
    }))
    setArmourByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: nextArmourRows,
    }))
    setPackedItemsByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: packedRows,
    }))
    setStoreSpentByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: (current[effectiveSelected.id] ?? 0) + cartTotal,
    }))
    const remainingAfter = (selectedStartingGold ?? 0) - ((storeSpentByCharacterId[effectiveSelected.id] ?? 0) + cartTotal)
    const goldChunks = goldChunksForAmount(Math.max(0, remainingAfter))
    const goldIndices = storeGoldSlotIndicesByCharacterId[effectiveSelected.id] ?? []
    if (goldIndices.length > 0) {
      setPackedItemsByCharacterId((current) => {
        const rows = [...(current[effectiveSelected.id] ?? Array(packedRowCount).fill(''))]
        goldIndices.forEach((slotIndex, index) => {
          rows[slotIndex] = goldChunks[index] !== undefined ? `Gold: ${goldChunks[index]} gp` : ''
        })
        return {
          ...current,
          [effectiveSelected.id]: rows,
        }
      })
    }
    clearCart()
    setStoreError(null)
  }

  const removeArmourRow = (rowIndex: number) => {
    if (!effectiveSelected || !canEditSelected) return
    setArmourByCharacterId((current) => {
      const existing = current[effectiveSelected.id] ?? []
      if (existing.length === 0) return current
      return {
        ...current,
        [effectiveSelected.id]: existing.filter((_, index) => index !== rowIndex),
      }
    })
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
        <aside className="maps-sidebar monsters-sidebar characters-sidebar">
          <div className="maps-sidebar-header">
            <h2>{role === 'gm' ? 'Characters' : 'Character'}</h2>
            {canCreateCharacter ? (
              <button
                type="button"
                className="monster-add-btn"
                onClick={() => setCreateCharacterModalOpen(true)}
                aria-label="Add character"
              >
                <Plus size={16} />
              </button>
            ) : null}
          </div>

          {charactersLoading ? <p>Loading characters...</p> : null}

          {sortedCharacters.length === 0 ? <p>No characters available.</p> : null}

          <div className="monster-list-grid character-list-grid">
            {sortedCharacters.map((character) => (
              <div key={character.id} className="character-list-item-wrap">
                <button
                  type="button"
                  className={
                    character.id === effectiveSelected?.id
                      ? 'monster-list-item active'
                      : 'monster-list-item'
                  }
                  onClick={() => {
                    setSelectedCharacterId(character.id)
                    if (isMobile) setMobileCharacterView('detail')
                  }}
                >
                  <div className="monster-card-portrait">
                    <div className="monster-portrait-empty small">
                      <UserRound size={14} />
                    </div>
                  </div>

                  <div className="monster-card-main">
                    <div className="character-card-title-row">
                      <h4>{character.name || 'Unnamed Character'}</h4>
                      {currentCharacterId === character.id ? (
                        <span className="character-current-badge">
                          <Star size={12} />
                          Current
                        </span>
                      ) : null}
                    </div>
                    <p className="monster-card-statline">
                      {character.className} • Level {character.level} • HP {character.hpCurrent}/{character.hpMax}
                    </p>
                    <p>AC {character.ac} • XP {character.xp.toLocaleString()}</p>
                    <p className="character-card-owner">
                      {character.ownerUsername || 'Unassigned'}
                    </p>
                  </div>
                </button>
                {canDeleteCharacter(character) ? (
                  <button
                    type="button"
                    className="map-delete-btn character-card-delete-btn"
                    onClick={() => setDeleteConfirmTarget({ id: character.id, name: character.name || 'character' })}
                    aria-label={`Delete ${character.name || 'character'}`}
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </aside>
      ) : null}

      {showDetailPane ? (
        <div className="monsters-detail characters-detail">
          <div className="monsters-detail-inner characters-detail-inner">
            {!isMobile && effectiveSelected ? (
              <div className="character-sheet-page-tabs top">
                <button
                  type="button"
                  className={activePage === 'core' ? 'character-sheet-tab active' : 'character-sheet-tab'}
                  onClick={() => setActivePage('core')}
                >
                  Core Sheet
                </button>
                {!isGuidedCreation ? (
                  <button
                    type="button"
                    className={activePage === 'asw' ? 'character-sheet-tab active' : 'character-sheet-tab'}
                    onClick={() => setActivePage('asw')}
                  >
                    Weapons, Armour & Spells
                  </button>
                ) : null}
                <button
                  type="button"
                  className={activePage === 'encumbrance' ? 'character-sheet-tab active' : 'character-sheet-tab'}
                  onClick={() => setActivePage('encumbrance')}
                >
                  Items
                </button>
                {canSetCurrentCharacter ? (
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
                {isGuidedCreation && canEditSelected ? (
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
              </div>
            ) : null}
            {isMobile ? (
              <div className="monster-detail-header-row">
                {effectiveSelected ? (
                  <button
                    type="button"
                    className="back-link monster-mobile-back"
                    onClick={() => setMobileCharacterView('list')}
                    aria-label="Back to character list"
                  >
                    <ChevronLeft size={16} />
                  </button>
                ) : <span />}
                {canSetCurrentCharacter ? (
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
                {isGuidedCreation && canEditSelected ? (
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
              </div>
            ) : null}

            {finalizeError ? <p className="error">{finalizeError}</p> : null}

            {!effectiveSelected ? (
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
                            <input type="text" defaultValue="" disabled={!canEditSelected} />
                          </label>
                          <div className="character-header-compact-row">
                            <label className="character-header-field character-header-field-level">
                              <span className="character-header-tag">Level</span>
                              <input
                                type="number"
                                min={1}
                                max={3}
                                value={String(effectiveSelected.level)}
                                onChange={(event) => {
                                  const parsed = Number(event.target.value || 1)
                                  updateSelectedCharacter({ level: Math.min(3, Math.max(1, parsed)) })
                                }}
                                disabled={!canEditSelected}
                              />
                            </label>
                            <label className="character-header-field character-header-field-class">
                              <span className="character-header-tag">Class</span>
                              <select
                                value={effectiveSelected.className}
                                onChange={(event) => {
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
                                disabled={!canEditSelected}
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
                            <select defaultValue="Neutrality" disabled={!canEditSelected}>
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
                              {hasRolledAbilityScores ? (
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
                                        && buildGuidedAbilityScores(abilityCode, currentValue - 1) !== null
                                      const canIncrease = canEditSelected
                                        && hasRolledAbilityScores
                                        && classChosen
                                        && Number.isFinite(currentValue)
                                        && buildGuidedAbilityScores(abilityCode, currentValue + 1) !== null
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
                                      disabled={!canEditSelected}
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
                                  <small>Unarmoured AC: 9 [10] + DEX mod</small>
                                </div>
                                <div className="character-combat-side-row">
                                  <span className="character-combat-tag">±</span>
                                  <input type="text" value={derivedDexAcModifier} readOnly />
                                  <small>DEX modifier to Armour Class</small>
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
                ) : activePage === 'encumbrance' || isGuidedCreation ? (
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
                      <section className="monster-section-block">
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
                          {Array.from({ length: equippedRowCount }, (_, index) => (
                            <label key={`equipped-slot-${index + 1}`} className="character-item-row">
                              {index < equippedAutoItems.length ? (
                                <div className="character-item-row-inner">
                                  <input
                                    type="checkbox"
                                    className="character-item-slot-check"
                                    checked
                                    onChange={(event) => equippedAutoItems[index]?.onToggle(event.target.checked)}
                                    disabled={!canEditSelected}
                                    aria-label={`Equipped toggle slot ${index + 1}`}
                                  />
                                  <span className="character-item-auto-slot">
                                    {equippedAutoItems[index]?.label}
                                  </span>
                                </div>
                              ) : (
                                <div className="character-item-row-inner">
                                  {(() => {
                                    const manualIndex = index - equippedAutoItems.length
                                    const value = selectedEquippedItems[manualIndex] ?? ''
                                    const isFilled = value.trim().length > 0
                                    return (
                                      <>
                                        {isFilled ? (
                                          <input
                                            type="checkbox"
                                            className="character-item-slot-check"
                                            checked
                                            onChange={(event) => {
                                              if (!effectiveSelected || event.target.checked) return
                                              const firstOpenPackedIndex = availablePackedSlotIndices.find(
                                                (slotIndex) => (selectedPackedItems[slotIndex] ?? '').trim().length === 0,
                                              )
                                              if (typeof firstOpenPackedIndex !== 'number') return
                                              setPackedItemsByCharacterId((current) => {
                                                const nextRows = [
                                                  ...(current[effectiveSelected.id] ?? Array(packedRowCount).fill('')),
                                                ]
                                                nextRows[firstOpenPackedIndex] = value
                                                return {
                                                  ...current,
                                                  [effectiveSelected.id]: nextRows,
                                                }
                                              })
                                              setEquippedItemsByCharacterId((current) => {
                                                const nextRows = [...(current[effectiveSelected.id] ?? [])]
                                                nextRows[manualIndex] = ''
                                                return {
                                                  ...current,
                                                  [effectiveSelected.id]: nextRows,
                                                }
                                              })
                                            }}
                                            disabled={!canEditSelected}
                                            aria-label={`Equipped toggle slot ${index + 1}`}
                                          />
                                        ) : null}
                                        <input
                                          type="text"
                                          className="character-item-input"
                                          value={value}
                                          onChange={(event) => {
                                            if (!effectiveSelected) return
                                            setEquippedItemsByCharacterId((current) => {
                                              const nextRows = [...(current[effectiveSelected.id] ?? [])]
                                              nextRows[manualIndex] = event.target.value
                                              return {
                                                ...current,
                                                [effectiveSelected.id]: nextRows,
                                              }
                                            })
                                          }}
                                          disabled={!canEditSelected}
                                          aria-label={`Equipped item slot ${index + 1}`}
                                        />
                                      </>
                                    )
                                  })()}
                                </div>
                              )}
                            </label>
                          ))}
                        </div>
                        {equippedAutoItems.length > equippedRowCount ? (
                          <p className="error">Too many equipped weapons/armour items for available equipped slots.</p>
                        ) : null}
                        <p className="character-enc-help">
                          Anything held, actively in use, or ready to use at short notice: armour worn, shields or
                          weapons held, sheathed weapons, items worn on the belt.
                        </p>
                      </section>

                      <section className="monster-section-block character-enc-packed">
                        <h3 className="monster-section-title">Packed Items</h3>
                        <div className="character-item-rows packed">
                          {Array.from({ length: packedStrengthSlotCount }, (_, index) => {
                            const threshold = packedSlotThresholds[index]
                            const label = packedSlotLabels[index]
                            const unlocked = !Number.isNaN(selectedStr) && selectedStr >= threshold
                            return (
                              <label
                                key={`packed-strength-slot-${index + 1}`}
                                className={`character-item-row${unlocked ? '' : ' locked'}`}
                              >
                                {packedAutoSlotByIndex.has(index) ? (
                                  <div className="character-item-row-inner">
                                    <input
                                      type="checkbox"
                                      className="character-item-slot-check"
                                      checked={false}
                                      onChange={(event) => packedAutoSlotByIndex.get(index)?.onToggle(event.target.checked)}
                                      disabled={!canEditSelected}
                                      aria-label={`Equipped toggle slot ${index + 1}`}
                                    />
                                    <span className="character-item-auto-slot">
                                      {packedAutoSlotByIndex.get(index)?.label}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="character-item-row-inner">
                                    {(displayedPackedItems[index] ?? '').trim().length > 0 ? (
                                      <input
                                        type="checkbox"
                                        className="character-item-slot-check"
                                        checked={false}
                                        onChange={(event) => {
                                          if (!effectiveSelected || !event.target.checked) return
                                          const manualEquippedSlots = equippedRowCount - equippedAutoItems.length
                                          if (manualEquippedSlots <= 0) return
                                          const firstOpenManualIndex = Array.from(
                                            { length: manualEquippedSlots },
                                            (_, manualIndex) => manualIndex,
                                          ).find((manualIndex) => (selectedEquippedItems[manualIndex] ?? '').trim().length === 0)
                                          if (typeof firstOpenManualIndex !== 'number') return
                                          const value = displayedPackedItems[index] ?? ''
                                          setEquippedItemsByCharacterId((current) => {
                                            const nextRows = [...(current[effectiveSelected.id] ?? [])]
                                            nextRows[firstOpenManualIndex] = value
                                            return {
                                              ...current,
                                              [effectiveSelected.id]: nextRows,
                                            }
                                          })
                                          setPackedItemsByCharacterId((current) => {
                                            const nextRows = [...(current[effectiveSelected.id] ?? Array(packedRowCount).fill(''))]
                                            nextRows[index] = ''
                                            return {
                                              ...current,
                                              [effectiveSelected.id]: nextRows,
                                            }
                                          })
                                        }}
                                        disabled={!canEditSelected || !unlocked}
                                        aria-label={`Equipped toggle slot ${index + 1}`}
                                      />
                                    ) : null}
                                    <input
                                      type="text"
                                      className="character-item-input"
                                      value={displayedPackedItems[index] ?? ''}
                                      onChange={(event) => {
                                        if (!effectiveSelected) return
                                        setPackedItemsByCharacterId((current) => {
                                          const nextRows = [...(current[effectiveSelected.id] ?? Array(packedRowCount).fill(''))]
                                          nextRows[index] = event.target.value
                                          return {
                                            ...current,
                                            [effectiveSelected.id]: nextRows,
                                          }
                                        })
                                      }}
                                      disabled={!canEditSelected || !unlocked}
                                      aria-label={`Packed strength slot ${index + 1}`}
                                    />
                                  </div>
                                )}
                                {label ? <span className="character-item-slot-label">{label}</span> : null}
                              </label>
                            )
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
                                {Array.from({ length: band.slotCount }, (_, rowOffset) => {
                                  const index = bandStartIndex + rowOffset
                                  return (
                                    <label key={`packed-slot-${index + 1}`} className="character-item-row">
                                      {packedAutoSlotByIndex.has(index) ? (
                                        <div className="character-item-row-inner">
                                          <input
                                            type="checkbox"
                                            className="character-item-slot-check"
                                            checked={false}
                                            onChange={(event) => packedAutoSlotByIndex.get(index)?.onToggle(event.target.checked)}
                                            disabled={!canEditSelected}
                                            aria-label={`Equipped toggle slot ${index + 1}`}
                                          />
                                          <span className="character-item-auto-slot">
                                            {packedAutoSlotByIndex.get(index)?.label}
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="character-item-row-inner">
                                          {(displayedPackedItems[index] ?? '').trim().length > 0 ? (
                                            <input
                                              type="checkbox"
                                              className="character-item-slot-check"
                                              checked={false}
                                              onChange={(event) => {
                                                if (!effectiveSelected || !event.target.checked) return
                                                const manualEquippedSlots = equippedRowCount - equippedAutoItems.length
                                                if (manualEquippedSlots <= 0) return
                                                const firstOpenManualIndex = Array.from(
                                                  { length: manualEquippedSlots },
                                                  (_, manualIndex) => manualIndex,
                                                ).find((manualIndex) => (selectedEquippedItems[manualIndex] ?? '').trim().length === 0)
                                                if (typeof firstOpenManualIndex !== 'number') return
                                                const value = displayedPackedItems[index] ?? ''
                                                setEquippedItemsByCharacterId((current) => {
                                                  const nextRows = [...(current[effectiveSelected.id] ?? [])]
                                                  nextRows[firstOpenManualIndex] = value
                                                  return {
                                                    ...current,
                                                    [effectiveSelected.id]: nextRows,
                                                  }
                                                })
                                                setPackedItemsByCharacterId((current) => {
                                                  const nextRows = [...(current[effectiveSelected.id] ?? Array(packedRowCount).fill(''))]
                                                  nextRows[index] = ''
                                                  return {
                                                    ...current,
                                                    [effectiveSelected.id]: nextRows,
                                                  }
                                                })
                                              }}
                                              disabled={!canEditSelected}
                                              aria-label={`Equipped toggle slot ${index + 1}`}
                                            />
                                          ) : null}
                                          <input
                                            type="text"
                                            className="character-item-input"
                                            value={displayedPackedItems[index] ?? ''}
                                            onChange={(event) => {
                                              if (!effectiveSelected) return
                                              setPackedItemsByCharacterId((current) => {
                                                const nextRows = [
                                                  ...(current[effectiveSelected.id] ?? Array(packedRowCount).fill('')),
                                                ]
                                                nextRows[index] = event.target.value
                                                return {
                                                  ...current,
                                                  [effectiveSelected.id]: nextRows,
                                                }
                                              })
                                            }}
                                            disabled={!canEditSelected}
                                            aria-label={`Packed item slot ${index + 1}`}
                                          />
                                        </div>
                                      )}
                                    </label>
                                  )
                                })}
                              </Fragment>
                            )
                          })}
                        </div>
                        {packedAutoItems.length > availablePackedSlotIndices.length ? (
                          <p className="error">Too many unequipped weapons/armour items for available packed slots.</p>
                        ) : null}
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
                          <input type="number" step={1} defaultValue="" disabled={!canEditSelected} />
                          <small>Experience points for next level</small>
                        </div>
                        <div className="character-enc-xp-side-row">
                          <span className="character-enc-xp-tag">%</span>
                          <input type="number" step={1} defaultValue="" disabled={!canEditSelected} />
                          <small>Prime requisite modifier to XP</small>
                        </div>
                      </div>
                    </section>
                  </section>
                ) : (
                  <section className="character-sheet character-asw-page">
                    <section className="monster-section-block character-weapons-block">
                      <div className="section-head">
                        <h3 className="monster-section-title">Weapons</h3>
                        <button
                          type="button"
                          className="icon-btn add-btn"
                          onClick={addWeaponRow}
                          disabled={!canEditSelected}
                          aria-label="Add weapon"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                      <div className="character-weapons-mobile-list">
                        {weaponRowCount === 0 ? <p className="character-enc-help">No weapons added yet.</p> : null}
                        {Array.from({ length: weaponRowCount }, (_, rowIndex) => {
                          const row = selectedWeapons[rowIndex] ?? { ...makeWeaponRow(), id: `weapon-${rowIndex}` }
                          const template = row.weaponId && row.weaponId !== 'custom' ? weaponCatalogById[row.weaponId] : null
                          const rowKey = effectiveSelected ? `${effectiveSelected.id}:${row.id}` : row.id
                          const isExpanded = !!expandedWeaponCards[rowKey]
                          return (
                            <article key={row.id} className="character-weapon-card">
                              <div className="character-weapon-card-head">
                                <strong>Weapon {rowIndex + 1}</strong>
                                <div className="character-weapon-card-actions">
                                  <label className="character-weapon-equipped-toggle">
                                    <input
                                      type="checkbox"
                                      checked={row.equipped}
                                      onChange={(event) => updateWeaponRow(rowIndex, { equipped: event.target.checked })}
                                      disabled={!canEditSelected}
                                    />
                                    Equipped
                                  </label>
                                  <button
                                    type="button"
                                    className="icon-btn"
                                    onClick={() => setExpandedWeaponCards((current) => ({ ...current, [rowKey]: !current[rowKey] }))}
                                    disabled={!canEditSelected}
                                    aria-label={`${isExpanded ? 'Collapse' : 'Edit'} weapon ${rowIndex + 1}`}
                                  >
                                    {isExpanded ? <Check size={13} /> : <Pencil size={13} />}
                                  </button>
                                  <button
                                    type="button"
                                    className="icon-btn add-btn"
                                    onClick={() => removeWeaponRow(rowIndex)}
                                    disabled={!canEditSelected}
                                    aria-label={`Remove weapon ${rowIndex + 1}`}
                                  >
                                    <Minus size={13} />
                                  </button>
                                </div>
                              </div>
                              <label className="character-weapon-primary-field">
                                Template
                                <select
                                  value={row.weaponId}
                                  onChange={(event) => updateWeaponRow(rowIndex, { weaponId: event.target.value })}
                                  disabled={!canEditSelected}
                                >
                                  <option value="">-</option>
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
                                  value={row.name}
                                  onChange={(event) => updateWeaponRow(rowIndex, { name: event.target.value })}
                                  disabled={!canEditSelected}
                                  placeholder="Optional"
                                />
                              </label>
                              {template && !isExpanded ? (
                                <div className="character-weapon-template-stats-wrap">
                                  <h4 className="character-weapon-template-stats-heading">Stats</h4>
                                  <p className="character-weapon-template-stats">
                                    {`Damage ${template.damage}${template.range ? ` • Range ${template.range}` : ''} • Cost ${template.costGp} gp${template.qualities.length > 0 ? ` • ${template.qualities.join(', ')}` : ''}`}
                                  </p>
                                </div>
                              ) : null}
                              {isExpanded ? (
                                <>
                                  <div className="character-weapon-mobile-grid">
                                    <label className="character-weapon-edit-field">
                                      Dmg
                                      <div className="character-weapon-damage-inputs">
                                        <input
                                          type="number"
                                          min={1}
                                          step={1}
                                          value={row.damageDiceCount}
                                          onChange={(event) => updateWeaponRow(rowIndex, { damageDiceCount: event.target.value })}
                                          disabled={!canEditSelected}
                                          aria-label={`Weapon ${rowIndex + 1} damage dice count`}
                                        />
                                        <span>d</span>
                                        <input
                                          type="number"
                                          min={1}
                                          step={1}
                                          value={row.damageDiceSides}
                                          onChange={(event) => updateWeaponRow(rowIndex, { damageDiceSides: event.target.value })}
                                          disabled={!canEditSelected}
                                          aria-label={`Weapon ${rowIndex + 1} damage dice sides`}
                                        />
                                      </div>
                                    </label>
                                    <label className="character-weapon-edit-field character-weapon-range-field">
                                      Range
                                      <div className="character-weapon-triplet-inputs">
                                        <input
                                          type="number"
                                          min={0}
                                          step={1}
                                          value={row.rangeShort}
                                          onChange={(event) => updateWeaponRow(rowIndex, { rangeShort: event.target.value })}
                                          disabled={!canEditSelected}
                                          aria-label={`Weapon ${rowIndex + 1} short range`}
                                        />
                                        <span>/</span>
                                        <input
                                          type="number"
                                          min={0}
                                          step={1}
                                          value={row.rangeMedium}
                                          onChange={(event) => updateWeaponRow(rowIndex, { rangeMedium: event.target.value })}
                                          disabled={!canEditSelected}
                                          aria-label={`Weapon ${rowIndex + 1} medium range`}
                                        />
                                        <span>/</span>
                                        <input
                                          type="number"
                                          min={0}
                                          step={1}
                                          value={row.rangeLong}
                                          onChange={(event) => updateWeaponRow(rowIndex, { rangeLong: event.target.value })}
                                          disabled={!canEditSelected}
                                          aria-label={`Weapon ${rowIndex + 1} long range`}
                                        />
                                      </div>
                                    </label>
                                    {template ? (
                                      <label className="character-weapon-edit-field">
                                        Cost
                                        <div className="character-inline-unit-field">
                                          <input
                                            type="text"
                                            value={template.costGp}
                                            readOnly
                                            disabled
                                          />
                                          <span>gp</span>
                                        </div>
                                      </label>
                                    ) : null}
                                  </div>
                                  <label className="character-weapon-card-check">
                                    <input
                                      type="checkbox"
                                      checked={row.twoHanded}
                                      onChange={(event) => updateWeaponRow(rowIndex, { twoHanded: event.target.checked })}
                                      disabled={!canEditSelected || (!!row.weaponId && row.weaponId !== 'custom') || selectedClassName === 'Halfling'}
                                    />
                                    Two-handed
                                  </label>
                                  <div className="character-weapon-magic-row">
                                    <label className="character-weapon-card-check">
                                      <input
                                        type="checkbox"
                                        checked={row.isMagic}
                                        onChange={(event) => updateWeaponRow(rowIndex, { isMagic: event.target.checked })}
                                        disabled={!canEditSelected}
                                      />
                                      Magic
                                    </label>
                                    {row.isMagic ? (
                                      <label className="character-weapon-magic-bonus character-weapon-edit-field">
                                        Bonus
                                        <input
                                          type="number"
                                          step={1}
                                          value={row.bonus}
                                          onChange={(event) => updateWeaponRow(rowIndex, { bonus: event.target.value })}
                                          disabled={!canEditSelected}
                                        />
                                      </label>
                                    ) : null}
                                  </div>
                                  <label className="character-weapon-edit-field">
                                    Notes
                                    <textarea
                                      value={row.notes}
                                      onChange={(event) => updateWeaponRow(rowIndex, { notes: event.target.value })}
                                      disabled={!canEditSelected}
                                    />
                                  </label>
                                </>
                              ) : null}
                            </article>
                          )
                        })}
                      </div>
                      {weaponRestrictionNote ? <p className="character-enc-help">{weaponRestrictionNote}</p> : null}
                    </section>

                    <section className="monster-section-block character-weapons-block">
                      <div className="section-head">
                        <h3 className="monster-section-title">Armour</h3>
                        <button
                          type="button"
                          className="icon-btn add-btn"
                          onClick={addArmourRow}
                          disabled={!canEditSelected || !canClassEquipArmour}
                          aria-label="Add armour"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                      <div className="character-weapons-mobile-list">
                        {armourRowCount === 0 ? <p className="character-enc-help">No armour added yet.</p> : null}
                        {Array.from({ length: armourRowCount }, (_, rowIndex) => {
                          const row = selectedArmour[rowIndex] ?? { ...makeArmourRow(), id: `armour-${rowIndex}` }
                          const template = row.armourId && row.armourId !== 'custom' ? armourCatalogById[row.armourId] : null
                          const rowKey = effectiveSelected ? `${effectiveSelected.id}:${row.id}` : row.id
                          const isExpanded = !!expandedArmourCards[rowKey]
                          return (
                            <article key={row.id} className="character-weapon-card">
                              <div className="character-weapon-card-head">
                                <strong>Armour {rowIndex + 1}</strong>
                                <div className="character-weapon-card-actions">
                                  <label className="character-weapon-equipped-toggle">
                                    <input
                                      type="checkbox"
                                      checked={row.equipped}
                                      onChange={(event) => updateArmourRow(rowIndex, { equipped: event.target.checked })}
                                      disabled={!canEditSelected || !canClassEquipArmour}
                                    />
                                    Equipped
                                  </label>
                                  <button
                                    type="button"
                                    className="icon-btn"
                                    onClick={() => setExpandedArmourCards((current) => ({ ...current, [rowKey]: !current[rowKey] }))}
                                    disabled={!canEditSelected}
                                    aria-label={`${isExpanded ? 'Collapse' : 'Edit'} armour ${rowIndex + 1}`}
                                  >
                                    {isExpanded ? <Check size={13} /> : <Pencil size={13} />}
                                  </button>
                                  <button
                                    type="button"
                                    className="icon-btn add-btn"
                                    onClick={() => removeArmourRow(rowIndex)}
                                    disabled={!canEditSelected}
                                    aria-label={`Remove armour ${rowIndex + 1}`}
                                  >
                                    <Minus size={13} />
                                  </button>
                                </div>
                              </div>
                              <label className="character-weapon-primary-field">
                                Template
                                <select
                                  value={row.armourId}
                                  onChange={(event) => updateArmourRow(rowIndex, { armourId: event.target.value })}
                                  disabled={!canEditSelected || !canClassEquipArmour}
                                >
                                  <option value="" disabled={!isArmourTemplateAllowedForClass('', selectedClassName)}>
                                    -
                                  </option>
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
                                  value={row.name}
                                  onChange={(event) => updateArmourRow(rowIndex, { name: event.target.value })}
                                  disabled={!canEditSelected}
                                  placeholder="Optional"
                                />
                              </label>
                              {template && !isExpanded ? (
                                <div className="character-weapon-template-stats-wrap">
                                  <h4 className="character-weapon-template-stats-heading">Stats</h4>
                                  <p className="character-weapon-template-stats">
                                    {`AC ${template.ac} • Cost ${template.costGp} gp`}
                                  </p>
                                </div>
                              ) : null}
                              {isExpanded ? (
                                <>
                                  <div className="character-weapon-mobile-grid">
                                    <label className="character-weapon-edit-field">
                                      AC
                                      <input
                                        type="number"
                                        step={1}
                                        value={row.ac}
                                        onChange={(event) => updateArmourRow(rowIndex, { ac: event.target.value })}
                                        disabled={!canEditSelected}
                                      />
                                    </label>
                                    {template ? (
                                      <label className="character-weapon-edit-field">
                                        Cost
                                        <div className="character-inline-unit-field">
                                          <input
                                            type="text"
                                            value={template.costGp}
                                            readOnly
                                            disabled
                                          />
                                          <span>gp</span>
                                        </div>
                                      </label>
                                    ) : null}
                                  </div>
                                  <div className="character-weapon-magic-row">
                                    <label className="character-weapon-card-check">
                                      <input
                                        type="checkbox"
                                        checked={row.isMagic}
                                        onChange={(event) => updateArmourRow(rowIndex, { isMagic: event.target.checked })}
                                        disabled={!canEditSelected}
                                      />
                                      Magic
                                    </label>
                                    {row.isMagic ? (
                                      <label className="character-weapon-magic-bonus character-weapon-edit-field">
                                        Bonus
                                        <input
                                          type="number"
                                          step={1}
                                          value={row.bonus}
                                          onChange={(event) => updateArmourRow(rowIndex, { bonus: event.target.value })}
                                          disabled={!canEditSelected}
                                        />
                                      </label>
                                    ) : null}
                                  </div>
                                  <label className="character-weapon-edit-field">
                                    Notes
                                    <textarea
                                      value={row.notes}
                                      onChange={(event) => updateArmourRow(rowIndex, { notes: event.target.value })}
                                      disabled={!canEditSelected}
                                    />
                                  </label>
                                </>
                              ) : null}
                            </article>
                          )
                        })}
                      </div>
                      {armourRestrictionNote ? <p className="character-enc-help">{armourRestrictionNote}</p> : null}
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
                    {!isGuidedCreation ? (
                      <button
                        type="button"
                        className={activePage === 'asw' ? 'character-sheet-tab active' : 'character-sheet-tab'}
                        onClick={() => setActivePage('asw')}
                      >
                        Weapons, Armour & Spells
                      </button>
                    ) : null}
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
                          {selectedStorePurchaseCountByName[item.name] ? (
                            <p className="store-item-count">Bought x{selectedStorePurchaseCountByName[item.name]}</p>
                          ) : null}
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
                  <button type="button" className="store-buy-btn" onClick={applyStorePurchases} disabled={!canEditSelected}>
                    Apply Purchases
                  </button>
                  <button type="button" className="store-buy-btn" onClick={clearCart} disabled={!canEditSelected || selectedStoreCart.length === 0}>
                    Clear Cart
                  </button>
                </div>
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
      <ConfirmModal
        open={finalizeConfirmOpen}
        title="Finalize character?"
        message="This character will leave guided creation mode and use the normal sheet."
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
          setDeleteConfirmTarget(null)
        }}
        onCancel={() => setDeleteConfirmTarget(null)}
      />
    </div>
  )
}
