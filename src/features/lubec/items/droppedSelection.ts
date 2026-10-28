// Picking several dropped items in the GM Items tab to delete at once, as the
// map token list picks tokens. Only dropped items can be picked. Pure: the
// stored items and the picked ids in, what the checkboxes and Delete show out.

import type { LubecGmItem } from '../../ruleSets/lubec/gear/gmItem'

/** The select-all checkbox: ticked when every dropped item is, part-ticked when some are. */
export type LubecSelectAll = 'all' | 'some' | 'none'

/** The ids of the dropped items, which are the only ones a checkbox picks. */
export const lubecDroppedIds = (items: readonly LubecGmItem[]): string[] =>
  items.filter((item) => item.status === 'dropped').map((item) => item.id)

/** The picked ids that are still dropped items, so a given, kept or deleted item drops out of the selection. */
export const lubecKeepDropped = (selectedIds: readonly string[], droppedIds: readonly string[]): string[] =>
  selectedIds.filter((id) => droppedIds.includes(id))

export function lubecSelectAllState(droppedIds: readonly string[], selectedIds: readonly string[]): LubecSelectAll {
  const picked = lubecKeepDropped(selectedIds, droppedIds).length
  if (picked === 0) return 'none'
  return picked === droppedIds.length ? 'all' : 'some'
}

/** What deleting the picked items asks first: one by name, several by how many. */
export function lubecBulkDeleteLine(items: readonly LubecGmItem[]): string {
  if (items.length === 1) return `${items[0].name} leaves the game. Nobody can get it back.`
  return `${items.length} dropped items leave the game. Nobody can get them back.`
}

/** The toast once they are gone. */
export const lubecBulkDeletedText = (items: readonly LubecGmItem[]): string =>
  (items.length === 1 ? `Deleted ${items[0].name}.` : `Deleted ${items.length} dropped items.`)
