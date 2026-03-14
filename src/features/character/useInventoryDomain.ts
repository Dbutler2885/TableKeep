import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import type { Dispatch, SetStateAction } from 'react'
import { inventoryItemToCampaignItem } from '../items/itemConversion'
import { toFirestoreItem } from '../items/useItems'
import { DEFAULT_STACK_POLICY } from '../items/itemDefaults'
import { db } from '../../firebase'
import type {
  CharacterRecord,
  CharacterInventoryItem,
  CharacterWeaponItem,
  CharacterArmourItem,
  CharacterGoldItem,
  CharacterGeneralItem,
  CharacterConsumableItem,
  CharacterAmmunitionItem,
} from '../../types/app'
import {
  normalizeGoldAmount,
  goldChunksForAmount,
  makeGoldItem,
  computeOverflow,
  writeDroppedOverflow,
} from './inventoryOverflow'
import { applyWeaponTemplateToItem, applyArmourTemplateToItem, resolveArmourType, isArmourTemplateAllowedForClass, isWeaponTemplateAllowedForClass } from './inventoryRules'
import { makeArmourItem, makeId, makeWeaponItem } from './characterFactories'
import { ammoCatalogById } from './ammoCatalog'
import { consumableCatalogById } from './consumableCatalog'
import { generalCatalogById } from './generalCatalog'

export type AddItemModalState = {
  equipped: boolean
  kind: 'general' | 'weapon' | 'armour' | 'ammunition' | 'consumable'
  typeName: string
  name: string
  costGp: string
  notes: string
  description: string
  typeId: string
  damageDiceCount: string
  damageDiceSides: string
  rangeShort: string
  rangeMedium: string
  rangeLong: string
  slow: boolean
  twoHanded: boolean
  isMagic: boolean
  attackBonus: string
  damageBonus: string
  armourClass: string
  shieldMod: string
  magicMod: string
  armourType: 'body' | 'shield'
  qty: string
  useMode: 'consume' | 'use'
  effectText: string
}

type Params = {
  campaignId: string
  currentUsername: string
  effectiveSelected: CharacterRecord | null
  canEditSelected: boolean
  canEditInventoryDetails: boolean
  selectedClassName: string
  canClassEquipArmour: boolean
  selectedInventory: CharacterInventoryItem[]
  availablePackedSlotCount: number
  requiresApprovalNow: boolean
  isGuidedCreation: boolean
  overflowWriting: boolean
  addItemModal: AddItemModalState | null

  setInventoryByCharacterId: Dispatch<SetStateAction<Record<string, CharacterInventoryItem[]>>>
  setAddItemModal: Dispatch<SetStateAction<AddItemModalState | null>>
  setOverflowWriting: Dispatch<SetStateAction<boolean>>
  setOverflowFeedback: Dispatch<SetStateAction<string | null>>
  setItemDetailId: Dispatch<SetStateAction<string | null>>
  setDropConfirmItemId: Dispatch<SetStateAction<string | null>>
  setSellConfirmItemId: Dispatch<SetStateAction<string | null>>
  setGoldSpendAmount: Dispatch<SetStateAction<string>>
  setApprovalPendingFeedback: Dispatch<SetStateAction<string | null>>

  submitRequest: (
    action: 'create' | 'sell' | 'learn_spell',
    characterId: string,
    characterName: string,
    username: string,
    item: CharacterInventoryItem,
  ) => Promise<void>
}

export function useInventoryDomain({
  campaignId,
  currentUsername,
  effectiveSelected,
  canEditSelected,
  canEditInventoryDetails,
  selectedClassName,
  canClassEquipArmour,
  selectedInventory,
  availablePackedSlotCount,
  requiresApprovalNow,
  isGuidedCreation,
  overflowWriting,
  addItemModal,
  setInventoryByCharacterId,
  setAddItemModal,
  setOverflowWriting,
  setOverflowFeedback,
  setItemDetailId,
  setDropConfirmItemId,
  setSellConfirmItemId,
  setGoldSpendAmount,
  setApprovalPendingFeedback,
  submitRequest,
}: Params) {
  const filterInventoryUpdatesForPlayer = <T extends Partial<CharacterInventoryItem>>(updates: T) => {
    if (canEditInventoryDetails) return updates
    const allowed: Partial<CharacterInventoryItem> = {}
    if (Object.prototype.hasOwnProperty.call(updates, 'equipped')) {
      allowed.equipped = updates.equipped
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
      allowed.name = updates.name
    }
    return allowed as T
  }

  const updateInventoryItem = (itemId: string, updates: Partial<CharacterInventoryItem>) => {
    if (!effectiveSelected) return
    const nextUpdates = filterInventoryUpdatesForPlayer(updates)
    if (Object.keys(nextUpdates).length === 0) return
    setInventoryByCharacterId((current) => {
      const items = current[effectiveSelected.id] ?? []
      return {
        ...current,
        [effectiveSelected.id]: items.map((item) =>
          item.id === itemId ? { ...item, ...nextUpdates } as CharacterInventoryItem : item,
        ),
      }
    })
  }

  const setInventoryGold = async (amount: number) => {
    if (!effectiveSelected || overflowWriting) return
    const nonGold = selectedInventory.filter((i) => i.kind !== 'gold')
    const chunks = goldChunksForAmount(Math.max(0, amount))
    const goldItems = chunks.map((chunk) => makeGoldItem(chunk))
    const candidateInventory = [...nonGold, ...goldItems]

    const overflow = computeOverflow(candidateInventory, availablePackedSlotCount, effectiveSelected.id, effectiveSelected.name)

    if (overflow.droppedItems.length > 0 || overflow.droppedGoldAmount > 0) {
      setOverflowWriting(true)
      try {
        await writeDroppedOverflow(db, campaignId, overflow.droppedItems, overflow.droppedGoldAmount, effectiveSelected.id, effectiveSelected.name)
      } catch {
        setOverflowFeedback('Failed to write overflow items. Gold change cancelled.')
        setOverflowWriting(false)
        return
      }
      setOverflowWriting(false)
    }

    setInventoryByCharacterId((current) => ({ ...current, [effectiveSelected.id]: overflow.keptInventory }))
    if (overflow.feedbackMessage) setOverflowFeedback(overflow.feedbackMessage)
  }

  const updateWeaponRow = (itemId: string, updates: Partial<CharacterWeaponItem>) => {
    if (!effectiveSelected) return
    const nextUpdates = filterInventoryUpdatesForPlayer(updates)
    if (Object.keys(nextUpdates).length === 0) return
    setInventoryByCharacterId((current) => {
      const items = current[effectiveSelected.id] ?? []
      const shouldEquipExclusively = nextUpdates.equipped === true

      return {
        ...current,
        [effectiveSelected.id]: items.map((item) => {
          if (item.kind !== 'weapon') return item
          if (item.id !== itemId) {
            if (shouldEquipExclusively) return { ...item, equipped: false }
            return item
          }
          let merged = { ...item, ...nextUpdates } as CharacterWeaponItem
          if (Object.prototype.hasOwnProperty.call(nextUpdates, 'typeId')) {
            merged = applyWeaponTemplateToItem(merged, nextUpdates.typeId ?? '')
          }
          if (selectedClassName === 'Halfling' && merged.twoHanded) {
            merged = { ...merged, twoHanded: false, equipped: false }
          }
          if (!isWeaponTemplateAllowedForClass(merged.typeId, selectedClassName)) {
            merged = { ...merged, equipped: false }
          }
          return merged
        }),
      }
    })
  }

  const updateArmourRow = (armourItemId: string, updates: Partial<CharacterArmourItem>) => {
    if (!effectiveSelected) return
    const nextUpdates = filterInventoryUpdatesForPlayer(updates)
    if (Object.keys(nextUpdates).length === 0) return
    setInventoryByCharacterId((current) => {
      const items = current[effectiveSelected.id] ?? []
      const shouldEquipExclusively = nextUpdates.equipped === true
      const currentTarget = items.find((item): item is CharacterArmourItem => item.kind === 'armour' && item.id === armourItemId) ?? null
      const targetArmourType = nextUpdates.armourType ?? (currentTarget ? resolveArmourType(currentTarget) : 'body')
      return {
        ...current,
        [effectiveSelected.id]: items.map((item) => {
          if (item.kind !== 'armour') return item
          const normalizedItem = { ...item, armourType: resolveArmourType(item) } as CharacterArmourItem
          if (item.id !== armourItemId) {
            if (shouldEquipExclusively && resolveArmourType(item) === targetArmourType) {
              return { ...normalizedItem, equipped: false }
            }
            return normalizedItem
          }
          let merged = { ...normalizedItem, ...nextUpdates } as CharacterArmourItem
          if (nextUpdates.typeId) {
            merged = applyArmourTemplateToItem(merged, nextUpdates.typeId)
          }
          if (!canClassEquipArmour) {
            merged = { ...merged, equipped: false }
          }
          if (!isArmourTemplateAllowedForClass(merged.typeId, selectedClassName)) {
            merged = { ...merged, equipped: false }
          }
          return merged
        }),
      }
    })
  }

  const openAddItemModal = (equipped: boolean) => {
    if (isGuidedCreation) return
    setAddItemModal({
      equipped, kind: 'general', typeName: '', name: '', costGp: '', notes: '', description: '',
      typeId: 'custom', damageDiceCount: '', damageDiceSides: '', rangeShort: '',
      rangeMedium: '', rangeLong: '', slow: false, twoHanded: false, isMagic: false, attackBonus: '',
      damageBonus: '', armourClass: '', shieldMod: '', magicMod: '', armourType: 'body', qty: '1', useMode: 'consume', effectText: '',
    })
  }

  const saveAddItem = () => {
    if (!addItemModal || !effectiveSelected || !canEditSelected) return
    const m = addItemModal
    const costGp = Number.parseFloat(m.costGp) || 0
    const fallbackTypeName = (m.typeName || m.name || 'Item').trim()

    let newItem: CharacterInventoryItem
    switch (m.kind) {
      case 'weapon': {
        let item = makeWeaponItem({
          typeName: fallbackTypeName,
          name: m.name || undefined, costGp, equipped: m.equipped, notes: m.notes,
          description: m.description, isMagic: m.isMagic, attackBonus: m.attackBonus,
          damageBonus: m.damageBonus,
          damageDiceCount: m.damageDiceCount, damageDiceSides: m.damageDiceSides,
          rangeShort: m.rangeShort, rangeMedium: m.rangeMedium, rangeLong: m.rangeLong,
          slow: m.slow,
          twoHanded: m.twoHanded,
        })
        if (m.typeId && m.typeId !== 'custom') item = applyWeaponTemplateToItem(item, m.typeId)
        newItem = item
        break
      }
      case 'armour': {
        let item = makeArmourItem({
          typeName: fallbackTypeName,
          name: m.name || undefined, costGp, equipped: m.equipped, notes: m.notes,
          description: m.description, isMagic: m.isMagic, magicMod: m.magicMod, armourClass: m.armourClass, shieldMod: m.shieldMod, armourType: m.armourType,
        })
        if (m.typeId && m.typeId !== 'custom') item = applyArmourTemplateToItem(item, m.typeId)
        newItem = item
        break
      }
      case 'ammunition': {
        const ammoTemplate = m.typeId && m.typeId !== 'custom' ? ammoCatalogById[m.typeId] : null
        newItem = {
          id: makeId(), kind: 'ammunition',
          typeId: ammoTemplate ? ammoTemplate.id : 'custom',
          typeName: ammoTemplate ? ammoTemplate.name : fallbackTypeName,
          name: m.name || undefined,
          costGp: ammoTemplate ? ammoTemplate.costGp : costGp,
          equipped: m.equipped, notes: m.notes,
          description: ammoTemplate ? ammoTemplate.description : m.description,
          qty: ammoTemplate ? ammoTemplate.qty : (Number.parseInt(m.qty, 10) || 1),
          stack: DEFAULT_STACK_POLICY.ammunition,
        } as CharacterAmmunitionItem
        break
      }
      case 'consumable': {
        const conTemplate = m.typeId && m.typeId !== 'custom' ? consumableCatalogById[m.typeId] : null
        newItem = {
          id: makeId(), kind: 'consumable',
          typeId: conTemplate ? conTemplate.id : 'custom',
          typeName: conTemplate ? conTemplate.name : fallbackTypeName,
          name: m.name || undefined,
          costGp: conTemplate ? conTemplate.costGp : costGp,
          equipped: m.equipped, notes: m.notes,
          description: conTemplate ? conTemplate.description : m.description,
          qty: conTemplate ? conTemplate.qty : (Number.parseInt(m.qty, 10) || 1),
          stack: DEFAULT_STACK_POLICY.consumable,
          useMode: conTemplate ? conTemplate.useMode : m.useMode,
          effectText: (conTemplate ? conTemplate.effectText : m.effectText) || undefined,
        } as CharacterConsumableItem
        break
      }
      default: {
        const genTemplate = m.typeId && m.typeId !== 'custom' ? generalCatalogById[m.typeId] : null
        newItem = {
          id: makeId(), kind: 'general',
          typeId: genTemplate ? genTemplate.id : 'custom',
          typeName: genTemplate ? genTemplate.name : fallbackTypeName,
          name: m.name || undefined,
          costGp: genTemplate ? genTemplate.costGp : costGp,
          equipped: m.equipped, notes: m.notes,
          description: genTemplate ? genTemplate.description : m.description,
          qty: 1, stack: DEFAULT_STACK_POLICY.general,
        } as CharacterGeneralItem
      }
    }
    if (requiresApprovalNow) {
      void submitRequest('create', effectiveSelected.id, effectiveSelected.name, currentUsername, newItem)
      setAddItemModal(null)
      setApprovalPendingFeedback('Item sent to GM for approval.')
      return
    }

    setInventoryByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: [...(current[effectiveSelected.id] ?? []), newItem],
    }))
    setAddItemModal(null)
  }

  const dropItem = async (itemId: string) => {
    if (!effectiveSelected || !canEditSelected) return
    const item = selectedInventory.find((i) => i.id === itemId)
    if (!item || item.kind === 'gold') return

    const campaignItem = inventoryItemToCampaignItem(item, {
      status: 'dropped',
      droppedByCharacterId: effectiveSelected.id,
      droppedByCharacterName: effectiveSelected.name,
    })

    const { id, ...rest } = campaignItem
    await setDoc(
      doc(db, 'campaigns', campaignId, 'items', id),
      { ...toFirestoreItem({ ...rest, id } as typeof campaignItem), createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    )

    setInventoryByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: (current[effectiveSelected.id] ?? []).filter((i) => i.id !== itemId),
    }))
    setItemDetailId(null)
    setDropConfirmItemId(null)
  }

  const sellItem = async (itemId: string) => {
    if (!effectiveSelected || !canEditSelected || overflowWriting) return
    const item = selectedInventory.find((i) => i.id === itemId)
    if (!item || item.kind === 'gold') return

    if (requiresApprovalNow) {
      void submitRequest('sell', effectiveSelected.id, effectiveSelected.name, currentUsername, item)
      setItemDetailId(null)
      setSellConfirmItemId(null)
      setApprovalPendingFeedback('Sale sent to GM for approval.')
      return
    }

    const sellAmount = normalizeGoldAmount(item.costGp)

    const currentItems = selectedInventory.filter((i) => i.id !== itemId)
    if (sellAmount <= 0) {
      setInventoryByCharacterId((current) => ({ ...current, [effectiveSelected.id]: currentItems }))
      setItemDetailId(null)
      setSellConfirmItemId(null)
      return
    }
    const existingGold = currentItems
      .filter((i): i is CharacterGoldItem => i.kind === 'gold')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- old gold data may have `amount`
      .reduce((sum, g) => sum + (g.qty ?? (g as any).amount ?? 0), 0)
    const nonGold = currentItems.filter((i) => i.kind !== 'gold')
    const chunks = goldChunksForAmount(existingGold + sellAmount)
    const golds = chunks.map((chunk) => makeGoldItem(chunk))
    const candidateInventory = [...nonGold, ...golds]

    const overflow = computeOverflow(candidateInventory, availablePackedSlotCount, effectiveSelected.id, effectiveSelected.name)

    if (overflow.droppedItems.length > 0 || overflow.droppedGoldAmount > 0) {
      setOverflowWriting(true)
      try {
        await writeDroppedOverflow(db, campaignId, overflow.droppedItems, overflow.droppedGoldAmount, effectiveSelected.id, effectiveSelected.name)
      } catch {
        setOverflowFeedback('Failed to write overflow items. Sale cancelled.')
        setOverflowWriting(false)
        return
      }
      setOverflowWriting(false)
    }

    setInventoryByCharacterId((current) => ({ ...current, [effectiveSelected.id]: overflow.keptInventory }))
    if (overflow.feedbackMessage) setOverflowFeedback(overflow.feedbackMessage)
    setItemDetailId(null)
    setSellConfirmItemId(null)
  }

  const spendGold = (amount: number) => {
    if (!effectiveSelected || !canEditSelected) return
    const spend = Math.max(0, Math.floor(amount))
    if (spend <= 0) return

    setInventoryByCharacterId((current) => {
      const currentItems = current[effectiveSelected.id] ?? []
      const existingGold = currentItems
        .filter((i): i is CharacterGoldItem => i.kind === 'gold')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy data may still have `amount`
        .reduce((sum, g) => sum + (g.qty ?? (g as any).amount ?? 0), 0)
      const nonGold = currentItems.filter((i) => i.kind !== 'gold')
      const nextTotal = Math.max(0, existingGold - spend)
      const chunks = goldChunksForAmount(nextTotal)
      const golds = chunks.map((chunk) => makeGoldItem(chunk))
      return { ...current, [effectiveSelected.id]: [...nonGold, ...golds] }
    })

    setGoldSpendAmount('')
    setItemDetailId(null)
  }

  const addItemsToInventory = (characterId: string, items: CharacterInventoryItem[]) => {
    setInventoryByCharacterId((current) => ({
      ...current,
      [characterId]: [...(current[characterId] ?? []), ...items],
    }))
  }

  const setInventoryGoldForCharacter = (characterId: string, amount: number) => {
    setInventoryByCharacterId((current) => {
      const items = (current[characterId] ?? []).filter((i) => i.kind !== 'gold')
      const chunks = goldChunksForAmount(Math.max(0, amount))
      const golds = chunks.map((chunk) => makeGoldItem(chunk))
      return {
        ...current,
        [characterId]: [...items, ...golds],
      }
    })
  }

  return {
    updateInventoryItem,
    updateWeaponRow,
    updateArmourRow,
    openAddItemModal,
    saveAddItem,
    dropItem,
    sellItem,
    spendGold,
    setInventoryGold,
    addItemsToInventory,
    setInventoryGoldForCharacter,
  }
}
