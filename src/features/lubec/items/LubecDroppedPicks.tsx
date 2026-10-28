// The Dropped list's checkboxes and its Delete selected, in the shape of the
// map token list's category checkbox and its bulk Delete.

import type { LubecGmItem } from '../../ruleSets/lubec/gear/gmItem'
import { lubecBulkDeleteLine } from './droppedSelection'
import type { LubecDroppedBulkDelete, LubecDroppedSelection } from './useDroppedSelection'

/** The Dropped list's ticks and what deleting them does. */
export type LubecDroppedPicks = { selection: LubecDroppedSelection; bulk: LubecDroppedBulkDelete }

/** Ticks every dropped item, or none once they all are; part-ticked while only some are. */
export function DroppedSelectAll({ title, selection }: { title: string; selection: LubecDroppedSelection }) {
  const all = selection.allState === 'all'
  return (
    <label className="items-check head-check">
      <input
        type="checkbox"
        checked={all}
        ref={(input) => {
          if (input) input.indeterminate = selection.allState === 'some'
        }}
        onChange={() => selection.setAll(!all)}
        aria-label={all ? `Deselect all ${title} items` : `Select all ${title} items`}
      />
    </label>
  )
}

export function DroppedRowCheck({ item, selection }: { item: LubecGmItem; selection: LubecDroppedSelection }) {
  return (
    <label className="items-check">
      <input type="checkbox" checked={selection.selectedIds.has(item.id)} onChange={() => selection.toggle(item.id)} aria-label={`Select ${item.name}`} />
    </label>
  )
}

// Deleting is the one way an item leaves the game outright, so it asks first, as the card's Delete does.
function BulkConfirm({ items, bulk }: { items: LubecGmItem[]; bulk: LubecDroppedBulkDelete }) {
  return (
    <div className="dispensation-box">
      <div className="head">Delete for good</div>
      <p>{lubecBulkDeleteLine(items)}</p>
      <div className="actions">
        <button className="btn line" type="button" onClick={bulk.cancel}>{items.length === 1 ? 'Keep it' : 'Keep them'}</button>
        <button className="btn danger solid" type="button" disabled={bulk.busy} onClick={bulk.confirm}>{bulk.busy ? 'Deleting...' : 'Delete'}</button>
      </div>
    </div>
  )
}

/** While any dropped item is ticked: Delete selected, which asks once before it deletes them all. */
export function DroppedBulkBar({ selection, bulk }: LubecDroppedPicks) {
  const items = selection.selectedItems
  if (!items.length) return null
  return (
    <div className="items-bulk">
      {bulk.asking
        ? <BulkConfirm items={items} bulk={bulk} />
        : <button className="btn danger small" type="button" onClick={bulk.ask}>{`Delete selected (${items.length})`}</button>}
      {bulk.error ? <p className="form-error" role="alert">{bulk.error}</p> : null}
    </div>
  )
}
