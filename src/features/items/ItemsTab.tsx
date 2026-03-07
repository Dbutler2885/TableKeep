import { ChevronLeft, Minus, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Role } from '../../types/app'
import { ConfirmModal } from '../common/ConfirmModal'
import { EntityMediaEditor } from '../common/EntityMediaEditor'
import type { TokenIconConfig } from '../tokens/TokenIconEditor'
import { MOBILE_BREAKPOINT } from '../../constants/layout'

type ItemType = 'weapon' | 'armor' | 'consumable' | 'misc'
type ItemTypeFilter = ItemType | 'all'

type ItemRecord = {
  id: string
  name: string
  type: ItemType
  portraitUrl: string | null
  portraitFocusX: number
  portraitFocusY: number
  tokenIcon: TokenIconConfig
  subtype: string
  description: string
  gpValue: string
  weight: string
  quantity: string
  weaponStats: {
    damage: string
    attackBonus: string
    damageBonus: string
  }
  armorStats: {
    acBonus: string
  }
  specialRule: string
  notes: string
}

const defaultTokenIcon: TokenIconConfig = {
  icon: 'pawn',
  color: '#bf2f2a',
  size: 34,
}

type ItemsTabProps = {
  role: Role | null
}

const itemTypeOptions: Array<{ value: ItemType; label: string }> = [
  { value: 'weapon', label: 'Weapons' },
  { value: 'armor', label: 'Armor' },
  { value: 'consumable', label: 'Consumables' },
  { value: 'misc', label: 'Misc' },
]

const newItemTemplate = (type: ItemType): ItemRecord => ({
  id: crypto.randomUUID(),
  name: 'New Item',
  type,
  portraitUrl: null,
  portraitFocusX: 50,
  portraitFocusY: 50,
  tokenIcon: defaultTokenIcon,
  subtype: '',
  description: '',
  gpValue: '',
  weight: '',
  quantity: '1',
  weaponStats: {
    damage: '',
    attackBonus: '',
    damageBonus: '',
  },
  armorStats: {
    acBonus: '',
  },
  specialRule: '',
  notes: '',
})

export function ItemsTab({ role }: ItemsTabProps) {
  const [items, setItems] = useState<ItemRecord[]>([])
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [deleteCandidate, setDeleteCandidate] = useState<ItemRecord | null>(null)
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
    const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name))
    if (typeFilter === 'all') return sorted
    return sorted.filter((item) => item.type === typeFilter)
  }, [items, typeFilter])

  const selectedItem = filteredItems.find((item) => item.id === selectedItemId) ?? items.find((item) => item.id === selectedItemId) ?? null
  const showListPane = !isMobile || mobileView === 'list'
  const showDetailPane = !isMobile || mobileView === 'detail'

  const addItem = () => {
    const defaultType = typeFilter === 'all' ? 'misc' : typeFilter
    const nextItem = newItemTemplate(defaultType)
    setItems((current) => [nextItem, ...current])
    setSelectedItemId(nextItem.id)
    if (isMobile) setMobileView('detail')
  }

  const updateSelectedItem = (updates: Partial<ItemRecord>) => {
    if (!selectedItemId) return
    setItems((current) => current.map((item) => (item.id === selectedItemId ? { ...item, ...updates } : item)))
  }

  const updateType = (nextType: ItemType) => {
    if (!selectedItem) return
    const next: Partial<ItemRecord> = { type: nextType }
    if (nextType !== 'weapon') {
      next.weaponStats = { damage: '', attackBonus: '', damageBonus: '' }
    }
    if (nextType !== 'armor') {
      next.armorStats = { acBonus: '' }
    }
    updateSelectedItem(next)
  }

  const deleteItem = () => {
    if (!deleteCandidate) return
    const deleteId = deleteCandidate.id
    setItems((current) => {
      const next = current.filter((item) => item.id !== deleteId)
      if (selectedItemId === deleteId) {
        setSelectedItemId(next[0]?.id ?? null)
      }
      return next
    })
    setWorldNotesOpenByItemId((current) => {
      const next = { ...current }
      delete next[deleteId]
      return next
    })
    setDeleteCandidate(null)
  }

  if (!canEdit) {
    return (
      <div className="stack-tight">
        <h2>Items</h2>
        <p>Only the GM can create and edit items.</p>
      </div>
    )
  }

  const worldNotesHasContent =
    !!selectedItem?.specialRule.trim() ||
    !!selectedItem?.notes.trim()
  const worldNotesOpen = selectedItem
    ? (worldNotesOpenByItemId[selectedItem.id] ?? worldNotesHasContent)
    : false

  return (
    <div className="maps-layout monsters-layout items-layout">
      {showListPane ? (
        <aside className="maps-sidebar monsters-sidebar items-sidebar">
          <div className="maps-sidebar-header">
            <h2>Items</h2>
            <button type="button" className="monster-add-btn" onClick={addItem} aria-label="Add item">
              <Plus size={16} />
            </button>
          </div>

          <div className="item-type-filter-grid">
            <button
              type="button"
              className={typeFilter === 'all' ? 'item-type-filter active' : 'item-type-filter'}
              onClick={() => setTypeFilter('all')}
            >
              <span>All</span>
              <small>{items.length}</small>
            </button>
            {itemTypeOptions.map((option) => {
              const count = items.filter((item) => item.type === option.value).length
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
          </div>

          {filteredItems.length === 0 ? <p>No items yet. Click + to create one.</p> : null}

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
                    <h4>{item.name.trim() || 'Unnamed Item'}</h4>
                    <span className="item-card-type">{item.type}</span>
                  </div>
                  <p>{item.subtype.trim() || item.description.trim() || 'No details yet'}</p>
                </div>
                <div className="item-actions">
                  <button
                    type="button"
                    className="map-delete-btn"
                    onClick={() => setDeleteCandidate(item)}
                    aria-label={`Delete ${item.name || 'item'}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
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
                <div className="item-media-rail">
                  <EntityMediaEditor
                    entityName={selectedItem.name || 'item'}
                    portraitUrl={selectedItem.portraitUrl}
                    portraitFocusX={selectedItem.portraitFocusX}
                    portraitFocusY={selectedItem.portraitFocusY}
                    tokenIcon={selectedItem.tokenIcon}
                    onChange={(updates) => updateSelectedItem(updates)}
                    portraitAltLabel="Item portrait"
                    tokenButtonAriaLabel="Edit item token icon"
                    removePortraitMessage="Remove the portrait image from this item?"
                  />
                </div>
                <section className="item-section">
                  <h3 className="monster-section-title">Identity</h3>
                  <div className="item-identity-grid">
                    <label className="item-field-name">
                      Name
                      <input
                        type="text"
                        value={selectedItem.name}
                        onChange={(event) => updateSelectedItem({ name: event.target.value })}
                        placeholder="Holy Sword of Sir Brandon"
                      />
                    </label>
                    <label>
                      Type
                      <select value={selectedItem.type} onChange={(event) => updateType(event.target.value as ItemType)}>
                        {itemTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Subtype
                      <input
                        type="text"
                        value={selectedItem.subtype}
                        onChange={(event) => updateSelectedItem({ subtype: event.target.value })}
                        placeholder="longsword, ring, relic..."
                      />
                    </label>
                    <label className="item-field-description">
                      Description
                      <input
                        type="text"
                        value={selectedItem.description}
                        onChange={(event) => updateSelectedItem({ description: event.target.value })}
                        placeholder="Core table-facing item description."
                      />
                    </label>
                  </div>
                </section>

                <section className="item-section">
                  <h3 className="monster-section-title">Value & Carry</h3>
                  <div className="item-numeric-grid">
                    <label>
                      GP
                      <input
                        type="number"
                        min={0}
                        value={selectedItem.gpValue}
                        onChange={(event) => updateSelectedItem({ gpValue: event.target.value })}
                        placeholder="300"
                      />
                    </label>
                    <label>
                      Weight
                      <input
                        type="number"
                        min={0}
                        value={selectedItem.weight}
                        onChange={(event) => updateSelectedItem({ weight: event.target.value })}
                        placeholder="10"
                      />
                    </label>
                    <label>
                      Qty
                      <input
                        type="number"
                        min={0}
                        value={selectedItem.quantity}
                        onChange={(event) => updateSelectedItem({ quantity: event.target.value })}
                      />
                    </label>
                  </div>
                </section>

                {selectedItem.type === 'weapon' ? (
                  <section className="item-section">
                    <h3 className="monster-section-title">Weapon Stats</h3>
                    <div className="item-numeric-grid">
                      <label>
                        Damage
                        <input
                          type="text"
                          value={selectedItem.weaponStats.damage}
                          onChange={(event) =>
                            updateSelectedItem({
                              weaponStats: { ...selectedItem.weaponStats, damage: event.target.value },
                            })
                          }
                          placeholder="1d8"
                        />
                      </label>
                      <label>
                        Atk +
                        <input
                          type="number"
                          value={selectedItem.weaponStats.attackBonus}
                          onChange={(event) =>
                            updateSelectedItem({
                              weaponStats: { ...selectedItem.weaponStats, attackBonus: event.target.value },
                            })
                          }
                          placeholder="1"
                        />
                      </label>
                      <label>
                        Dmg +
                        <input
                          type="number"
                          value={selectedItem.weaponStats.damageBonus}
                          onChange={(event) =>
                            updateSelectedItem({
                              weaponStats: { ...selectedItem.weaponStats, damageBonus: event.target.value },
                            })
                          }
                          placeholder="1"
                        />
                      </label>
                    </div>
                  </section>
                ) : null}

                {selectedItem.type === 'armor' ? (
                  <section className="item-section">
                    <h3 className="monster-section-title">Armor Stats</h3>
                    <div className="item-numeric-grid">
                      <label>
                        AC Bonus
                        <input
                          type="number"
                          value={selectedItem.armorStats.acBonus}
                          onChange={(event) =>
                            updateSelectedItem({
                              armorStats: { ...selectedItem.armorStats, acBonus: event.target.value },
                            })
                          }
                          placeholder="1"
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
                          onChange={(event) => updateSelectedItem({ specialRule: event.target.value })}
                          placeholder="Any non-standard ruling text."
                        />
                      </label>
                      <label>
                        Notes
                        <textarea
                          value={selectedItem.notes}
                          onChange={(event) => updateSelectedItem({ notes: event.target.value })}
                          placeholder="Story-facing effects and GM reminders."
                        />
                      </label>
                    </div>
                  ) : null}
                </section>
              </div>
            )}
          </div>
        </div>
      ) : null}
      <ConfirmModal
        open={deleteCandidate !== null}
        title="Delete Item?"
        message={`Permanently remove "${deleteCandidate?.name ?? ''}"?`}
        confirmLabel="Delete"
        onConfirm={deleteItem}
        onCancel={() => setDeleteCandidate(null)}
      />
    </div>
  )
}
