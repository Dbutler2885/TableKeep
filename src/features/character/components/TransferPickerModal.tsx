import type { CharacterInventoryItem } from '../../../types/app'
import { computeAvailablePackedSlots } from '../inventoryOverflow'
import type { useCharacterTransfer } from '../hooks/useCharacterTransfer'

type Props = {
  flow: ReturnType<typeof useCharacterTransfer>
  detailItem: CharacterInventoryItem | null
}

export function TransferPickerModal(props: Props) {
  const { flow } = props
  if (!flow.transferPickerOpen) return null
  const showQuantity = props.detailItem && props.detailItem.stack.stackable && props.detailItem.qty > 1
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={flow.closeTransferPicker}>
      <div className="confirm-modal" onClick={(event) => event.stopPropagation()}>
        <h3>Give Item To...</h3>
        {flow.transferTargets.length === 0 ? <p>No other player-owned characters are available.</p> : (
          <div style={{ display: 'grid', gap: 10 }}>
            {flow.transferTargets.map((character) => {
              const inventory = Array.isArray(character.details?.inventory) ? character.details.inventory : []
              const packedUsed = inventory.filter((item) => !item.equipped).length
              const strScore = Number.parseInt(character.details?.abilityScores?.STR ?? '', 10)
              return (
                <label key={character.id} className="character-sheet-row">
                  <input type="radio" name="transfer-target" value={character.id} checked={flow.transferTargetCharacterId === character.id} onChange={() => flow.setTransferTargetCharacterId(character.id)} disabled={flow.transferBusy} />
                  <span><strong>{character.name}</strong>{character.ownerUsername ? ` (${character.ownerUsername})` : ''}<br /><small>Packed slots: {packedUsed}/{computeAvailablePackedSlots(strScore)}</small></span>
                </label>
              )
            })}
          </div>
        )}
        {showQuantity ? (
          <label className="item-detail-field" style={{ marginTop: 8 }}>
            <span className="item-detail-field-label">Quantity (of {props.detailItem!.qty})</span>
            <input type="number" min={1} max={props.detailItem!.qty} step={1} value={flow.transferQty} onChange={(event) => flow.setTransferQty(event.target.value)} disabled={flow.transferBusy} />
          </label>
        ) : null}
        {flow.transferError ? <p className="error">{flow.transferError}</p> : null}
        <div className="confirm-actions">
          <button type="button" onClick={flow.closeTransferPicker} disabled={flow.transferBusy}>Cancel</button>
          <button type="button" className="confirm-danger" onClick={() => {
            if (!props.detailItem || props.detailItem.kind === 'gold') return
            void flow.submitTransfer(props.detailItem)
          }} disabled={flow.transferBusy || flow.transferTargets.length === 0 || !flow.transferTargetCharacterId}>
            {flow.transferBusy ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
