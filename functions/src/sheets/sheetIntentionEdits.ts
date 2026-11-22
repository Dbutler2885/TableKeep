import { editSheetPath, sheetObject } from './sheetIntentionPath.js'
import { SheetRepair, type SheetBase, type SheetEdit, type SheetValue } from './sheetIntentionTypes.js'

/** Stable comparison also makes receipt identity independent of object key order. */
export function sheetPayload(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (!sheetObject(entry)) return entry
    return Object.fromEntries(Object.keys(entry).sort().map((key) => [key, entry[key]]))
  })
}

function compareBase(current: SheetBase, base: SheetBase, edit: SheetEdit) {
  if (sheetPayload(current) !== sheetPayload(base)) throw new SheetRepair('value-conflict', edit.path)
}

function applyDelta(current: SheetBase, edit: Extract<SheetEdit, { kind: 'delta' }>): SheetBase {
  if (!current.exists || typeof current.value !== 'number') throw new SheetRepair('value-conflict', edit.path)
  const value = current.value + edit.amount
  if (!Number.isFinite(value)) throw new SheetRepair('value-conflict', edit.path)
  return { exists: true, value }
}

function insertRecord(current: SheetBase, edit: Extract<SheetEdit, { kind: 'insert' }>): SheetBase {
  if (!current.exists || !Array.isArray(current.value)) throw new SheetRepair('invalid-path', edit.path)
  if (current.value.some((row) => sheetObject(row) && row.id === edit.record.id)) throw new SheetRepair('record-exists', edit.path)
  return { exists: true, value: [...current.value, edit.record] }
}

function applyValue(current: SheetBase, edit: SheetEdit): SheetBase {
  if (edit.kind === 'delta') return applyDelta(current, edit)
  if (edit.kind === 'insert') return insertRecord(current, edit)
  compareBase(current, edit.base, edit)
  return edit.kind === 'set' ? { exists: true, value: edit.value } : { exists: false }
}

export function applySheetEdit(current: Record<string, unknown>, edit: SheetEdit): Record<string, unknown> {
  return editSheetPath(current, edit.path, (base) => applyValue(base, edit)) as Record<string, unknown>
}

export function isSheetValue(value: unknown): value is SheetValue {
  if (value === null) return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string' || typeof value === 'boolean') return true
  return isSheetContainer(value)
}

function isSheetContainer(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(isSheetValue)
  if (!sheetObject(value)) return false
  return Object.values(value).every(isSheetValue)
}
