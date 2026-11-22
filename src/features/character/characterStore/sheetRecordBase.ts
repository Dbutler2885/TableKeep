const bases = new WeakMap<object, Record<string, unknown>>()

export function rememberSheetRecordBase<T extends object>(record: T, raw: Record<string, unknown>): T {
  bases.set(record, raw)
  return record
}
export const sheetRecordBase = (record: object) => bases.get(record)
export function copySheetRecordBase<T extends object>(source: object, target: T): T {
  const raw = bases.get(source)
  if (raw) bases.set(target, raw)
  return target
}
