import { planSheetIntention } from '../sheetIntention'
import { sheetPayload } from '../sheetIntentionEdits'
import { SheetRepair, type SheetIntention, type SheetWriteReceipt } from '../sheetIntentionTypes'

type Fields = Record<string, unknown>
type Ref = { path: string; id: string }

/** Component fixtures keep their existing database and write spies. The public save seam still plans real intentions; live adapter/rules tests cover its transactions. */
export function sheetProtocol(read: (path: string) => Fields | undefined, write: (ref: Ref, fields: Fields) => unknown) {
  const receipts = new Map<string, Fields>()
  return {
    clear: () => receipts.clear(),
    snapshot: (ref: Ref) => {
      const data = receipts.get(ref.path) ?? read(ref.path)
      return { exists: () => data !== undefined, data: () => data }
    },
    save: (_db: unknown, ref: Ref, intention: SheetIntention) => {
      const key = `${ref.path}/writeReceipts/${intention.operationId}`
      const plan = planSheetIntention(read(ref.path), intention, receipts.get(key) as SheetWriteReceipt | undefined)
      if (plan.mutation) {
        write(ref, { ...plan.mutation.sheet, updatedAt: { sentinel: 'serverTimestamp' } })
        receipts.set(key, plan.mutation.receipt)
      }
      return Promise.resolve(plan.outcome)
    },
    create: (_db: unknown, ref: Ref, fields: Fields, initial: Fields) => {
      const key = `${ref.path}/writeReceipts/create-${ref.id}`
      if (read(ref.path)) {
        if (receipts.get(key)?.createPayload !== sheetPayload(initial)) return Promise.reject(new SheetRepair('value-conflict'))
      } else {
        write(ref, { ...fields, sheetRevision: 0 })
        receipts.set(key, { createPayload: sheetPayload(initial) })
      }
      return Promise.resolve()
    },
  }
}

/** Nonenumerable SDK attributes retain the old fixtures' plain path assertions. */
export function sheetFixtureDoc(first: unknown, ...segments: string[]): Ref {
  const prefix = first && typeof first === 'object' && 'path' in first ? String(first.path) : ''
  const path = [prefix, ...segments].filter(Boolean).join('/')
  const ref = { path } as Ref
  Object.defineProperties(ref, {
    id: { value: path.split('/').at(-1) },
    parent: { value: { id: path.split('/').at(-2), path: path.split('/').slice(0, -1).join('/') } },
    withConverter: { value: () => ref },
  })
  return ref
}
