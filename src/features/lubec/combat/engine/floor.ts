import { lubecDetachedItem, lubecGmPhysicalItem } from '../../../ruleSets/lubec/gear/detachedItems'
import { parseLubecGear } from '../../../ruleSets/lubec/gear/gearRecord'
import type { LubecGmItem } from '../../../ruleSets/lubec/gear/gmItem'
import { lubecLibraryCopy, lubecSplitItem } from '../../../ruleSets/lubec/gear/itemIdentity'
import type { FloorSelection } from './types'

function takeItem(item: LubecGmItem, qty: number, commandId: string, ordinal: number) {
  const physical = lubecGmPhysicalItem(item)
  const command = { commandId, ordinal, role: `floor:${item.id}` }
  if (item.status === 'library') return { detached: lubecLibraryCopy(physical, qty, command), remainder: item }
  const split = lubecSplitItem(physical, qty, command)
  return { detached: split.detached, remainder: split.remainder && { ...item, qty: split.remainder.qty } }
}

/** A consumed dropped record stays in `current` as null, so a repeated selection reads it as stale. */
function takeSelection(current: Map<string, LubecGmItem | null>, selection: FloorSelection, commandId: string, ordinal: number) {
  const item = current.get(selection.itemId)
  if (!item || item.status !== selection.status) throw new Error(`Floor selection ${selection.itemId} is stale; nothing was consumed.`)
  const taken = takeItem(item, selection.qty, commandId, ordinal)
  current.set(item.id, taken.remainder)
  return lubecDetachedItem(taken.detached, parseLubecGear({ supplies: item.supplies }).supplies)
}

/** Library sources are copied and never written; each dropped source is written once, as its remainder or a delete. */
export function placeCombatFloor(selections: FloorSelection[], items: ReadonlyMap<string, LubecGmItem>, commandId: string) {
  const current = new Map<string, LubecGmItem | null>(items)
  const floor = selections.map((selection, ordinal) => takeSelection(current, selection, commandId, ordinal))
  const dropped = new Set(selections.filter((selection) => selection.status === 'dropped').map((selection) => selection.itemId))
  return { floor, writes: [...dropped].map((id) => ({ id, value: current.get(id) ?? null })) }
}
