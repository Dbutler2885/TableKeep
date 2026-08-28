import { useEffect, useMemo, useState } from 'react'
import type {
  CharacterRecord,
  CharacterInventoryItem,
} from '../../types/app'
import { useItems } from '../items/useItems'
import { useItemApprovals } from './hooks/useItemApprovals'
import type { StoreCategoryId } from './storeCatalog'
import {
  type AbilityCode,
  saveScoresForClassLevel,
  thacoForClassLevel,
} from './characterRules'
import { usePendingTransfers } from '../transfers/usePendingTransfers'
import { useResponsiveCharacterLayout } from './hooks/useResponsiveCharacterLayout'
import { useCharacterPersistenceSync } from './hooks/useCharacterPersistenceSync'
import { useCharacterCreationFlow } from './hooks/useCharacterCreationFlow'
import { useSpellbookDomain } from './hooks/useSpellbookDomain'
import { useInventoryDomain } from './hooks/useInventoryDomain'
import type { AddItemModalState } from './hooks/useInventoryDomain'
import { useStoreDomain } from './hooks/useStoreDomain'
import { useCharacterSheetState } from './hooks/useCharacterSheetState'
import { useCampaignCharacterDirectory } from './hooks/useCampaignCharacterDirectory'
import { useCharacterTransfer } from './hooks/useCharacterTransfer'
import { usePlayerAssignment } from './hooks/usePlayerAssignment'
import { useCharacterMedia } from './hooks/useCharacterMedia'
import { useCharacterRoster } from './hooks/useCharacterRoster'
import { useGrantTools } from './hooks/useGrantTools'
import { useSelectedCharacterDerivations } from './hooks/useSelectedCharacterDerivations'
import { useLevelUpFlow } from './hooks/useLevelUpFlow'
import { useAutoClearFeedback } from './hooks/useAutoClearFeedback'
import { CharacterListPane } from './components/CharacterListPane'
import { CreateCharacterModal } from './components/CreateCharacterModal'
import { TransferPickerModal } from './components/TransferPickerModal'
import { PlayerAssignmentModal } from './components/PlayerAssignmentModal'
import { LevelUpModal } from './components/LevelUpModal'
import { AddItemModal } from './components/AddItemModal'
import { StoreModal } from './components/StoreModal'
import { GrantToolsPanel } from './components/GrantToolsPanel'
import { ReadOnlyItemDetail } from './components/ReadOnlyItemDetail'
import { CharacterCoreSheetPage } from './components/CharacterCoreSheetPage'
import { CharacterItemsPage } from './components/CharacterItemsPage'
import { ItemDetailModal } from './components/ItemDetailModal'
import { CharacterSheetNavigation } from './components/CharacterSheetNavigation'
import { ItemInteractionDialogs } from './components/ItemInteractionDialogs'
import { CharacterWorkflowDialogs } from './components/CharacterWorkflowDialogs'
import { SpellbookModals } from './components/SpellbookModals'
import { migrateToInventory } from './lib/legacyCharacterMigration'
import { canDeleteCharacterForRole, deriveCharacterPermissions } from './lib/characterPermissions'
import {
  applyPlayerAddTemplate as applyPlayerAddTemplateState,
} from './lib/playerAddGear'
import type {
  CharacterTabProps,
} from './lib/characterTabTypes'


export function CharacterTab({
  campaignId,
  groupId,
  gmUserId,
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
  syncCharacterLocal,
  deleteCharacter,
  hasPendingWrite,
  embeddedMode = false,
}: CharacterTabProps) {
  const { stateMaps, stateSetters } = useCharacterSheetState()
  const {
    abilityScoresByCharacterId, rolledAbilityScoresByCharacterId, abilityScoresRolledByCharacterId,
    hpBaseRollByCharacterId, inventoryByCharacterId, spellBookSpellIdsByCharacterId,
    memorizedSpellIdsByCharacterId, thacoByCharacterId, saveScoresByCharacterId,
    adventureScoresByCharacterId, adventureSeedClassByCharacterId, thiefSkillsByCharacterId,
    startingGoldByCharacterId, storeSpentByCharacterId, storeCartByCharacterId,
  } = stateMaps
  const {
    setAbilityScoresByCharacterId, setRolledAbilityScoresByCharacterId, setAbilityScoresRolledByCharacterId,
    setHpBaseRollByCharacterId, setInventoryByCharacterId, setSpellBookSpellIdsByCharacterId,
    setMemorizedSpellIdsByCharacterId, setThacoByCharacterId, setSaveScoresByCharacterId,
    setAdventureScoresByCharacterId, setAdventureSeedClassByCharacterId, setThiefSkillsByCharacterId,
    setStartingGoldByCharacterId, setStoreSpentByCharacterId, setStoreCartByCharacterId,
  } = stateSetters
  const [storeOpen, setStoreOpen] = useState(false)
  const [storeCloseConfirmOpen, setStoreCloseConfirmOpen] = useState(false)
  const [storeCategory, setStoreCategory] = useState<StoreCategoryId>('adventuring')
  const [storeError, setStoreError] = useState<string | null>(null)
  const [customStoreName, setCustomStoreName] = useState('')
  const [customStoreCost, setCustomStoreCost] = useState('')
  const [customStoreDescription, setCustomStoreDescription] = useState('')
  const [storeClassRequiredOpen, setStoreClassRequiredOpen] = useState(false)
  const [reallocationClassRequiredOpen, setReallocationClassRequiredOpen] = useState(false)
  const [hpClassRequiredOpen, setHpClassRequiredOpen] = useState(false)
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ id: string, name: string } | null>(null)
  const [itemDetailId, setItemDetailId] = useState<string | null>(null)
  const [addItemModal, setAddItemModal] = useState<AddItemModalState | null>(null)
  const [dropConfirmItemId, setDropConfirmItemId] = useState<string | null>(null)
  const [sellConfirmItemId, setSellConfirmItemId] = useState<string | null>(null)
  const [stackActionQty, setStackActionQty] = useState<string>('')
  const [goldSpendAmount, setGoldSpendAmount] = useState<string>('')
  const [goldSpendConfirmAmount, setGoldSpendConfirmAmount] = useState<number | null>(null)
  const [cantLightOpen, setCantLightOpen] = useState(false)
  const [cantFireMessage, setCantFireMessage] = useState<string | null>(null)
  const [overflowFeedback, setOverflowFeedback] = useState<string | null>(null)
  const [overflowWriting, setOverflowWriting] = useState(false)
  const [grantMode, setGrantMode] = useState(false)
  const effectiveGrantMode = grantMode && role === 'gm'

  // Declared after `grantMode` because the grant builder occupies the detail
  // pane just like a sheet does: both count as "open" when the layout narrows
  // and has to choose which single pane to keep.
  const {
    isMobile, isSinglePane, setPaneView,
    activePage, setActivePage,
    showListPane, showDetailPane,
    isIntermediateMobileLayout, useIntermediateLayout,
  } = useResponsiveCharacterLayout({ hasOpenDetail: !!selectedCharacterId || effectiveGrantMode })

  const itemApprovals = useItemApprovals(campaignId, groupId, role, currentUserId)
  const { ownPendingRequests, submitRequest, submitSpellLearnRequest, submitAbilityRerollRequest } = itemApprovals
  const { items: campaignItems } = useItems(campaignId, groupId)
  const { outgoingTransfers, createTransfer, cancelTransfer } = usePendingTransfers(campaignId, groupId, role, currentUserId)
  const [approvalPendingFeedback, setApprovalPendingFeedback] = useState<string | null>(null)

  useAutoClearFeedback(approvalPendingFeedback, setApprovalPendingFeedback)

  const { allCampaignCharacters, campaignPlayers } = useCampaignCharacterDirectory(campaignId, groupId, gmUserId, role)

  const { seededCharacterIdsRef, justSeededRef, lastPersistedDetailsJsonRef } = useCharacterPersistenceSync({
    selectedCharacterId,
    characters,
    hasPendingWrite,
    updateCharacter,
    migrateToInventory,
    stateMaps,
    stateSetters,
  })

  useAutoClearFeedback(overflowFeedback, setOverflowFeedback)

  const visibleCharacters = useMemo(
    () => (
      embeddedMode && role === 'player'
        ? characters.filter((character) => character.id === currentCharacterId && character.ownerUserId === currentUserId)
        : characters
    ),
    [characters, currentCharacterId, currentUserId, embeddedMode, role],
  )
  const sortedCharacters = useMemo(() => {
    // Tier order: active player characters, then active GM-owned, then dead.
    const tier = (character: CharacterRecord) => {
      if (character.hpCurrent <= 0) return 2
      if (gmUserId && character.ownerUserId === gmUserId) return 1
      return 0
    }
    return [...visibleCharacters].sort((a, b) => {
      const tierDiff = tier(a) - tier(b)
      if (tierDiff !== 0) return tierDiff
      return a.name.localeCompare(b.name)
    })
  }, [visibleCharacters, gmUserId])
  const effectiveSelected = embeddedMode
    ? (sortedCharacters[0] ?? null)
    : selectedCharacter ?? sortedCharacters.find((character) => character.id === selectedCharacterId) ?? null

  useEffect(() => {
    if (embeddedMode || sortedCharacters.length === 0) return
    if (!effectiveSelected) {
      setSelectedCharacterId(sortedCharacters[0].id)
    }
  }, [effectiveSelected, embeddedMode, setSelectedCharacterId, sortedCharacters])
  const permissions = deriveCharacterPermissions({ role, currentUserId, character: effectiveSelected, grantMode: effectiveGrantMode })
  const {
    canCreateCharacter, canEditSelected, canEditInventoryDetails, canGrant,
    isGuidedCreation, isInFinalizationFlow,
    canMemorizeSpell, requiresSpellLearnApproval,
    requiresApprovalNow, canEditAbilityScores, canClassEquipArmour,
  } = permissions
  const grantTools = useGrantTools({
    campaignId,
    groupId,
    grantMode,
    setGrantMode,
    setActivePage,
    setPaneView,
    isSinglePane,
    canGrant,
    sortedCharacters,
    campaignItems,
    abilityScoresByCharacterId,
    setInventoryByCharacterId,
    syncCharacterLocal,
  })
  const {
    selectedGrantTargetIds,
    enterGrantMode, exitGrantMode, exitGrantModeForCharacterSelection, toggleGrantTarget,
  } = grantTools
  const canDeleteCharacter = (character: CharacterRecord) => canDeleteCharacterForRole(role, currentUserId, character)
  const effectiveShowListPane = embeddedMode ? false : showListPane
  const effectiveShowDetailPane = embeddedMode ? true : showDetailPane
  const playerAssignment = usePlayerAssignment({ effectiveSelected, campaignPlayers, updateCharacter })
  const { openPlayerAssignment } = playerAssignment

  const updateSelectedCharacter = (updates: Partial<CharacterRecord>) => {
    if (!effectiveSelected) return
    const nextUpdates = { ...updates }
    delete nextUpdates.hpMax
    updateCharacter(effectiveSelected.id, nextUpdates)
  }

  const updateSelectedCharacterSystem = (updates: Partial<CharacterRecord>) => {
    if (!effectiveSelected) return
    updateCharacter(effectiveSelected.id, updates)
  }

  const selectedDerivations = useSelectedCharacterDerivations({
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
    isInFinalizationFlow,
  })
  const {
    selectedAbilityScores, selectedRolledAbilityScores, hasRolledAbilityScores,
    primeRequisiteCodes,
    selectedInventory, selectedWeapons,
    selectedArmour, packedItems,
    selectedClassName, selectedLevel,
    selectedStartingGold, hasRolledStartingGold, selectedStoreCart,
    selectedCommittedStoreSpent, selectedStoreCartTotal, selectedStoreRemaining,
    visibleStoreItems, availablePackedSlotIndices,
    selectedStoreRequiredPacked, selectedStoreOpenPackedSlots, storeCartExceedsPackedSlots,
    computedAc, derivedConModifierNumber, canSelectedLevelUp, selectedHitDie,
    levelUpTargetLevel, levelUpNewFeatures, levelUpFlavor, levelUpChecklist,
  } = selectedDerivations
  const levelUpFlow = useLevelUpFlow({
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
  })
  const { resetLevelUpForCharacterSelection } = levelUpFlow

  const transferFlow = useCharacterTransfer({
    allCampaignCharacters,
    currentUserId,
    effectiveSelected,
    createTransfer,
    cancelTransfer,
    closeItemDetail: () => setItemDetailId(null),
  })
  const renderReadOnlyItemDetail = (item: CharacterInventoryItem) => <ReadOnlyItemDetail item={item} />
  // Build slot rendering arrays from unified inventory
  const applyPlayerAddTemplate = (
    kind: 'general' | 'weapon' | 'armour' | 'ammunition',
    templateId: string,
  ) => {
    setAddItemModal((current) => current ? applyPlayerAddTemplateState(current, kind, templateId) : current)
  }

  const characterMedia = useCharacterMedia({
    campaignId, groupId, effectiveSelected, canEditSelected,
  })
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

  const creationFlow = useCharacterCreationFlow({
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
    updateSelectedCharacterSystem,
  })
  const {
    tryBuildGuidedScores,
    rollAbilityScores,
    hasRolledHp,
    requestRollHitPoints: _requestRollHitPoints,
  } = creationFlow

  const requestRollHitPoints = () => _requestRollHitPoints(setHpClassRequiredOpen)
  const hasPendingAbilityReroll = ownPendingRequests.some((request) =>
    request.action === 'ability_reroll'
    && request.characterId === effectiveSelected?.id
    && request.status === 'pending',
  )

  const requestAbilityScoreRoll = () => {
    if (!effectiveSelected || !canEditSelected || !isGuidedCreation) return
    if (!hasRolledAbilityScores || role === 'gm') {
      rollAbilityScores()
      return
    }
    if (hasPendingAbilityReroll) return
    void submitAbilityRerollRequest(
      effectiveSelected.id,
      effectiveSelected.name,
      currentUsername,
    )
    setApprovalPendingFeedback('Ability score re-roll sent to GM for approval.')
  }

  const spellbookDomain = useSpellbookDomain({
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
  const rosterFlow = useCharacterRoster({
    campaignId,
    groupId,
    currentUserId,
    currentUsername,
    canCreateCharacter,
    effectiveSelected,
    canEditSelected,
    isGuidedCreation,
    isInFinalizationFlow,
    hasRolledAbilityScores,
    hasRolledHp,
    selectedInventory,
    setSelectedCharacterId,
    isSinglePane,
    showDetailPane: () => setPaneView('detail'),
    updateSelectedCharacter,
  })
  const {
    createCharacterModalOpen,
    setCreateCharacterModalOpen,
    finalizeError,
    addCharacter,
    requestFinalizeCharacter,
  } = rosterFlow

  const inventoryDomain = useInventoryDomain({
    campaignId,
    groupId,
    currentUsername,
    effectiveSelected,
    canEditSelected,
    canEditInventoryDetails,
    selectedClassName,
    canClassEquipArmour,
    selectedInventory,
    allInventories: inventoryByCharacterId,
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
    saveAddItem,
    setInventoryGold,
    addItemsToInventory,
    setInventoryGoldForCharacter,
  } = inventoryDomain

  const storeDomain = useStoreDomain({
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
    storeOpen,
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
  const {
    decrementCartEntry,
    incrementCartEntry,
    removeCartEntry,
    clearCart,
    rollStartingGold,
    handleStoreBuy,
    handleBuyCustomStoreItem,
    applyStorePurchases,
  } = storeDomain

  // Clear justSeeded AFTER all init effects have run (effect order matters —
  // this must be defined after the init effects so they can see justSeeded as true)
  useEffect(() => {
    if (!selectedCharacterId) return
    justSeededRef.current.delete(selectedCharacterId)
  })

  return (
    <div className="maps-layout monsters-layout characters-layout">
      {effectiveShowListPane ? (
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
            if (effectiveGrantMode) {
              exitGrantModeForCharacterSelection()
            }
            resetLevelUpForCharacterSelection()
            setSelectedCharacterId(characterId)
            if (isSinglePane) setPaneView('detail')
          }}
          onDeleteCharacter={(character) => {
            setDeleteConfirmTarget({ id: character.id, name: character.name || 'character' })
          }}
          showGrantCard={canGrant}
          isGrantMode={effectiveGrantMode}
          selectedGrantTargetIds={selectedGrantTargetIds}
          onEnterGrantMode={enterGrantMode}
          onToggleGrantTarget={toggleGrantTarget}
        />
      ) : null}

      {effectiveShowDetailPane ? (
        <div className="monsters-detail characters-detail">
          <div className="monsters-detail-inner characters-detail-inner">
            <CharacterSheetNavigation
              position="top"
              character={effectiveSelected}
              effectiveGrantMode={effectiveGrantMode}
              activePage={activePage}
              setActivePage={setActivePage}
              permissions={permissions}
              levelUpFlow={levelUpFlow}
              canSelectedLevelUp={canSelectedLevelUp}
              currentCharacterId={currentCharacterId}
              setCurrentCharacter={setCurrentCharacter}
              isMobile={isMobile}
              isSinglePane={isSinglePane}
              embeddedMode={embeddedMode}
              onFinalize={requestFinalizeCharacter}
              onAssign={openPlayerAssignment}
              onExitGrant={exitGrantMode}
              onBackToList={() => setPaneView('list')}
            />

            {finalizeError ? <p className="error">{finalizeError}</p> : null}

            {effectiveGrantMode ? (
              <GrantToolsPanel tools={grantTools} characters={sortedCharacters} isMobile={isMobile} />
            ) : !effectiveSelected ? (
              <p>{embeddedMode ? "You don't have a character, yet." : 'Select a character from the list.'}</p>
            ) : (
              <div className="monster-editor-grid character-editor-grid">
                {activePage === 'core' ? (
                  <CharacterCoreSheetPage
                    character={effectiveSelected}
                    role={role}
                    layout={{ isMobile, useIntermediateLayout, isIntermediateMobileLayout }}
                    permissions={permissions}
                    derivations={selectedDerivations}
                    creationFlow={creationFlow}
                    media={characterMedia}
                    sheetState={{ stateMaps, stateSetters }}
                    hasPendingAbilityReroll={hasPendingAbilityReroll}
                    actions={{
                      updateCharacter: updateSelectedCharacter,
                      updateCharacterSystem: updateSelectedCharacterSystem,
                      applyClassDerivedData,
                      requestAbilityScoreRoll,
                      requestRollHitPoints,
                      updateAbilityScore,
                      openReallocationClassRequired: () => setReallocationClassRequiredOpen(true),
                    }}
                  />
                ) : (
                  <CharacterItemsPage
                    character={effectiveSelected}
                    permissions={permissions}
                    derivations={selectedDerivations}
                    inventoryDomain={inventoryDomain}
                    spellbookDomain={spellbookDomain}
                    storeDomain={storeDomain}
                    approvals={itemApprovals}
                    sheetState={{ stateMaps, stateSetters }}
                    overflowFeedback={overflowFeedback}
                    approvalPendingFeedback={approvalPendingFeedback}
                    onOpenStore={() => {
                      setStoreError(null)
                      setStoreOpen(true)
                    }}
                    onOpenStoreClassRequired={() => setStoreClassRequiredOpen(true)}
                    onOpenItemDetail={setItemDetailId}
                    onUpdateCharacter={updateSelectedCharacter}
                  />
                )}

                <CharacterSheetNavigation
                  position="bottom"
                  character={effectiveSelected}
                  effectiveGrantMode={effectiveGrantMode}
                  activePage={activePage}
                  setActivePage={setActivePage}
                  permissions={permissions}
                  levelUpFlow={levelUpFlow}
                  canSelectedLevelUp={canSelectedLevelUp}
                  currentCharacterId={currentCharacterId}
                  setCurrentCharacter={setCurrentCharacter}
                  isMobile={isMobile}
                  isSinglePane={isSinglePane}
                  embeddedMode={embeddedMode}
                  onFinalize={requestFinalizeCharacter}
                  onAssign={openPlayerAssignment}
                  onExitGrant={exitGrantMode}
                  onBackToList={() => setPaneView('list')}
                />
              </div>
            )}
          </div>
        </div>
      ) : null}
      <StoreModal
        state={{ storeOpen, effectiveSelected, selectedStoreCart, hasRolledStartingGold, selectedStoreRemaining, selectedStartingGold, canEditSelected, storeCategory, customStoreName, customStoreCost, customStoreDescription, visibleStoreItems, selectedClassName, selectedStoreCartTotal, storeCartExceedsPackedSlots, selectedStoreOpenPackedSlots, selectedStoreRequiredPacked, storeError, storeCloseConfirmOpen }}
        actions={{ setStoreCloseConfirmOpen, setStoreOpen, rollStartingGold, setStoreCategory, setCustomStoreName, setCustomStoreCost, setCustomStoreDescription, handleBuyCustomStoreItem, handleStoreBuy, decrementCartEntry, incrementCartEntry, removeCartEntry, applyStorePurchases, clearCart }}
      />
      <CreateCharacterModal
        open={createCharacterModalOpen}
        onAdd={addCharacter}
        onClose={() => setCreateCharacterModalOpen(false)}
      />
      {effectiveSelected ? (
        <ItemDetailModal
          character={effectiveSelected}
          itemDetailId={itemDetailId}
          permissions={permissions}
          derivations={selectedDerivations}
          inventoryDomain={inventoryDomain}
          spellbookDomain={spellbookDomain}
          transferFlow={transferFlow}
          storeDomain={storeDomain}
          goldSpendAmount={goldSpendAmount}
          setItemDetailId={setItemDetailId}
          setGoldSpendAmount={setGoldSpendAmount}
          setStackActionQty={setStackActionQty}
          setGoldSpendConfirmAmount={setGoldSpendConfirmAmount}
          setCantLightOpen={setCantLightOpen}
          setCantFireMessage={setCantFireMessage}
          setDropConfirmItemId={setDropConfirmItemId}
          setSellConfirmItemId={setSellConfirmItemId}
        />
      ) : null}
      <SpellbookModals domain={spellbookDomain} className={selectedClassName} />
      <AddItemModal
        modal={addItemModal}
        setModal={setAddItemModal}
        selectedClassName={selectedClassName}
        canClassEquipArmour={canClassEquipArmour}
        requiresApprovalNow={requiresApprovalNow}
        onApplyTemplate={applyPlayerAddTemplate}
        renderReadOnlyItemDetail={renderReadOnlyItemDetail}
        onSave={saveAddItem}
      />
      <TransferPickerModal flow={transferFlow} detailItem={itemDetailId ? selectedInventory.find((item) => item.id === itemDetailId) ?? null : null} />
      <PlayerAssignmentModal character={effectiveSelected} flow={playerAssignment} />
      <LevelUpModal character={effectiveSelected} flow={levelUpFlow} derivations={selectedDerivations} />
      <ItemInteractionDialogs
        derivations={selectedDerivations}
        inventoryDomain={inventoryDomain}
        goldSpendConfirmAmount={goldSpendConfirmAmount}
        setGoldSpendConfirmAmount={setGoldSpendConfirmAmount}
        dropConfirmItemId={dropConfirmItemId}
        setDropConfirmItemId={setDropConfirmItemId}
        sellConfirmItemId={sellConfirmItemId}
        setSellConfirmItemId={setSellConfirmItemId}
        stackActionQty={stackActionQty}
        setStackActionQty={setStackActionQty}
        cantFireMessage={cantFireMessage}
        setCantFireMessage={setCantFireMessage}
        cantLightOpen={cantLightOpen}
        setCantLightOpen={setCantLightOpen}
      />
      <CharacterWorkflowDialogs
        rosterFlow={rosterFlow}
        isGuidedCreation={isGuidedCreation}
        reallocationClassRequiredOpen={reallocationClassRequiredOpen}
        setReallocationClassRequiredOpen={setReallocationClassRequiredOpen}
        storeClassRequiredOpen={storeClassRequiredOpen}
        setStoreClassRequiredOpen={setStoreClassRequiredOpen}
        hpClassRequiredOpen={hpClassRequiredOpen}
        setHpClassRequiredOpen={setHpClassRequiredOpen}
        deleteTarget={deleteConfirmTarget}
        onConfirmDelete={(target) => {
          deleteCharacter(target.id)
          seededCharacterIdsRef.current.delete(target.id)
          delete lastPersistedDetailsJsonRef.current[target.id]
          setDeleteConfirmTarget(null)
        }}
        onCancelDelete={() => setDeleteConfirmTarget(null)}
      />
    </div>
  )
}
