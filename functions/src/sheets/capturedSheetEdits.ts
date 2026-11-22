import { sheetRecordEdits } from './sheetIntentionDiff.js'
import { sheetPayload } from './sheetIntentionEdits.js'
import { sheetObject } from './sheetIntentionPath.js'
import type { SheetBase, SheetEdit, SheetPath, SheetValue } from './sheetIntentionTypes.js'

type Fields = Record<string, unknown>
const containerPath = (edit: SheetEdit) => edit.kind === 'insert' ? edit.path : edit.path.slice(0, -1)

/** Use the actual captured storage base, including missing fields that the parser presents as defaults. */
export function capturedSheetEdits(before: Fields, after: Fields, raw: Fields): SheetEdit[] {
  const initialized = new Set<string>()
  return sheetRecordEdits(before, after).flatMap((edit) => captureEdit(edit, raw, after, initialized))
}

function captureEdit(edit: SheetEdit, raw: Fields, after: Fields, initialized: Set<string>): SheetEdit[] {
  const missing = firstMissingField(raw, containerPath(edit))
  if (missing) return initializeContainer(missing, after, initialized)
  if (edit.kind === 'insert') return [edit]
  const base = capturedBase(raw, edit.path)
  if (edit.kind === 'delta') return [captureDelta(edit, base, after)]
  return [{ ...edit, base }]
}

function captureDelta(edit: Extract<SheetEdit, { kind: 'delta' }>, base: SheetBase, after: Fields): SheetEdit {
  if (base.exists && typeof base.value === 'number') return { ...edit, base: base.value }
  return { kind: 'set', path: edit.path, base, value: valueAt(after, edit.path) as SheetValue }
}

function initializeContainer(path: SheetPath, after: Fields, initialized: Set<string>): SheetEdit[] {
  const key = sheetPayload(path)
  if (initialized.has(key)) return []
  initialized.add(key)
  return [{ kind: 'set', path, base: { exists: false }, value: valueAt(after, path) as SheetValue }]
}

function valueAt(value: unknown, path: SheetPath): unknown {
  return path.reduce((current: unknown, segment) => typeof segment === 'string' ? objectField(current, segment) : findRow(current, segment.recordId), value)
}
function objectField(value: unknown, key: string): unknown {
  return sheetObject(value) ? value[key] : undefined
}
function findRow(value: unknown, id: string): unknown {
  if (!Array.isArray(value)) return undefined
  return value.find((row) => sheetObject(row) && row.id === id)
}

function firstMissingField(value: unknown, path: SheetPath, prefix: SheetPath = []): SheetPath | undefined {
  const [segment, ...rest] = path
  if (segment === undefined) return undefined
  if (typeof segment === 'string') return missingObjectField(value, segment, rest, prefix)
  return firstMissingField(findRow(value, segment.recordId), rest, [...prefix, segment])
}
function missingObjectField(value: unknown, key: string, rest: SheetPath, prefix: SheetPath): SheetPath | undefined {
  if (!sheetObject(value)) return undefined
  if (!Object.hasOwn(value, key)) return [...prefix, key]
  return firstMissingField(value[key], rest, [...prefix, key])
}
function capturedBase(raw: Fields, path: SheetPath): SheetBase {
  const parent = valueAt(raw, path.slice(0, -1))
  const leaf = path.at(-1)!
  if (typeof leaf === 'string') return objectBase(parent, leaf)
  const row = findRow(parent, leaf.recordId)
  return row === undefined ? { exists: false } : { exists: true, value: row as SheetValue }
}
function objectBase(value: unknown, key: string): SheetBase {
  if (!sheetObject(value) || !Object.hasOwn(value, key)) return { exists: false }
  return { exists: true, value: value[key] as SheetValue }
}
