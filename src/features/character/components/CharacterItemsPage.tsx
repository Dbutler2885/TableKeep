import { Fragment } from 'react'
import { ShoppingBag } from 'lucide-react'
import type { CharacterInventoryItem, CharacterRecord } from '../../../types/app'
import type { useCharacterSheetState } from '../hooks/useCharacterSheetState'
import type { useSelectedCharacterDerivations } from '../hooks/useSelectedCharacterDerivations'
import type { useInventoryDomain } from '../hooks/useInventoryDomain'
import type { useSpellbookDomain } from '../hooks/useSpellbookDomain'
import type { useStoreDomain } from '../hooks/useStoreDomain'
import type { useItemApprovals } from '../hooks/useItemApprovals'
import type { deriveCharacterPermissions } from '../lib/characterPermissions'
import { equippedRowCount, packedMovementBands, packedSlotLabels, packedSlotThresholds, packedStrengthSlotCount } from '../lib/characterSheetLayout'
import { BlurSyncedTextarea } from './BlurSyncedTextarea'
import { CharacterPackedItemsSection } from './CharacterPackedItemsSection'
import { InlineInventoryAction } from './InlineInventoryAction'
import { itemSlotLabel } from './inventoryItemPresentation'

type Props = {
  character: CharacterRecord
  permissions: ReturnType<typeof deriveCharacterPermissions>
  derivations: ReturnType<typeof useSelectedCharacterDerivations>
  inventoryDomain: ReturnType<typeof useInventoryDomain>
  spellbookDomain: ReturnType<typeof useSpellbookDomain>
  storeDomain: ReturnType<typeof useStoreDomain>
  approvals: ReturnType<typeof useItemApprovals>
  sheetState: ReturnType<typeof useCharacterSheetState>
  overflowFeedback: string | null
  approvalPendingFeedback: string | null
  onOpenStore: () => void
  onOpenStoreClassRequired: () => void
  onOpenItemDetail: (itemId: string) => void
  onUpdateCharacter: (updates: Partial<CharacterRecord>) => void
}

export function CharacterItemsPage({
  character: effectiveSelected,
  permissions,
  derivations,
  inventoryDomain,
  spellbookDomain,
  storeDomain,
  approvals,
  sheetState,
  overflowFeedback,
  approvalPendingFeedback,
  onOpenStore,
  onOpenStoreClassRequired,
  onOpenItemDetail: setItemDetailId,
  onUpdateCharacter: updateSelectedCharacter,
}: Props) {
  const { canEditSelected, isGuidedCreation } = permissions
  const {
    selectedClassName, equippedItems, packedItems, selectedStr, availablePackedSlotIndices,
    currentPackedMovement, selectedNextLevelXp, selectedXpToNextLevel,
    selectedPrimeXpModifierPercent, primeRequisiteLabel,
  } = derivations
  const { tickDown, toggleItemEquip, openAddItemModal } = inventoryDomain
  const { refundItem } = storeDomain
  const {
    selectedMemorizedSpells, openDivinePrepareModal, canOpenDivinePrepareModal,
    setMemorizedSpellDetailId, consumeMemorizedSpell, preparedSlotsPerDay,
    memorizedCountsByLevel,
  } = spellbookDomain
  const {
    unencumberingItemsTextByCharacterId, otherNotesTextByCharacterId,
  } = sheetState.stateMaps
  const {
    setUnencumberingItemsTextByCharacterId, setOtherNotesTextByCharacterId,
  } = sheetState.stateSetters
  const getItemSlotLabel = (item: CharacterInventoryItem) =>
    itemSlotLabel(item, { onTickDown: tickDown, canEdit: canEditSelected })
  const equippedSlotItems = equippedItems.map((item) => ({
    item,
    label: getItemSlotLabel(item),
    onToggle: (checked: boolean) => toggleItemEquip(item, checked),
    isGold: item.kind === 'gold',
  }))
  const packedSlotItems = packedItems.map((item) => ({
    item,
    label: getItemSlotLabel(item),
    onToggle: (checked: boolean) => toggleItemEquip(item, checked),
    isGold: item.kind === 'gold',
  }))
  const renderInlineInventoryAction = (item: CharacterInventoryItem) => (
    <InlineInventoryAction
      item={item}
      inventoryDomain={inventoryDomain}
      isGuidedCreation={isGuidedCreation}
      canEdit={canEditSelected}
    />
  )
  const packedRejectionNodes = approvals.rejections
    .filter((rejection) => rejection.characterId === effectiveSelected.id)
    .map((rejection) => (
      <p key={rejection.id} className="error character-approval-rejection">
        {rejection.action === 'sell'
          ? `GM did not approve selling ${rejection.item?.typeName ?? 'item'}`
          : rejection.action === 'learn_spell'
            ? `GM did not approve spell transcription${rejection.spellNames?.length ? ` (${rejection.spellNames.join(', ')})` : ''}`
            : rejection.action === 'ability_reroll'
              ? 'GM did not approve your ability score re-roll'
              : `GM did not approve your item creation${rejection.item?.typeName ? ` (${rejection.item.typeName})` : ''}`}
        <button
          type="button"
          className="monster-example-btn"
          style={{ marginLeft: 8 }}
          onClick={() => void approvals.dismissRejection(rejection.id)}
        >
          Dismiss
        </button>
      </p>
    ))

  return (
<section className="character-sheet character-enc-page">
  <div className="character-store-head">
    <p className="character-enc-note">
      Item-based encumbrance: Optional rule. See Carcass Crawler issue #2 from Necrotic Gnome.
    </p>
    {isGuidedCreation ? (
      <button
        type="button"
        className="character-store-open-btn"
                          onClick={selectedClassName === '-' ? onOpenStoreClassRequired : onOpenStore}
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

  )
}
