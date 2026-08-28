import type { Dispatch, SetStateAction } from 'react'
import type {
  CharacterRecord,
  CharacterInventoryItem,
  CharacterStoreCartEntry as StoreCartEntry,
} from '../../../types/app'
import type { StoreItem } from '../storeCatalog'
import { isArmourTemplateAllowedForClass, isWeaponTemplateAllowedForClass } from '../inventoryRules'
import { materializeCartEntries, validateStorePurchase } from '../storeRules'

type Params = {
  effectiveSelected: CharacterRecord | null
  canEditSelected: boolean
  selectedClassName: string
  hasRolledStartingGold: boolean
  selectedStoreRemaining: number
  selectedStoreCart: StoreCartEntry[]
  selectedStoreCartTotal: number
  selectedStartingGold: number | null
  selectedCommittedStoreSpent: number
  packedItemsCount: number
  availablePackedSlotCount: number
  isGuidedCreation: boolean
  selectedInventory: CharacterInventoryItem[]
  customStoreName: string
  customStoreCost: string
  customStoreDescription: string

  storeSpentByCharacterId: Record<string, number>

  setStoreCartByCharacterId: Dispatch<SetStateAction<Record<string, StoreCartEntry[]>>>
  setStoreError: Dispatch<SetStateAction<string | null>>
  setStoreClassRequiredOpen: Dispatch<SetStateAction<boolean>>
  setCustomStoreName: Dispatch<SetStateAction<string>>
  setCustomStoreCost: Dispatch<SetStateAction<string>>
  setCustomStoreDescription: Dispatch<SetStateAction<string>>
  setStoreSpentByCharacterId: Dispatch<SetStateAction<Record<string, number>>>
  setStartingGoldByCharacterId: Dispatch<SetStateAction<Record<string, number>>>
  setStoreOpen: Dispatch<SetStateAction<boolean>>
  setInventoryByCharacterId: Dispatch<SetStateAction<Record<string, CharacterInventoryItem[]>>>

  setInventoryGold: (amount: number) => Promise<void>
  addItemsToInventory: (characterId: string, items: CharacterInventoryItem[]) => void
  setInventoryGoldForCharacter: (characterId: string, amount: number) => void
}

export function useStoreDomain({
  effectiveSelected,
  canEditSelected,
  selectedClassName,
  hasRolledStartingGold,
  selectedStoreRemaining,
  selectedStoreCart,
  selectedStoreCartTotal,
  selectedStartingGold,
  selectedCommittedStoreSpent,
  packedItemsCount,
  availablePackedSlotCount,
  isGuidedCreation,
  selectedInventory,
  customStoreName,
  customStoreCost,
  customStoreDescription,
  storeSpentByCharacterId,
  setStoreCartByCharacterId,
  setStoreError,
  setStoreClassRequiredOpen,
  setCustomStoreName,
  setCustomStoreCost,
  setCustomStoreDescription,
  setStoreSpentByCharacterId,
  setStartingGoldByCharacterId,
  setStoreOpen,
  setInventoryByCharacterId,
  setInventoryGold,
  addItemsToInventory,
  setInventoryGoldForCharacter,
}: Params) {
  const upsertCartEntry = (nextEntry: Omit<StoreCartEntry, 'qty'>) => {
    if (!effectiveSelected) return
    setStoreCartByCharacterId((current) => {
      const existing = current[effectiveSelected.id] ?? []
      const index = existing.findIndex((entry) => entry.key === nextEntry.key)
      if (index < 0) {
        return {
          ...current,
          [effectiveSelected.id]: [...existing, { ...nextEntry, qty: 1 }],
        }
      }
      const next = [...existing]
      next[index] = { ...next[index], qty: next[index].qty + 1 }
      return {
        ...current,
        [effectiveSelected.id]: next,
      }
    })
  }

  const decrementCartEntry = (entryKey: string) => {
    if (!effectiveSelected) return
    setStoreCartByCharacterId((current) => {
      const existing = current[effectiveSelected.id] ?? []
      const index = existing.findIndex((entry) => entry.key === entryKey)
      if (index < 0) return current
      const next = [...existing]
      const target = next[index]
      if (target.qty <= 1) {
        return {
          ...current,
          [effectiveSelected.id]: next.filter((entry) => entry.key !== entryKey),
        }
      }
      next[index] = { ...target, qty: target.qty - 1 }
      return {
        ...current,
        [effectiveSelected.id]: next,
      }
    })
  }

  const incrementCartEntry = (entryKey: string) => {
    if (!effectiveSelected) return
    setStoreCartByCharacterId((current) => {
      const existing = current[effectiveSelected.id] ?? []
      const index = existing.findIndex((entry) => entry.key === entryKey)
      if (index < 0) return current
      const target = existing[index]
      if (selectedStoreRemaining < target.costGp) {
        setStoreError('Not enough gp remaining for this purchase.')
        return current
      }
      const next = [...existing]
      next[index] = { ...target, qty: target.qty + 1 }
      return {
        ...current,
        [effectiveSelected.id]: next,
      }
    })
  }

  const removeCartEntry = (entryKey: string) => {
    if (!effectiveSelected) return
    setStoreCartByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: (current[effectiveSelected.id] ?? []).filter((entry) => entry.key !== entryKey),
    }))
  }

  const clearCart = () => {
    if (!effectiveSelected) return
    setStoreCartByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: [],
    }))
  }

  const rollStartingGold = () => {
    if (!effectiveSelected || !canEditSelected) return
    const roll = () => Math.floor(Math.random() * 6) + 1
    const total = (roll() + roll() + roll()) * 10
    void setInventoryGold(total)
    setStartingGoldByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: total,
    }))
    setStoreSpentByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: 0,
    }))
    clearCart()
    setStoreError(null)
  }

  const handleStoreBuy = (item: StoreItem) => {
    if (!effectiveSelected || !canEditSelected) return
    if (selectedClassName === '-') {
      setStoreClassRequiredOpen(true)
      return
    }
    if (!hasRolledStartingGold) {
      setStoreError('Roll starting gold before buying equipment.')
      return
    }
    if (selectedStoreRemaining < item.costGp) {
      setStoreError('Not enough gp remaining for this purchase.')
      return
    }

    if (item.kind === 'weapon' && item.weaponId) {
      if (!isWeaponTemplateAllowedForClass(item.weaponId, selectedClassName)) {
        setStoreError('This class cannot use that weapon.')
        return
      }
      upsertCartEntry({
        key: item.id,
        name: item.name,
        costGp: item.costGp,
        kind: item.kind,
        weaponId: item.weaponId,
        armourId: item.armourId,
        packedLabel: item.name,
      })
      setStoreError(null)
      return
    }

    if (item.kind === 'armour' && item.armourId) {
      if (!isArmourTemplateAllowedForClass(item.armourId, selectedClassName)) {
        setStoreError('This class cannot use that armour.')
        return
      }
      upsertCartEntry({
        key: item.id,
        name: item.name,
        costGp: item.costGp,
        kind: item.kind,
        weaponId: item.weaponId,
        armourId: item.armourId,
        packedLabel: item.name,
      })
      setStoreError(null)
      return
    }

    upsertCartEntry({
      key: item.id,
      name: item.name,
      costGp: item.costGp,
      kind: item.kind,
      packedLabel: item.name,
    })
    setStoreError(null)
  }

  const handleBuyCustomStoreItem = () => {
    if (!effectiveSelected || !canEditSelected) return
    if (selectedClassName === '-') {
      setStoreClassRequiredOpen(true)
      return
    }
    if (!hasRolledStartingGold) {
      setStoreError('Roll starting gold before buying equipment.')
      return
    }
    const trimmedName = customStoreName.trim()
    if (!trimmedName) {
      setStoreError('Enter a name for custom equipment.')
      return
    }
    const parsedCost = Number.parseInt(customStoreCost || '0', 10)
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      setStoreError('Custom equipment cost must be 0 gp or greater.')
      return
    }
    if (selectedStoreRemaining < parsedCost) {
      setStoreError('Not enough gp remaining for this purchase.')
      return
    }
    upsertCartEntry({
      key: `custom:${trimmedName}:${parsedCost}:${customStoreDescription.trim()}`,
      name: trimmedName,
      costGp: parsedCost,
      kind: 'general',
      packedLabel: customStoreDescription.trim(),
    })
    setStoreError(null)
    setCustomStoreName('')
    setCustomStoreCost('')
    setCustomStoreDescription('')
  }

  const applyStorePurchases = () => {
    if (!effectiveSelected || !canEditSelected) return
    if (selectedClassName === '-') {
      setStoreClassRequiredOpen(true)
      return
    }
    const validationError = validateStorePurchase(
      selectedStoreCart,
      selectedStartingGold,
      selectedCommittedStoreSpent,
      selectedClassName,
      packedItemsCount,
      availablePackedSlotCount,
    )
    if (validationError === 'CLASS_REQUIRED') {
      setStoreClassRequiredOpen(true)
      return
    }
    if (validationError) {
      setStoreError(validationError)
      return
    }

    const cartTotal = selectedStoreCartTotal
    const result = materializeCartEntries(selectedStoreCart, selectedClassName)
    if (!result.ok) {
      setStoreError(result.error)
      return
    }
    const newItems = result.items

    addItemsToInventory(effectiveSelected.id, newItems)
    setStoreSpentByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: (current[effectiveSelected.id] ?? 0) + cartTotal,
    }))
    const remainingAfter = (selectedStartingGold ?? 0) - ((storeSpentByCharacterId[effectiveSelected.id] ?? 0) + cartTotal)
    setInventoryGoldForCharacter(effectiveSelected.id, remainingAfter)
    clearCart()
    setStoreError(null)
    setStoreOpen(false)
  }

  const refundItem = (itemId: string) => {
    if (!effectiveSelected || !canEditSelected || !isGuidedCreation) return
    const item = selectedInventory.find((i) => i.id === itemId)
    if (!item || item.kind === 'gold') return
    const refundAmount = item.costGp
    setInventoryByCharacterId((current) => ({
      ...current,
      [effectiveSelected.id]: (current[effectiveSelected.id] ?? []).filter((i) => i.id !== itemId),
    }))
    if (refundAmount > 0) {
      setStoreSpentByCharacterId((current) => ({
        ...current,
        [effectiveSelected.id]: Math.max(0, (current[effectiveSelected.id] ?? 0) - refundAmount),
      }))
      const newRemaining = (selectedStartingGold ?? 0) - Math.max(0, selectedCommittedStoreSpent - refundAmount)
      setInventoryGoldForCharacter(effectiveSelected.id, newRemaining)
    }
  }

  return {
    upsertCartEntry,
    decrementCartEntry,
    incrementCartEntry,
    removeCartEntry,
    clearCart,
    rollStartingGold,
    handleStoreBuy,
    handleBuyCustomStoreItem,
    applyStorePurchases,
    refundItem,
  }
}
