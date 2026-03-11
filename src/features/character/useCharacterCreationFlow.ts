// Owns class-derived default effects and creation flow handlers.
// Moved verbatim from CharacterTab — preserve effect ordering exactly.

import { useEffect } from 'react'
import type { Dispatch, SetStateAction, MutableRefObject } from 'react'
import type {
  CharacterRecord,
  CharacterInventoryItem,
  CharacterWeaponItem,
} from '../../types/app'
import type { AbilityScores, SaveScores, AdventureScores, ThiefSkillScores } from './characterRules'
import {
  classLevel1Saves,
  classHitDieByClass,
  adventureDefaultsByClass,
  defaultThiefSkills,
  buildGuidedAbilityScores,
  loweringCandidateCodes,
} from './characterRules'

type Params = {
  effectiveSelected: CharacterRecord | null
  selectedCharacterId: string
  selectedClassName: string
  selectedAbilityScores: AbilityScores
  selectedRolledAbilityScores: AbilityScores | null
  primeRequisiteCodes: readonly string[]
  hasRolledAbilityScores: boolean
  canEditSelected: boolean
  isGuidedCreation: boolean
  isInFinalizationFlow: boolean
  computedAc: number
  derivedConModifierNumber: number
  selectedWeapons: CharacterWeaponItem[]
  selectedArmour: CharacterInventoryItem[]
  canClassEquipArmour: boolean
  seededCharacterIdsRef: MutableRefObject<Set<string>>
  justSeededRef: MutableRefObject<Set<string>>

  // State maps
  hpBaseRollByCharacterId: Record<string, number>
  saveScoresByCharacterId: Record<string, SaveScores>
  thacoByCharacterId: Record<string, string>
  adventureScoresByCharacterId: Record<string, AdventureScores>
  adventureSeedClassByCharacterId: Record<string, string>
  thiefSkillsByCharacterId: Record<string, ThiefSkillScores>
  acManualOverrideByCharacterId: Record<string, boolean>

  // Setters
  setAbilityScoresByCharacterId: Dispatch<SetStateAction<Record<string, AbilityScores>>>
  setRolledAbilityScoresByCharacterId: Dispatch<SetStateAction<Record<string, AbilityScores>>>
  setAbilityScoresRolledByCharacterId: Dispatch<SetStateAction<Record<string, boolean>>>
  setHpBaseRollByCharacterId: Dispatch<SetStateAction<Record<string, number>>>
  setSaveScoresByCharacterId: Dispatch<SetStateAction<Record<string, SaveScores>>>
  setThacoByCharacterId: Dispatch<SetStateAction<Record<string, string>>>
  setAdventureScoresByCharacterId: Dispatch<SetStateAction<Record<string, AdventureScores>>>
  setAdventureSeedClassByCharacterId: Dispatch<SetStateAction<Record<string, string>>>
  setThiefSkillsByCharacterId: Dispatch<SetStateAction<Record<string, ThiefSkillScores>>>
  setInventoryByCharacterId: Dispatch<SetStateAction<Record<string, CharacterInventoryItem[]>>>
  updateSelectedCharacter: (updates: Partial<CharacterRecord>) => void
}

export function useCharacterCreationFlow({
  effectiveSelected,
  selectedClassName,
  selectedAbilityScores,
  selectedRolledAbilityScores,
  primeRequisiteCodes,
  hasRolledAbilityScores,
  canEditSelected,
  isGuidedCreation,
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
}: Params) {
  const loweringCodes = loweringCandidateCodes.filter((code) => !primeRequisiteCodes.includes(code))

  // ---------------------------------------------------------------------------
  // Ability score helpers
  // ---------------------------------------------------------------------------

  const tryBuildGuidedScores = (code: string, nextValue: number): AbilityScores | null => {
    if (!selectedRolledAbilityScores) return null
    return buildGuidedAbilityScores(
      code as any, nextValue, selectedAbilityScores, selectedRolledAbilityScores,
      primeRequisiteCodes as any, loweringCodes,
    )
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

  // ---------------------------------------------------------------------------
  // HP helpers
  // ---------------------------------------------------------------------------

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

  const requestRollHitPoints = (setHpClassRequiredOpen: (open: boolean) => void) => {
    if (!canEditSelected) return
    if (!isGuidedCreation) return
    if (!classHitDie) {
      setHpClassRequiredOpen(true)
      return
    }
    if (hasRolledHp && !canFreeRerollHp) return
    rollHitPoints()
  }

  // ---------------------------------------------------------------------------
  // Class-derived default effects (preserve exact ordering)
  // ---------------------------------------------------------------------------

  // HP recalculation when CON or base roll changes
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

  // Auto-seed save scores when class is set
  useEffect(() => {
    if (!effectiveSelected) return
    if (!seededCharacterIdsRef.current.has(effectiveSelected.id)) return
    if (justSeededRef.current.has(effectiveSelected.id)) return
    if (saveScoresByCharacterId[effectiveSelected.id]) return
    const saveProfile = classLevel1Saves[effectiveSelected.className]
    if (!saveProfile) return
    setSaveScoresByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: saveProfile,
    }))
  }, [effectiveSelected, saveScoresByCharacterId])

  // Auto-seed THAC0 for levels 1-3
  useEffect(() => {
    if (!effectiveSelected) return
    if (!seededCharacterIdsRef.current.has(effectiveSelected.id)) return
    if (justSeededRef.current.has(effectiveSelected.id)) return
    if (effectiveSelected.level < 1 || effectiveSelected.level > 3) return
    if ((thacoByCharacterId[effectiveSelected.id] ?? '').trim().length > 0) return
    setThacoByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: '19',
    }))
  }, [effectiveSelected, thacoByCharacterId])

  // Auto-seed adventure scores by class
  useEffect(() => {
    if (!effectiveSelected) return
    if (!seededCharacterIdsRef.current.has(effectiveSelected.id)) return
    if (justSeededRef.current.has(effectiveSelected.id)) return
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

  // Auto-seed thief skills
  useEffect(() => {
    if (!effectiveSelected) return
    if (!seededCharacterIdsRef.current.has(effectiveSelected.id)) return
    if (justSeededRef.current.has(effectiveSelected.id)) return
    if (effectiveSelected.className !== 'Thief') return
    if (thiefSkillsByCharacterId[effectiveSelected.id]) return
    setThiefSkillsByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: defaultThiefSkills(),
    }))
  }, [effectiveSelected, thiefSkillsByCharacterId])

  // Auto-compute AC from equipped armour
  useEffect(() => {
    if (!effectiveSelected) return
    if (acManualOverrideByCharacterId[effectiveSelected.id]) return
    const autoAc = computedAc
    if (effectiveSelected.ac === autoAc) return
    updateSelectedCharacter({ ac: autoAc })
  }, [effectiveSelected, computedAc, acManualOverrideByCharacterId])

  // Halfling two-handed weapon restriction
  useEffect(() => {
    if (!effectiveSelected || selectedClassName !== 'Halfling') return
    const weapons = selectedWeapons
    if (!weapons.some((w) => w.twoHanded)) return
    setInventoryByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: (current[effectiveSelected.id] ?? []).map((item) =>
        item.kind === 'weapon' && (item as CharacterWeaponItem).twoHanded
          ? { ...item, twoHanded: false } as CharacterWeaponItem
          : item,
      ),
    }))
  }, [effectiveSelected, selectedClassName, selectedWeapons])

  // Magic-User armour restriction
  useEffect(() => {
    if (!effectiveSelected || canClassEquipArmour) return
    const armours = selectedArmour
    if (!armours.some((a) => a.equipped)) return
    setInventoryByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: (current[effectiveSelected.id] ?? []).map((item) =>
        item.kind === 'armour' && item.equipped ? { ...item, equipped: false } : item,
      ),
    }))
  }, [effectiveSelected, canClassEquipArmour, selectedArmour])

  return {
    tryBuildGuidedScores,
    rollAbilityScores,
    classHitDie,
    hasRolledHp,
    canFreeRerollHp,
    rollHitPoints,
    requestRollHitPoints,
  }
}
