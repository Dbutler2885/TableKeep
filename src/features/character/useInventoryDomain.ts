import { serverTimestamp, setDoc } from 'firebase/firestore'
import type { Dispatch, SetStateAction } from 'react'
import { inventoryItemToCampaignItem } from '../items/itemConversion'
import { toFirestoreItem } from '../items/useItems'
import { DEFAULT_STACK_POLICY } from '../items/itemDefaults'
import { db } from '../../firebase'
import { campaignDocRef } from '../campaign/firestorePaths'
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

// Which weapon typeIds can fire which ammo typeIds
export const AMMO_WEAPON_MAP: Record<string, string[]> = {
  'ammo-arrows': ['long-bow', 'short-bow'],
  'ammo-silver-arrow': ['long-bow', 'short-bow'],
  'ammo-bolts': ['crossbow'],
  'ammo-sling-stones': ['sling'],
}
import { consumableCatalogById } from './consumableCatalog'
import { OSE_GENERAL_CATALOG, generalCatalogById } from './generalCatalog'

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
  effectText: string
}

type Params = {
  campaignId: string
  groupId?: string | null
  currentUsername: string
  effectiveSelected: CharacterRecord | null
  canEditSelected: boolean
  canEditInventoryDetails: boolean
  selectedClassName: string
  canClassEquipArmour: boolean
  selectedInventory: CharacterInventoryItem[]
  allInventories: Record<string, CharacterInventoryItem[]>
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
  groupId = null,
  currentUsername,
  effectiveSelected,
  canEditSelected,
  canEditInventoryDetails,
  selectedClassName,
  canClassEquipArmour,
  selectedInventory,
  allInventories,
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
    const playerAllowedKeys: (keyof CharacterInventoryItem)[] = [
      'equipped', 'name', 'qty', 'lit', 'turnsRemaining', 'amountRemaining', 'spent', 'stack',
    ] as (keyof CharacterInventoryItem)[]
    for (const key of playerAllowedKeys) {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(allowed as any)[key] = (updates as any)[key]
      }
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
        await writeDroppedOverflow(db, campaignId, groupId, overflow.droppedItems, overflow.droppedGoldAmount, effectiveSelected.id, effectiveSelected.name)
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
    const firstGeneral = OSE_GENERAL_CATALOG[0] ?? null
    setAddItemModal({
      equipped, kind: 'general', typeName: firstGeneral?.name ?? '', name: '', costGp: firstGeneral ? String(firstGeneral.costGp) : '', notes: '', description: firstGeneral?.description ?? '',
      typeId: firstGeneral?.id ?? 'custom', damageDiceCount: '', damageDiceSides: '', rangeShort: '',
      rangeMedium: '', rangeLong: '', slow: false, twoHanded: false, isMagic: false, attackBonus: '',
      damageBonus: '', armourClass: '', shieldMod: '', magicMod: '', armourType: 'body', qty: '1', effectText: '',
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
        const isOil = conTemplate?.id === 'con-oil'
        newItem = {
          id: makeId(), kind: 'consumable',
          typeId: conTemplate ? conTemplate.id : 'custom',
          typeName: conTemplate ? conTemplate.name : fallbackTypeName,
          name: m.name || undefined,
          costGp: conTemplate ? conTemplate.costGp : costGp,
          equipped: m.equipped, notes: m.notes,
          description: conTemplate ? conTemplate.description : m.description,
          qty: conTemplate ? conTemplate.qty : (Number.parseInt(m.qty, 10) || 1),
          stack: isOil ? { stackable: false } as const : DEFAULT_STACK_POLICY.consumable,
          effectText: (conTemplate ? conTemplate.effectText : m.effectText) || undefined,
          ...(isOil ? { amountRemaining: conTemplate?.fuelCapacity ?? 24 } : {}),
        } as CharacterConsumableItem
        break
      }
      default: {
        const conTemplate = m.typeId && m.typeId !== 'custom' ? consumableCatalogById[m.typeId] : null
        if (conTemplate) {
          const isOil = conTemplate.id === 'con-oil'
          newItem = {
            id: makeId(),
            kind: 'consumable',
            typeId: conTemplate.id,
            typeName: conTemplate.name,
            name: m.name || undefined,
            costGp: conTemplate.costGp,
            equipped: m.equipped,
            notes: m.notes,
            description: conTemplate.description,
            qty: conTemplate.qty,
            stack: isOil ? { stackable: false } as const : DEFAULT_STACK_POLICY.consumable,
            effectText: conTemplate.effectText || undefined,
            ...(isOil ? { amountRemaining: conTemplate.fuelCapacity ?? 24 } : {}),
          } as CharacterConsumableItem
          break
        }
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

  const dropItem = async (itemId: string, qty?: number) => {
    if (!effectiveSelected || !canEditSelected) return
    const item = selectedInventory.find((i) => i.id === itemId)
    if (!item || item.kind === 'gold') return

    const dropAll = qty === undefined || qty >= item.qty
    const dropSnapshot = dropAll ? item : { ...item, qty } as typeof item

    const campaignItem = inventoryItemToCampaignItem(dropSnapshot, {
      status: 'dropped',
      droppedByCharacterId: effectiveSelected.id,
      droppedByCharacterName: effectiveSelected.name,
    })

    const { id, ...rest } = campaignItem
    await setDoc(
      campaignDocRef(db, { campaignId, groupId }, 'items', id),
      { ...toFirestoreItem({ ...rest, id } as typeof campaignItem), createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    )

    if (dropAll) {
      setInventoryByCharacterId((current) => ({
        ...current,
        [effectiveSelected.id]: (current[effectiveSelected.id] ?? []).filter((i) => i.id !== itemId),
      }))
    } else {
      setInventoryByCharacterId((current) => ({
        ...current,
        [effectiveSelected.id]: (current[effectiveSelected.id] ?? []).map((i) =>
          i.id === itemId ? { ...i, qty: i.qty - (qty ?? 0) } as CharacterInventoryItem : i,
        ),
      }))
    }
    setItemDetailId(null)
    setDropConfirmItemId(null)
  }

  const sellItem = async (itemId: string, qty?: number) => {
    if (!effectiveSelected || !canEditSelected || overflowWriting) return
    const item = selectedInventory.find((i) => i.id === itemId)
    if (!item || item.kind === 'gold') return

    const sellAll = qty === undefined || qty >= item.qty
    const sellQty = sellAll ? item.qty : qty

    if (requiresApprovalNow) {
      const snapshot = sellAll ? item : { ...item, qty: sellQty } as typeof item
      void submitRequest('sell', effectiveSelected.id, effectiveSelected.name, currentUsername, snapshot)
      setItemDetailId(null)
      setSellConfirmItemId(null)
      setApprovalPendingFeedback('Sale sent to GM for approval.')
      return
    }

    const sellAmount = normalizeGoldAmount(item.costGp * sellQty)

    const currentItems = sellAll
      ? selectedInventory.filter((i) => i.id !== itemId)
      : selectedInventory.map((i) => i.id === itemId ? { ...i, qty: i.qty - sellQty } as CharacterInventoryItem : i)
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
        await writeDroppedOverflow(db, campaignId, groupId, overflow.droppedItems, overflow.droppedGoldAmount, effectiveSelected.id, effectiveSelected.name)
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

  // Items that leave a recoverable object behind when used
  const dropsOnUse = new Set(['con-iron-spikes'])
  const removeOnZeroUse = new Set(['con-rations-iron', 'con-rations-standard', 'con-wine', 'con-iron-spikes'])

  const consumeOne = async (itemId: string) => {
    if (!effectiveSelected || !canEditSelected) return
    const item = selectedInventory.find((i) => i.id === itemId)
    if (!item || item.kind !== 'consumable') return
    const consumable = item as CharacterConsumableItem
    const nextQty = Math.max(0, (consumable.qty ?? 1) - 1)

    if (nextQty <= 0 && removeOnZeroUse.has(item.typeId)) {
      setInventoryByCharacterId((current) => ({
        ...current,
        [effectiveSelected.id]: (current[effectiveSelected.id] ?? []).filter((i) => i.id !== itemId),
      }))
    } else {
      updateInventoryItem(itemId, { qty: nextQty })
    }

    // Create a dropped campaign item for recoverable gear
    if (dropsOnUse.has(item.typeId)) {
      const dropSnapshot = { ...item, qty: 1 } as typeof item
      const campaignItem = inventoryItemToCampaignItem(dropSnapshot, {
        status: 'dropped',
        droppedByCharacterId: effectiveSelected.id,
        droppedByCharacterName: effectiveSelected.name,
      })
      const { id, ...rest } = campaignItem
      await setDoc(
        campaignDocRef(db, { campaignId, groupId }, 'items', id),
        { ...toFirestoreItem({ ...rest, id } as typeof campaignItem), createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
      )
    }

    const label = consumable.name?.trim() || consumable.typeName || 'Consumable'
    const effectSuffix = consumable.effectText?.trim() ? ` — ${consumable.effectText.trim()}` : ''
    const qtySuffix = nextQty <= 0 ? ' (none left)' : ` (${nextQty} left)`
    setOverflowFeedback(`Used ${label}${effectSuffix}${qtySuffix}`)
    setItemDetailId(null)
  }

  const hasIgnitionSource = () => {
    // Own equipped tinderbox counts
    if (selectedInventory.some((i) => i.equipped && i.kind === 'general' && i.typeId === 'gear-tinderbox')) return true
    // Any party member's equipped lit torch or lantern counts
    const allItems = Object.values(allInventories).flat()
    return allItems.some((i) =>
      i.equipped && (
        (i.kind === 'consumable' && (i as CharacterConsumableItem).lit)
        || (i.kind === 'general' && (i as CharacterGeneralItem).lit)
      ),
    )
  }

  const lightTorch = (itemId: string) => {
    if (!effectiveSelected || !canEditSelected) return
    const item = selectedInventory.find((i) => i.id === itemId)
    if (!item || item.kind !== 'consumable' || item.typeId !== 'con-torches') return
    const torch = item as CharacterConsumableItem
    if ((torch.qty ?? 0) <= 0) return
    if (!item.equipped || !hasIgnitionSource()) return

    if ((torch.qty ?? 0) > 1) {
      // Split: decrement stack, create new lit torch
      const litTorch: CharacterConsumableItem = {
        ...torch,
        id: makeId(),
        qty: 0,
        lit: true,
        turnsRemaining: 6,
        equipped: true,
        stack: { stackable: false },
      }
      setInventoryByCharacterId((current) => ({
        ...current,
        [effectiveSelected.id]: [
          ...(current[effectiveSelected.id] ?? []).map((i) =>
            i.id === itemId ? { ...i, qty: (i.qty ?? 1) - 1 } as CharacterInventoryItem : i,
          ),
          litTorch,
        ],
      }))
    } else {
      // Last torch: convert in place
      updateInventoryItem(itemId, { qty: 0, lit: true, turnsRemaining: 6, equipped: true, stack: { stackable: false } })
    }

    setOverflowFeedback('Lit a torch (6 turns)')
    setItemDetailId(null)
  }

  const tickDown = (itemId: string) => {
    if (!effectiveSelected || !canEditSelected) return
    const item = selectedInventory.find((i) => i.id === itemId)
    if (!item) return

    // Works for both consumable (torch) and general (lantern)
    const current = (item as CharacterConsumableItem | CharacterGeneralItem)
    if (!current.lit || (current.turnsRemaining ?? 0) <= 0) return

    const nextTurns = (current.turnsRemaining ?? 0) - 1
    if (nextTurns <= 0) {
      updateInventoryItem(itemId, { turnsRemaining: 0, lit: false })
      const label = item.name?.trim() || item.typeName || 'Item'
      setOverflowFeedback(`${label} burned out`)
    } else {
      updateInventoryItem(itemId, { turnsRemaining: nextTurns })
    }
  }

  const canFireAmmo = (itemId: string): { ok: boolean; reason?: string } => {
    const item = selectedInventory.find((i) => i.id === itemId)
    if (!item || item.kind !== 'ammunition') return { ok: false }
    if (!item.equipped) return { ok: false, reason: 'Ammo must be equipped to fire.' }
    if ((item.qty ?? 0) <= 0) return { ok: false, reason: 'No ammo left.' }
    const requiredWeapons = AMMO_WEAPON_MAP[item.typeId]
    if (requiredWeapons) {
      const hasWeapon = selectedInventory.some(
        (i) => i.kind === 'weapon' && i.equipped && requiredWeapons.includes(i.typeId),
      )
      if (!hasWeapon) {
        const weaponNames = requiredWeapons.map((id) => id.replace(/-/g, ' ')).join(' or ')
        return { ok: false, reason: `Requires an equipped ${weaponNames}.` }
      }
    }
    return { ok: true }
  }

  const fireAmmo = (itemId: string) => {
    if (!effectiveSelected || !canEditSelected) return
    const check = canFireAmmo(itemId)
    if (!check.ok) return
    const ammo = selectedInventory.find((i) => i.id === itemId) as CharacterAmmunitionItem

    const newQty = ammo.qty - 1
    const nextSpent = (ammo.spent ?? 0) + 1
    const label = ammo.name?.trim() || ammo.typeName || 'Ammo'
    if (newQty <= 0) {
      updateInventoryItem(itemId, { qty: 0, spent: nextSpent })
      setOverflowFeedback(`Fired last ${label} (0 left, ${nextSpent} spent)`)
    } else {
      updateInventoryItem(itemId, { qty: newQty, spent: nextSpent })
      setOverflowFeedback(`Fired ${label} (${newQty} left, ${nextSpent} spent)`)
    }
  }

  const retrieveAmmo = (itemId: string) => {
    if (!effectiveSelected || !canEditSelected) return
    const item = selectedInventory.find((i) => i.id === itemId)
    if (!item || item.kind !== 'ammunition') return
    const ammo = item as CharacterAmmunitionItem
    const spent = ammo.spent ?? 0
    if (spent <= 0) return

    const recoverChance = ammo.typeId === 'ammo-sling-stones' ? 0.1 : 0.75
    let recovered = 0
    for (let i = 0; i < spent; i++) {
      if (Math.random() < recoverChance) recovered++
    }

    const label = ammo.name?.trim() || ammo.typeName || 'ammo'
    if ((ammo.qty + recovered) <= 0) {
      setInventoryByCharacterId((current) => ({
        ...current,
        [effectiveSelected.id]: (current[effectiveSelected.id] ?? []).filter((i) => i.id !== itemId),
      }))
      setOverflowFeedback(`Retrieved 0 of ${spent} ${label}; all were lost`)
      setItemDetailId(null)
      return
    }

    updateInventoryItem(itemId, { qty: ammo.qty + recovered, spent: 0 })
    setOverflowFeedback(`Retrieved ${recovered} of ${spent} ${label}`)
    setItemDetailId(null)
  }

  const throwOil = (itemId: string) => {
    if (!effectiveSelected || !canEditSelected) return
    const item = selectedInventory.find((i) => i.id === itemId)
    if (!item || item.kind !== 'consumable' || item.typeId !== 'con-oil') return

    setInventoryByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: (current[effectiveSelected.id] ?? []).filter((i) => i.id !== itemId),
    }))
    setOverflowFeedback('Threw oil flask!')
    setItemDetailId(null)
  }

  const pourOil = (flaskId: string, lanternId: string) => {
    if (!effectiveSelected || !canEditSelected) return
    const flask = selectedInventory.find((i) => i.id === flaskId) as CharacterConsumableItem | undefined
    const lantern = selectedInventory.find((i) => i.id === lanternId) as CharacterGeneralItem | undefined
    if (!flask || !lantern) return
    if (flask.typeId !== 'con-oil' || lantern.typeId !== 'gear-lantern') return

    const flaskFuel = flask.amountRemaining ?? 24
    const lanternFuel = lantern.turnsRemaining ?? 0
    const lanternNeed = 24 - lanternFuel
    const transfer = Math.min(lanternNeed, flaskFuel)

    setInventoryByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: (current[effectiveSelected.id] ?? []).map((i) => {
        if (i.id === flaskId) return { ...i, amountRemaining: flaskFuel - transfer } as CharacterInventoryItem
        if (i.id === lanternId) return { ...i, turnsRemaining: lanternFuel + transfer } as CharacterInventoryItem
        return i
      }),
    }))
    setOverflowFeedback(`Poured ${transfer} fuel into lantern (${lanternFuel + transfer}/24)`)
    setItemDetailId(null)
  }

  const lightLantern = (itemId: string) => {
    if (!effectiveSelected || !canEditSelected) return
    const item = selectedInventory.find((i) => i.id === itemId)
    if (!item || item.kind !== 'general' || item.typeId !== 'gear-lantern') return
    const lantern = item as CharacterGeneralItem
    if ((lantern.turnsRemaining ?? 0) <= 0) return
    if (!item.equipped || !hasIgnitionSource()) return

    updateInventoryItem(itemId, { lit: true, equipped: true })
    setOverflowFeedback('Lantern lit')
    setItemDetailId(null)
  }

  const extinguishLantern = (itemId: string) => {
    if (!effectiveSelected || !canEditSelected) return
    const item = selectedInventory.find((i) => i.id === itemId)
    if (!item || item.kind !== 'general' || item.typeId !== 'gear-lantern') return

    updateInventoryItem(itemId, { lit: false })
    setOverflowFeedback('Lantern extinguished')
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
    hasIgnitionSource,
    openAddItemModal,
    saveAddItem,
    dropItem,
    sellItem,
    spendGold,
    setInventoryGold,
    consumeOne,
    lightTorch,
    tickDown,
    canFireAmmo,
    fireAmmo,
    retrieveAmmo,
    throwOil,
    pourOil,
    lightLantern,
    extinguishLantern,
    addItemsToInventory,
    setInventoryGoldForCharacter,
  }
}
