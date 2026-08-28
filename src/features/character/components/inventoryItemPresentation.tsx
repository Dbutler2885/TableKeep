import type { ReactNode } from 'react'
import type {
  CharacterAmmunitionItem,
  CharacterArmourItem,
  CharacterConsumableItem,
  CharacterGeneralItem,
  CharacterInventoryItem,
  CharacterWeaponItem,
} from '../../../types/app'
import {
  armourStatsLabel,
  armourTypeLabel,
  weaponStatsLabel,
  weaponTypeLabel,
} from '../lib/inventoryItemLabels'

export function renderWeaponSlotLabel(weapon: CharacterWeaponItem): ReactNode {
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

export function renderArmourSlotLabel(armour: CharacterArmourItem): ReactNode {
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

type ItemSlotLabelOptions = {
  onTickDown: (itemId: string) => void
  canEdit: boolean
}

export function itemSlotLabel(item: CharacterInventoryItem, options: ItemSlotLabelOptions): ReactNode {
  if (item.kind === 'weapon') return renderWeaponSlotLabel(item)
  if (item.kind === 'armour') return renderArmourSlotLabel(item)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- old gold data may still have `amount` instead of `qty`
  if (item.kind === 'gold') return `Gold: ${item.qty ?? (item as any).amount ?? 0} gp`
  const label = item.typeName || item.name || 'Item'
  const qty = item.qty ?? 1
  if (item.kind === 'consumable' && item.typeId === 'con-oil') {
    const fuel = (item as CharacterConsumableItem).amountRemaining ?? 24
    if (fuel <= 0) return `${label} (empty)`
    return fuel < 24 ? `${label} (${fuel}/24)` : label
  }
  if (item.kind === 'general' && item.typeId === 'gear-lantern') {
    const lantern = item as CharacterGeneralItem
    const fuel = lantern.turnsRemaining ?? 0
    if (lantern.lit) {
      return <span className="item-slot-lit">{label} (lit) ●{fuel}/24{' '}<button type="button" className="item-tick-btn" onClick={(event) => { event.stopPropagation(); options.onTickDown(item.id) }} disabled={!options.canEdit} aria-label="Tick down turn">−</button></span>
    }
    if (fuel <= 0) return `${label} (empty)`
    if (fuel >= 24) return `${label} (full)`
    return `${label} (${fuel}/24)`
  }
  if (item.kind === 'consumable' && item.typeId === 'con-torches') {
    const torch = item as CharacterConsumableItem
    const torchLabel = item.name?.trim() || 'Torches'
    if (torch.lit) {
      return <span className="item-slot-lit">Torch (lit) ●{torch.turnsRemaining ?? 0}/6{' '}<button type="button" className="item-tick-btn" onClick={(event) => { event.stopPropagation(); options.onTickDown(item.id) }} disabled={!options.canEdit} aria-label="Tick down turn">−</button></span>
    }
    return qty > 1 ? `${torchLabel} (${qty})` : qty === 1 ? `${torchLabel} (1)` : `${torchLabel} (spent)`
  }
  if (item.kind === 'ammunition' && (item as CharacterAmmunitionItem).spent) {
    return `${label} (${qty}) [${(item as CharacterAmmunitionItem).spent} spent]`
  }
  return qty > 1 ? `${label} (${qty})` : label
}
