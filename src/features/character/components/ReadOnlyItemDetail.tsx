import type { CharacterAmmunitionItem, CharacterArmourItem, CharacterConsumableItem, CharacterGeneralItem, CharacterInventoryItem, CharacterWeaponItem } from '../../../types/app'
import { formatWeaponEffectLine } from '../lib/inventoryItemLabels'

type Props = { item: CharacterInventoryItem }

export function ReadOnlyItemDetail({ item: detailItem }: Props) {
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
