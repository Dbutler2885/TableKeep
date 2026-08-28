import type { CharacterInventoryItem } from '../../../types/app'

type Props = { item: CharacterInventoryItem | null; quantity: string; onQuantityChange: (value: string) => void; onClose: () => void; onDrop: (quantity?: number) => void }

export function DropItemDialog({ item, quantity, onQuantityChange, onClose, onDrop }: Props) {
  if (!item) return null
  const isStack = item.stack.stackable && item.qty > 1
  const parsedQuantity = isStack ? Math.max(1, Math.min(item.qty, Number.parseInt(quantity, 10) || item.qty)) : undefined
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="confirm-modal" onClick={(event) => event.stopPropagation()}>
        <h3>Drop item?</h3><p>Drop {item.name?.trim() || item.typeName || 'this item'}? It will be moved to the campaign items list.</p>
        {isStack ? <label className="item-detail-field"><span className="item-detail-field-label">Quantity (of {item.qty})</span><input type="number" min={1} max={item.qty} step={1} value={quantity} onChange={(event) => onQuantityChange(event.target.value)} /></label> : null}
        <div className="confirm-actions"><button type="button" onClick={onClose}>Cancel</button><button type="button" className="confirm-danger" onClick={() => onDrop(parsedQuantity)}>{isStack ? `Drop ${parsedQuantity}` : 'Drop'}</button></div>
      </div>
    </div>
  )
}
