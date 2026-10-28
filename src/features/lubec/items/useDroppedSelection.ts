import { useMemo, useState } from 'react'
import type { LubecGmItem } from '../../ruleSets/lubec/gear/gmItem'
import { setIdsSelected, toggleId } from '../../maps/lib/tokenListSelection'
import { lubecDroppedIds, lubecKeepDropped, lubecSelectAllState } from './droppedSelection'
import { deleteLubecGmItems, type LubecItemsRecords } from './gmItemWrites'

/**
 * The dropped items the GM has ticked. A tick toggles one, and the select-all
 * checkbox ticks every dropped item or none. An item that stops being a
 * dropped item is forgotten, so it never comes back ticked.
 */
export function useDroppedSelection(items: LubecGmItem[] | null) {
  const droppedIds = useMemo(() => lubecDroppedIds(items ?? []), [items])
  const [pickedIds, setPickedIds] = useState<string[]>([])
  const [previousDroppedIds, setPreviousDroppedIds] = useState(droppedIds)
  if (previousDroppedIds !== droppedIds) {
    setPreviousDroppedIds(droppedIds)
    setPickedIds((current) => lubecKeepDropped(current, droppedIds))
  }
  const selectedIds = new Set(lubecKeepDropped(pickedIds, droppedIds))
  const allState = lubecSelectAllState(droppedIds, pickedIds)
  return {
    selectedIds,
    selectedItems: (items ?? []).filter((item) => selectedIds.has(item.id)),
    allState,
    toggle: (itemId: string) => setPickedIds((current) => toggleId(current, itemId)),
    setAll: (selected: boolean) => setPickedIds((current) => setIdsSelected(current, droppedIds, selected)),
    clear: () => setPickedIds([]),
  }
}

export type LubecDroppedSelection = ReturnType<typeof useDroppedSelection>

const CANNOT_DELETE = 'Could not delete those. Nothing changed.'

/** Deleting the ticked items: asked once, then one batch, and the selection clears once they are gone. */
export function useDroppedBulkDelete(records: LubecItemsRecords, selection: LubecDroppedSelection, onDeleted: (items: LubecGmItem[]) => void) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Unticking every item while asked takes the question away with it.
  if (asking && selection.selectedIds.size === 0) setAsking(false)
  const confirm = async () => {
    const items = selection.selectedItems
    setBusy(true)
    setError(null)
    const ok = await deleteLubecGmItems(records, items).then(() => true, () => false)
    setBusy(false)
    if (!ok) {
      setError(CANNOT_DELETE)
      return
    }
    setAsking(false)
    selection.clear()
    onDeleted(items)
  }
  return {
    asking,
    busy,
    error,
    ask: () => {
      setError(null)
      setAsking(true)
    },
    cancel: () => setAsking(false),
    confirm: () => void confirm(),
  }
}

export type LubecDroppedBulkDelete = ReturnType<typeof useDroppedBulkDelete>
