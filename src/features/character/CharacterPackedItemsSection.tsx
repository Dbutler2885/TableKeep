import { Fragment, memo } from 'react'
import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import type { CharacterInventoryItem } from '../../types/app'

type PackedSlotItem = {
  item: CharacterInventoryItem
  label: ReactNode
  isGold: boolean
}

type PackedMovementBand = {
  label: string
  slotCount: number
}

type CharacterPackedItemsSectionProps = {
  packedSlotItems: PackedSlotItem[]
  packedStrengthSlotCount: number
  packedSlotLabels: string[]
  packedSlotThresholds: number[]
  packedMovementBands: PackedMovementBand[]
  selectedStr: number
  canEditSelected: boolean
  isGuidedCreation: boolean
  equippedSlotItemsLength: number
  equippedRowCount: number
  packedItemsLength: number
  availablePackedSlotCount: number
  overflowFeedback: string | null
  approvalPendingFeedback: string | null
  rejectionNodes: ReactNode[]
  onToggleItemEquip: (item: CharacterInventoryItem, checked: boolean) => void
  onOpenItemDetail: (itemId: string) => void
  onRefundItem: (itemId: string) => void
  onOpenAddItemModal: () => void
  renderInlineAction: (item: CharacterInventoryItem) => ReactNode
}

export const CharacterPackedItemsSection = memo(function CharacterPackedItemsSection({
  packedSlotItems,
  packedStrengthSlotCount,
  packedSlotLabels,
  packedSlotThresholds,
  packedMovementBands,
  selectedStr,
  canEditSelected,
  isGuidedCreation,
  equippedSlotItemsLength,
  equippedRowCount,
  packedItemsLength,
  availablePackedSlotCount,
  overflowFeedback,
  approvalPendingFeedback,
  rejectionNodes,
  onToggleItemEquip,
  onOpenItemDetail,
  onRefundItem,
  onOpenAddItemModal,
  renderInlineAction,
}: CharacterPackedItemsSectionProps) {
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
                  if (equippedSlotItemsLength >= equippedRowCount) return
                  onToggleItemEquip(slotItem.item, true)
                }}
                disabled={!canEditSelected || slotItem.isGold}
                aria-label={`Equip slot ${slotIndex + 1}`}
              />
            ) : null}
            <button
              type="button"
              className="character-item-auto-slot character-item-detail-btn"
              onClick={() => onOpenItemDetail(slotItem.item.id)}
            >
              {slotItem.label}
            </button>
            {isGuidedCreation && canEditSelected && !slotItem.isGold ? (
              <button
                type="button"
                className="monster-example-btn"
                onClick={() => onRefundItem(slotItem.item.id)}
              >
                Sell
              </button>
            ) : null}
            {!isGuidedCreation ? renderInlineAction(slotItem.item) : null}
          </div>
        ) : (
          <div className="character-item-row-inner">
            {isGuidedCreation ? (
              <span className="character-item-input" />
            ) : (
              <button
                type="button"
                className="character-item-add-btn"
                onClick={onOpenAddItemModal}
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
    <section className="monster-section-block character-enc-packed">
      <h3 className="monster-section-title">Packed Items</h3>
      <div className="character-item-rows packed">
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
      </div>
      {packedItemsLength > availablePackedSlotCount ? (
        <p className="error">Too many packed items for available packed slots.</p>
      ) : null}
      {overflowFeedback ? (
        <p className="character-overflow-feedback">{overflowFeedback}</p>
      ) : null}
      {approvalPendingFeedback ? (
        <p className="character-overflow-feedback">{approvalPendingFeedback}</p>
      ) : null}
      {rejectionNodes}
    </section>
  )
})
