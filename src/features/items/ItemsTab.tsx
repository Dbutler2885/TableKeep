import { ChevronLeft, Gift, Minus, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import type { CampaignItem, CampaignItemType, CharacterInventoryItem, CharacterGoldItem, CharacterRecord, CharacterSheetDetails, Role } from '../../types/app'
import type { TokenIconConfig } from '../tokens/TokenIconEditor'
import { ConfirmModal } from '../common/ConfirmModal'
import { EntityMediaEditor } from '../common/EntityMediaEditor'
import { uploadEntityImage } from '../common/mediaStorage'
import { MOBILE_BREAKPOINT } from '../../constants/layout'
import { useItems, toFirestoreItem } from './useItems'
import { campaignItemToInventoryItem, campaignGoldToInventoryChunks } from './itemConversion'
import { computeAvailablePackedSlots, computeOverflow, makeDroppedGoldCampaignItem } from '../character/inventoryOverflow'
import { OSE_WEAPON_CATALOG } from '../character/weaponCatalog'
import { OSE_ARMOUR_CATALOG } from '../character/armourCatalog'
import { OSE_STORE_ITEMS } from '../character/storeCatalog'

type ItemTypeFilter = CampaignItemType | 'all' | 'dropped'

const defaultTokenIcon: TokenIconConfig = {
  icon: 'pawn',
  color: '#bf2f2a',
  size: 34,
}

type ItemsTabProps = {
  campaignId: string
  role: Role | null
  characters: CharacterRecord[]
}

const itemTypeOptions: Array<{ value: CampaignItemType; label: string }> = [
  { value: 'weapon', label: 'Weapons' },
  { value: 'armour', label: 'Armour' },
  { value: 'ammunition', label: 'Ammo' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'general', label: 'General' },
]

const generalCatalog = OSE_STORE_ITEMS.filter((i) => i.kind === 'general')
const ammoCatalog = OSE_STORE_ITEMS.filter((i) => i.kind === 'ammunition')

const newItemTemplate = (type: CampaignItemType): CampaignItem => ({
  id: crypto.randomUUID(),
  name: '',
  type,
  typeId: 'custom',
  typeName: '',
  status: 'authored',
  portraitPath: '',
  portraitUrl: null,
  portraitFocusX: 50,
  portraitFocusY: 50,
  tokenIcon: defaultTokenIcon,
  description: '',
  gpValue: '',
  qty: '1',
  isMagic: false,
  weaponStats: {
    damageDiceCount: '',
    damageDiceSides: '',
    attackBonus: '',
    damageBonus: '',
    rangeShort: '',
    rangeMedium: '',
    rangeLong: '',
    twoHanded: false,
  },
  armourStats: {
    armourClass: '',
    shieldMod: '',
    magicMod: '',
    armourType: 'body',
  },
  consumableStats: {
    useMode: 'consume',
    effectText: '',
  },
  specialRule: '',
  notes: '',
})

export function ItemsTab({ campaignId, role, characters }: ItemsTabProps) {
  const { items, addItem: hookAddItem, updateItem, deleteItem: hookDeleteItem } = useItems(campaignId)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [deleteCandidate, setDeleteCandidate] = useState<CampaignItem | null>(null)
  const [grantTargetId, setGrantTargetId] = useState<string>('')
  const [grantBusy, setGrantBusy] = useState(false)
  const [grantFeedback, setGrantFeedback] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<ItemTypeFilter>('all')
  const [worldNotesOpenByItemId, setWorldNotesOpenByItemId] = useState<Record<string, boolean>>({})
  const [isMobile, setIsMobile] = useState<boolean>(() => window.innerWidth <= MOBILE_BREAKPOINT)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const canEdit = role === 'gm'

  useEffect(() => {
    const updateMobileState = () => {
      const mobile = window.innerWidth <= MOBILE_BREAKPOINT
      setIsMobile(mobile)
      if (!mobile) setMobileView('list')
    }
    updateMobileState()
    window.addEventListener('resize', updateMobileState)
    return () => window.removeEventListener('resize', updateMobileState)
  }, [])

  const filteredItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => (a.typeName || a.name).localeCompare(b.typeName || b.name))
    if (typeFilter === 'all') return sorted.filter((item) => item.status !== 'dropped')
    if (typeFilter === 'dropped') return sorted.filter((item) => item.status === 'dropped')
    return sorted.filter((item) => item.type === typeFilter && item.status !== 'dropped')
  }, [items, typeFilter])

  const selectedItem = filteredItems.find((item) => item.id === selectedItemId) ?? items.find((item) => item.id === selectedItemId) ?? null
  const showListPane = !isMobile || mobileView === 'list'
  const showDetailPane = !isMobile || mobileView === 'detail'

  const addItem = () => {
    const defaultType: CampaignItemType = typeFilter === 'all' || typeFilter === 'dropped' ? 'general' : typeFilter
    const nextItem = newItemTemplate(defaultType)
    hookAddItem(nextItem)
    setSelectedItemId(nextItem.id)
    if (isMobile) setMobileView('detail')
  }

  const updateSelectedItem = (updates: Partial<CampaignItem>) => {
    if (!selectedItemId) return
    updateItem(selectedItemId, updates)
  }

  const uploadItemTokenImage = async (file: File) => {
    if (!selectedItem) throw new Error('No item selected.')
    const { path, url, name } = await uploadEntityImage({
      campaignId,
      collectionName: 'items',
      entityId: selectedItem.id,
      mediaKind: 'token-icons',
      file,
      maxWidth: 1024,
      maxHeight: 1024,
    })
    return {
      customImagePath: path,
      customImageUrl: url,
      customImageName: name,
    }
  }

  const uploadItemPortraitImage = async (file: File) => {
    if (!selectedItem) throw new Error('No item selected.')
    const { path, url } = await uploadEntityImage({
      campaignId,
      collectionName: 'items',
      entityId: selectedItem.id,
      mediaKind: 'portraits',
      file,
      maxWidth: 600,
      maxHeight: 800,
    })
    return {
      portraitPath: path,
      portraitUrl: url,
    }
  }

  const updateType = (nextType: CampaignItemType) => {
    if (!selectedItem) return
    const next: Partial<CampaignItem> = { type: nextType, typeId: 'custom', typeName: '' }
    if (nextType !== 'weapon') {
      next.weaponStats = { damageDiceCount: '', damageDiceSides: '', attackBonus: '', damageBonus: '', rangeShort: '', rangeMedium: '', rangeLong: '', twoHanded: false }
    }
    if (nextType !== 'armour') {
      next.armourStats = { armourClass: '', shieldMod: '', magicMod: '', armourType: 'body' }
    }
    if (nextType !== 'consumable') {
      next.consumableStats = { useMode: 'consume', effectText: '' }
    }
    updateSelectedItem(next)
  }

  const confirmDeleteItem = () => {
    if (!deleteCandidate) return
    const deleteId = deleteCandidate.id
    if (selectedItemId === deleteId) {
      const remaining = items.filter((item) => item.id !== deleteId)
      setSelectedItemId(remaining[0]?.id ?? null)
    }
    setWorldNotesOpenByItemId((current) => {
      const next = { ...current }
      delete next[deleteId]
      return next
    })
    hookDeleteItem(deleteId)
    setDeleteCandidate(null)
  }

  const grantItemToCharacter = async () => {
    if (!selectedItem || !grantTargetId || grantBusy) return
    setGrantBusy(true)
    setGrantFeedback(null)
    try {
      const isGoldGrant = selectedItem.type === 'gold'
      const charRef = doc(db, 'campaigns', campaignId, 'characters', grantTargetId)
      const targetName = characters.find((c) => c.id === grantTargetId)?.name ?? 'character'

      // Pre-generate deterministic ID for overflow gold doc (safe for transaction retry)
      const overflowGoldDocId = crypto.randomUUID()

      let overflowFeedback: string | null = null

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(charRef)
        if (!snap.exists()) throw new Error('Target character not found')
        const data = snap.data() as { details?: CharacterSheetDetails | null } | undefined
        const existingDetails = (data?.details && typeof data.details === 'object')
          ? data.details as Record<string, unknown>
          : {}
        const currentInventory: CharacterInventoryItem[] = Array.isArray(existingDetails.inventory)
          ? existingDetails.inventory
          : []

        // Compute available packed slots from STR
        const abilityScores = (existingDetails.abilityScores && typeof existingDetails.abilityScores === 'object')
          ? existingDetails.abilityScores as Record<string, string>
          : {}
        const strScore = Number.parseInt(abilityScores.STR ?? '', 10)
        const availableSlots = computeAvailablePackedSlots(strScore)

        // Build candidate inventory
        let candidateInventory: CharacterInventoryItem[]
        let grantAmount = 0
        let existingGoldBeforeGrant = 0
        if (isGoldGrant) {
          grantAmount = selectedItem.goldAmount ?? 0
          existingGoldBeforeGrant = currentInventory
            .filter((i): i is CharacterGoldItem => i.kind === 'gold')
            .reduce((sum, g) => sum + (g.qty ?? 0), 0)
          const nonGold = currentInventory.filter((i) => i.kind !== 'gold')
          const equipped = nonGold.filter((i) => i.equipped)
          const packedNonGold = nonGold.filter((i) => !i.equipped)
          const totalGold = existingGoldBeforeGrant + grantAmount
          const goldChunks = campaignGoldToInventoryChunks(totalGold)
          candidateInventory = [...equipped, ...packedNonGold, ...goldChunks]
        } else {
          const inventoryItem = campaignItemToInventoryItem(selectedItem)
          candidateInventory = [...currentInventory, inventoryItem]
        }

        const overflow = computeOverflow(candidateInventory, availableSlots, grantTargetId, targetName)
        overflowFeedback = overflow.feedbackMessage

        // Write kept inventory to character doc
        tx.set(charRef, {
          details: {
            ...existingDetails,
            inventory: overflow.keptInventory,
          },
        }, { merge: true })

        // Write non-gold overflow items in same transaction
        for (const droppedItem of overflow.droppedItems) {
          const itemRef = doc(db, 'campaigns', campaignId, 'items', droppedItem.id)
          tx.set(itemRef, { ...toFirestoreItem(droppedItem), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        }

        // Write gold overflow in same transaction.
        // If source is dropped gold, remainder stays on source doc (below), so skip creating a new dropped gold doc.
        const sourceIsDroppedGold = isGoldGrant && selectedItem.status === 'dropped'
        if (overflow.droppedGoldAmount > 0 && !sourceIsDroppedGold) {
          const goldDoc = makeDroppedGoldCampaignItem(overflow.droppedGoldAmount, grantTargetId, targetName, overflowGoldDocId)
          const goldRef = doc(db, 'campaigns', campaignId, 'items', overflowGoldDocId)
          tx.set(goldRef, { ...toFirestoreItem(goldDoc), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        }

        // Handle dropped gold source doc: decrement remainder on same doc, or delete if fully picked up.
        if (sourceIsDroppedGold) {
          const sourceRef = doc(db, 'campaigns', campaignId, 'items', selectedItem.id)
          const keptGoldTotal = overflow.keptInventory
            .filter((i): i is CharacterGoldItem => i.kind === 'gold')
            .reduce((sum, g) => sum + (g.qty ?? 0), 0)
          const acceptedFromSource = Math.max(0, Math.min(grantAmount, keptGoldTotal - existingGoldBeforeGrant))
          const sourceRemainder = Math.max(0, grantAmount - acceptedFromSource)

          if (sourceRemainder <= 0) {
            tx.delete(sourceRef)
          } else {
            tx.set(
              sourceRef,
              { goldAmount: sourceRemainder, updatedAt: serverTimestamp() },
              { merge: true },
            )
          }
        }
      })

      const label = isGoldGrant ? `${selectedItem.goldAmount ?? 0} gp` : `"${selectedItem.typeName || selectedItem.name}"`
      const feedbackParts = [`Granted ${label} to ${targetName}`]
      if (overflowFeedback) feedbackParts.push(overflowFeedback)
      setGrantFeedback(feedbackParts.join('. '))
      setTimeout(() => setGrantFeedback(null), 5000)
    } catch (error) {
      console.error('Grant item failed', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      setGrantFeedback(`Grant failed: ${message}`)
    } finally {
      setGrantBusy(false)
    }
  }

  const worldNotesHasContent =
    !!selectedItem?.specialRule.trim() ||
    !!selectedItem?.notes.trim()
  const worldNotesOpen = selectedItem
    ? (worldNotesOpenByItemId[selectedItem.id] ?? worldNotesHasContent)
    : false

  const droppedCount = items.filter((item) => item.status === 'dropped').length
  const authoredItems = items.filter((item) => item.status !== 'dropped')

  const typeDropdown = (item: CampaignItem) => {
    if (item.type === 'weapon') {
      return (
        <label>
          Type
          <select
            value={item.typeId}
            disabled={!canEdit}
            onChange={(event) => {
              const id = event.target.value
              if (id === 'custom') {
                updateSelectedItem({ typeId: 'custom', typeName: '' })
              } else {
                const t = OSE_WEAPON_CATALOG.find((w) => w.id === id)
                if (t) updateSelectedItem({ typeId: id, typeName: t.name })
              }
            }}
          >
            <option value="custom">Custom</option>
            {OSE_WEAPON_CATALOG.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </label>
      )
    }
    if (item.type === 'armour') {
      return (
        <label>
          Type
          <select
            value={item.typeId}
            disabled={!canEdit}
            onChange={(event) => {
              const id = event.target.value
              if (id === 'custom') {
                updateSelectedItem({ typeId: 'custom', typeName: '' })
              } else {
                const t = OSE_ARMOUR_CATALOG.find((a) => a.id === id)
                if (t) updateSelectedItem({ typeId: id, typeName: t.name })
              }
            }}
          >
            <option value="custom">Custom</option>
            {OSE_ARMOUR_CATALOG.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
      )
    }
    if (item.type === 'ammunition') {
      return (
        <label>
          Type
          <select
            value={item.typeId}
            disabled={!canEdit}
            onChange={(event) => {
              const id = event.target.value
              if (id === 'custom') {
                updateSelectedItem({ typeId: 'custom', typeName: '' })
              } else {
                const t = ammoCatalog.find((a) => a.id === id)
                if (t) updateSelectedItem({ typeId: id, typeName: t.name, gpValue: String(t.costGp), description: t.description })
              }
            }}
          >
            <option value="custom">Custom</option>
            {ammoCatalog.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
      )
    }
    if (item.type === 'consumable') {
      return (
        <label>
          Type
          <select
            value={item.typeId}
            disabled={!canEdit}
            onChange={(event) => {
              const id = event.target.value
              if (id === 'custom') {
                updateSelectedItem({ typeId: 'custom', typeName: '' })
              }
            }}
          >
            <option value="custom">Custom</option>
          </select>
        </label>
      )
    }
    // general
    return (
      <label>
        Type
        <select
          value={item.typeId}
          disabled={!canEdit}
          onChange={(event) => {
            const id = event.target.value
            if (id === 'custom') {
              updateSelectedItem({ typeId: 'custom', typeName: '' })
            } else {
              const t = generalCatalog.find((g) => g.id === id)
              if (t) updateSelectedItem({ typeId: id, typeName: t.name, gpValue: String(t.costGp), description: t.description })
            }
          }}
        >
          <option value="custom">Custom</option>
          {generalCatalog.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <div className="maps-layout monsters-layout items-layout">
      {showListPane ? (
        <aside className="maps-sidebar monsters-sidebar items-sidebar">
          <div className="maps-sidebar-header">
            <h2>Items</h2>
            {canEdit ? (
              <button type="button" className="monster-add-btn" onClick={addItem} aria-label="Add item">
                <Plus size={16} />
              </button>
            ) : null}
          </div>

          <div className="item-type-filter-grid">
            <button
              type="button"
              className={typeFilter === 'all' ? 'item-type-filter active' : 'item-type-filter'}
              onClick={() => setTypeFilter('all')}
            >
              <span>All</span>
              <small>{authoredItems.length}</small>
            </button>
            {itemTypeOptions.map((option) => {
              const count = authoredItems.filter((item) => item.type === option.value).length
              return (
                <button
                  key={option.value}
                  type="button"
                  className={typeFilter === option.value ? 'item-type-filter active' : 'item-type-filter'}
                  onClick={() => setTypeFilter(option.value)}
                >
                  <span>{option.label}</span>
                  <small>{count}</small>
                </button>
              )
            })}
            <button
              type="button"
              className={typeFilter === 'dropped' ? 'item-type-filter active' : 'item-type-filter'}
              onClick={() => setTypeFilter('dropped')}
            >
              <span>Dropped</span>
              <small>{droppedCount}</small>
            </button>
          </div>

          {filteredItems.length === 0 ? <p>{canEdit ? 'No items yet. Click + to create one.' : 'No items yet.'}</p> : null}

          <div className="item-list-grid">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className={item.id === selectedItemId ? 'item-row active' : 'item-row'}
              >
                <div
                  className="item-select"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedItemId(item.id)
                    if (isMobile) setMobileView('detail')
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedItemId(item.id)
                      if (isMobile) setMobileView('detail')
                    }
                  }}
                >
                  <div className="item-card-head">
                    <h4>{item.type === 'gold' ? `Gold: ${item.goldAmount ?? 0} gp` : (item.typeName.trim() || item.name.trim() || 'Unnamed Item')}</h4>
                    <span className="item-card-type">{item.status === 'dropped' ? 'dropped' : item.type}</span>
                  </div>
                  <p>
                    {item.status === 'dropped' && item.droppedByCharacterName
                      ? `Dropped by ${item.droppedByCharacterName}`
                      : item.type === 'gold' ? `${item.goldAmount ?? 0} gp`
                      : item.name.trim() || item.description.trim() || 'No details yet'}
                  </p>
                </div>
                {canEdit ? (
                  <div className="item-actions">
                    <button
                      type="button"
                      className="map-delete-btn"
                      onClick={() => setDeleteCandidate(item)}
                      aria-label={`Delete ${item.typeName || item.name || 'item'}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </aside>
      ) : null}

      {showDetailPane ? (
        <div className="monsters-detail items-detail">
          <div className="monsters-detail-inner items-detail-inner">
            {isMobile && selectedItem ? (
              <button
                type="button"
                className="back-link monster-mobile-back"
                onClick={() => setMobileView('list')}
                aria-label="Back to item list"
              >
                <ChevronLeft size={16} />
              </button>
            ) : null}

            {!selectedItem ? (
              <p>Select an item from the list or click + to create one.</p>
            ) : (
              <div className="item-editor-grid">
                {canEdit ? (
                  <div className="item-media-rail">
                    <EntityMediaEditor
                      entityName={selectedItem.typeName || selectedItem.name || 'item'}
                      portraitUrl={selectedItem.portraitUrl}
                      portraitFocusX={selectedItem.portraitFocusX}
                      portraitFocusY={selectedItem.portraitFocusY}
                      tokenIcon={selectedItem.tokenIcon}
                      onChange={(updates) => updateSelectedItem(updates)}
                      onUploadPortraitImage={uploadItemPortraitImage}
                      onUploadTokenImage={uploadItemTokenImage}
                      portraitAltLabel="Item portrait"
                      tokenButtonAriaLabel="Edit item token icon"
                      removePortraitMessage="Remove the portrait image from this item?"
                    />
                  </div>
                ) : null}
                <section className="item-section">
                  <h3 className="monster-section-title">Identity</h3>
                  <div className="item-identity-grid">
                    <label>
                      Kind
                      <select value={selectedItem.type} disabled={!canEdit} onChange={(event) => updateType(event.target.value as CampaignItemType)}>
                        {itemTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {typeDropdown(selectedItem)}
                    {selectedItem.typeId === 'custom' ? (
                      <label className="item-field-name">
                        Type Name
                        <input
                          type="text"
                          value={selectedItem.typeName}
                          readOnly={!canEdit}
                          onChange={(event) => updateSelectedItem({ typeName: event.target.value })}
                          placeholder="e.g. Bec de corbin"
                        />
                      </label>
                    ) : null}
                    <label className="item-field-name">
                      Name
                      <input
                        type="text"
                        value={selectedItem.name}
                        readOnly={!canEdit}
                        onChange={(event) => updateSelectedItem({ name: event.target.value })}
                        placeholder="Optional proper name"
                      />
                    </label>
                    <label className="item-field-description">
                      Description
                      <input
                        type="text"
                        value={selectedItem.description}
                        readOnly={!canEdit}
                        onChange={(event) => updateSelectedItem({ description: event.target.value })}
                        placeholder="Core table-facing item description."
                      />
                    </label>
                  </div>
                </section>

                <section className="item-section">
                  <h3 className="monster-section-title">Value</h3>
                  <div className="item-numeric-grid">
                    <label>
                      GP
                      <input
                        type="number"
                        min={0}
                        value={selectedItem.gpValue}
                        readOnly={!canEdit}
                        onChange={(event) => updateSelectedItem({ gpValue: event.target.value })}
                        placeholder="300"
                      />
                    </label>
                    {(selectedItem.type === 'ammunition' || selectedItem.type === 'consumable') ? (
                      <label>
                        Qty
                        <input
                          type="number"
                          min={0}
                          value={selectedItem.qty}
                          readOnly={!canEdit}
                          onChange={(event) => updateSelectedItem({ qty: event.target.value })}
                          placeholder="20"
                        />
                      </label>
                    ) : null}
                    <label className="item-checkbox-label">
                      <input
                        type="checkbox"
                        checked={selectedItem.isMagic}
                        disabled={!canEdit}
                        onChange={(event) => updateSelectedItem({ isMagic: event.target.checked })}
                      />
                      Magic
                    </label>
                  </div>
                </section>

                {selectedItem.type === 'weapon' ? (
                  <section className="item-section">
                    <h3 className="monster-section-title">Weapon Stats</h3>
                    <div className="item-numeric-grid item-template-grid">
                      <label>
                        Dice #
                        <input
                          type="number"
                          min={0}
                          value={selectedItem.weaponStats.damageDiceCount}
                          readOnly={!canEdit}
                          onChange={(event) =>
                            updateSelectedItem({
                              weaponStats: { ...selectedItem.weaponStats, damageDiceCount: event.target.value },
                            })
                          }
                          placeholder="1"
                        />
                      </label>
                      <label>
                        Die
                        <select
                          value={selectedItem.weaponStats.damageDiceSides}
                          disabled={!canEdit}
                          onChange={(event) =>
                            updateSelectedItem({
                              weaponStats: {
                                ...selectedItem.weaponStats,
                                damageDiceSides: event.target.value,
                                damageDiceCount: selectedItem.weaponStats.damageDiceCount || (event.target.value ? '1' : ''),
                              },
                            })
                          }
                        >
                          <option value="">—</option>
                          <option value="4">d4</option>
                          <option value="6">d6</option>
                          <option value="8">d8</option>
                          <option value="10">d10</option>
                          <option value="12">d12</option>
                          <option value="20">d20</option>
                        </select>
                      </label>
                      <label>
                        Atk +
                        <input
                          type="number"
                          value={selectedItem.weaponStats.attackBonus}
                          readOnly={!canEdit}
                          onChange={(event) =>
                            updateSelectedItem({
                              weaponStats: { ...selectedItem.weaponStats, attackBonus: event.target.value },
                            })
                          }
                          placeholder="0"
                        />
                      </label>
                      <label>
                        Dmg +
                        <input
                          type="number"
                          value={selectedItem.weaponStats.damageBonus}
                          readOnly={!canEdit}
                          onChange={(event) =>
                            updateSelectedItem({
                              weaponStats: { ...selectedItem.weaponStats, damageBonus: event.target.value },
                            })
                          }
                          placeholder="0"
                        />
                      </label>
                    </div>
                    <div className="item-numeric-grid">
                      <label>
                        Range S
                        <input
                          type="text"
                          value={selectedItem.weaponStats.rangeShort}
                          readOnly={!canEdit}
                          onChange={(event) =>
                            updateSelectedItem({
                              weaponStats: { ...selectedItem.weaponStats, rangeShort: event.target.value },
                            })
                          }
                          placeholder="—"
                        />
                      </label>
                      <label>
                        Range M
                        <input
                          type="text"
                          value={selectedItem.weaponStats.rangeMedium}
                          readOnly={!canEdit}
                          onChange={(event) =>
                            updateSelectedItem({
                              weaponStats: { ...selectedItem.weaponStats, rangeMedium: event.target.value },
                            })
                          }
                          placeholder="—"
                        />
                      </label>
                      <label>
                        Range L
                        <input
                          type="text"
                          value={selectedItem.weaponStats.rangeLong}
                          readOnly={!canEdit}
                          onChange={(event) =>
                            updateSelectedItem({
                              weaponStats: { ...selectedItem.weaponStats, rangeLong: event.target.value },
                            })
                          }
                          placeholder="—"
                        />
                      </label>
                      <label className="item-checkbox-label">
                        <input
                          type="checkbox"
                          checked={selectedItem.weaponStats.twoHanded}
                          disabled={!canEdit}
                          onChange={(event) =>
                            updateSelectedItem({
                              weaponStats: { ...selectedItem.weaponStats, twoHanded: event.target.checked },
                            })
                          }
                        />
                        Two-handed
                      </label>
                    </div>
                  </section>
                ) : null}

                {selectedItem.type === 'armour' ? (
                  <section className="item-section">
                    <h3 className="monster-section-title">Armour Stats</h3>
                    <div className="item-numeric-grid">
                      <label>
                        {selectedItem.armourStats.armourType === 'shield' ? 'Shield Mod' : 'Armour Class'}
                        <input
                          type="number"
                          value={selectedItem.armourStats.armourType === 'shield' ? selectedItem.armourStats.shieldMod : selectedItem.armourStats.armourClass}
                          readOnly={!canEdit}
                          onChange={(event) =>
                            updateSelectedItem({
                              armourStats: selectedItem.armourStats.armourType === 'shield'
                                ? { ...selectedItem.armourStats, shieldMod: event.target.value }
                                : { ...selectedItem.armourStats, armourClass: event.target.value },
                            })
                          }
                          placeholder={selectedItem.armourStats.armourType === 'shield' ? '-1' : '7'}
                        />
                      </label>
                      <label>
                        Magic Mod
                        <input
                          type="number"
                          value={selectedItem.armourStats.magicMod}
                          readOnly={!canEdit}
                          onChange={(event) =>
                            updateSelectedItem({
                              armourStats: { ...selectedItem.armourStats, magicMod: event.target.value },
                            })
                          }
                          placeholder="0"
                        />
                      </label>
                      <label>
                        Type
                        <select
                          value={selectedItem.armourStats.armourType}
                          disabled={!canEdit}
                          onChange={(event) =>
                            updateSelectedItem({
                              armourStats: { ...selectedItem.armourStats, armourType: event.target.value as 'body' | 'shield' },
                            })
                          }
                        >
                          <option value="body">Body Armour</option>
                          <option value="shield">Shield</option>
                        </select>
                      </label>
                    </div>
                  </section>
                ) : null}

                {selectedItem.type === 'consumable' ? (
                  <section className="item-section">
                    <h3 className="monster-section-title">Consumable Stats</h3>
                    <div className="item-numeric-grid">
                      <label>
                        Use Mode
                        <select
                          value={selectedItem.consumableStats.useMode}
                          disabled={!canEdit}
                          onChange={(event) =>
                            updateSelectedItem({
                              consumableStats: { ...selectedItem.consumableStats, useMode: event.target.value as 'consume' | 'use' },
                            })
                          }
                        >
                          <option value="consume">Consume (drink, eat, apply)</option>
                          <option value="use">Use (light, activate, burn)</option>
                        </select>
                      </label>
                      <label className="item-field-description">
                        Effect
                        <input
                          type="text"
                          value={selectedItem.consumableStats.effectText}
                          readOnly={!canEdit}
                          onChange={(event) =>
                            updateSelectedItem({
                              consumableStats: { ...selectedItem.consumableStats, effectText: event.target.value },
                            })
                          }
                          placeholder="Effect description"
                        />
                      </label>
                    </div>
                  </section>
                ) : null}

                <section className="item-section">
                  <div className="section-head">
                    <h3 className="monster-section-title">Story Notes</h3>
                    {!worldNotesOpen ? (
                      <button
                        type="button"
                        className="icon-btn add-btn"
                        onClick={() =>
                          setWorldNotesOpenByItemId((current) => ({ ...current, [selectedItem.id]: true }))
                        }
                        aria-label="Show world notes"
                      >
                        <Plus size={13} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="icon-btn remove-btn"
                        onClick={() =>
                          setWorldNotesOpenByItemId((current) => ({ ...current, [selectedItem.id]: false }))
                        }
                        aria-label="Hide story notes"
                      >
                        <Minus size={13} />
                      </button>
                    )}
                  </div>
                  {worldNotesOpen ? (
                    <div className="item-world-grid">
                      <label>
                        Special Rule
                        <input
                          type="text"
                          value={selectedItem.specialRule}
                          readOnly={!canEdit}
                          onChange={(event) => updateSelectedItem({ specialRule: event.target.value })}
                          placeholder="Any non-standard ruling text."
                        />
                      </label>
                      <label>
                        Notes
                        <textarea
                          value={selectedItem.notes}
                          readOnly={!canEdit}
                          onChange={(event) => updateSelectedItem({ notes: event.target.value })}
                          placeholder="Story-facing effects and GM reminders."
                        />
                      </label>
                    </div>
                  ) : null}
                </section>

                {canEdit && characters.length > 0 ? (
                  <section className="item-section">
                    <h3 className="monster-section-title">Grant to Character</h3>
                    <div className="item-grant-row">
                      <select
                        value={grantTargetId}
                        onChange={(event) => setGrantTargetId(event.target.value)}
                      >
                        <option value="">Select character…</option>
                        {characters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name || 'Unnamed'} ({c.className} {c.level})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="icon-btn add-btn"
                        disabled={!grantTargetId || grantBusy}
                        onClick={grantItemToCharacter}
                        aria-label="Grant item to selected character"
                      >
                        <Gift size={14} />
                        {grantBusy ? ' …' : ' Grant'}
                      </button>
                    </div>
                    {grantFeedback ? <p className="item-grant-feedback">{grantFeedback}</p> : null}
                  </section>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
      <ConfirmModal
        open={deleteCandidate !== null}
        title="Delete Item?"
        message={`Permanently remove "${deleteCandidate?.typeName || deleteCandidate?.name || ''}"?`}
        confirmLabel="Delete"
        onConfirm={confirmDeleteItem}
        onCancel={() => setDeleteCandidate(null)}
      />
    </div>
  )
}
