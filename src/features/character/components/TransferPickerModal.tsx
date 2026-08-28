import type { CharacterInventoryItem, TransferableInventoryItem } from '../../../types/app'
import { computeAvailablePackedSlots } from '../inventoryOverflow'
import type { TransferTargetCharacter } from '../lib/characterTabTypes'

type Props = {
  open: boolean
  targets: TransferTargetCharacter[]
  targetCharacterId: string
  busy: boolean
  error: string | null
  quantity: string
  detailItem: CharacterInventoryItem | null
  onTargetChange: (id: string) => void
  onQuantityChange: (value: string) => void
  onClose: () => void
  onSubmit: (item: TransferableInventoryItem) => void
}

export function TransferPickerModal(props: Props) {
  if (!props.open) return null
  const showQuantity = props.detailItem && props.detailItem.stack.stackable && props.detailItem.qty > 1
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={props.onClose}>
      <div className="confirm-modal" onClick={(event) => event.stopPropagation()}>
        <h3>Give Item To...</h3>
        {props.targets.length === 0 ? <p>No other player-owned characters are available.</p> : (
          <div style={{ display: 'grid', gap: 10 }}>
            {props.targets.map((character) => {
              const inventory = Array.isArray(character.details?.inventory) ? character.details.inventory : []
              const packedUsed = inventory.filter((item) => !item.equipped).length
              const strScore = Number.parseInt(character.details?.abilityScores?.STR ?? '', 10)
              return (
                <label key={character.id} className="character-sheet-row">
                  <input type="radio" name="transfer-target" value={character.id} checked={props.targetCharacterId === character.id} onChange={() => props.onTargetChange(character.id)} disabled={props.busy} />
                  <span><strong>{character.name}</strong>{character.ownerUsername ? ` (${character.ownerUsername})` : ''}<br /><small>Packed slots: {packedUsed}/{computeAvailablePackedSlots(strScore)}</small></span>
                </label>
              )
            })}
          </div>
        )}
        {showQuantity ? (
          <label className="item-detail-field" style={{ marginTop: 8 }}>
            <span className="item-detail-field-label">Quantity (of {props.detailItem!.qty})</span>
            <input type="number" min={1} max={props.detailItem!.qty} step={1} value={props.quantity} onChange={(event) => props.onQuantityChange(event.target.value)} disabled={props.busy} />
          </label>
        ) : null}
        {props.error ? <p className="error">{props.error}</p> : null}
        <div className="confirm-actions">
          <button type="button" onClick={props.onClose} disabled={props.busy}>Cancel</button>
          <button type="button" className="confirm-danger" onClick={() => {
            if (!props.detailItem || props.detailItem.kind === 'gold') return
            props.onSubmit(props.detailItem)
          }} disabled={props.busy || props.targets.length === 0 || !props.targetCharacterId}>
            {props.busy ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
