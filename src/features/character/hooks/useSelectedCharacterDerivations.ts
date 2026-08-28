import { useMemo } from 'react'
import type {
  CharacterArmourItem,
  CharacterGoldItem,
  CharacterInventoryItem,
  CharacterRecord,
  CharacterStoreCartEntry,
  CharacterWeaponItem,
  PendingTransfer,
} from '../../../types/app'
import { resolveArmourType } from '../inventoryRules'
import { OSE_STORE_ITEMS, type StoreCategoryId } from '../storeCatalog'
import {
  adventureDefaultsByClass,
  classHitDieByClass,
  defaultThiefSkills,
  emptyAbilityScores,
  loweringCandidateCodes,
  primeRequisiteCodesForClass,
  type AbilityScores,
  type AdventureScores,
  type SaveScores,
  type ThiefSkillScores,
} from '../characterRules'
import { nextLevelXpFor, primeRequisiteXpBonusPercent } from '../xpProgression'
import { classFeaturesByClass, levelUpChecklistForClass, levelUpFlavorByClass } from '../lib/characterClassData'
import { packedRowCount, packedSlotThresholds, packedStrengthSlotCount } from '../lib/characterSheetLayout'
import { deriveCombatStats, deriveMovement, deriveThiefExpertise } from '../lib/characterDerivedStats'

type Params = {
  effectiveSelected: CharacterRecord | null
  abilityScoresByCharacterId: Record<string, AbilityScores>
  rolledAbilityScoresByCharacterId: Record<string, AbilityScores>
  abilityScoresRolledByCharacterId: Record<string, boolean>
  inventoryByCharacterId: Record<string, CharacterInventoryItem[]>
  startingGoldByCharacterId: Record<string, number>
  storeCartByCharacterId: Record<string, CharacterStoreCartEntry[]>
  storeSpentByCharacterId: Record<string, number>
  thacoByCharacterId: Record<string, string>
  saveScoresByCharacterId: Record<string, SaveScores>
  adventureScoresByCharacterId: Record<string, AdventureScores>
  thiefSkillsByCharacterId: Record<string, ThiefSkillScores>
  outgoingTransfers: PendingTransfer[]
  goldSpendAmount: string
  storeCategory: StoreCategoryId
  levelUpHpRoll: number | null
  isInFinalizationFlow: boolean
}

export function useSelectedCharacterDerivations({
  effectiveSelected,
  abilityScoresByCharacterId,
  rolledAbilityScoresByCharacterId,
  abilityScoresRolledByCharacterId,
  inventoryByCharacterId,
  startingGoldByCharacterId,
  storeCartByCharacterId,
  storeSpentByCharacterId,
  thacoByCharacterId,
  saveScoresByCharacterId,
  adventureScoresByCharacterId,
  thiefSkillsByCharacterId,
  outgoingTransfers,
  goldSpendAmount,
  storeCategory,
  levelUpHpRoll,
  isInFinalizationFlow,
}: Params) {
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
  const primeRequisiteLabel = primeRequisiteCodes.length > 0 ? primeRequisiteCodes.join('/') : '-'
  const selectedStrRaw = selectedAbilityScores.STR
  const selectedDexRaw = selectedAbilityScores.DEX
  const selectedChaRaw = selectedAbilityScores.CHA
  const selectedConRaw = selectedAbilityScores.CON
  const selectedStr = Number.parseInt(selectedStrRaw, 10)
  const selectedDex = Number.parseInt(selectedDexRaw, 10)
  const selectedCha = Number.parseInt(selectedChaRaw, 10)
  const selectedCon = Number.parseInt(selectedConRaw, 10)
  const selectedInventory = effectiveSelected ? (inventoryByCharacterId[effectiveSelected.id] ?? []) : []
  const selectedGoldTotal = selectedInventory
    .filter((item): item is CharacterGoldItem => item.kind === 'gold')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy data may still have `amount`
    .reduce((sum, gold) => sum + (gold.qty ?? (gold as any).amount ?? 0), 0)
  const parsedGoldSpendAmount = Number.parseInt(goldSpendAmount, 10) || 0
  const selectedWeapons = selectedInventory.filter((item): item is CharacterWeaponItem => item.kind === 'weapon')
  const selectedArmour = selectedInventory.filter((item): item is CharacterArmourItem => item.kind === 'armour')
  const equippedBodyArmour = selectedArmour.find((item) => item.equipped && resolveArmourType(item) === 'body') ?? null
  const equippedShield = selectedArmour.find((item) => item.equipped && resolveArmourType(item) === 'shield') ?? null
  const equippedItems = selectedInventory.filter((item) => item.equipped)
  const packedItems = selectedInventory.filter((item) => !item.equipped)
  const outgoingTransferByItemKey = useMemo(
    () => new Map(outgoingTransfers.map((transfer) => [`${transfer.fromCharacterId}:${transfer.itemId}`, transfer])),
    [outgoingTransfers],
  )
  const selectedClassName = effectiveSelected?.className ?? '-'
  const selectedLevel = effectiveSelected?.level ?? 1
  const unlockedClassFeatures = (classFeaturesByClass[selectedClassName] ?? [])
    .filter((feature) => selectedLevel >= feature.unlockedAt)
    .sort((left, right) => left.unlockedAt - right.unlockedAt)
  const selectedStartingGold = effectiveSelected ? (startingGoldByCharacterId[effectiveSelected.id] ?? null) : null
  const hasRolledStartingGold = typeof selectedStartingGold === 'number'
  const selectedStoreCart = effectiveSelected ? (storeCartByCharacterId[effectiveSelected.id] ?? []) : []
  const selectedCommittedStoreSpent = effectiveSelected ? (storeSpentByCharacterId[effectiveSelected.id] ?? 0) : 0
  const selectedStoreCartTotal = selectedStoreCart.reduce((sum, entry) => sum + entry.costGp * entry.qty, 0)
  const selectedStoreRemaining = (selectedStartingGold ?? 0) - selectedCommittedStoreSpent - selectedStoreCartTotal
  const visibleStoreItems = OSE_STORE_ITEMS.filter((item) => item.category === storeCategory)
  const packedSlotUnlockedByIndex = Array.from({ length: packedRowCount }, (_, index) =>
    index < packedStrengthSlotCount
      ? (!Number.isNaN(selectedStr) && selectedStr >= packedSlotThresholds[index])
      : true)
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
  const thiefRemainingExpertisePoints = deriveThiefExpertise(
    effectiveSelected?.level ?? 1,
    selectedThiefSkills,
  ).remaining
  const combatStats = deriveCombatStats({
    str: selectedStr,
    dex: selectedDex,
    cha: selectedCha,
    con: selectedCon,
    wis: Number.parseInt(selectedAbilityScores.WIS, 10),
    isHalfling,
    equippedBodyArmour,
    equippedShield,
    saveScores: selectedSaveScores,
  })
  const canSelectedLevelUp = !!effectiveSelected
    && !isInFinalizationFlow
    && selectedNextLevelXp !== null
    && effectiveSelected.xp >= selectedNextLevelXp
  const selectedHitDie = classHitDieByClass[selectedClassName] ?? null
  const levelUpHpGain = levelUpHpRoll === null ? null : Math.max(1, levelUpHpRoll)
  const levelUpTargetLevel = effectiveSelected ? effectiveSelected.level + 1 : null
  const levelUpNewFeatures = levelUpTargetLevel === null
    ? []
    : (classFeaturesByClass[selectedClassName] ?? []).filter((feature) => feature.unlockedAt === levelUpTargetLevel)
  const levelUpFlavor = levelUpFlavorByClass[selectedClassName] ?? 'Your experience pays off as your capabilities expand.'
  const levelUpChecklist = levelUpChecklistForClass(selectedClassName, selectedHitDie)
  const abilityTradePointsGained = selectedRolledAbilityScores
    ? Math.floor(loweringCodes.reduce((sum, code) => {
      const base = Number.parseInt(selectedRolledAbilityScores[code], 10)
      const current = Number.parseInt(selectedAbilityScores[code], 10)
      return Number.isNaN(base) || Number.isNaN(current) ? sum : sum + Math.max(0, base - current)
    }, 0) / 2)
    : 0
  const abilityTradePointsSpent = selectedRolledAbilityScores
    ? primeRequisiteCodes.reduce((sum, code) => {
      const base = Number.parseInt(selectedRolledAbilityScores[code], 10)
      const current = Number.parseInt(selectedAbilityScores[code], 10)
      return Number.isNaN(base) || Number.isNaN(current) ? sum : sum + Math.max(0, current - base)
    }, 0)
    : 0
  const availableAbilityTradePoints = Math.max(0, abilityTradePointsGained - abilityTradePointsSpent)
  const packedItemCount = packedItems.length
  const movement = deriveMovement(packedItemCount)

  return {
    selectedAbilityScores,
    selectedRolledAbilityScores,
    hasRolledAbilityScores,
    primeRequisiteCodes,
    loweringCodes,
    selectedPrimeXpModifierPercent,
    selectedNextLevelXp,
    selectedXpToNextLevel,
    primeRequisiteLabel,
    selectedStrRaw,
    selectedDexRaw,
    selectedChaRaw,
    selectedConRaw,
    selectedStr,
    selectedDex,
    selectedCha,
    selectedCon,
    selectedInventory,
    selectedGoldTotal,
    parsedGoldSpendAmount,
    selectedWeapons,
    selectedArmour,
    equippedBodyArmour,
    equippedShield,
    equippedItems,
    packedItems,
    outgoingTransferByItemKey,
    selectedClassName,
    selectedLevel,
    unlockedClassFeatures,
    selectedStartingGold,
    hasRolledStartingGold,
    selectedStoreCart,
    selectedCommittedStoreSpent,
    selectedStoreCartTotal,
    selectedStoreRemaining,
    visibleStoreItems,
    packedSlotUnlockedByIndex,
    availablePackedSlotIndices,
    selectedStoreRequiredPacked,
    selectedStoreOpenPackedSlots,
    storeCartExceedsPackedSlots,
    selectedThacoRaw,
    selectedThaco,
    selectedSaveScores,
    selectedAdventureScores,
    selectedThiefSkills,
    isHalfling,
    thiefRemainingExpertisePoints,
    ...combatStats,
    canSelectedLevelUp,
    selectedHitDie,
    levelUpHpGain,
    levelUpTargetLevel,
    levelUpNewFeatures,
    levelUpFlavor,
    levelUpChecklist,
    abilityTradePointsGained,
    abilityTradePointsSpent,
    availableAbilityTradePoints,
    packedItemCount,
    ...movement,
  }
}
