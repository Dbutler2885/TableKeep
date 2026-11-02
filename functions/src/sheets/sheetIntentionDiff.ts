import { sheetPayload } from './sheetIntentionEdits.js'
import { sheetObject } from './sheetIntentionPath.js'
import type { SheetBase, SheetEdit, SheetPath, SheetValue } from './sheetIntentionTypes.js'

type Fields = Record<string, unknown>
const baseOf = (value: unknown): SheetBase => value === undefined ? { exists: false } : { exists: true, value: value as SheetValue }
const isRow = (row: unknown): row is Fields & { id: string } => sheetObject(row) && typeof row.id === 'string'
const isRows = (rows: unknown[]): rows is (Fields & { id: string })[] => rows.every(isRow)
const isCounter = (path: SheetPath) => path[0] === 'lubec' && path[1] === 'counters'

function leafEdit(before: unknown, after: unknown, path: SheetPath): SheetEdit {
  if (after === undefined) return { kind: 'remove', path, base: baseOf(before) }
  if (isCounter(path) && typeof before === 'number' && typeof after === 'number') return { kind: 'delta', path, base: before, amount: after - before }
  return { kind: 'set', path, base: baseOf(before), value: after as SheetValue }
}

function rowChange(before: Fields[], after: Fields & { id: string }, path: SheetPath): SheetEdit[] {
  const previous = before.find((row) => row.id === after.id)
  if (!previous) return [{ kind: 'insert', path, record: after as { id: string; [key: string]: SheetValue } }]
  return fieldEdits(previous, after, [...path, { recordId: after.id }])
}

function rowRemoval(after: Fields[], before: Fields & { id: string }, path: SheetPath): SheetEdit[] {
  if (after.some((row) => row.id === before.id)) return []
  return [{ kind: 'remove', path: [...path, { recordId: before.id }], base: baseOf(before) }]
}

function arrayEdits(before: unknown[], after: unknown[], path: SheetPath): SheetEdit[] {
  if (!isRows(before) || !isRows(after)) return [leafEdit(before, after, path)]
  return [...before.flatMap((row) => rowRemoval(after, row, path)), ...after.flatMap((row) => rowChange(before, row, path))]
}

/** Capture only what the user actually changed in their local before/after view. */
export function sheetEditDiff(before: unknown, after: unknown, path: SheetPath): SheetEdit[] {
  if (sheetPayload(before) === sheetPayload(after)) return []
  return compositeEdits(before, after, path)
}

function compositeEdits(before: unknown, after: unknown, path: SheetPath): SheetEdit[] {
  if (sheetObject(before) && sheetObject(after)) return fieldEdits(before, after, path)
  if (Array.isArray(before) && Array.isArray(after)) return arrayEdits(before, after, path)
  return [leafEdit(before, after, path)]
}

function fieldEdits(before: Fields, after: Fields, path: SheetPath): SheetEdit[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].flatMap((key) => sheetEditDiff(before[key], after[key], [...path, key]))
}

const PROTOCOL_FIELDS = new Set(['schemaVersion', 'schemaWrittenAt', 'sheetRevision', 'createdAt', 'updatedAt'])

/** A serialized view is used only to discover edits, never as the saved replacement. */
export function sheetRecordEdits(before: Fields, after: Fields): SheetEdit[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].filter((key) => !PROTOCOL_FIELDS.has(key)).flatMap((key) => sheetEditDiff(before[key], after[key], [key]))
}
