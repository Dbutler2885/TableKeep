import { Fragment, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, ChevronLeft, ShoppingBag, Sparkles, Star, X } from 'lucide-react'
import type {
  CharacterRecord,
  CharacterSpell,
  CharacterInventoryItem,
  CharacterWeaponItem,
  CharacterArmourItem,
  CharacterConsumableItem,
  CharacterAmmunitionItem,
  CharacterGeneralItem,
  TransferableInventoryItem,
} from '../../types/app'
import { useItems } from '../items/useItems'
import { useItemApprovals } from './hooks/useItemApprovals'
import { EntityMediaEditor } from '../common/EntityMediaEditor'
import { ConfirmModal } from '../common/ConfirmModal'
import { OSE_WEAPON_CATALOG } from './weaponCatalog'
import { OSE_ARMOUR_CATALOG } from './armourCatalog'
import { STORE_CATEGORY_LABELS } from './storeCatalog'
import {
  SPELL_BOOK_TYPE_ID,
  arcaneSpellById,
} from './spellCatalog'
import type { StoreCategoryId } from './storeCatalog'
import {
  type AbilityCode,
  defaultThiefSkills,
  saveScoresForClassLevel,
  thacoForClassLevel,
} from './characterRules'
import {
  isWeaponTemplateAllowedForClass,
  isArmourTemplateAllowedForClass,
} from './inventoryRules'
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
import { CharacterListPane } from './components/CharacterListPane'
import { BlurSyncedTextarea } from './components/BlurSyncedTextarea'
import { CharacterPackedItemsSection } from './components/CharacterPackedItemsSection'
import { CharacterThiefSkillsSection } from './components/CharacterThiefSkillsSection'
import { CreateCharacterModal } from './components/CreateCharacterModal'
import { MemorizedSpellDetailModal } from './components/MemorizedSpellDetailModal'
import { TransferPickerModal } from './components/TransferPickerModal'
import { PlayerAssignmentModal } from './components/PlayerAssignmentModal'
import { LevelUpModal } from './components/LevelUpModal'
import { DropItemDialog } from './components/DropItemDialog'
import { SellItemDialog } from './components/SellItemDialog'
import { SpellbookAddModal } from './components/SpellbookAddModal'
import { DivinePrepareModal } from './components/DivinePrepareModal'
import { AddItemModal } from './components/AddItemModal'
import {
  alignmentOptions,
  classOptions,
} from './lib/characterClassData'
import {
  abilityRows,
  adventureRows,
  saveRows,
  thiefSkillRows,
} from './lib/characterSheetTables'
import {
  equippedRowCount,
  packedMovementBands,
  packedSlotLabels,
  packedSlotThresholds,
  packedStrengthSlotCount,
} from './lib/characterSheetLayout'
import { migrateToInventory } from './lib/legacyCharacterMigration'
import {
  armourStatsLabel,
  armourTypeLabel,
  formatWeaponEffectLine,
  weaponStatsLabel,
  weaponTypeLabel,
} from './lib/inventoryItemLabels'
import { canDeleteCharacterForRole, deriveCharacterPermissions } from './lib/characterPermissions'
import {
  applyPlayerAddTemplate as applyPlayerAddTemplateState,
} from './lib/playerAddGear'
import { amountForTarget } from './lib/grantPlanning'
import type {
  AdventureEditableCode,
  CharacterTabProps,
  ClassFeature,
} from './lib/characterTabTypes'


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
    alignmentByCharacterId, titleByCharacterId, languagesTextByCharacterId,
    unencumberingItemsTextByCharacterId, otherNotesTextByCharacterId,
  } = stateMaps
  const {
    setAbilityScoresByCharacterId, setRolledAbilityScoresByCharacterId, setAbilityScoresRolledByCharacterId,
    setHpBaseRollByCharacterId, setInventoryByCharacterId, setSpellBookSpellIdsByCharacterId,
    setMemorizedSpellIdsByCharacterId, setThacoByCharacterId, setSaveScoresByCharacterId,
    setAdventureScoresByCharacterId, setAdventureSeedClassByCharacterId, setThiefSkillsByCharacterId,
    setStartingGoldByCharacterId, setStoreSpentByCharacterId, setStoreCartByCharacterId,
    setAlignmentByCharacterId, setTitleByCharacterId, setLanguagesTextByCharacterId,
    setUnencumberingItemsTextByCharacterId, setOtherNotesTextByCharacterId,
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

  const { ownPendingRequests, rejections, submitRequest, submitSpellLearnRequest, submitAbilityRerollRequest, dismissRejection } = useItemApprovals(campaignId, groupId, role, currentUserId)
  const { items: campaignItems } = useItems(campaignId, groupId)
  const { outgoingTransfers, createTransfer, cancelTransfer } = usePendingTransfers(campaignId, groupId, role, currentUserId)
  const [approvalPendingFeedback, setApprovalPendingFeedback] = useState<string | null>(null)

  // Auto-clear approval pending feedback after 5 seconds
  useEffect(() => {
    if (!approvalPendingFeedback) return
    const timer = setTimeout(() => setApprovalPendingFeedback(null), 5000)
    return () => clearTimeout(timer)
  }, [approvalPendingFeedback])

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

  // Auto-clear overflow feedback after 5 seconds
  useEffect(() => {
    if (!overflowFeedback) return
    const timer = setTimeout(() => setOverflowFeedback(null), 5000)
    return () => clearTimeout(timer)
  }, [overflowFeedback])

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
    canSetCurrentCharacter, canAssignCharacter, isGuidedCreation, isInFinalizationFlow,
    canEditClassAndAlignment, canMemorizeSpell, requiresSpellLearnApproval,
    requiresApprovalNow, canEditAbilityScores, canClassEquipArmour,
  } = permissions
  const {
    grantTargetIds,
    grantXpBase, setGrantXpBase, grantXpSplitBetweenTargets, setGrantXpSplitBetweenTargets,
    grantGoldGp, setGrantGoldGp, grantGoldSplitBetweenTargets, setGrantGoldSplitBetweenTargets,
    grantNote, setGrantNote,
    grantCampaignItemId, setGrantCampaignItemId, grantCampaignEntries, setGrantCampaignEntries,
    grantTemplateItemId, setGrantTemplateItemId, grantTemplateEntries, setGrantTemplateEntries,
    grantBusy, grantFeedback, authoredCampaignItems, grantTemplateSelectable,
    selectedGrantTargetIds, parsedGrantBaseXp, parsedGrantGoldGp, grantPreviewByCharacterId,
    enterGrantMode, exitGrantMode, exitGrantModeForCharacterSelection, toggleGrantTarget,
    clearGrantDraftAndTargets, selectAllGrantTargets, clearGrantTargets,
    upsertGrantCampaignEntry, upsertGrantTemplateEntry, applyGrantToSelectedTargets,
  } = useGrantTools({
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
  const canDeleteCharacter = (character: CharacterRecord) => canDeleteCharacterForRole(role, currentUserId, character)
  const effectiveShowListPane = embeddedMode ? false : showListPane
  const effectiveShowDetailPane = embeddedMode ? true : showDetailPane
  const {
    playerAssignmentOpen, assignmentBusy, assignmentOptions,
    effectiveAssignmentTargetUserId, setAssignmentTargetUserId, openPlayerAssignment,
    closePlayerAssignment, submitPlayerAssignment,
  } = usePlayerAssignment({ effectiveSelected, campaignPlayers, updateCharacter })

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

  const {
    selectedAbilityScores, selectedRolledAbilityScores, hasRolledAbilityScores,
    primeRequisiteCodes, selectedPrimeXpModifierPercent, selectedNextLevelXp,
    selectedXpToNextLevel, primeRequisiteLabel, selectedStr,
    selectedInventory, selectedGoldTotal, parsedGoldSpendAmount, selectedWeapons,
    selectedArmour, equippedItems, packedItems,
    outgoingTransferByItemKey, selectedClassName, selectedLevel, unlockedClassFeatures,
    selectedStartingGold, hasRolledStartingGold, selectedStoreCart,
    selectedCommittedStoreSpent, selectedStoreCartTotal, selectedStoreRemaining,
    visibleStoreItems, availablePackedSlotIndices,
    selectedStoreRequiredPacked, selectedStoreOpenPackedSlots, storeCartExceedsPackedSlots,
    selectedThacoRaw, selectedThaco, selectedAdventureScores,
    selectedThiefSkills, thiefRemainingExpertisePoints,
    derivedDexAcModifier, derivedUnarmouredAc, computedAc, derivedInitModifier,
    derivedReactionModifier, derivedOpenStuckDoor, derivedMeleeModifier,
    derivedMissileModifier, derivedConModifierNumber, derivedConModifier,
    derivedWisMagicSaveModifier, displayedSaveScores, canSelectedLevelUp, selectedHitDie,
    levelUpTargetLevel, levelUpNewFeatures, levelUpFlavor, levelUpChecklist,
    availableAbilityTradePoints, currentPackedMovement, derivedOverlandMove, derivedExplorationMove,
    derivedEncounterMove,
  } = useSelectedCharacterDerivations({
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
    levelUpModalOpen, levelUpHpRoll, levelUpApplying, levelUpError, levelUpHpGain,
    resetLevelUpForCharacterSelection, openLevelUpModal, closeLevelUpModal,
    rollLevelUpHitPoints, applyLevelUp,
  } = useLevelUpFlow({
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

  const {
    transferPickerOpen, transferTargetCharacterId, transferBusy, transferError, transferQty,
    transferTargets, setTransferTargetCharacterId, setTransferQty,
    openTransferPickerForItem, closeTransferPicker, submitTransfer, cancelOutgoingTransfer,
  } = useCharacterTransfer({
    allCampaignCharacters,
    currentUserId,
    effectiveSelected,
    createTransfer,
    cancelTransfer,
    closeItemDetail: () => setItemDetailId(null),
  })
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
  const renderWeaponSlotLabel = (weapon: CharacterWeaponItem): ReactNode => {
    const name = (weapon.name ?? '').trim()
    const stats = weaponStatsLabel(weapon)
    const hasExtraDetail = (weapon.weaponEffects?.length ?? 0) > 0 || (weapon.weaponRollTables?.length ?? 0) > 0
    return (
      <span className="weapon-slot-label">
        <strong>{weaponTypeLabel(weapon)}</strong>
        {name ? <><span> </span><em>{name}</em></> : null}
        {weapon.isMagic ? <span className="weapon-slot-magic">(M)</span> : null}
        {stats ? <span> - {stats}</span> : null}
        {hasExtraDetail ? <span className="weapon-slot-core"> [details]</span> : null}
      </span>
    )
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
  const renderReadOnlyItemDetail = (detailItem: CharacterInventoryItem) => {
    if (detailItem.kind === 'gold') return null
    if (detailItem.kind === 'weapon') {
      const weapon = detailItem as CharacterWeaponItem
      const tags: string[] = []
      if (weapon.slow) tags.push('Slow')
      if (weapon.twoHanded) tags.push('Two-handed')
      if (weapon.isMagic) tags.push('Magic')
      const bonusBits = [
        weapon.attackBonus ? `${weapon.attackBonus.replace(/^\+?/, '+')} attack` : '',
        weapon.damageBonus ? `${weapon.damageBonus.replace(/^\+?/, '+')} damage` : '',
      ].filter((value) => value.length > 0)
      const hasRange = [weapon.rangeShort, weapon.rangeMedium, weapon.rangeLong].every((value) => (value ?? '').trim().length > 0)
      const effects = (weapon.weaponEffects ?? []).map((effect) => formatWeaponEffectLine(weapon, effect)).filter((line) => line.trim().length > 0)
      const tables = (weapon.weaponRollTables ?? []).filter((table) => table.entries.some((entry) => entry.text.trim().length > 0))
      return (
        <div className="item-detail-display">
          <h3>{weapon.name?.trim() || weapon.typeName || 'Weapon'}</h3>
          {weapon.name?.trim() && weapon.typeName ? <p className="item-detail-display-subtitle">{weapon.typeName}</p> : null}
          <div className="item-detail-display-grid">
            {(weapon.damageDiceCount && weapon.damageDiceSides) ? (
              <div>
                <span className="item-detail-field-label">Damage</span>
                <p>{weapon.damageDiceCount}d{weapon.damageDiceSides}</p>
              </div>
            ) : null}
            {hasRange ? (
              <div>
                <span className="item-detail-field-label">Range</span>
                <p>{weapon.rangeShort}/{weapon.rangeMedium}/{weapon.rangeLong}</p>
              </div>
            ) : null}
            {detailItem.costGp > 0 ? (
              <div>
                <span className="item-detail-field-label">Cost</span>
                <p>{detailItem.costGp} gp</p>
              </div>
            ) : null}
            {bonusBits.length > 0 ? (
              <div>
                <span className="item-detail-field-label">Bonuses</span>
                <p>{bonusBits.join(' | ')}</p>
              </div>
            ) : null}
          </div>
          {tags.length > 0 ? (
            <div className="item-detail-tag-list">
              {tags.map((tag) => <span key={tag} className="item-detail-tag">{tag}</span>)}
            </div>
          ) : null}
          {detailItem.description?.trim() ? (
            <div className="item-detail-display-section">
              <span className="item-detail-field-label">Description</span>
              <p>{detailItem.description}</p>
            </div>
          ) : null}
          {effects.length > 0 ? (
            <div className="item-detail-display-section">
              <span className="item-detail-field-label">Special Effects</span>
              <ul className="item-detail-list">
                {effects.map((line, index) => <li key={`${weapon.id}-effect-${index}`}>{line}</li>)}
              </ul>
            </div>
          ) : null}
          {tables.length > 0 ? (
            <div className="item-detail-display-section">
              <span className="item-detail-field-label">Roll Tables</span>
              <div className="item-detail-roll-tables">
                {tables.map((table) => (
                  <div key={table.id} className="item-detail-roll-table">
                    <strong>{table.name || 'Unnamed Table'}{table.dieSides ? ` (d${table.dieSides})` : ''}</strong>
                    <ul className="item-detail-list">
                      {table.entries.filter((entry) => entry.text.trim().length > 0).map((entry) => (
                        <li key={entry.id}><strong>{entry.roll}:</strong> {entry.text}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {detailItem.notes.trim() ? (
            <div className="item-detail-display-section">
              <span className="item-detail-field-label">Notes</span>
              <p>{detailItem.notes}</p>
            </div>
          ) : null}
        </div>
      )
    }
    if (detailItem.kind === 'armour') {
      const armour = detailItem as CharacterArmourItem
      const tags: string[] = []
      if (armour.isMagic) tags.push('Magic')
      if (armour.armourType === 'shield') tags.push('Shield')
      return (
        <div className="item-detail-display">
          <h3>{armour.name?.trim() || armour.typeName || 'Armour'}</h3>
          {armour.name?.trim() && armour.typeName ? <p className="item-detail-display-subtitle">{armour.typeName}</p> : null}
          <div className="item-detail-display-grid">
            {(armour.armourType === 'shield' ? armour.shieldMod : armour.armourClass).trim() ? (
              <div>
                <span className="item-detail-field-label">{armour.armourType === 'shield' ? 'Shield Mod' : 'Armour Class'}</span>
                <p>{armour.armourType === 'shield' ? armour.shieldMod : armour.armourClass}</p>
              </div>
            ) : null}
            {armour.magicMod.trim() ? (
              <div>
                <span className="item-detail-field-label">Magic Mod</span>
                <p>{armour.magicMod}</p>
              </div>
            ) : null}
            {detailItem.costGp > 0 ? (
              <div>
                <span className="item-detail-field-label">Cost</span>
                <p>{detailItem.costGp} gp</p>
              </div>
            ) : null}
          </div>
          {tags.length > 0 ? (
            <div className="item-detail-tag-list">
              {tags.map((tag) => <span key={tag} className="item-detail-tag">{tag}</span>)}
            </div>
          ) : null}
          {detailItem.description?.trim() ? (
            <div className="item-detail-display-section">
              <span className="item-detail-field-label">Description</span>
              <p>{detailItem.description}</p>
            </div>
          ) : null}
          {detailItem.notes.trim() ? (
            <div className="item-detail-display-section">
              <span className="item-detail-field-label">Notes</span>
              <p>{detailItem.notes}</p>
            </div>
          ) : null}
        </div>
      )
    }
    if (detailItem.kind === 'consumable') {
      const consumable = detailItem as CharacterConsumableItem
      const isTorch = detailItem.typeId === 'con-torches'
      const isOil = detailItem.typeId === 'con-oil'
      const isLitTorch = isTorch && consumable.lit
      const consumableTitle = isLitTorch
        ? (detailItem.name?.trim() || 'Torch')
        : (detailItem.name?.trim() || detailItem.typeName || 'Consumable')
      return (
        <div className="item-detail-display">
          <h3>{consumableTitle}</h3>
          {!isLitTorch && detailItem.name?.trim() && detailItem.typeName ? <p className="item-detail-display-subtitle">{detailItem.typeName}</p> : null}
          <div className="item-detail-display-grid">
            {!isLitTorch ? (
              <div>
                <span className="item-detail-field-label">Qty</span>
                <p>{detailItem.qty}</p>
              </div>
            ) : null}
            {detailItem.costGp > 0 ? (
              <div>
                <span className="item-detail-field-label">Cost</span>
                <p>{detailItem.costGp} gp</p>
              </div>
            ) : null}
            {isLitTorch ? (
              <div>
                <span className="item-detail-field-label">Burns</span>
                <p>{consumable.turnsRemaining ?? 0}/6 turns</p>
              </div>
            ) : null}
            {isOil ? (
              <div>
                <span className="item-detail-field-label">Fuel</span>
                <p>{consumable.amountRemaining ?? 24}/24</p>
              </div>
            ) : null}
          </div>
          {detailItem.description?.trim() ? (
            <div className="item-detail-display-section">
              <span className="item-detail-field-label">Description</span>
              <p>{detailItem.description}</p>
            </div>
          ) : null}
          {consumable.effectText?.trim() ? (
            <div className="item-detail-display-section">
              <span className="item-detail-field-label">Effect</span>
              <p>{consumable.effectText}</p>
            </div>
          ) : null}
          {detailItem.notes.trim() ? (
            <div className="item-detail-display-section">
              <span className="item-detail-field-label">Notes</span>
              <p>{detailItem.notes}</p>
            </div>
          ) : null}
        </div>
      )
    }
    const isLantern = detailItem.kind === 'general' && detailItem.typeId === 'gear-lantern'
    const lantern = isLantern ? detailItem as CharacterGeneralItem : null
    return (
      <div className="item-detail-display">
        <h3>{detailItem.name?.trim() || detailItem.typeName || 'Item'}</h3>
        {detailItem.name?.trim() && detailItem.typeName ? <p className="item-detail-display-subtitle">{detailItem.typeName}</p> : null}
        <div className="item-detail-display-grid">
          {detailItem.kind === 'ammunition' ? (
            <>
              <div>
                <span className="item-detail-field-label">Qty</span>
                <p>{detailItem.qty}</p>
              </div>
              {(detailItem as CharacterAmmunitionItem).spent ? (
                <div>
                  <span className="item-detail-field-label">Spent</span>
                  <p>{(detailItem as CharacterAmmunitionItem).spent}</p>
                </div>
              ) : null}
            </>
          ) : null}
          {isLantern ? (
            <div>
              <span className="item-detail-field-label">Fuel</span>
              <p>{lantern!.turnsRemaining ?? 0}/24{lantern!.lit ? ' (lit)' : ''}</p>
            </div>
          ) : null}
          {detailItem.costGp > 0 ? (
            <div>
              <span className="item-detail-field-label">Cost</span>
              <p>{detailItem.costGp} gp</p>
            </div>
          ) : null}
        </div>
        {isLantern && (lantern!.turnsRemaining ?? 0) <= 0 ? (
          <p className="character-enc-help">Empty — needs oil</p>
        ) : null}
        {detailItem.description?.trim() ? (
          <div className="item-detail-display-section">
            <span className="item-detail-field-label">Description</span>
            <p>{detailItem.description}</p>
          </div>
        ) : null}
        {detailItem.notes.trim() ? (
          <div className="item-detail-display-section">
            <span className="item-detail-field-label">Notes</span>
            <p>{detailItem.notes}</p>
          </div>
        ) : null}
      </div>
    )
  }
  // Build slot rendering arrays from unified inventory
  const applyPlayerAddTemplate = (
    kind: 'general' | 'weapon' | 'armour' | 'ammunition',
    templateId: string,
  ) => {
    setAddItemModal((current) => current ? applyPlayerAddTemplateState(current, kind, templateId) : current)
  }

  const toggleItemEquip = (item: CharacterInventoryItem, checked: boolean) => {
    // Block packing lit torches
    if (!checked && item.kind === 'consumable' && (item as CharacterConsumableItem).lit) return
    if (item.kind === 'weapon') {
      updateWeaponRow(item.id, { equipped: checked })
    } else if (item.kind === 'armour') {
      updateArmourRow(item.id, { equipped: checked })
    } else if (!checked && item.kind === 'general' && (item as CharacterGeneralItem).lit) {
      // Auto-extinguish lit lantern when packing
      updateInventoryItem(item.id, { equipped: false, lit: false })
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

    // Oil flask — show (empty) when drained
    if (item.kind === 'consumable' && item.typeId === 'con-oil') {
      const fuel = (item as CharacterConsumableItem).amountRemaining ?? 24
      if (fuel <= 0) return `${label} (empty)`
      return fuel < 24 ? `${label} (${fuel}/24)` : label
    }

    // Lantern — always show fuel status
    if (item.kind === 'general' && item.typeId === 'gear-lantern') {
      const g = item as CharacterGeneralItem
      const fuel = g.turnsRemaining ?? 0
      if (g.lit) {
        return (
          <span className="item-slot-lit">
            {label} (lit) ●{fuel}/24{' '}
            <button
              type="button"
              className="item-tick-btn"
              onClick={(e) => { e.stopPropagation(); tickDown(item.id) }}
              disabled={!canEditSelected}
              aria-label="Tick down turn"
            >
              −
            </button>
          </span>
        )
      }
      if (fuel <= 0) return `${label} (empty)`
      if (fuel >= 24) return `${label} (full)`
      return `${label} (${fuel}/24)`
    }

    // Torch — use clean label since catalog name includes "(6)"
    if (item.kind === 'consumable' && item.typeId === 'con-torches') {
      const t = item as CharacterConsumableItem
      const torchLabel = item.name?.trim() || 'Torches'
      if (t.lit) {
        return (
          <span className="item-slot-lit">
            Torch (lit) ●{t.turnsRemaining ?? 0}/6{' '}
            <button
              type="button"
              className="item-tick-btn"
              onClick={(e) => { e.stopPropagation(); tickDown(item.id) }}
              disabled={!canEditSelected}
              aria-label="Tick down turn"
            >
              −
            </button>
          </span>
        )
      }
      return qty > 1 ? `${torchLabel} (${qty})` : qty === 1 ? `${torchLabel} (1)` : `${torchLabel} (spent)`
    }

    // Ammo with spent
    if (item.kind === 'ammunition' && (item as CharacterAmmunitionItem).spent) {
      return `${label} (${qty}) [${(item as CharacterAmmunitionItem).spent} spent]`
    }

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
  const renderInlineInventoryAction = (item: CharacterInventoryItem) => {
    if (isGuidedCreation) return null

    if (item.kind === 'ammunition' && canFireAmmo(item.id).ok) {
      return (
        <button
          type="button"
          className="item-fire-pill"
          onClick={() => fireAmmo(item.id)}
          disabled={!canEditSelected}
        >
          Fire
        </button>
      )
    }

    if (item.kind === 'consumable' && (item.qty ?? 0) > 0) {
      if (item.typeId === 'con-rations-iron' || item.typeId === 'con-rations-standard') {
        return (
          <button
            type="button"
            className="item-fire-pill"
            onClick={() => consumeOne(item.id)}
            disabled={!canEditSelected}
          >
            Eat
          </button>
        )
      }
      if (item.typeId === 'con-wine') {
        return (
          <button
            type="button"
            className="item-fire-pill"
            onClick={() => consumeOne(item.id)}
            disabled={!canEditSelected}
          >
            Drink
          </button>
        )
      }
      if (item.typeId === 'con-iron-spikes') {
        return (
          <button
            type="button"
            className="item-fire-pill"
            onClick={() => consumeOne(item.id)}
            disabled={!canEditSelected}
          >
            Use
          </button>
        )
      }
      if (item.typeId === 'con-torches' && !item.lit && item.equipped && hasIgnitionSource()) {
        return (
          <button
            type="button"
            className="item-fire-pill"
            onClick={() => lightTorch(item.id)}
            disabled={!canEditSelected}
          >
            Light
          </button>
        )
      }
    }

    if (
      item.kind === 'general'
      && item.typeId === 'gear-lantern'
      && !item.lit
      && (item.turnsRemaining ?? 0) > 0
      && item.equipped
      && hasIgnitionSource()
    ) {
      return (
        <button
          type="button"
          className="item-fire-pill"
          onClick={() => lightLantern(item.id)}
          disabled={!canEditSelected}
        >
          Light
        </button>
      )
    }

    return null
  }
  const packedRejectionNodes = rejections
    .filter((r) => r.characterId === effectiveSelected?.id)
    .map((r) => (
        <p key={r.id} className="error character-approval-rejection">
          {r.action === 'sell'
            ? `GM did not approve selling ${r.item?.typeName ?? 'item'}`
            : r.action === 'learn_spell'
              ? `GM did not approve spell transcription${r.spellNames?.length ? ` (${r.spellNames.join(', ')})` : ''}`
              : r.action === 'ability_reroll'
                ? 'GM did not approve your ability score re-roll'
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
    ))
  const { uploadCharacterTokenImage, uploadCharacterPortraitImage } = useCharacterMedia({
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

  const {
    createCharacterModalOpen,
    setCreateCharacterModalOpen,
    finalizeConfirmOpen,
    setFinalizeConfirmOpen,
    finalizeError,
    holySymbolRequiredOpen,
    setHolySymbolRequiredOpen,
    addCharacter,
    requestFinalizeCharacter,
    finalizeCharacter,
  } = useCharacterRoster({
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
    updateInventoryItem,
    updateWeaponRow,
    updateArmourRow,
    openAddItemModal,
    saveAddItem,
    dropItem,
    sellItem,
    spendGold,
    setInventoryGold,
    hasIgnitionSource,
    consumeOne,
    lightTorch,
    tickDown,
    canFireAmmo,
    fireAmmo,
    retrieveAmmo,
    throwOil,
    pourOil,
    lightLantern,
    extinguishLantern,
    addItemsToInventory,
    setInventoryGoldForCharacter,
  } = useInventoryDomain({
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

  // Clear justSeeded AFTER all init effects have run (effect order matters —
  // this must be defined after the init effects so they can see justSeeded as true)
  useEffect(() => {
    if (!selectedCharacterId) return
    justSeededRef.current.delete(selectedCharacterId)
  })

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
                  readOnly
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
    <CharacterThiefSkillsSection
      characterId={effectiveSelected.id}
      selectedThiefSkills={selectedThiefSkills}
      thiefRemainingExpertisePoints={thiefRemainingExpertisePoints}
      canEditSelected={canEditSelected}
      thiefSkillRows={thiefSkillRows}
      defaultThiefSkills={defaultThiefSkills}
      setThiefSkillsByCharacterId={setThiefSkillsByCharacterId}
    />
  ) : null)

  const renderLanguagesSection = () => (
    <section className="monster-section-block">
      <h3 className="monster-section-title">Languages</h3>
      <BlurSyncedTextarea
        className="character-sheet-textarea short"
        value={effectiveSelected ? (languagesTextByCharacterId[effectiveSelected.id] ?? '') : ''}
        onCommit={(value) => {
          if (!effectiveSelected) return
          setLanguagesTextByCharacterId((current) => ({
            ...current,
            [effectiveSelected.id]: value,
          }))
        }}
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
            {!isMobile && (effectiveSelected || effectiveGrantMode) ? (
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
                  {canSetCurrentCharacter && effectiveSelected && !effectiveGrantMode ? (
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
                  {isInFinalizationFlow && canEditSelected && !effectiveGrantMode ? (
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
                  {canSelectedLevelUp && !effectiveGrantMode ? (
                    <button
                      type="button"
                      className="character-current-action character-levelup-action"
                      onClick={openLevelUpModal}
                      disabled={!canEditSelected}
                      aria-label="Level up character"
                    >
                      <Sparkles size={14} />
                      <span>Level Up</span>
                    </button>
                  ) : null}
                  {canAssignCharacter ? (
                    <button
                      type="button"
                      className="character-current-action"
                      onClick={openPlayerAssignment}
                      aria-label="Give character to player"
                    >
                      <span>Give to Player</span>
                    </button>
                  ) : null}
                  {effectiveGrantMode ? (
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
            {isSinglePane && !embeddedMode ? (
              <div className="monster-detail-header-row">
                {effectiveSelected || effectiveGrantMode ? (
                  <button
                    type="button"
                    className="back-link monster-mobile-back"
                    onClick={() => {
                      if (effectiveGrantMode) {
                        exitGrantMode()
                      } else {
                        setPaneView('list')
                      }
                    }}
                    aria-label="Back to character list"
                  >
                    <ChevronLeft size={16} />
                  </button>
                ) : <span />}
                {canSetCurrentCharacter && effectiveSelected && !effectiveGrantMode ? (
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
                {isInFinalizationFlow && canEditSelected && !effectiveGrantMode ? (
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
                {canSelectedLevelUp && !effectiveGrantMode ? (
                  <button
                    type="button"
                    className="character-current-action character-levelup-action"
                    onClick={openLevelUpModal}
                    disabled={!canEditSelected}
                    aria-label="Level up character"
                  >
                    <Sparkles size={14} />
                    <span>Level Up</span>
                  </button>
                ) : null}
              </div>
            ) : null}

            {finalizeError ? <p className="error">{finalizeError}</p> : null}

            {effectiveGrantMode ? (
              <div className="monster-editor-grid character-editor-grid">
                <section className="character-sheet">
                  <div className="character-sheet-main-grid">
                    <div className="character-sheet-left">
                      <section className="monster-section-block">
                        <div className="section-head">
                          <h3 className="monster-section-title">Grant Builder</h3>
                          <span className="character-roll-points">{selectedGrantTargetIds.length} selected</span>
                        </div>
                        <p className="character-enc-help">Build a grant package, then choose target characters.</p>
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

                      {isMobile ? (
                        <section className="monster-section-block">
                          <div className="section-head">
                            <h3 className="monster-section-title">Select Targets</h3>
                            <button
                              type="button"
                              className="monster-example-btn"
                              onClick={selectAllGrantTargets}
                              disabled={grantBusy || sortedCharacters.length === 0}
                            >
                              Select All
                            </button>
                            <button
                              type="button"
                              className="monster-example-btn"
                              onClick={clearGrantTargets}
                              disabled={grantBusy || selectedGrantTargetIds.length === 0}
                            >
                              Clear
                            </button>
                          </div>
                          <div className="character-grant-mobile-targets">
                            {sortedCharacters.map((character) => {
                              const selected = !!grantTargetIds[character.id]
                              return (
                                <button
                                  key={`mobile-target-${character.id}`}
                                  type="button"
                                  className={selected ? 'character-grant-mobile-target selected' : 'character-grant-mobile-target'}
                                  onClick={() => toggleGrantTarget(character.id, !selected)}
                                  disabled={grantBusy}
                                  aria-pressed={selected}
                                >
                                  <strong>{character.name}</strong>
                                  <small>L{character.level} {character.className}</small>
                                </button>
                              )
                            })}
                          </div>
                        </section>
                      ) : null}
                    </div>

                    <div className="character-sheet-right">
                      <section className="monster-section-block">
                        <div className="section-head">
                          <h3 className="monster-section-title">Targets</h3>
                          <button
                            type="button"
                            className="monster-example-btn"
                            onClick={selectAllGrantTargets}
                            disabled={grantBusy || sortedCharacters.length === 0}
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            className="monster-example-btn"
                            onClick={clearGrantTargets}
                            disabled={grantBusy || selectedGrantTargetIds.length === 0}
                          >
                            Clear
                          </button>
                        </div>
                        {selectedGrantTargetIds.length === 0 ? <p className="character-enc-help">Choose one or more targets to preview and grant.</p> : (
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
                            onClick={clearGrantDraftAndTargets}
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
              <p>{embeddedMode ? "You don't have a character, yet." : 'Select a character from the list.'}</p>
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
                                    updateSelectedCharacterSystem({ className: nextClass, hpCurrent: 0, hpMax: 0 })
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
                                onUploadPortraitImage={uploadCharacterPortraitImage}
                                onUploadTokenImage={uploadCharacterTokenImage}
                                portraitAltLabel="Character portrait"
                                tokenButtonAriaLabel="Edit character token icon"
                                removePortraitMessage="Remove the portrait image from this character?"
                                disabled={!canEditSelected}
                                showDeadOverlay={effectiveSelected.hpCurrent <= 0}
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
                                  onClick={requestAbilityScoreRoll}
                                  disabled={!canEditSelected || hasPendingAbilityReroll}
                                >
                                  {hasRolledAbilityScores && role !== 'gm'
                                    ? hasPendingAbilityReroll ? 'Re-roll Pending' : 'Request Re-roll'
                                    : hasRolledAbilityScores ? 'Re-roll' : 'Roll'}
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
                                    onChange={(event) =>
                                      updateSelectedCharacterSystem({ hpMax: Number(event.target.value || 0) })
                                    }
                                    readOnly={isGuidedCreation || !canEditSelected}
                                    disabled={isGuidedCreation || !canEditSelected}
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
                                    readOnly
                                    disabled
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
                                onUploadPortraitImage={uploadCharacterPortraitImage}
                                onUploadTokenImage={uploadCharacterTokenImage}
                                portraitAltLabel="Character portrait"
                                tokenButtonAriaLabel="Edit character token icon"
                                removePortraitMessage="Remove the portrait image from this character?"
                                disabled={!canEditSelected}
                                showDeadOverlay={effectiveSelected.hpCurrent <= 0}
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
                        <BlurSyncedTextarea
                          className="character-sheet-textarea short"
                          value={effectiveSelected ? (unencumberingItemsTextByCharacterId[effectiveSelected.id] ?? '') : ''}
                          onCommit={(value) => {
                            if (!effectiveSelected) return
                            setUnencumberingItemsTextByCharacterId((current) => ({
                              ...current,
                              [effectiveSelected.id]: value,
                            }))
                          }}
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
                                {!isGuidedCreation ? renderInlineInventoryAction(entry.item) : null}
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

                        {selectedClassName === 'Magic-User' || selectedClassName === 'Elf' || selectedClassName === 'Cleric' || selectedMemorizedSpells.length > 0 ? (
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

                      <CharacterPackedItemsSection
                        packedSlotItems={packedSlotItems}
                        packedStrengthSlotCount={packedStrengthSlotCount}
                        packedSlotLabels={packedSlotLabels}
                        packedSlotThresholds={packedSlotThresholds}
                        packedMovementBands={packedMovementBands}
                        selectedStr={selectedStr}
                        canEditSelected={canEditSelected}
                        isGuidedCreation={isGuidedCreation}
                        equippedSlotItemsLength={equippedSlotItems.length}
                        equippedRowCount={equippedRowCount}
                        packedItemsLength={packedItems.length}
                        availablePackedSlotCount={availablePackedSlotIndices.length}
                        overflowFeedback={overflowFeedback}
                        approvalPendingFeedback={approvalPendingFeedback}
                        rejectionNodes={packedRejectionNodes}
                        onToggleItemEquip={toggleItemEquip}
                        onOpenItemDetail={setItemDetailId}
                        onRefundItem={refundItem}
                        onOpenAddItemModal={() => openAddItemModal(false)}
                        renderInlineAction={renderInlineInventoryAction}
                      />
                      <p className="character-enc-help">
                          <strong>Current movement:</strong> {currentPackedMovement}
                        </p>
                        <p className="character-enc-help">
                          All other equipment, packed into sacks, backpacks, etc. In combat, retrieving a packed item
                          optionally takes one round. STR modifier (optional): Optionally, remove slots at the top of
                          the list based on the character&apos;s STR score. If not using this optional rule: Remove the top
                          3 slots.
                        </p>
                    </div>

                    <section className="monster-section-block">
                      <h3 className="monster-section-title">Other Notes</h3>
                      <p className="character-enc-help centered">Spells, mounts, retainers, areas explored, clues.</p>
                      <BlurSyncedTextarea
                        className="character-sheet-textarea"
                        value={effectiveSelected ? (otherNotesTextByCharacterId[effectiveSelected.id] ?? '') : ''}
                        onCommit={(value) => {
                          if (!effectiveSelected) return
                          setOtherNotesTextByCharacterId((current) => ({
                            ...current,
                            [effectiveSelected.id]: value,
                          }))
                        }}
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
      <CreateCharacterModal
        open={createCharacterModalOpen}
        onAdd={addCharacter}
        onClose={() => setCreateCharacterModalOpen(false)}
      />
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
        const isTransferableDetailItem = detailItem.kind !== 'gold' && !isSpellBookDetailItem
        const canEditDetailItemFields = canEditInventoryDetails
        const canEditDetailItemName = canEditSelected
        const isActiveCharacter = effectiveSelected?.creationStatus === 'active'
        const pendingOutgoingTransfer = effectiveSelected && isTransferableDetailItem
          ? outgoingTransferByItemKey.get(`${effectiveSelected.id}:${detailItem.id}`) ?? null
          : null
        const selectedSpellBookSpell = spellBookSelectedSpellId ? arcaneSpellById[spellBookSelectedSpellId] : null
        const itemKindLabel = detailItem.kind === 'weapon' ? 'Weapon'
          : detailItem.kind === 'armour' ? 'Armour'
          : detailItem.kind === 'ammunition' ? 'Ammunition'
          : detailItem.kind === 'gold' ? 'Gold'
          : detailItem.kind === 'consumable' ? 'Consumable'
          : detailItem.kind === 'treasure' ? 'Treasure'
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
              ) : !canEditDetailItemFields && !isSpellBookDetailItem ? (
                renderReadOnlyItemDetail(detailItem)
              ) : detailItem.kind === 'weapon' ? (() => {
                const w = detailItem as CharacterWeaponItem
                return (
                  <div className="item-detail-weapon-form">
                    <label className="character-weapon-primary-field">
                      Template
                      <select
                        value={w.typeId || 'custom'}
                        onChange={(e) => updateWeaponRow(w.id, { typeId: e.target.value })}
                        disabled={!canEditDetailItemFields}
                      >
                        <option value="custom">Custom</option>
                        {OSE_WEAPON_CATALOG.map((weapon) => (
                          <option
                            key={weapon.id}
                            value={weapon.id}
                            disabled={!isWeaponTemplateAllowedForClass(weapon.id, selectedClassName)}
                          >
                            {weapon.name}
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
                        disabled={!canEditDetailItemName}
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
                          disabled={!canEditDetailItemFields}
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
                            disabled={!canEditDetailItemFields}
                          />
                          <select
                            value={w.damageDiceSides ?? ''}
                            onChange={(e) => updateWeaponRow(w.id, { damageDiceSides: e.target.value })}
                            disabled={!canEditDetailItemFields}
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
                            disabled={!canEditDetailItemFields}
                          />
                          <span>/</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={w.rangeMedium ?? ''}
                            onChange={(e) => updateWeaponRow(w.id, { rangeMedium: e.target.value })}
                            disabled={!canEditDetailItemFields}
                          />
                          <span>/</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={w.rangeLong ?? ''}
                            onChange={(e) => updateWeaponRow(w.id, { rangeLong: e.target.value })}
                            disabled={!canEditDetailItemFields}
                          />
                        </div>
                      </label>
                      <label className="character-weapon-edit-field">
                        Cost
                        <div className="character-inline-unit-field">
                          <input
                            type="text"
                            value={w.costGp ?? 0}
                            onChange={(e) => updateInventoryItem(w.id, { costGp: Number.parseFloat(e.target.value) || 0 })}
                            disabled={!canEditDetailItemFields}
                          />
                          <span>gp</span>
                        </div>
                      </label>
                    </div>
                    <label className="character-weapon-card-check">
                        <input
                          type="checkbox"
                          checked={w.slow}
                          onChange={(e) => updateWeaponRow(w.id, { slow: e.target.checked })}
                          disabled={!canEditDetailItemFields || (!!w.typeId && w.typeId !== 'custom')}
                      />
                      Slow
                    </label>
                    <label className="character-weapon-card-check">
                        <input
                          type="checkbox"
                          checked={w.twoHanded}
                          onChange={(e) => updateWeaponRow(w.id, { twoHanded: e.target.checked })}
                          disabled={!canEditDetailItemFields || (!!w.typeId && w.typeId !== 'custom') || selectedClassName === 'Halfling'}
                      />
                      Two-handed
                    </label>
                    <div className="character-weapon-magic-row">
                      <label className="character-weapon-card-check">
                        <input
                          type="checkbox"
                          checked={w.isMagic}
                          onChange={(e) => updateWeaponRow(w.id, { isMagic: e.target.checked })}
                          disabled={!canEditDetailItemFields}
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
                            disabled={!canEditDetailItemFields}
                          />
                        </label>
                      ) : null}
                    </div>
                    <label className="character-weapon-edit-field">
                      Notes
                      <BlurSyncedTextarea
                        value={w.notes}
                        onCommit={(value) => updateWeaponRow(w.id, { notes: value })}
                        disabled={!canEditDetailItemFields}
                        placeholder="Description, magic properties, etc."
                        rows={3}
                      />
                    </label>
                  </div>
                )
              })() : detailItem.kind === 'armour' ? (() => {
                const a = detailItem as CharacterArmourItem
                return (
                  <div className="item-detail-weapon-form">
                    <label className="character-weapon-primary-field">
                      Template
                      <select
                        value={a.typeId || 'custom'}
                        onChange={(e) => updateArmourRow(a.id, { typeId: e.target.value })}
                        disabled={!canEditDetailItemFields || !canClassEquipArmour}
                      >
                        <option value="custom">Custom</option>
                        {OSE_ARMOUR_CATALOG.map((armour) => (
                          <option
                            key={armour.id}
                            value={armour.id}
                            disabled={!isArmourTemplateAllowedForClass(armour.id, selectedClassName)}
                          >
                            {armour.name}
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
                        disabled={!canEditDetailItemName}
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
                          disabled={!canEditDetailItemFields}
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
                          disabled={!canEditDetailItemFields}
                        />
                      </label>
                      <label className="character-weapon-edit-field">
                        Type
                        <select
                          value={a.armourType}
                          onChange={(e) => updateArmourRow(a.id, { armourType: e.target.value as 'body' | 'shield' })}
                          disabled={!canEditDetailItemFields}
                        >
                          <option value="body">Body Armour</option>
                          <option value="shield">Shield</option>
                        </select>
                      </label>
                      <label className="character-weapon-edit-field">
                        Cost
                        <div className="character-inline-unit-field">
                          <input
                            type="text"
                            value={a.costGp ?? 0}
                            onChange={(e) => updateInventoryItem(a.id, { costGp: Number.parseFloat(e.target.value) || 0 })}
                            disabled={!canEditDetailItemFields}
                          />
                          <span>gp</span>
                        </div>
                      </label>
                    </div>
                    <div className="character-weapon-magic-row">
                      <label className="character-weapon-card-check">
                        <input
                          type="checkbox"
                          checked={a.isMagic}
                          onChange={(e) => updateArmourRow(a.id, { isMagic: e.target.checked })}
                          disabled={!canEditDetailItemFields}
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
                            disabled={!canEditDetailItemFields}
                          />
                        </label>
                      ) : null}
                    </div>
                    <label className="character-weapon-edit-field">
                      Notes
                      <BlurSyncedTextarea
                        value={a.notes}
                        onCommit={(value) => updateArmourRow(a.id, { notes: value })}
                        disabled={!canEditDetailItemFields}
                        placeholder="Description, magic properties, etc."
                        rows={3}
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
                      disabled={!canEditDetailItemFields}
                    />
                  </label>
                  <label className="item-detail-field">
                    <span className="item-detail-field-label">Name (Optional)</span>
                    <input
                      type="text"
                      value={detailItem.name ?? ''}
                      onChange={(e) => updateInventoryItem(detailItem.id, { name: e.target.value })}
                      disabled={!canEditDetailItemName}
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
                        disabled={!canEditDetailItemFields}
                      />
                    </label>
                  ) : null}
                  {detailItem.kind === 'consumable' ? (
                    <>
                      <label className="item-detail-field">
                        <span className="item-detail-field-label">Effect</span>
                        <BlurSyncedTextarea
                          className="item-detail-notes"
                          value={(detailItem as CharacterConsumableItem).effectText ?? ''}
                          onCommit={(value) => updateInventoryItem(detailItem.id, { effectText: value })}
                          disabled={!canEditDetailItemFields}
                          placeholder="Optional effect description"
                          rows={2}
                        />
                      </label>
                    </>
                  ) : null}
                  <label className="item-detail-field">
                    <span className="item-detail-field-label">Notes</span>
                    <BlurSyncedTextarea
                      className="item-detail-notes"
                      value={detailItem.notes}
                      onCommit={(value) => updateInventoryItem(detailItem.id, { notes: value })}
                      disabled={!canEditDetailItemFields}
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
                {canEditSelected && isActiveCharacter ? (
                  <>
                    {detailItem.kind === 'consumable' && detailItem.typeId === 'con-torches' && !((detailItem as CharacterConsumableItem).lit) && (detailItem.qty > 0) ? (
                      <button type="button" onClick={() => {
                        if (!detailItem.equipped || !hasIgnitionSource()) { setCantLightOpen(true); return }
                        lightTorch(detailItem.id)
                      }}>Light</button>
                    ) : null}
                    {detailItem.kind === 'consumable' && (detailItem as CharacterConsumableItem).lit ? (
                      <button type="button" onClick={() => tickDown(detailItem.id)}>Tick Down</button>
                    ) : null}
                    {detailItem.kind === 'consumable' && detailItem.typeId === 'con-oil' ? (
                      <>
                        <button type="button" className="confirm-danger" onClick={() => throwOil(detailItem.id)}>Throw</button>
                        {(() => {
                          const lanterns = selectedInventory.filter((i): i is CharacterGeneralItem => i.kind === 'general' && i.typeId === 'gear-lantern')
                          if (lanterns.length === 0) return null
                          if (lanterns.length === 1) {
                            return <button type="button" onClick={() => pourOil(detailItem.id, lanterns[0].id)}>Pour into Lantern</button>
                          }
                          return lanterns.map((l) => (
                            <button key={l.id} type="button" onClick={() => pourOil(detailItem.id, l.id)}>
                              Pour into {l.name?.trim() || 'Lantern'}
                            </button>
                          ))
                        })()}
                      </>
                    ) : null}
                    {detailItem.kind === 'consumable' && detailItem.typeId !== 'con-torches' && detailItem.typeId !== 'con-oil' && !((detailItem as CharacterConsumableItem).lit) && (detailItem.qty > 0) ? (
                      <button type="button" onClick={() => consumeOne(detailItem.id)}>
                        {detailItem.typeId === 'con-rations-iron' || detailItem.typeId === 'con-rations-standard'
                          ? 'Eat'
                          : detailItem.typeId === 'con-wine'
                            ? 'Drink'
                            : 'Use'}
                      </button>
                    ) : null}
                    {detailItem.kind === 'ammunition' ? (
                      <>
                        <button type="button" onClick={() => {
                          const check = canFireAmmo(detailItem.id)
                          if (!check.ok) { setCantFireMessage(check.reason ?? "Can't fire."); return }
                          fireAmmo(detailItem.id)
                        }}>Fire</button>
                        {((detailItem as CharacterAmmunitionItem).spent ?? 0) > 0 ? (
                          <button type="button" onClick={() => retrieveAmmo(detailItem.id)}>Retrieve</button>
                        ) : null}
                      </>
                    ) : null}
                    {detailItem.kind === 'general' && detailItem.typeId === 'gear-lantern' ? (
                      <>
                        {(detailItem as CharacterGeneralItem).lit ? (
                          <>
                            <button type="button" onClick={() => tickDown(detailItem.id)}>Tick Down</button>
                            <button type="button" onClick={() => extinguishLantern(detailItem.id)}>Extinguish</button>
                          </>
                        ) : (detailItem as CharacterGeneralItem).turnsRemaining && (detailItem as CharacterGeneralItem).turnsRemaining! > 0 ? (
                          <button type="button" onClick={() => {
                            if (!detailItem.equipped || !hasIgnitionSource()) { setCantLightOpen(true); return }
                            lightLantern(detailItem.id)
                          }}>Light</button>
                        ) : null}
                      </>
                    ) : null}
                  </>
                ) : null}
                {detailItem.kind !== 'gold' && !isSpellBookDetailItem ? (
                  <button
                    type="button"
                    onClick={() => {
                      toggleItemEquip(detailItem, !detailItem.equipped)
                      setItemDetailId(null)
                    }}
                    disabled={!canEditSelected || (detailItem.kind === 'consumable' && !!(detailItem as CharacterConsumableItem).lit)}
                  >
                    {detailItem.equipped ? 'Unequip' : 'Equip'}
                  </button>
                ) : null}
                {canEditSelected && detailItem.kind !== 'gold' && !isSpellBookDetailItem ? (
                  <button
                    type="button"
                    className="confirm-danger"
                    onClick={() => { setStackActionQty(detailItem.stack.stackable && detailItem.qty > 1 ? String(detailItem.qty) : ''); setDropConfirmItemId(detailItem.id) }}
                  >
                    Drop
                  </button>
                ) : null}
                {canEditSelected && detailItem.kind !== 'gold' && !isSpellBookDetailItem ? (
                  pendingOutgoingTransfer ? (
                    <button
                      type="button"
                      onClick={() => {
                        void cancelOutgoingTransfer(pendingOutgoingTransfer.id)
                      }}
                      disabled={transferBusy}
                    >
                      Cancel Offer to {pendingOutgoingTransfer.toCharacterName}
                    </button>
                  ) : null
                ) : null}
                {canEditSelected && detailItem.kind !== 'gold' && !isSpellBookDetailItem ? (
                  <button
                    type="button"
                    onClick={() => openTransferPickerForItem(detailItem as TransferableInventoryItem)}
                    disabled={transferBusy || transferTargets.length === 0 || !!pendingOutgoingTransfer}
                  >
                    Give to...
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
                        setStackActionQty(detailItem.stack.stackable && detailItem.qty > 1 ? String(detailItem.qty) : '')
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
              {pendingOutgoingTransfer ? (
                <p className="character-enc-help">Offered to {pendingOutgoingTransfer.toCharacterName}.</p>
              ) : null}
              {transferError && transferPickerOpen ? <p className="error">{transferError}</p> : null}
            </div>
          </div>
        )
      })()}
      <SpellbookAddModal
        open={spellBookAddModalOpen}
        className={selectedClassName}
        accessibleLevels={accessibleSpellLevels}
        tabLevel={spellBookAddTabLevel}
        pendingIds={spellBookPendingAddIds}
        expandedId={spellBookExpandedSpellId}
        selectedIds={selectedSpellBookSpellIds}
        pendingSpells={pendingSpellObjects}
        onTabChange={setSpellBookAddTabLevel}
        onExpandedChange={setSpellBookExpandedSpellId}
        onQueue={queueSpellForBook}
        onRemove={removePendingSpell}
        onCommit={commitPendingSpellsToBook}
        onClose={() => { setSpellBookAddModalOpen(false); setSpellBookPendingAddIds([]); setSpellBookExpandedSpellId(null) }}
      />
      <DivinePrepareModal
        open={divinePrepareModalOpen}
        className={selectedClassName}
        levels={preparedSpellLevels}
        tabLevel={divinePrepareTabLevel}
        expandedId={divinePrepareExpandedSpellId}
        draftIds={divinePreparedDraftIds}
        slotsPerDay={preparedSlotsPerDay}
        countsByLevel={divineDraftCountsByLevel}
        countsBySpellId={divineDraftCountsBySpellId}
        draftSpells={divinePreparedDraftSpells}
        onTabChange={setDivinePrepareTabLevel}
        onExpandedChange={setDivinePrepareExpandedSpellId}
        onPrepare={prepareDivineSpell}
        onRemove={removePreparedDivineSpell}
        onCommit={commitPreparedDivineSpells}
        onClear={clearPreparedDivineSpells}
        onClose={() => { setDivinePrepareModalOpen(false); setDivinePrepareExpandedSpellId(null) }}
      />
      <MemorizedSpellDetailModal
        spell={memorizedSpellDetail}
        description={memorizedSpellDetail ? renderSpellDescriptionBody(memorizedSpellDetail) : null}
        onClose={() => setMemorizedSpellDetailId(null)}
      />
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
      <TransferPickerModal
        open={transferPickerOpen}
        targets={transferTargets}
        targetCharacterId={transferTargetCharacterId}
        busy={transferBusy}
        error={transferError}
        quantity={transferQty}
        detailItem={itemDetailId ? selectedInventory.find((item) => item.id === itemDetailId) ?? null : null}
        onTargetChange={setTransferTargetCharacterId}
        onQuantityChange={setTransferQty}
        onClose={closeTransferPicker}
        onSubmit={(item) => void submitTransfer(item)}
      />
      <PlayerAssignmentModal
        open={playerAssignmentOpen}
        character={effectiveSelected}
        busy={assignmentBusy}
        options={assignmentOptions}
        targetUserId={effectiveAssignmentTargetUserId}
        onTargetChange={setAssignmentTargetUserId}
        onClose={closePlayerAssignment}
        onSubmit={() => void submitPlayerAssignment()}
      />
      <LevelUpModal
        open={levelUpModalOpen}
        character={effectiveSelected}
        targetLevel={levelUpTargetLevel}
        className={selectedClassName}
        flavor={levelUpFlavor}
        nextLevelXp={selectedNextLevelXp}
        checklist={levelUpChecklist}
        hitDie={selectedHitDie}
        hpGain={levelUpHpGain}
        hpRoll={levelUpHpRoll}
        applying={levelUpApplying}
        newFeatures={levelUpNewFeatures}
        error={levelUpError}
        onClose={closeLevelUpModal}
        onRoll={rollLevelUpHitPoints}
        onApply={applyLevelUp}
      />
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
      <DropItemDialog
        item={dropConfirmItemId ? selectedInventory.find((item) => item.id === dropConfirmItemId) ?? null : null}
        quantity={stackActionQty}
        onQuantityChange={setStackActionQty}
        onClose={() => setDropConfirmItemId(null)}
        onDrop={(quantity) => { if (dropConfirmItemId) void dropItem(dropConfirmItemId, quantity) }}
      />
      <SellItemDialog
        item={sellConfirmItemId ? selectedInventory.find((item) => item.id === sellConfirmItemId) ?? null : null}
        quantity={stackActionQty}
        onQuantityChange={setStackActionQty}
        onClose={() => setSellConfirmItemId(null)}
        onSell={(quantity) => { if (sellConfirmItemId) void sellItem(sellConfirmItemId, quantity) }}
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
        open={cantFireMessage !== null}
        title="Can't Fire"
        message={cantFireMessage ?? ''}
        confirmLabel="OK"
        onConfirm={() => setCantFireMessage(null)}
        onCancel={() => setCantFireMessage(null)}
      />
      <ConfirmModal
        open={cantLightOpen}
        title="Can't Light"
        message="To light this, you need it equipped and a fire source — an equipped tinderbox, or a lit torch or lantern (yours or another party member's)."
        confirmLabel="OK"
        onConfirm={() => setCantLightOpen(false)}
        onCancel={() => setCantLightOpen(false)}
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
