import { sheetPayload } from '../../../character/characterStore/sheetIntentionEdits'
import { lubecPlacedAt, lubecReceive, type LubecArrival } from './arrival'
import { lubecUnplaced, type LubecUnplacedItem } from './drop'
import type { LubecGear, LubecItem, LubecSupply } from './gearRecord'
import { LUBEC_GM_ITEM_FIELDS, type LubecGmItem } from './gmItem'
import { assertLubecItemOwnership, lubecSplitItem, type LubecItemCommand } from './itemIdentity'
import { lubecImportItemSupplies, lubecReferencedSupplies } from './itemSupplyTransfer'
import { place } from './placement'

/** Floor and current-attack records keep one unplaced stack and its custom definitions. */
export type LubecDetachedItem = { item: LubecUnplacedItem; supplies: LubecSupply[] }

export const lubecDetachedItem = (item: LubecItem, supplies: readonly LubecSupply[]): LubecDetachedItem =>
  ({ item: lubecUnplaced(item), supplies: lubecReferencedSupplies(item, supplies) })

/** Take an exact backing Floor record/quantity; names never select or merge records. */
export function lubecTakeDetached(records: readonly LubecDetachedItem[], itemId: string, qty: number, command: LubecItemCommand) {
  assertLubecItemOwnership(records.map((record) => record.item))
  const source = records.find((record) => record.item.id === itemId)
  if (!source) throw new Error('That item is no longer available.')
  const split = lubecSplitItem(source.item as LubecItem, qty, command)
  const rest = records.flatMap((record) => record === source ? detachedRemainder(split.remainder, record) : record)
  assertLubecItemOwnership([...rest.map((record) => record.item), split.detached])
  return { records: rest, detached: lubecDetachedItem(split.detached, source.supplies) }
}

const detachedRemainder = (item: LubecItem | null, record: LubecDetachedItem) => item ? [{ ...record, item }] : []

export function lubecDetachFromGear(gear: LubecGear, itemId: string, qty: number, command: LubecItemCommand) {
  assertLubecItemOwnership(gear.items)
  const source = gear.items.find((item) => item.id === itemId)
  if (!source) throw new Error('That item is no longer available.')
  const { detached, remainder } = lubecSplitItem(source, qty, command)
  const items = gear.items.flatMap((item) => item === source ? remainder ?? [] : item)
  assertLubecItemOwnership([...items, detached])
  return { gear: { ...gear, items }, detached: lubecDetachedItem(detached, gear.supplies) }
}

/** Pickup/catch changes placement without coalescing with a remainder or a same-name item. */
export function lubecPlaceDetached(gear: LubecGear, detached: LubecDetachedItem, command: LubecItemCommand, dest?: string): LubecArrival {
  assertLubecItemOwnership([...gear.items, detached.item])
  const imported = lubecImportItemSupplies(detached.item as LubecItem, gear.supplies, detached.supplies, command)
  if (dest === undefined) return lubecReceive({ ...gear, supplies: imported.supplies }, imported.item)
  const at = place(gear, dest, imported.item)
  if (!at.ok) return at
  const item = lubecPlacedAt(imported.item, at)
  return { ok: true, item, gear: { ...gear, supplies: imported.supplies, items: [...gear.items, item] } }
}

export type LubecDetachedOwnership = { floor: LubecDetachedItem[]; inFlight: LubecDetachedItem | null }

/** The shared End/interruption primitive; calling it again after settlement is a no-op. */
export function lubecSettleDetached(ownership: LubecDetachedOwnership): LubecDetachedOwnership {
  const floor = [...ownership.floor, ...(ownership.inFlight ? [ownership.inFlight] : [])]
  assertLubecItemOwnership(floor.map((record) => record.item))
  return { floor, inFlight: null }
}

/** Only record metadata is removed; unknown transferable fields remain intact. */
export function lubecGmPhysicalItem(item: LubecGmItem): LubecItem {
  const excluded: readonly string[] = [...LUBEC_GM_ITEM_FIELDS, 'createdAt', 'updatedAt', 'supplies']
  return Object.fromEntries(Object.entries(item).filter(([key]) => !excluded.includes(key))) as LubecItem
}

export function lubecDroppedPhysicalItem(record: LubecDetachedItem): LubecGmItem {
  return { ...record.item, ...lubecSupplyFields(record.supplies), status: 'dropped' } as LubecGmItem
}

export const lubecSupplyFields = (supplies: readonly LubecSupply[]) => supplies.length ? { supplies } : {}

/** Finalization creates one document per preserved id and refuses conflicting data. */
export function lubecExportDetached(floor: readonly LubecDetachedItem[], existing: ReadonlyMap<string, LubecGmItem>) {
  assertLubecItemOwnership(floor.map((record) => record.item))
  const drops = floor.map(lubecDroppedPhysicalItem)
  drops.forEach((item) => assertCompatibleDrop(item, existing.get(item.id)))
  return { floor: [], drops: drops.map((item) => existing.get(item.id) ?? item) }
}

function assertCompatibleDrop(item: LubecGmItem, existing: LubecGmItem | undefined): void {
  if (!existing) return
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...data }: Record<string, unknown> = existing
  if (data.carrier === '') delete data.carrier
  if (sheetPayload(item) !== sheetPayload(data)) throw new Error('A conflicting dropped item already exists.')
}
