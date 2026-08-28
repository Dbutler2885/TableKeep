import type { Dispatch, SetStateAction } from 'react'
import type {
  CharacterAmmunitionItem,
  CharacterArmourItem,
  CharacterConsumableItem,
  CharacterGeneralItem,
  CharacterInventoryItem,
  CharacterRecord,
  CharacterWeaponItem,
  TransferableInventoryItem,
} from '../../../types/app'
import type { useSelectedCharacterDerivations } from '../hooks/useSelectedCharacterDerivations'
import type { useInventoryDomain } from '../hooks/useInventoryDomain'
import type { useSpellbookDomain } from '../hooks/useSpellbookDomain'
import type { useCharacterTransfer } from '../hooks/useCharacterTransfer'
import type { useStoreDomain } from '../hooks/useStoreDomain'
import type { deriveCharacterPermissions } from '../lib/characterPermissions'
import { OSE_WEAPON_CATALOG } from '../weaponCatalog'
import { OSE_ARMOUR_CATALOG } from '../armourCatalog'
import { SPELL_BOOK_TYPE_ID, arcaneSpellById } from '../spellCatalog'
import { isArmourTemplateAllowedForClass, isWeaponTemplateAllowedForClass } from '../inventoryRules'
import { BlurSyncedTextarea } from './BlurSyncedTextarea'
import { ReadOnlyItemDetail } from './ReadOnlyItemDetail'

type Props = {
  character: CharacterRecord
  itemDetailId: string | null
  permissions: ReturnType<typeof deriveCharacterPermissions>
  derivations: ReturnType<typeof useSelectedCharacterDerivations>
  inventoryDomain: ReturnType<typeof useInventoryDomain>
  spellbookDomain: ReturnType<typeof useSpellbookDomain>
  transferFlow: ReturnType<typeof useCharacterTransfer>
  storeDomain: ReturnType<typeof useStoreDomain>
  goldSpendAmount: string
  setItemDetailId: Dispatch<SetStateAction<string | null>>
  setGoldSpendAmount: Dispatch<SetStateAction<string>>
  setStackActionQty: Dispatch<SetStateAction<string>>
  setGoldSpendConfirmAmount: Dispatch<SetStateAction<number | null>>
  setCantLightOpen: Dispatch<SetStateAction<boolean>>
  setCantFireMessage: Dispatch<SetStateAction<string | null>>
  setDropConfirmItemId: Dispatch<SetStateAction<string | null>>
  setSellConfirmItemId: Dispatch<SetStateAction<string | null>>
}

export function ItemDetailModal({
  character: effectiveSelected,
  itemDetailId,
  permissions,
  derivations,
  inventoryDomain,
  spellbookDomain,
  transferFlow,
  storeDomain,
  goldSpendAmount,
  setItemDetailId,
  setGoldSpendAmount,
  setStackActionQty,
  setGoldSpendConfirmAmount,
  setCantLightOpen,
  setCantFireMessage,
  setDropConfirmItemId,
  setSellConfirmItemId,
}: Props) {
  const {
    canEditInventoryDetails, canEditSelected, canMemorizeSpell, canClassEquipArmour,
    isInFinalizationFlow, isGuidedCreation,
  } = permissions
  const {
    selectedInventory, selectedGoldTotal, outgoingTransferByItemKey,
    selectedClassName, parsedGoldSpendAmount,
  } = derivations
  const {
    updateInventoryItem, updateWeaponRow, updateArmourRow,
    consumeOne, lightTorch, tickDown, canFireAmmo, fireAmmo, retrieveAmmo,
    throwOil, pourOil, lightLantern, extinguishLantern, hasIgnitionSource,
  } = inventoryDomain
  const {
    spellBookSelectedSpellId, setSpellBookSelectedSpellId,
    selectedSpellBookSpells, memorizeSpell, removeSpellFromBook, spellBookFeedback,
    openSpellBookAddModal, canOpenSpellBookAddModal,
  } = spellbookDomain
  const {
    transferError, transferPickerOpen, transferBusy, transferTargets, openTransferPickerForItem,
    cancelOutgoingTransfer,
  } = transferFlow
  const { refundItem } = storeDomain
  const renderReadOnlyItemDetail = (item: CharacterInventoryItem) => <ReadOnlyItemDetail item={item} />

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
              inventoryDomain.toggleItemEquip(detailItem, !detailItem.equipped)
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

}
