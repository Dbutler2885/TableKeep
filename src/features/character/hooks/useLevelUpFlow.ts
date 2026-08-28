import { useState, type Dispatch, type SetStateAction } from 'react'
import type { CharacterRecord } from '../../../types/app'
import { saveScoresForClassLevel, thacoForClassLevel, type SaveScores } from '../characterRules'
import type { ClassFeature } from '../lib/characterTabTypes'

type Params = {
  effectiveSelected: CharacterRecord | null
  canEditSelected: boolean
  canSelectedLevelUp: boolean
  selectedHitDie: number | null
  levelUpTargetLevel: number | null
  levelUpNewFeatures: ClassFeature[]
  levelUpFlavor: string
  levelUpChecklist: string[]
  updateSelectedCharacterSystem: (updates: Partial<CharacterRecord>) => void
  setSaveScoresByCharacterId: Dispatch<SetStateAction<Record<string, SaveScores>>>
  setThacoByCharacterId: Dispatch<SetStateAction<Record<string, string>>>
}

export function useLevelUpFlow({
  effectiveSelected,
  canEditSelected,
  canSelectedLevelUp,
  selectedHitDie,
  levelUpTargetLevel,
  levelUpNewFeatures,
  levelUpFlavor,
  levelUpChecklist,
  updateSelectedCharacterSystem,
  setSaveScoresByCharacterId,
  setThacoByCharacterId,
}: Params) {
  const [levelUpModalCharacterId, setLevelUpModalCharacterId] = useState<string | null>(null)
  const [levelUpHpRoll, setLevelUpHpRoll] = useState<number | null>(null)
  const [levelUpApplying, setLevelUpApplying] = useState(false)
  const [levelUpError, setLevelUpError] = useState<string | null>(null)
  const levelUpModalOpen = levelUpModalCharacterId === effectiveSelected?.id
  const levelUpHpGain = levelUpHpRoll === null ? null : Math.max(1, levelUpHpRoll)

  const resetLevelUpForCharacterSelection = () => {
    setLevelUpModalCharacterId(null)
    setLevelUpHpRoll(null)
    setLevelUpError(null)
  }
  const openLevelUpModal = () => {
    if (!canSelectedLevelUp || !canEditSelected) return
    setLevelUpHpRoll(null)
    setLevelUpError(null)
    setLevelUpModalCharacterId(effectiveSelected?.id ?? null)
  }
  const closeLevelUpModal = () => {
    if (levelUpApplying) return
    resetLevelUpForCharacterSelection()
  }
  const rollLevelUpHitPoints = () => {
    if (levelUpHpRoll !== null) return
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
    updateSelectedCharacterSystem({
      level: nextLevel,
      hpMax: Math.max(0, effectiveSelected.hpMax) + levelUpHpGain,
      hpCurrent: Math.max(0, effectiveSelected.hpCurrent) + levelUpHpGain,
    })
    setLevelUpApplying(false)
    resetLevelUpForCharacterSelection()
  }

  return {
    levelUpModalOpen,
    levelUpHpRoll,
    levelUpApplying,
    levelUpError,
    levelUpHpGain,
    levelUpTargetLevel,
    levelUpNewFeatures,
    levelUpFlavor,
    levelUpChecklist,
    resetLevelUpForCharacterSelection,
    openLevelUpModal,
    closeLevelUpModal,
    rollLevelUpHitPoints,
    applyLevelUp,
  }
}
