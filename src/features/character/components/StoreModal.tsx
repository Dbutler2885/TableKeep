import { X } from 'lucide-react'
import type { CharacterRecord, CharacterStoreCartEntry } from '../../../types/app'
import type { StoreCategoryId, StoreItem } from '../storeCatalog'
import { STORE_CATEGORY_LABELS } from '../storeCatalog'
import { isArmourTemplateAllowedForClass, isWeaponTemplateAllowedForClass } from '../inventoryRules'
import { ConfirmModal } from '../../common/ConfirmModal'

export type StoreModalState = {
  storeOpen: boolean; effectiveSelected: CharacterRecord | null; selectedStoreCart: CharacterStoreCartEntry[]
  hasRolledStartingGold: boolean; selectedStoreRemaining: number; selectedStartingGold: number | null
  canEditSelected: boolean; storeCategory: StoreCategoryId; customStoreName: string; customStoreCost: string
  customStoreDescription: string; visibleStoreItems: StoreItem[]; selectedClassName: string
  selectedStoreCartTotal: number; storeCartExceedsPackedSlots: boolean; selectedStoreOpenPackedSlots: number
  selectedStoreRequiredPacked: number; storeError: string | null
  storeCloseConfirmOpen: boolean
}
export type StoreModalActions = {
  setStoreCloseConfirmOpen: (open: boolean) => void; setStoreOpen: (open: boolean) => void
  rollStartingGold: () => void; setStoreCategory: (category: StoreCategoryId) => void
  setCustomStoreName: (value: string) => void; setCustomStoreCost: (value: string) => void
  setCustomStoreDescription: (value: string) => void; handleBuyCustomStoreItem: () => void
  handleStoreBuy: (item: StoreItem) => void; decrementCartEntry: (key: string) => void
  incrementCartEntry: (key: string) => void; removeCartEntry: (key: string) => void
  applyStorePurchases: () => void; clearCart: () => void
}
type Props = { state: StoreModalState; actions: StoreModalActions }

export function StoreModal({ state, actions }: Props) {
  const { storeOpen, effectiveSelected, selectedStoreCart, hasRolledStartingGold, selectedStoreRemaining, selectedStartingGold, canEditSelected, storeCategory, customStoreName, customStoreCost, customStoreDescription, visibleStoreItems, selectedClassName, selectedStoreCartTotal, storeCartExceedsPackedSlots, selectedStoreOpenPackedSlots, selectedStoreRequiredPacked, storeError, storeCloseConfirmOpen } = state
  const { setStoreCloseConfirmOpen, setStoreOpen, rollStartingGold, setStoreCategory, setCustomStoreName, setCustomStoreCost, setCustomStoreDescription, handleBuyCustomStoreItem, handleStoreBuy, decrementCartEntry, incrementCartEntry, removeCartEntry, applyStorePurchases, clearCart } = actions
  return (
    <>
    {storeOpen && effectiveSelected ? (
      <div className="store-modal-overlay" role="dialog" aria-modal="true">
        <div className="store-modal">
          <div className="store-modal-head">
            <div>
              <h3>Store</h3>
              <p>Buy starting equipment for this draft character.</p>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                if (selectedStoreCart.length > 0) {
                  setStoreCloseConfirmOpen(true)
                  return
                }
                setStoreOpen(false)
              }}
              aria-label="Close store"
            >
              <X size={14} />
            </button>
          </div>

          <div className="store-wallet">
            {hasRolledStartingGold ? (
              <>
                <p className="store-wallet-compact">
                  <strong>{selectedStoreRemaining}</strong>/{selectedStartingGold} gp
                </p>
              </>
            ) : (
              <button type="button" className="store-buy-btn" onClick={rollStartingGold} disabled={!canEditSelected}>
                Roll 3d6 x 10
              </button>
            )}
          </div>

          <div className="store-modal-body">
            <div className="store-catalog">
              <div className="store-category-tabs">
                {(Object.keys(STORE_CATEGORY_LABELS) as StoreCategoryId[]).map((categoryId) => (
                  <button
                    key={categoryId}
                    type="button"
                    className={storeCategory === categoryId ? 'store-category-btn active' : 'store-category-btn'}
                    onClick={() => setStoreCategory(categoryId)}
                  >
                    {STORE_CATEGORY_LABELS[categoryId]}
                  </button>
                ))}
              </div>

              <div className="store-catalog-content">
                {storeCategory === 'other' ? (
                  <div className="store-custom-panel">
                    <h4>Custom equipment</h4>
                    <p>
                      For items not listed, use this to add referee-approved equipment and cost.
                    </p>
                    <label>
                      Name
                      <input
                        type="text"
                        value={customStoreName}
                        onChange={(event) => setCustomStoreName(event.target.value)}
                        placeholder="e.g. Silver whistle"
                      />
                    </label>
                    <label>
                      Cost (gp)
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={customStoreCost}
                        onChange={(event) => setCustomStoreCost(event.target.value)}
                        placeholder="0"
                      />
                    </label>
                    <label>
                      Description (optional)
                      <input
                        type="text"
                        value={customStoreDescription}
                        onChange={(event) => setCustomStoreDescription(event.target.value)}
                        placeholder="short note"
                      />
                    </label>
                    <button
                      type="button"
                      className="store-buy-btn"
                      onClick={handleBuyCustomStoreItem}
                      disabled={!canEditSelected}
                    >
                      Add to Packed Items
                    </button>
                  </div>
                ) : (
                  <div className="store-items-grid">
                    {visibleStoreItems.map((item) => (
                      <article key={item.id} className="store-item-card">
                        <div className="store-item-head">
                          <strong>{item.name}</strong>
                          <span>{item.costGp} gp</span>
                        </div>
                        <p>{item.description}</p>
                        {item.kind === 'weapon' && item.weaponId && !isWeaponTemplateAllowedForClass(item.weaponId, selectedClassName) ? (
                          <p className="store-item-note">Class restriction</p>
                        ) : null}
                        {item.kind === 'armour' && item.armourId && !isArmourTemplateAllowedForClass(item.armourId, selectedClassName) ? (
                          <p className="store-item-note">Class restriction</p>
                        ) : null}
                        <button
                          type="button"
                          className="store-buy-btn"
                          onClick={() => handleStoreBuy(item)}
                          disabled={!canEditSelected}
                        >
                          Buy
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <aside className="store-tally store-cart">
              <div className="store-tally-head">
                <h4>Cart / Purchases</h4>
                <span>{selectedStoreCartTotal} gp total</span>
              </div>
              {selectedStoreCart.length === 0 ? (
                <p className="store-tally-empty">No purchases yet.</p>
              ) : (
                <div className="store-tally-list">
                  {selectedStoreCart.map((line) => (
                    <div key={line.key} className="store-tally-row">
                      <span>{line.name}</span>
                      <div className="store-tally-qty-controls">
                        <button type="button" className="store-qty-btn" onClick={() => decrementCartEntry(line.key)}>-</button>
                        <span>x{line.qty}</span>
                        <button type="button" className="store-qty-btn" onClick={() => incrementCartEntry(line.key)}>+</button>
                      </div>
                      <strong>{line.qty * line.costGp} gp</strong>
                      <button type="button" className="store-remove-btn" onClick={() => removeCartEntry(line.key)}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="store-cart-actions">
                <button
                  type="button"
                  className="store-buy-btn"
                  onClick={applyStorePurchases}
                  disabled={!canEditSelected || storeCartExceedsPackedSlots}
                >
                  Apply Purchases
                </button>
                <button type="button" className="store-buy-btn" onClick={clearCart} disabled={!canEditSelected || selectedStoreCart.length === 0}>
                  Clear Cart
                </button>
              </div>
              <p className={storeCartExceedsPackedSlots ? 'error' : 'store-item-note'}>
                Packed slots: {selectedStoreOpenPackedSlots} open / {selectedStoreRequiredPacked} needed
              </p>
              {storeCartExceedsPackedSlots ? (
                <p className="error">Not enough packed slots. Reorganize inventory to purchase these goods.</p>
              ) : null}
            </aside>
          </div>

          {storeError ? <p className="error">{storeError}</p> : null}
        </div>
      </div>
    ) : null}
    <ConfirmModal
      open={storeCloseConfirmOpen}
      title="Discard cart?"
      message="You have unapplied purchases in your cart. Close store and discard them?"
      confirmLabel="Discard"
      onConfirm={() => {
        clearCart()
        setStoreCloseConfirmOpen(false)
        setStoreOpen(false)
      }}
      onCancel={() => setStoreCloseConfirmOpen(false)}
    />
    </>
  )
}
