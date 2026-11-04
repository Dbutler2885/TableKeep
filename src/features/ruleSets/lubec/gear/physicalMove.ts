import type { LubecMove, LubecMovePlan, LubecMoveRecord } from './containers'
import { lubecDetachedItem, lubecExportDetached, lubecGmPhysicalItem, lubecPlaceDetached } from './detachedItems'
import { parseLubecGear, type LubecGear, type LubecItem, type LubecSupply } from './gearRecord'
import type { LubecGmItem } from './gmItem'
import { assertLubecItemOwnership, lubecLibraryCopy, lubecSplitItem, type LubecItemCommand } from './itemIdentity'

type SheetRecord = { kind: 'character' | 'npc'; gear: LubecGear }
type PhysicalRemainder = SheetRecord | { kind: 'gm-items'; item: LubecGmItem | null }
type Source = { item: LubecItem; supplies: LubecSupply[]; record: SheetRecord | { kind: 'gm-items'; item: LubecGmItem } }

const stale = (): Extract<LubecMovePlan, { ok: false }> => ({ ok: false, msg: 'Someone moved that first. Nothing changed.' })

function physicalSource(record: LubecMoveRecord, move: LubecMove): Source | null {
  if (record.kind === 'gm-items') return gmSource(record, move)
  return 'gear' in record ? sheetSource(record, move) : null
}

function gmSource(record: Extract<LubecMoveRecord, { kind: 'gm-items' }>, move: LubecMove): Source | null {
  if (!record.item || record.item.id !== move.itemId) return null
  return { item: lubecGmPhysicalItem(record.item), supplies: parseLubecGear({ supplies: record.item.supplies }).supplies, record: { ...record, item: record.item } }
}

function sheetSource(record: Extract<LubecMoveRecord, { gear: unknown }>, move: LubecMove): Source | null {
  const gear = record.gear
  if (!gear) return null
  assertLubecItemOwnership(gear.items)
  const item = gear.items.find((entry) => entry.id === move.itemId)
  if (!item || !whereSeen(item, move)) return null
  return { item, supplies: gear.supplies, record: { ...record, gear } }
}

function whereSeen(item: LubecItem, move: LubecMove): boolean {
  const seen = move.seen
  return seen !== undefined && (['carrier', 'pocket', 'slot'] as const).every((key) => samePlaceValue(item[key], seen[key]))
}

const samePlaceValue = (a: unknown, b: unknown) => (a ?? null) === (b ?? null)

function withoutTaken(record: Source['record'], source: LubecItem, remainder: LubecItem | null): PhysicalRemainder {
  if (record.kind === 'gm-items') return { ...record, item: remainder && { ...record.item, qty: remainder.qty } }
  const items = replaceTaken(record.gear.items, source, remainder)
  return { ...record, gear: { ...record.gear, items } }
}

const replaceTaken = (items: LubecItem[], source: LubecItem, remainder: LubecItem | null) =>
  items.flatMap((item) => item.id === source.id ? remainder ?? [] : item)

function detachedSource(source: Source, move: LubecMove, command: LubecItemCommand) {
  const record = source.record
  const qty = move.qty ?? source.item.qty
  if (record.kind === 'gm-items' && record.item.status === 'library') {
    return { detached: lubecLibraryCopy(source.item, qty, command), rest: record }
  }
  const split = lubecSplitItem(source.item, qty, command)
  return { detached: split.detached, rest: withoutTaken(record, source.item, split.remainder) }
}

/** Composable inventory intention used by both sheet transactions and later combat commands. */
export function lubecPhysicalMovePlan(from: LubecMoveRecord, to: LubecMoveRecord, move: LubecMove, command: LubecItemCommand): LubecMovePlan {
  const source = physicalSource(from, move)
  if (!source) return stale()
  const taken = detachedSource(source, move, command)
  assertSourceOwnership(taken.rest, taken.detached)
  const record = lubecDetachedItem(taken.detached, source.supplies)
  if (to.kind === 'gm-items') {
    const { drops: [item] } = lubecExportDetached([record], new Map(to.item ? [[to.item.id, to.item]] : []))
    return { ok: true, from: taken.rest, to: { kind: 'gm-items', item }, item }
  }
  return putOnSheet(taken.rest, to, record, move, command)
}

function assertSourceOwnership(rest: PhysicalRemainder, detached: LubecItem): void {
  if ('gear' in rest) assertLubecItemOwnership([...rest.gear.items, detached])
}

function putOnSheet(from: LubecMoveRecord, to: LubecMoveRecord, record: Parameters<typeof lubecPlaceDetached>[1], move: LubecMove, command: LubecItemCommand): LubecMovePlan {
  if (!('gear' in to) || !to.gear) return stale()
  const put = lubecPlaceDetached(to.gear, record, command, move.dest)
  if (!put.ok) return put
  return { ok: true, from, to: { ...to, gear: put.gear }, item: put.item }
}
