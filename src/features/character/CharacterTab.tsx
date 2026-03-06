import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Plus, Trash2, UserRound } from 'lucide-react'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import type { CharacterRecord, Role } from '../../types/app'
import { EntityMediaEditor } from '../common/EntityMediaEditor'
import { ConfirmModal } from '../common/ConfirmModal'

type CharacterTabProps = {
  campaignId: string
  role: Role | null
  characters: CharacterRecord[]
  charactersLoading: boolean
  selectedCharacterId: string
  setSelectedCharacterId: (id: string) => void
  selectedCharacter: CharacterRecord | null
  updateCharacter: (characterId: string, updates: Partial<CharacterRecord>) => void
  deleteCharacter: (characterId: string) => void
}

type WeaponRow = {
  id: string
  name: string
  damage: string
  bonus: string
  range: string
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

export function CharacterTab({
  campaignId,
  role,
  characters,
  charactersLoading,
  selectedCharacterId,
  setSelectedCharacterId,
  selectedCharacter,
  updateCharacter,
  deleteCharacter,
}: CharacterTabProps) {
  const [isMobile, setIsMobile] = useState<boolean>(() => window.innerWidth <= 900)
  const [mobileCharacterView, setMobileCharacterView] = useState<'list' | 'detail'>('list')
  const [activePage, setActivePage] = useState<'core' | 'encumbrance' | 'asw'>('core')
  const [abilityScoresByCharacterId, setAbilityScoresByCharacterId] = useState<Record<string, AbilityScores>>({})
  const [rolledAbilityScoresByCharacterId, setRolledAbilityScoresByCharacterId] = useState<Record<string, AbilityScores>>({})
  const [abilityScoresRolledByCharacterId, setAbilityScoresRolledByCharacterId] = useState<Record<string, boolean>>({})
  const [hpBaseRollByCharacterId, setHpBaseRollByCharacterId] = useState<Record<string, number>>({})
  const [packedItemsByCharacterId, setPackedItemsByCharacterId] = useState<Record<string, string[]>>({})
  const [weaponsByCharacterId, setWeaponsByCharacterId] = useState<Record<string, WeaponRow[]>>({})
  const [thacoByCharacterId, setThacoByCharacterId] = useState<Record<string, string>>({})
  const [saveScoresByCharacterId, setSaveScoresByCharacterId] = useState<Record<string, SaveScores>>({})
  const [adventureScoresByCharacterId, setAdventureScoresByCharacterId] = useState<Record<string, AdventureScores>>({})
  const [adventureSeedClassByCharacterId, setAdventureSeedClassByCharacterId] = useState<Record<string, string>>({})
  const [thiefSkillsByCharacterId, setThiefSkillsByCharacterId] = useState<Record<string, ThiefSkillScores>>({})
  const [acManualOverrideByCharacterId, setAcManualOverrideByCharacterId] = useState<Record<string, boolean>>({})
  const [rerollHpConfirmOpen, setRerollHpConfirmOpen] = useState(false)

  const sortedCharacters = useMemo(
    () => [...characters].sort((a, b) => a.name.localeCompare(b.name)),
    [characters],
  )

  const effectiveSelected =
    selectedCharacter ?? sortedCharacters.find((character) => character.id === selectedCharacterId) ?? null

  useEffect(() => {
    const updateMobileState = () => {
      const mobile = window.innerWidth <= 900
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
  const canCreateCharacter = role === 'gm'
  const canDeleteCharacter = role === 'gm'
  const canEditSelected = !!effectiveSelected

  const updateSelectedCharacter = (updates: Partial<CharacterRecord>) => {
    if (!effectiveSelected) return
    updateCharacter(effectiveSelected.id, updates)
  }

  const selectedAbilityScores = effectiveSelected
    ? (abilityScoresByCharacterId[effectiveSelected.id] ?? effectiveSelected.abilityScores ?? emptyAbilityScores())
    : emptyAbilityScores()
  const selectedRolledAbilityScores = effectiveSelected
    ? rolledAbilityScoresByCharacterId[effectiveSelected.id] ?? effectiveSelected.rolledAbilityScores ?? null
    : null
  const hasRolledAbilityScores = !!(
    effectiveSelected && (abilityScoresRolledByCharacterId[effectiveSelected.id] ?? effectiveSelected.abilityScoresRolled)
  )
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
  const selectedPackedItems = effectiveSelected
    ? (packedItemsByCharacterId[effectiveSelected.id] ?? effectiveSelected.packedItems ?? [])
    : []
  const selectedEquippedItems = effectiveSelected ? (effectiveSelected.equippedItems ?? []) : []
  const selectedWeapons = effectiveSelected
    ? (weaponsByCharacterId[effectiveSelected.id] ?? (effectiveSelected.weapons as WeaponRow[] | undefined) ?? [])
    : []
  const selectedThacoRaw = effectiveSelected ? (thacoByCharacterId[effectiveSelected.id] ?? effectiveSelected.thaco ?? '') : ''
  const selectedThaco = Number.parseInt(selectedThacoRaw, 10)
  const selectedSaveScores = effectiveSelected
    ? (saveScoresByCharacterId[effectiveSelected.id] ?? effectiveSelected.saveScores ?? { D: '', W: '', P: '', B: '', S: '' })
    : { D: '', W: '', P: '', B: '', S: '' }
  const selectedAdventureScores = effectiveSelected
    ? (adventureScoresByCharacterId[effectiveSelected.id] ?? effectiveSelected.adventureScores ?? adventureDefaultsByClass(effectiveSelected.className))
    : adventureDefaultsByClass('-')
  const selectedThiefSkills = effectiveSelected
    ? (thiefSkillsByCharacterId[effectiveSelected.id] ?? effectiveSelected.thiefSkills ?? defaultThiefSkills())
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
  const filledPackedItemCount = selectedPackedItems
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

  const addCharacter = () => {
    if (!canCreateCharacter) return
    const nextCharacter: CharacterRecord = {
      id: crypto.randomUUID(),
      name: 'New Character',
      title: '',
      ownerUserId: '',
      className: '-',
      alignment: 'Neutrality',
      level: 1,
      hpCurrent: 0,
      hpMax: 0,
      hpBaseRoll: 0,
      ac: 10,
      acManualOverride: false,
      xp: 0,
      xpNext: '',
      xpPrimeModifier: '',
      thaco: '',
      abilityScores: emptyAbilityScores(),
      rolledAbilityScores: emptyAbilityScores(),
      abilityScoresRolled: false,
      saveScores: { D: '', W: '', P: '', B: '', S: '' },
      adventureScores: adventureDefaultsByClass('-'),
      adventureSeedClass: '-',
      thiefSkills: defaultThiefSkills(),
      aswNotes: '',
      languages: '',
      unencumberingItems: '',
      equippedItems: [],
      packedItems: [],
      otherNotes: '',
      weapons: [],
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
      class: nextCharacter.className,
      title: nextCharacter.title,
      alignment: nextCharacter.alignment,
      level: nextCharacter.level,
      hpCurrent: nextCharacter.hpCurrent,
      hpMax: nextCharacter.hpMax,
      hpBaseRoll: nextCharacter.hpBaseRoll,
      ac: nextCharacter.ac,
      acManualOverride: nextCharacter.acManualOverride,
      xp: nextCharacter.xp,
      xpNext: nextCharacter.xpNext,
      xpPrimeModifier: nextCharacter.xpPrimeModifier,
      thaco: nextCharacter.thaco,
      abilityScores: nextCharacter.abilityScores,
      rolledAbilityScores: nextCharacter.rolledAbilityScores,
      abilityScoresRolled: nextCharacter.abilityScoresRolled,
      saveScores: nextCharacter.saveScores,
      adventureScores: nextCharacter.adventureScores,
      adventureSeedClass: nextCharacter.adventureSeedClass,
      thiefSkills: nextCharacter.thiefSkills,
      aswNotes: nextCharacter.aswNotes,
      languages: nextCharacter.languages,
      unencumberingItems: nextCharacter.unencumberingItems,
      equippedItems: nextCharacter.equippedItems,
      packedItems: nextCharacter.packedItems,
      otherNotes: nextCharacter.otherNotes,
      weapons: nextCharacter.weapons,
      portraitUrl: nextCharacter.portraitUrl,
      portraitFocusX: nextCharacter.portraitFocusX,
      portraitFocusY: nextCharacter.portraitFocusY,
      tokenIcon: nextCharacter.tokenIcon,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  const updateAbilityScore = (code: AbilityCode, value: string) => {
    if (!effectiveSelected) return
    if (!hasRolledAbilityScores || !selectedRolledAbilityScores) return
    const nextValue = Number.parseInt(value, 10)
    if (!Number.isFinite(nextValue)) return

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
      if (Number.isNaN(base) || Number.isNaN(current)) return

      const isPrime = primeRequisiteCodes.includes(abilityCode)
      const canLowerForPoints = loweringCodes.includes(abilityCode)

      if (canLowerForPoints) {
        if (current > base) return
        if (current < 9) return
      } else if (!isPrime) {
        if (current !== base) return
      }

      if (isPrime && current < base) return
      if (current < 3 || current > 18) return
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
    if (spent > gained) return

    setAbilityScoresByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: {
        STR: String(nextScores.STR),
        INT: String(nextScores.INT),
        WIS: String(nextScores.WIS),
        DEX: String(nextScores.DEX),
        CON: String(nextScores.CON),
        CHA: String(nextScores.CHA),
      },
    }))
  }

  const rollAbilityScores = () => {
    if (!effectiveSelected || !canEditSelected) return
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
  const canRollHitPoints = !!(canEditSelected && classHitDie)
  const selectedBaseHpRoll = effectiveSelected
    ? (hpBaseRollByCharacterId[effectiveSelected.id] ?? effectiveSelected.hpBaseRoll)
    : undefined
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
    setRerollHpConfirmOpen(false)
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
    if (!canRollHitPoints) return
    if (!hasRolledHp || canFreeRerollHp) {
      rollHitPoints()
      return
    }
    setRerollHpConfirmOpen(true)
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
    if (acManualOverrideByCharacterId[effectiveSelected.id] ?? effectiveSelected.acManualOverride) return
    const autoAc = 9 - derivedDexAcModifierNumber
    if (effectiveSelected.ac === autoAc) return
    updateSelectedCharacter({ ac: autoAc })
  }, [effectiveSelected, derivedDexAcModifierNumber, acManualOverrideByCharacterId])

  useEffect(() => {
    if (!effectiveSelected) return
    const local = abilityScoresByCharacterId[effectiveSelected.id]
    if (!local) return
    if (JSON.stringify(local) === JSON.stringify(effectiveSelected.abilityScores ?? emptyAbilityScores())) return
    updateSelectedCharacter({ abilityScores: local })
  }, [effectiveSelected, abilityScoresByCharacterId])

  useEffect(() => {
    if (!effectiveSelected) return
    const local = rolledAbilityScoresByCharacterId[effectiveSelected.id]
    if (!local) return
    if (JSON.stringify(local) === JSON.stringify(effectiveSelected.rolledAbilityScores ?? emptyAbilityScores())) return
    updateSelectedCharacter({ rolledAbilityScores: local })
  }, [effectiveSelected, rolledAbilityScoresByCharacterId])

  useEffect(() => {
    if (!effectiveSelected) return
    const local = abilityScoresRolledByCharacterId[effectiveSelected.id]
    if (typeof local !== 'boolean') return
    if (local === !!effectiveSelected.abilityScoresRolled) return
    updateSelectedCharacter({ abilityScoresRolled: local })
  }, [effectiveSelected, abilityScoresRolledByCharacterId])

  useEffect(() => {
    if (!effectiveSelected) return
    const local = hpBaseRollByCharacterId[effectiveSelected.id]
    if (typeof local !== 'number') return
    if (local === (effectiveSelected.hpBaseRoll ?? 0)) return
    updateSelectedCharacter({ hpBaseRoll: local })
  }, [effectiveSelected, hpBaseRollByCharacterId])

  useEffect(() => {
    if (!effectiveSelected) return
    const local = thacoByCharacterId[effectiveSelected.id]
    if (typeof local !== 'string') return
    if (local === (effectiveSelected.thaco ?? '')) return
    updateSelectedCharacter({ thaco: local })
  }, [effectiveSelected, thacoByCharacterId])

  useEffect(() => {
    if (!effectiveSelected) return
    const local = saveScoresByCharacterId[effectiveSelected.id]
    if (!local) return
    if (JSON.stringify(local) === JSON.stringify(effectiveSelected.saveScores ?? { D: '', W: '', P: '', B: '', S: '' })) return
    updateSelectedCharacter({ saveScores: local })
  }, [effectiveSelected, saveScoresByCharacterId])

  useEffect(() => {
    if (!effectiveSelected) return
    const local = adventureScoresByCharacterId[effectiveSelected.id]
    if (!local) return
    if (JSON.stringify(local) === JSON.stringify(effectiveSelected.adventureScores ?? adventureDefaultsByClass(effectiveSelected.className))) return
    updateSelectedCharacter({ adventureScores: local })
  }, [effectiveSelected, adventureScoresByCharacterId])

  useEffect(() => {
    if (!effectiveSelected) return
    const local = adventureSeedClassByCharacterId[effectiveSelected.id]
    if (typeof local !== 'string') return
    if (local === (effectiveSelected.adventureSeedClass ?? '')) return
    updateSelectedCharacter({ adventureSeedClass: local })
  }, [effectiveSelected, adventureSeedClassByCharacterId])

  useEffect(() => {
    if (!effectiveSelected) return
    const local = thiefSkillsByCharacterId[effectiveSelected.id]
    if (!local) return
    if (JSON.stringify(local) === JSON.stringify(effectiveSelected.thiefSkills ?? defaultThiefSkills())) return
    updateSelectedCharacter({ thiefSkills: local })
  }, [effectiveSelected, thiefSkillsByCharacterId])

  useEffect(() => {
    if (!effectiveSelected) return
    const local = packedItemsByCharacterId[effectiveSelected.id]
    if (!local) return
    if (JSON.stringify(local) === JSON.stringify(effectiveSelected.packedItems ?? [])) return
    updateSelectedCharacter({ packedItems: local })
  }, [effectiveSelected, packedItemsByCharacterId])

  useEffect(() => {
    if (!effectiveSelected) return
    const local = weaponsByCharacterId[effectiveSelected.id]
    if (!local) return
    if (JSON.stringify(local) === JSON.stringify(effectiveSelected.weapons ?? [])) return
    updateSelectedCharacter({ weapons: local })
  }, [effectiveSelected, weaponsByCharacterId])

  useEffect(() => {
    if (!effectiveSelected) return
    const local = acManualOverrideByCharacterId[effectiveSelected.id]
    if (typeof local !== 'boolean') return
    if (local === !!effectiveSelected.acManualOverride) return
    updateSelectedCharacter({ acManualOverride: local })
  }, [effectiveSelected, acManualOverrideByCharacterId])

  return (
    <div className="maps-layout monsters-layout characters-layout">
      {showListPane ? (
        <aside className="maps-sidebar monsters-sidebar characters-sidebar">
          <div className="maps-sidebar-header">
            <h2>{role === 'gm' ? 'Characters' : 'Character'}</h2>
            {canCreateCharacter ? (
              <button type="button" className="monster-add-btn" onClick={addCharacter} aria-label="Add character">
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
                  className={character.id === effectiveSelected?.id ? 'monster-list-item active' : 'monster-list-item'}
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
                    <h4>{character.name || 'Unnamed Character'}</h4>
                    <p className="monster-card-statline">
                      {character.className} • Level {character.level} • HP {character.hpCurrent}/{character.hpMax}
                    </p>
                    <p>AC {character.ac} • XP {character.xp.toLocaleString()}</p>
                  </div>
                </button>
                {canDeleteCharacter ? (
                  <button
                    type="button"
                    className="map-delete-btn character-card-delete-btn"
                    onClick={() => deleteCharacter(character.id)}
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
            <div className="monster-detail-header-row">
              {isMobile && effectiveSelected ? (
                <button
                  type="button"
                  className="back-link monster-mobile-back"
                  onClick={() => setMobileCharacterView('list')}
                  aria-label="Back to character list"
                >
                  <ChevronLeft size={16} />
                </button>
              ) : <span />}
            </div>

            {!effectiveSelected ? (
              <p>Select a character from the list.</p>
            ) : (
              <div className="monster-editor-grid character-editor-grid">
                {!isMobile ? (
                  <div className="character-sheet-page-tabs top">
                    <button
                      type="button"
                      className={activePage === 'core' ? 'character-sheet-tab active' : 'character-sheet-tab'}
                      onClick={() => setActivePage('core')}
                    >
                      Core Sheet
                    </button>
                    <button
                      type="button"
                      className={activePage === 'asw' ? 'character-sheet-tab active' : 'character-sheet-tab'}
                      onClick={() => setActivePage('asw')}
                    >
                      Abilities, Skills & Weapons
                    </button>
                    <button
                      type="button"
                      className={activePage === 'encumbrance' ? 'character-sheet-tab active' : 'character-sheet-tab'}
                      onClick={() => setActivePage('encumbrance')}
                    >
                      Item Encumbrance
                    </button>
                  </div>
                ) : null}

                {activePage === 'core' ? (
                <section className="character-sheet">
                  <div className="character-sheet-header-grid">
                    <label>
                      Name
                      <input
                        type="text"
                        value={effectiveSelected.name}
                        onChange={(event) => updateSelectedCharacter({ name: event.target.value })}
                        disabled={!canEditSelected}
                      />
                    </label>
                    <label>
                      Title
                      <input
                        type="text"
                        value={effectiveSelected.title ?? ''}
                        onChange={(event) => updateSelectedCharacter({ title: event.target.value })}
                        disabled={!canEditSelected}
                      />
                    </label>
                    <label>
                      Level
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
                    <label>
                      Class
                      <select
                        value={effectiveSelected.className}
                        onChange={(event) => {
                          const nextClass = event.target.value
                          updateSelectedCharacter({ className: nextClass })
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
                    <label>
                      Align
                      <select
                        value={effectiveSelected.alignment ?? 'Neutrality'}
                        onChange={(event) => updateSelectedCharacter({ alignment: event.target.value })}
                        disabled={!canEditSelected}
                      >
                        {alignmentOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="character-sheet-main-grid">
                    <div className="character-sheet-left">
                      <div className="character-sheet-two-col">
                        <section className="monster-section-block">
                          <div className="section-head">
                            <h3 className="monster-section-title">Ability Scores</h3>
                            <button type="button" className="monster-example-btn" onClick={rollAbilityScores} disabled={!canEditSelected}>
                              Roll
                            </button>
                            {hasRolledAbilityScores ? (
                              <span className="character-roll-points">Points: {availableAbilityTradePoints}</span>
                            ) : null}
                          </div>
                          <div className="character-sheet-rows">
                            {abilityRows.map((row) => (
                              <div key={row.code} className="character-sheet-row">
                                <span className="character-sheet-code">{row.code}</span>
                                <input
                                  type="number"
                                  step={1}
                                  min={1}
                                  max={18}
                                  value={selectedAbilityScores[row.code as AbilityCode]}
                                  onChange={(event) => updateAbilityScore(row.code as AbilityCode, event.target.value)}
                                  disabled={!canEditSelected || !hasRolledAbilityScores}
                                />
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

                      <section className="monster-section-block">
                        <div className="section-head">
                          <h3 className="monster-section-title">Combat</h3>
                          <button
                            type="button"
                            className="monster-example-btn"
                            onClick={requestRollHitPoints}
                            disabled={!canRollHitPoints}
                          >
                            {hasRolledHp ? 'Re-roll HP' : 'Roll HP'}
                          </button>
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
                                disabled={!canEditSelected}
                              />
                              <small>Hit points</small>
                            </div>
                            <div className="character-combat-side-row">
                              <span className="character-combat-tag">Max</span>
                              <input
                                type="number"
                                value={String(effectiveSelected.hpMax)}
                                onChange={(event) => updateSelectedCharacter({ hpMax: Number(event.target.value || 0) })}
                                disabled={!canEditSelected}
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

                    </div>

                    <div className="character-sheet-right">
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

                      {effectiveSelected.className === 'Thief' ? (
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
                      ) : null}

                      <section className="monster-section-block">
                        <h3 className="monster-section-title">Languages</h3>
                        <textarea
                          className="character-sheet-textarea short"
                          value={effectiveSelected.languages ?? ''}
                          onChange={(event) => updateSelectedCharacter({ languages: event.target.value })}
                          disabled={!canEditSelected}
                        />
                      </section>
                    </div>
                  </div>
                </section>
                ) : activePage === 'encumbrance' ? (
                  <section className="character-sheet character-enc-page">
                    <p className="character-enc-note">
                      Item-based encumbrance: Optional rule. See Carcass Crawler issue #2 from Necrotic Gnome.
                    </p>

                    <div className="character-enc-items-grid">
                      <section className="monster-section-block">
                        <h3 className="monster-section-title">Unencumbering Items</h3>
                        <textarea
                          className="character-sheet-textarea short"
                          value={effectiveSelected.unencumberingItems ?? ''}
                          onChange={(event) => updateSelectedCharacter({ unencumberingItems: event.target.value })}
                          disabled={!canEditSelected}
                        />
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
                              <input
                                type="text"
                                value={selectedEquippedItems[index] ?? ''}
                                onChange={(event) => {
                                  const nextRows = [...selectedEquippedItems]
                                  while (nextRows.length < equippedRowCount) nextRows.push('')
                                  nextRows[index] = event.target.value
                                  updateSelectedCharacter({ equippedItems: nextRows })
                                }}
                                disabled={!canEditSelected}
                                aria-label={`Equipped item slot ${index + 1}`}
                              />
                            </label>
                          ))}
                        </div>
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
                                <input
                                  type="text"
                                  value={selectedPackedItems[index] ?? ''}
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
                                      <input
                                        type="text"
                                        value={selectedPackedItems[index] ?? ''}
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
                                    </label>
                                  )
                                })}
                              </Fragment>
                            )
                          })}
                        </div>
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
                      <textarea
                        className="character-sheet-textarea"
                        value={effectiveSelected.otherNotes ?? ''}
                        onChange={(event) => updateSelectedCharacter({ otherNotes: event.target.value })}
                        disabled={!canEditSelected}
                      />
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
                            type="number"
                            step={1}
                            value={effectiveSelected.xpNext ?? ''}
                            onChange={(event) => updateSelectedCharacter({ xpNext: event.target.value })}
                            disabled={!canEditSelected}
                          />
                          <small>Experience points for next level</small>
                        </div>
                        <div className="character-enc-xp-side-row">
                          <span className="character-enc-xp-tag">%</span>
                          <input
                            type="number"
                            step={1}
                            value={effectiveSelected.xpPrimeModifier ?? ''}
                            onChange={(event) => updateSelectedCharacter({ xpPrimeModifier: event.target.value })}
                            disabled={!canEditSelected}
                          />
                          <small>Prime requisite modifier to XP</small>
                        </div>
                      </div>
                    </section>
                  </section>
                ) : (
                  <section className="character-sheet character-asw-page">
                    <section className="monster-section-block">
                      <div className="character-asw-head-row">
                        <h3 className="monster-section-title">Abilities, Skills, Weapons</h3>
                        <p>Including weapon proficiencies and secondary skills, if used.</p>
                      </div>
                      <textarea
                        className="character-sheet-textarea short"
                        value={effectiveSelected.aswNotes ?? ''}
                        onChange={(event) => updateSelectedCharacter({ aswNotes: event.target.value })}
                        disabled={!canEditSelected}
                      />
                    </section>

                    <section className="monster-section-block character-weapons-block">
                      <h3 className="monster-section-title">Weapons</h3>
                      <div className="character-weapons-table-wrap">
                        <table className="character-weapons-table">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Damage</th>
                              <th>Bonus</th>
                              <th>Range</th>
                              <th>Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from({ length: 6 }, (_, rowIndex) => {
                              const row = selectedWeapons[rowIndex] ?? {
                                id: crypto.randomUUID(),
                                name: '',
                                damage: '',
                                bonus: '',
                                range: '',
                                notes: '',
                              }
                              return (
                                <tr key={row.id}>
                                  <td>
                                    <input
                                      type="text"
                                      value={row.name}
                                      onChange={(event) => {
                                        if (!effectiveSelected) return
                                        setWeaponsByCharacterId((current) => {
                                          const nextRows = [...(current[effectiveSelected.id] ?? Array.from(
                                            { length: 6 },
                                            () => ({
                                              id: crypto.randomUUID(),
                                              name: '',
                                              damage: '',
                                              bonus: '',
                                              range: '',
                                              notes: '',
                                            }),
                                          ))]
                                          nextRows[rowIndex] = { ...row, name: event.target.value }
                                          return {
                                            ...current,
                                            [effectiveSelected.id]: nextRows,
                                          }
                                        })
                                      }}
                                      disabled={!canEditSelected}
                                      aria-label={`Weapon ${rowIndex + 1} name`}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      type="text"
                                      value={row.damage}
                                      onChange={(event) => {
                                        if (!effectiveSelected) return
                                        setWeaponsByCharacterId((current) => {
                                          const nextRows = [...(current[effectiveSelected.id] ?? Array.from(
                                            { length: 6 },
                                            () => ({
                                              id: crypto.randomUUID(),
                                              name: '',
                                              damage: '',
                                              bonus: '',
                                              range: '',
                                              notes: '',
                                            }),
                                          ))]
                                          nextRows[rowIndex] = { ...row, damage: event.target.value }
                                          return {
                                            ...current,
                                            [effectiveSelected.id]: nextRows,
                                          }
                                        })
                                      }}
                                      disabled={!canEditSelected}
                                      aria-label={`Weapon ${rowIndex + 1} damage`}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      type="number"
                                      step={1}
                                      value={row.bonus}
                                      onChange={(event) => {
                                        if (!effectiveSelected) return
                                        setWeaponsByCharacterId((current) => {
                                          const nextRows = [...(current[effectiveSelected.id] ?? Array.from(
                                            { length: 6 },
                                            () => ({
                                              id: crypto.randomUUID(),
                                              name: '',
                                              damage: '',
                                              bonus: '',
                                              range: '',
                                              notes: '',
                                            }),
                                          ))]
                                          nextRows[rowIndex] = { ...row, bonus: event.target.value }
                                          return {
                                            ...current,
                                            [effectiveSelected.id]: nextRows,
                                          }
                                        })
                                      }}
                                      disabled={!canEditSelected}
                                      aria-label={`Weapon ${rowIndex + 1} bonus`}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      type="text"
                                      value={row.range}
                                      onChange={(event) => {
                                        if (!effectiveSelected) return
                                        setWeaponsByCharacterId((current) => {
                                          const nextRows = [...(current[effectiveSelected.id] ?? Array.from(
                                            { length: 6 },
                                            () => ({
                                              id: crypto.randomUUID(),
                                              name: '',
                                              damage: '',
                                              bonus: '',
                                              range: '',
                                              notes: '',
                                            }),
                                          ))]
                                          nextRows[rowIndex] = { ...row, range: event.target.value }
                                          return {
                                            ...current,
                                            [effectiveSelected.id]: nextRows,
                                          }
                                        })
                                      }}
                                      disabled={!canEditSelected}
                                      aria-label={`Weapon ${rowIndex + 1} range`}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      type="text"
                                      value={row.notes}
                                      onChange={(event) => {
                                        if (!effectiveSelected) return
                                        setWeaponsByCharacterId((current) => {
                                          const nextRows = [...(current[effectiveSelected.id] ?? Array.from(
                                            { length: 6 },
                                            () => ({
                                              id: crypto.randomUUID(),
                                              name: '',
                                              damage: '',
                                              bonus: '',
                                              range: '',
                                              notes: '',
                                            }),
                                          ))]
                                          nextRows[rowIndex] = { ...row, notes: event.target.value }
                                          return {
                                            ...current,
                                            [effectiveSelected.id]: nextRows,
                                          }
                                        })
                                      }}
                                      disabled={!canEditSelected}
                                      aria-label={`Weapon ${rowIndex + 1} notes`}
                                    />
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
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
                      className={activePage === 'asw' ? 'character-sheet-tab active' : 'character-sheet-tab'}
                      onClick={() => setActivePage('asw')}
                    >
                      ASW
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
      <ConfirmModal
        open={rerollHpConfirmOpen}
        title="Re-roll hit points?"
        message="Are you sure you want to reroll HP? Re-roll without confirmation is only allowed when the previous base HP roll was 1 or 2 (before CON modifier)."
        confirmLabel="Re-roll"
        onConfirm={rollHitPoints}
        onCancel={() => setRerollHpConfirmOpen(false)}
      />
    </div>
  )
}
