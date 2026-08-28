import type { CharacterInventoryItem } from '../../../types/app'
import type { useInventoryDomain } from '../hooks/useInventoryDomain'

type Props = {
  item: CharacterInventoryItem
  inventoryDomain: ReturnType<typeof useInventoryDomain>
  isGuidedCreation: boolean
  canEdit: boolean
}

export function InlineInventoryAction(props: Props) {
  const { item } = props
  const { canFireAmmo, fireAmmo, consumeOne, hasIgnitionSource, lightTorch, lightLantern } = props.inventoryDomain
  if (props.isGuidedCreation) return null
  if (item.kind === 'ammunition' && canFireAmmo(item.id).ok) {
    return <button type="button" className="item-fire-pill" onClick={() => fireAmmo(item.id)} disabled={!props.canEdit}>Fire</button>
  }
  if (item.kind === 'consumable' && (item.qty ?? 0) > 0) {
    if (item.typeId === 'con-rations-iron' || item.typeId === 'con-rations-standard') {
      return <button type="button" className="item-fire-pill" onClick={() => consumeOne(item.id)} disabled={!props.canEdit}>Eat</button>
    }
    if (item.typeId === 'con-wine') {
      return <button type="button" className="item-fire-pill" onClick={() => consumeOne(item.id)} disabled={!props.canEdit}>Drink</button>
    }
    if (item.typeId === 'con-iron-spikes') {
      return <button type="button" className="item-fire-pill" onClick={() => consumeOne(item.id)} disabled={!props.canEdit}>Use</button>
    }
    if (item.typeId === 'con-torches' && !item.lit && item.equipped && hasIgnitionSource()) {
      return <button type="button" className="item-fire-pill" onClick={() => lightTorch(item.id)} disabled={!props.canEdit}>Light</button>
    }
  }
  if (item.kind === 'general' && item.typeId === 'gear-lantern' && !item.lit && (item.turnsRemaining ?? 0) > 0 && item.equipped && hasIgnitionSource()) {
    return <button type="button" className="item-fire-pill" onClick={() => lightLantern(item.id)} disabled={!props.canEdit}>Light</button>
  }
  return null
}
