// Owns player-to-player transfer picker state and its async submit handler.
// Step 0 removed its reset effect, so this hook owns no effect relative to justSeeded.

import { useMemo, useState } from 'react'
import type { CharacterRecord, TransferableInventoryItem } from '../../../types/app'
import { makeId } from '../characterFactories'
import type { TransferTargetCharacter } from '../lib/characterTabTypes'

type Params = {
  allCampaignCharacters: TransferTargetCharacter[]
  currentUserId: string
  effectiveSelected: CharacterRecord | null
  createTransfer: (item: TransferableInventoryItem, sourceId: string, from: Pick<CharacterRecord, 'id' | 'name' | 'ownerUserId'>, to: Pick<CharacterRecord, 'id' | 'name' | 'ownerUserId'>) => Promise<void>
  cancelTransfer: (transferId: string) => Promise<void>
  closeItemDetail: () => void
}

export function useCharacterTransfer({ allCampaignCharacters, currentUserId, effectiveSelected, createTransfer, cancelTransfer, closeItemDetail }: Params) {
  const [transferPickerOpen, setTransferPickerOpen] = useState(false)
  const [transferTargetCharacterId, setTransferTargetCharacterId] = useState('')
  const [transferBusy, setTransferBusy] = useState(false)
  const [transferError, setTransferError] = useState<string | null>(null)
  const [transferQty, setTransferQty] = useState('')
  const transferTargets = useMemo(() => allCampaignCharacters.filter((character) => character.id !== effectiveSelected?.id).filter((character) => character.ownerUserId !== currentUserId), [allCampaignCharacters, currentUserId, effectiveSelected?.id])
  const openTransferPickerForItem = (item: TransferableInventoryItem) => { setTransferError(null); setTransferTargetCharacterId(transferTargets[0]?.id ?? ''); setTransferQty(item.stack.stackable && item.qty > 1 ? '1' : ''); setTransferPickerOpen(true) }
  const closeTransferPicker = () => { setTransferPickerOpen(false); setTransferTargetCharacterId(''); setTransferBusy(false); setTransferError(null); setTransferQty('') }
  const submitTransfer = async (item: TransferableInventoryItem) => {
    if (!effectiveSelected) return
    const target = transferTargets.find((character) => character.id === transferTargetCharacterId) ?? null
    if (!target) { setTransferError('Choose a target character.'); return }
    const split = item.stack.stackable && item.qty > 1
    const giveQty = split ? Math.max(1, Math.min(item.qty, Number.parseInt(transferQty, 10) || 1)) : item.qty
    const snapshot = giveQty >= item.qty ? item : { ...item, id: makeId(), qty: giveQty } as TransferableInventoryItem
    setTransferBusy(true)
    setTransferError(null)
    try {
      await createTransfer(snapshot, item.id, effectiveSelected, target)
      setTransferPickerOpen(false)
      setTransferTargetCharacterId('')
      setTransferQty('')
      closeItemDetail()
    } catch (error) { setTransferError(error instanceof Error ? error.message : 'Failed to create transfer.') } finally { setTransferBusy(false) }
  }
  const cancelOutgoingTransfer = async (transferId: string) => {
    setTransferBusy(true)
    setTransferError(null)
    try {
      await cancelTransfer(transferId)
    } catch (error) {
      setTransferError(error instanceof Error ? error.message : 'Failed to cancel transfer.')
    } finally {
      setTransferBusy(false)
    }
  }
  return { transferPickerOpen, transferTargetCharacterId, transferBusy, transferError, transferQty, transferTargets, setTransferTargetCharacterId, setTransferError, setTransferQty, openTransferPickerForItem, closeTransferPicker, submitTransfer, cancelOutgoingTransfer }
}
