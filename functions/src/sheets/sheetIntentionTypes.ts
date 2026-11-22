/** Paths address collection entries by stable id, never by array position. */
export type SheetPath = readonly (string | { recordId: string })[]
export type SheetValue = null | boolean | number | string | SheetValue[] | { [key: string]: SheetValue }
export type SheetBase = { exists: false } | { exists: true; value: SheetValue }

export type SheetEdit =
  | { kind: 'set'; path: SheetPath; base: SheetBase; value: SheetValue }
  | { kind: 'remove'; path: SheetPath; base: SheetBase }
  | { kind: 'delta'; path: SheetPath; base: number; amount: number }
  | { kind: 'insert'; path: SheetPath; record: { id: string; [key: string]: SheetValue } }

/** Allocate and retain this envelope before sending, including after an uncertain acknowledgement. */
export type SheetIntention = {
  operationId: string
  baseRevision: number
  edits: readonly SheetEdit[]
}

export type SheetRepairCode =
  | 'invalid-intention' | 'invalid-revision' | 'future-revision' | 'sheet-deleted'
  | 'value-conflict' | 'record-missing' | 'record-exists' | 'invalid-path'
  | 'operation-id-reused'

export type SheetWriteOutcome =
  | { status: 'committed'; operationId: string; revision: number }
  | { status: 'repair'; code: SheetRepairCode; path: SheetPath }

export type SheetWriteReceipt = {
  intention: SheetIntention
  outcome: Extract<SheetWriteOutcome, { status: 'committed' }>
}

export class SheetRepair extends Error {
  readonly code: SheetRepairCode
  readonly path: SheetPath

  constructor(code: SheetRepairCode, path: SheetPath = []) {
    super(code)
    this.code = code
    this.path = path
  }
}
