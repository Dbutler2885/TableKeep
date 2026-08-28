import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { CharacterInventoryItem } from '../../../types/app'
import { OSE_WEAPON_CATALOG, weaponCatalogById } from '../weaponCatalog'
import { OSE_ARMOUR_CATALOG, armourCatalogById } from '../armourCatalog'
import { OSE_GENERAL_CATALOG, generalCatalogById } from '../generalCatalog'
import { OSE_AMMO_CATALOG, ammoCatalogById } from '../ammoCatalog'
import { consumableCatalogById } from '../consumableCatalog'
import { armourTypeFromTemplateId, isArmourTemplateAllowedForClass, isWeaponTemplateAllowedForClass, parseArmourTemplateValues, parseDamageDice, parseRangeBands } from '../inventoryRules'
import type { AddItemModalState } from '../hooks/useInventoryDomain'
import { playerAddGearTemplates } from '../lib/characterSheetTables'
import { playerAddPreviewItem } from '../lib/playerAddGear'

type Props = {
  modal: AddItemModalState | null
  setModal: Dispatch<SetStateAction<AddItemModalState | null>>
  selectedClassName: string
  canClassEquipArmour: boolean
  requiresApprovalNow: boolean
  onApplyTemplate: (kind: 'general' | 'weapon' | 'armour' | 'ammunition', templateId: string) => void
  renderReadOnlyItemDetail: (item: CharacterInventoryItem) => ReactNode
  onSave: () => void
}

export function AddItemModal({ modal: addItemModal, setModal: setAddItemModal, selectedClassName, canClassEquipArmour, requiresApprovalNow, onApplyTemplate: applyPlayerAddTemplate, renderReadOnlyItemDetail, onSave: saveAddItem }: Props) {
  return (
    <>
    {addItemModal ? (
      <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={() => setAddItemModal(null)}>
        <div className="confirm-modal item-detail-modal add-item-modal" onClick={(e) => e.stopPropagation()}>
          <h3>Add Item</h3>
          {requiresApprovalNow ? (
            <>
              <div className="add-item-kind-picker">
                {(['general', 'weapon', 'armour', 'ammunition'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={addItemModal.kind === k ? 'active' : ''}
                    onClick={() => {
                      const nextId = k === 'weapon'
                        ? OSE_WEAPON_CATALOG[0]?.id
                        : k === 'armour'
                          ? OSE_ARMOUR_CATALOG[0]?.id
                          : k === 'ammunition'
                            ? OSE_AMMO_CATALOG[0]?.id
                            : OSE_GENERAL_CATALOG[0]?.id
                      if (!nextId) return
                      applyPlayerAddTemplate(k, nextId)
                    }}
                  >
                    {k === 'general' ? 'Gear' : k === 'ammunition' ? 'Ammo' : k.charAt(0).toUpperCase() + k.slice(1)}
                  </button>
                ))}
              </div>
              <label className="character-weapon-primary-field">
                {addItemModal.kind === 'weapon' ? 'Weapon' : addItemModal.kind === 'armour' ? 'Armour' : addItemModal.kind === 'ammunition' ? 'Ammo' : 'Gear'}
                <select
                  value={addItemModal.typeId || ''}
                  onChange={(e) => applyPlayerAddTemplate(addItemModal.kind as 'general' | 'weapon' | 'armour' | 'ammunition', e.target.value)}
                >
                  {(addItemModal.kind === 'weapon' ? OSE_WEAPON_CATALOG
                    : addItemModal.kind === 'armour' ? OSE_ARMOUR_CATALOG
                      : addItemModal.kind === 'ammunition' ? OSE_AMMO_CATALOG
                        : playerAddGearTemplates).map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.name}
                          </option>
                        ))}
                </select>
              </label>
              {playerAddPreviewItem(addItemModal) ? renderReadOnlyItemDetail(playerAddPreviewItem(addItemModal) as CharacterInventoryItem) : null}
            </>
          ) : (
            <>
          <div className="add-item-kind-picker">
            {(['general', 'weapon', 'armour', 'ammunition'] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={addItemModal.kind === k ? 'active' : ''}
                onClick={() =>
                  setAddItemModal({
                    ...addItemModal,
                    kind: k,
                    typeId: 'custom',
                    typeName: addItemModal.kind === k ? addItemModal.typeName : '',
                    name: addItemModal.kind === k ? addItemModal.name : '',
                  })
                }
              >
                {k === 'ammunition' ? 'Ammo' : k.charAt(0).toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
          {addItemModal.kind === 'weapon' ? (
            <div className="item-detail-weapon-form">
              <label className="character-weapon-primary-field">
                Template
                <select
                  value={addItemModal.typeId || 'custom'}
                  onChange={(e) => {
                    const wId = e.target.value
                    if (wId === 'custom') {
                      setAddItemModal({ ...addItemModal, typeId: 'custom', typeName: '' })
                    } else {
                      const t = weaponCatalogById[wId]
                      if (t) {
                        const parsed = parseDamageDice(t.damage)
                        const range = parseRangeBands(t.range)
                        setAddItemModal({
                          ...addItemModal,
                          typeId: wId,
                          typeName: t.name,
                          costGp: String(t.costGp),
                          damageDiceCount: parsed.damageDiceCount,
                          damageDiceSides: parsed.damageDiceSides,
                          rangeShort: range.rangeShort,
                          rangeMedium: range.rangeMedium,
                          rangeLong: range.rangeLong,
                          slow: t.qualities.includes('Slow'),
                          twoHanded: t.twoHanded,
                        })
                      }
                    }
                  }}
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
              {addItemModal.typeId === 'custom' ? (
                <label className="character-weapon-primary-field">
                  Type
                  <input
                    type="text"
                    value={addItemModal.typeName}
                    onChange={(e) => setAddItemModal({ ...addItemModal, typeName: e.target.value })}
                    placeholder="e.g. Bec de corbin"
                  />
                </label>
              ) : null}
              <label className="character-weapon-primary-field">
                Name
                <input
                  type="text"
                  value={addItemModal.name}
                  onChange={(e) => setAddItemModal({ ...addItemModal, name: e.target.value })}
                  placeholder="Optional"
                />
              </label>
              <div className="character-weapon-mobile-grid">
                <label className="character-weapon-edit-field">
                  Dmg
                  <div className="character-weapon-damage-inputs">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={addItemModal.damageDiceCount}
                      onChange={(e) => setAddItemModal({ ...addItemModal, damageDiceCount: e.target.value })}
                    />
                    <select
                      value={addItemModal.damageDiceSides}
                      onChange={(e) => setAddItemModal({ ...addItemModal, damageDiceSides: e.target.value })}
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
                    <input type="number" min={0} step={1} value={addItemModal.rangeShort} onChange={(e) => setAddItemModal({ ...addItemModal, rangeShort: e.target.value })} />
                    <span>/</span>
                    <input type="number" min={0} step={1} value={addItemModal.rangeMedium} onChange={(e) => setAddItemModal({ ...addItemModal, rangeMedium: e.target.value })} />
                    <span>/</span>
                    <input type="number" min={0} step={1} value={addItemModal.rangeLong} onChange={(e) => setAddItemModal({ ...addItemModal, rangeLong: e.target.value })} />
                  </div>
                </label>
                <label className="character-weapon-edit-field">
                  Cost
                  <div className="character-inline-unit-field">
                    <input type="text" value={addItemModal.costGp} onChange={(e) => setAddItemModal({ ...addItemModal, costGp: e.target.value })} />
                    <span>gp</span>
                  </div>
                </label>
              </div>
              <label className="character-weapon-card-check">
                <input
                  type="checkbox"
                  checked={addItemModal.slow}
                  onChange={(e) => setAddItemModal({ ...addItemModal, slow: e.target.checked })}
                  disabled={!!addItemModal.typeId && addItemModal.typeId !== 'custom'}
                />
                Slow
              </label>
              <label className="character-weapon-card-check">
                <input
                  type="checkbox"
                  checked={addItemModal.twoHanded}
                  onChange={(e) => setAddItemModal({ ...addItemModal, twoHanded: e.target.checked })}
                />
                Two-handed
              </label>
              <div className="character-weapon-magic-row">
                <label className="character-weapon-card-check">
                  <input
                    type="checkbox"
                    checked={addItemModal.isMagic}
                    onChange={(e) => setAddItemModal({ ...addItemModal, isMagic: e.target.checked })}
                  />
                  Magic
                </label>
                {addItemModal.isMagic ? (
                  <label className="character-weapon-magic-bonus character-weapon-edit-field">
                    Bonus
                    <input
                      type="number"
                      step={1}
                      value={addItemModal.attackBonus}
                      onChange={(e) => setAddItemModal({ ...addItemModal, attackBonus: e.target.value })}
                    />
                  </label>
                ) : null}
              </div>
              <label className="character-weapon-edit-field">
                Notes
                <textarea
                  value={addItemModal.notes}
                  onChange={(e) => setAddItemModal({ ...addItemModal, notes: e.target.value })}
                  placeholder="Description, magic properties, etc."
                />
              </label>
            </div>
          ) : addItemModal.kind === 'armour' ? (
            <div className="item-detail-weapon-form">
              <label className="character-weapon-primary-field">
                Template
                <select
                  value={addItemModal.typeId || 'custom'}
                  onChange={(e) => {
                    const aId = e.target.value
                    if (aId === 'custom') {
                      setAddItemModal({ ...addItemModal, typeId: 'custom', typeName: '' })
                    } else {
                      const t = armourCatalogById[aId]
                      if (t) {
                        const parsed = parseArmourTemplateValues(t.ac)
                        setAddItemModal({
                          ...addItemModal,
                          typeId: aId,
                          typeName: t.name,
                          costGp: String(t.costGp),
                          armourClass: parsed.armourClass,
                          shieldMod: parsed.shieldMod,
                          armourType: armourTypeFromTemplateId(t.id),
                        })
                      }
                    }
                  }}
                  disabled={!canClassEquipArmour}
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
              {addItemModal.typeId === 'custom' ? (
                <label className="character-weapon-primary-field">
                  Type
                  <input
                    type="text"
                    value={addItemModal.typeName}
                    onChange={(e) => setAddItemModal({ ...addItemModal, typeName: e.target.value })}
                    placeholder="e.g. Brigandine"
                  />
                </label>
              ) : null}
              <label className="character-weapon-primary-field">
                Name
                <input
                  type="text"
                  value={addItemModal.name}
                  onChange={(e) => setAddItemModal({ ...addItemModal, name: e.target.value })}
                  placeholder="Optional"
                />
              </label>
              <div className="character-weapon-mobile-grid">
                <label className="character-weapon-edit-field">
                  {addItemModal.armourType === 'shield' ? 'Shield Mod' : 'Armour Class'}
                  <input
                    type="number"
                    step={1}
                    value={addItemModal.armourType === 'shield' ? addItemModal.shieldMod : addItemModal.armourClass}
                    onChange={(e) =>
                      setAddItemModal({
                        ...addItemModal,
                        ...(addItemModal.armourType === 'shield'
                          ? { shieldMod: e.target.value }
                          : { armourClass: e.target.value }),
                      })}
                  />
                </label>
                <label className="character-weapon-edit-field">
                  Type
                  <select
                    value={addItemModal.armourType ?? 'body'}
                    onChange={(e) => setAddItemModal({ ...addItemModal, armourType: e.target.value as 'body' | 'shield' })}
                  >
                    <option value="body">Body Armour</option>
                    <option value="shield">Shield</option>
                  </select>
                </label>
                <label className="character-weapon-edit-field">
                  Cost
                  <div className="character-inline-unit-field">
                    <input type="text" value={addItemModal.costGp} onChange={(e) => setAddItemModal({ ...addItemModal, costGp: e.target.value })} />
                    <span>gp</span>
                  </div>
                </label>
              </div>
              <div className="character-weapon-magic-row">
                <label className="character-weapon-card-check">
                  <input
                    type="checkbox"
                    checked={addItemModal.isMagic}
                    onChange={(e) => setAddItemModal({ ...addItemModal, isMagic: e.target.checked })}
                  />
                  Magic
                </label>
                {addItemModal.isMagic ? (
                  <label className="character-weapon-magic-bonus character-weapon-edit-field">
                    Mod
                    <input
                      type="number"
                      step={1}
                      value={addItemModal.magicMod}
                      onChange={(e) => setAddItemModal({ ...addItemModal, magicMod: e.target.value })}
                    />
                  </label>
                ) : null}
              </div>
              <label className="character-weapon-edit-field">
                Notes
                <textarea
                  value={addItemModal.notes}
                  onChange={(e) => setAddItemModal({ ...addItemModal, notes: e.target.value })}
                  placeholder="Description, magic properties, etc."
                />
              </label>
            </div>
          ) : (
            <>
              {addItemModal.kind === 'general' ? (
                <label className="item-detail-field">
                  <span className="item-detail-field-label">Template</span>
                  <select
                    value={addItemModal.typeId || 'custom'}
                    onChange={(e) => {
                      const templateId = e.target.value
                      if (templateId === 'custom') {
                        setAddItemModal({ ...addItemModal, typeId: 'custom', typeName: '', costGp: '', description: '', qty: '1', effectText: '' })
                      } else {
                        const generalTemplate = generalCatalogById[templateId]
                        const consumableTemplate = consumableCatalogById[templateId]
                        const template = generalTemplate ?? consumableTemplate
                        if (template) {
                          setAddItemModal({
                            ...addItemModal,
                            typeId: templateId,
                            typeName: template.name,
                            costGp: String(template.costGp),
                            description: template.description,
                            qty: consumableTemplate ? String(consumableTemplate.qty) : '1',
                            effectText: consumableTemplate?.effectText ?? '',
                          })
                        }
                      }
                    }}
                  >
                    <option value="custom">Custom</option>
                    {playerAddGearTemplates.map((entry) => (
                      <option key={entry.id} value={entry.id}>{`${entry.name} (${entry.costGp} gp)`}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              {addItemModal.kind === 'ammunition' ? (
                <label className="item-detail-field">
                  <span className="item-detail-field-label">Template</span>
                  <select
                    value={addItemModal.typeId || 'custom'}
                    onChange={(e) => {
                      const aId = e.target.value
                      if (aId === 'custom') {
                        setAddItemModal({ ...addItemModal, typeId: 'custom', typeName: '', costGp: '', description: '', qty: '1' })
                      } else {
                        const t = ammoCatalogById[aId]
                        if (t) setAddItemModal({ ...addItemModal, typeId: aId, typeName: t.name, costGp: String(t.costGp), description: t.description, qty: String(t.qty) })
                      }
                    }}
                  >
                    <option value="custom">Custom</option>
                    {OSE_AMMO_CATALOG.map((a) => (
                      <option key={a.id} value={a.id}>{`${a.name} (${a.costGp} gp)`}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              {addItemModal.typeId === 'custom' ? (
                <label className="item-detail-field">
                  <span className="item-detail-field-label">Type</span>
                  <input
                    type="text"
                    value={addItemModal.typeName}
                    onChange={(e) => setAddItemModal({ ...addItemModal, typeName: e.target.value })}
                  />
                </label>
              ) : null}
              <label className="item-detail-field">
                <span className="item-detail-field-label">Name (Optional)</span>
                <input
                  type="text"
                  value={addItemModal.name}
                  onChange={(e) => setAddItemModal({ ...addItemModal, name: e.target.value })}
                />
              </label>
              <label className="item-detail-field">
                <span className="item-detail-field-label">Cost</span>
                <div className="character-inline-unit-field">
                  <input type="text" value={addItemModal.costGp} onChange={(e) => setAddItemModal({ ...addItemModal, costGp: e.target.value })} />
                  <span>gp</span>
                </div>
              </label>
              {(addItemModal.kind === 'ammunition' || !!consumableCatalogById[addItemModal.typeId]) ? (
                <label className="item-detail-field">
                  <span className="item-detail-field-label">Qty</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={addItemModal.qty}
                    onChange={(e) => setAddItemModal({ ...addItemModal, qty: e.target.value })}
                  />
                </label>
              ) : null}
              {((addItemModal.kind === 'general' && !!consumableCatalogById[addItemModal.typeId]) || addItemModal.kind === 'consumable') ? (
                <label className="item-detail-field">
                  <span className="item-detail-field-label">Effect</span>
                  <textarea
                    className="item-detail-notes"
                    value={addItemModal.effectText}
                    onChange={(e) => setAddItemModal({ ...addItemModal, effectText: e.target.value })}
                    placeholder="Optional effect description"
                    rows={2}
                  />
                </label>
              ) : null}
              <label className="item-detail-field">
                <span className="item-detail-field-label">Description</span>
                <textarea
                  className="item-detail-notes"
                  value={addItemModal.description}
                  onChange={(e) => setAddItemModal({ ...addItemModal, description: e.target.value })}
                  placeholder="Optional item description"
                  rows={2}
                />
              </label>
              <label className="item-detail-field">
                <span className="item-detail-field-label">Notes</span>
                <textarea
                  className="item-detail-notes"
                  value={addItemModal.notes}
                  onChange={(e) => setAddItemModal({ ...addItemModal, notes: e.target.value })}
                  placeholder="Optional notes"
                  rows={2}
                />
              </label>
            </>
          )}
            </>
          )}
          <div className="confirm-actions">
            <button type="button" onClick={() => setAddItemModal(null)}>Cancel</button>
            <button type="button" onClick={saveAddItem}>{requiresApprovalNow ? 'Request' : 'Add'}</button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  )
}
