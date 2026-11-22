import { SheetRepair, type SheetBase, type SheetPath, type SheetValue } from './sheetIntentionTypes.js'

export function sheetObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function recordIndex(rows: unknown[], recordId: string, path: SheetPath): number {
  const matches = rows.flatMap((row, index) => sheetObject(row) && row.id === recordId ? [index] : [])
  if (matches.length !== 1) throw new SheetRepair('record-missing', path)
  return matches[0]
}

/** Rebuild only the touched ancestors, retaining all other canonical data verbatim. */
export function editSheetPath(
  current: unknown,
  path: SheetPath,
  edit: (base: SheetBase) => SheetBase,
  fullPath: SheetPath = path,
): unknown {
  const [segment, ...rest] = path
  if (typeof segment === 'string') return editObjectField(current, segment, rest, edit, fullPath)
  if (!segment || !Array.isArray(current)) throw new SheetRepair('invalid-path', fullPath)
  const index = recordIndex(current, segment.recordId, fullPath)
  const rows = [...current]
  if (rest.length) rows[index] = editSheetPath(rows[index], rest, edit, fullPath)
  else replaceRecord(rows, index, edit, fullPath)
  return rows
}

function replaceRecord(rows: unknown[], index: number, edit: (base: SheetBase) => SheetBase, path: SheetPath) {
  const next = edit({ exists: true, value: rows[index] as SheetValue })
  if (next.exists) throw new SheetRepair('invalid-path', path)
  rows.splice(index, 1)
}

function editObjectField(current: unknown, field: string, rest: SheetPath, edit: (base: SheetBase) => SheetBase, path: SheetPath) {
  if (!sheetObject(current)) throw new SheetRepair('invalid-path', path)
  if (rest.length) return { ...current, [field]: editSheetPath(current[field], rest, edit, path) }
  const next = edit(readField(current, field))
  const result = { ...current }
  if (next.exists) result[field] = next.value
  else delete result[field]
  return result
}

function readField(current: Record<string, unknown>, field: string): SheetBase {
  if (!Object.hasOwn(current, field)) return { exists: false }
  return { exists: true, value: current[field] as SheetValue }
}
