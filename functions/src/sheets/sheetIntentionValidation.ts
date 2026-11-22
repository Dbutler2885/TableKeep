import { isSheetValue } from './sheetIntentionEdits.js'
import { SheetRepair, type SheetEdit, type SheetIntention, type SheetPath } from './sheetIntentionTypes.js'

const protectedFields = new Set(['sheetRevision', 'schemaVersion', 'schemaWrittenAt', 'createdAt', 'updatedAt'])
const unsafeFields = new Set(['__proto__', 'constructor', 'prototype'])

function validPath(path: SheetPath): boolean {
  if (!path.length || typeof path[0] !== 'string') return false
  if (protectedFields.has(path[0])) return false
  return path.every((segment) => typeof segment === 'string' ? validField(segment) : validField(segment.recordId))
}

function validField(field: string): boolean {
  return typeof field === 'string' && field.length > 0 && !unsafeFields.has(field)
}

function validEditValue(edit: SheetEdit): boolean {
  if (edit.kind === 'delta') return [edit.base, edit.amount].every(Number.isFinite)
  if (edit.kind === 'insert') return validField(edit.record.id) && isSheetValue(edit.record)
  return !edit.base.exists || isSheetValue(edit.base.value)
}

function validateEdit(edit: SheetEdit) {
  if (!validPath(edit.path)) throw new SheetRepair('invalid-path', edit.path)
  if (!validEditValue(edit)) throw new SheetRepair('invalid-intention', edit.path)
  if (edit.kind === 'set' && !isSheetValue(edit.value)) throw new SheetRepair('invalid-intention', edit.path)
}

function validOperationId(operationId: string): boolean {
  return operationId.length > 0 && operationId.length <= 128 && !/[^A-Za-z0-9_-]/.test(operationId)
}

export function validateSheetIntention(intention: SheetIntention) {
  if (!validOperationId(intention.operationId)) throw new SheetRepair('invalid-intention')
  if (!Number.isSafeInteger(intention.baseRevision) || intention.baseRevision < 0) throw new SheetRepair('invalid-revision')
  if (!intention.edits.length) throw new SheetRepair('invalid-intention')
  intention.edits.forEach(validateEdit)
}
