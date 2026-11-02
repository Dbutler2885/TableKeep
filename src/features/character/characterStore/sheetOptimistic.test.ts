import { describe, expect, it } from 'vitest'
import { acknowledgeSheetEdit, acceptConfirmedSheet, optimisticSheet, type OptimisticSheet, type PendingSheetEdit } from './sheetOptimistic'
import { sheetRecordEdits } from '../../../../functions/src/sheets/sheetIntentionDiff'
import { planSheetIntention } from './sheetIntention'
import { capturedSheetEdits } from '../../../../functions/src/sheets/capturedSheetEdits'
import { copySheetRecordBase, rememberSheetRecordBase, sheetRecordBase } from './sheetRecordBase'

const original = { name: 'Ada', schemaVersion: 1, unknown: { preserved: true }, lubec: { counters: { stress: 4, trauma: 0 }, effects: [{ id: 'old', name: 'Bruise', value: 1 }], gear: { items: [{ id: 'ball', name: 'Dodgeball', qty: 2, slot: 0 }], supplies: [] } } }
const pending = (before: object, after: object, id = 'edit'): PendingSheetEdit => ({ intention: { operationId: id, baseRevision: 0, edits: sheetRecordEdits(before as Record<string, unknown>, after as Record<string, unknown>) } })

it('keeps an acknowledged wound and pickup visible under an unrelated delayed edit', () => {
  const state: OptimisticSheet = { confirmed: original, pending: [pending(original, { ...original, name: 'Ada M' })] }
  acceptConfirmedSheet(state, { ...original, sheetRevision: 1, lubec: { ...original.lubec, counters: { stress: 4, trauma: 2 }, effects: [...original.lubec.effects, { id: 'wound', name: 'Dazed' }], gear: { ...original.lubec.gear, items: [...original.lubec.gear.items, { id: 'pickup', name: 'Rock' }] } } })
  expect(optimisticSheet(state)).toMatchObject({ name: 'Ada M', sheetRevision: 1, lubec: { counters: { trauma: 2 }, effects: [{ id: 'old' }, { id: 'wound' }], gear: { items: [{ id: 'ball' }, { id: 'pickup' }] } } })
})

it('replays deltas onto fresh counters and avoids doubling a committed edit before/after its snapshot', () => {
  const entry = pending(original, { ...original, lubec: { ...original.lubec, counters: { stress: 5, trauma: 0 } } })
  const state: OptimisticSheet = { confirmed: original, pending: [entry] }
  expect(optimisticSheet(state)).toMatchObject({ lubec: { counters: { stress: 5 } }, sheetRevision: 0 })
  acknowledgeSheetEdit(entry, { status: 'committed', operationId: 'edit', revision: 2 })
  acceptConfirmedSheet(state, { ...original, sheetRevision: 1, lubec: { ...original.lubec, counters: { stress: 9, trauma: 2 } } })
  expect(optimisticSheet(state)).toMatchObject({ lubec: { counters: { stress: 10, trauma: 2 } } })
  acceptConfirmedSheet(state, { ...original, sheetRevision: 2, lubec: { ...original.lubec, counters: { stress: 10, trauma: 2 } } })
  expect(state.pending).toEqual([])
  expect(optimisticSheet(state)).toMatchObject({ lubec: { counters: { stress: 10 } } })
  acceptConfirmedSheet(state, { ...original, sheetRevision: 1 })
  expect(optimisticSheet(state)).toHaveProperty('sheetRevision', 2)
})

it('retains conflicting and vanished-record intentions for explicit review without hiding current data', () => {
  const rename = pending(original, { ...original, name: 'Mine' })
  const item = pending(original, { ...original, lubec: { ...original.lubec, gear: { ...original.lubec.gear, items: [{ ...original.lubec.gear.items[0], name: 'Red ball' }] } } }, 'item')
  const current = { ...original, name: 'Other device', sheetRevision: 1, lubec: { ...original.lubec, gear: { ...original.lubec.gear, items: [] } } }
  const state = { confirmed: current, pending: [rename, item] }
  expect(optimisticSheet(state)).toEqual(current)
  expect(state.pending).toHaveLength(2)
  expect(rename.error).toContain('Another device changed the same field')
  expect(item.error).toContain('is no longer on the sheet')
})

describe('capturing actual edited fields', () => {
  it('initializes legacy missing containers once and distinguishes normalized defaults from stored values', () => {
    const raw = { system: 'lubec', schemaVersion: 1, lubec: {} }
    const before = { ...raw, name: '', lubec: { counters: { stress: 0 }, gear: { items: [], supplies: [] } } }
    const after = { ...before, name: 'Ada', lubec: { counters: { stress: 1 }, gear: { items: [{ id: 'one' }, { id: 'two' }], supplies: [{ id: 'ammo' }] } } }
    const edits = capturedSheetEdits(before, after, raw)
    expect(edits).toEqual([
      { kind: 'set', path: ['lubec', 'counters'], base: { exists: false }, value: { stress: 1 } },
      { kind: 'set', path: ['lubec', 'gear'], base: { exists: false }, value: after.lubec.gear },
      { kind: 'set', path: ['name'], base: { exists: false }, value: 'Ada' },
    ])
    expect(planSheetIntention(raw, { operationId: 'legacy', baseRevision: 0, edits }).mutation?.sheet).toMatchObject(after)
    expect(capturedSheetEdits(before, before, raw)).toEqual([])
    expect(planSheetIntention({ ...raw, lubec: { gear: { items: [{ id: 'server' }] } } }, { operationId: 'legacy', baseRevision: 0, edits }).outcome).toMatchObject({ status: 'repair', code: 'value-conflict' })
  })

  it('sets an absent counter leaf initially, then uses numeric deltas and exact stored bases', () => {
    const raw = { lubec: { counters: { trauma: 2 } }, optional: null }
    const before = { ...raw, name: '', lubec: { counters: { stress: 0, trauma: 2 } } }
    const after = { ...before, name: 'Ada', optional: 'value', lubec: { counters: { stress: 1, trauma: 3 } } }
    expect(capturedSheetEdits(before, after, raw)).toEqual([
      { kind: 'set', path: ['lubec', 'counters', 'stress'], base: { exists: false }, value: 1 },
      { kind: 'delta', path: ['lubec', 'counters', 'trauma'], base: 2, amount: 1 },
      { kind: 'set', path: ['optional'], base: { exists: true, value: null }, value: 'value' },
      { kind: 'set', path: ['name'], base: { exists: false }, value: 'Ada' },
    ])
  })

  it('never resurrects a vanished stable row and preserves a captured raw base across display copies', () => {
    const edits = capturedSheetEdits(original, { ...original, lubec: { ...original.lubec, effects: [{ ...original.lubec.effects[0], name: 'New' }] } }, original)
    expect(planSheetIntention({ ...original, lubec: { ...original.lubec, effects: [] } }, { operationId: 'gone', baseRevision: 0, edits }).outcome).toMatchObject({ status: 'repair', code: 'record-missing' })
    const record = rememberSheetRecordBase({ name: 'view' }, original)
    const copy = copySheetRecordBase(record, { ...record, image: 'local' })
    expect(sheetRecordBase(copy)).toBe(original)
    expect(copySheetRecordBase({}, {})).toEqual({})
  })
  it('edits stable rows after reordering without replacing their neighbors or unknown fields', () => {
    const after = { ...original, lubec: { ...original.lubec, gear: { ...original.lubec.gear, items: [{ ...original.lubec.gear.items[0], qty: 1 }] }, effects: [{ id: 'new', name: 'Dazed' }, { ...original.lubec.effects[0], value: 2 }] } }
    const entry = pending(original, after)
    const current = { ...original, lubec: { ...original.lubec, effects: [{ id: 'server', name: 'Wound' }, ...original.lubec.effects], gear: { ...original.lubec.gear, items: [{ ...original.lubec.gear.items[0], futureField: true }] } } }
    const result = planSheetIntention(current, entry.intention)
    expect(result.mutation?.sheet).toMatchObject({ lubec: { effects: [{ id: 'server' }, { id: 'old', value: 2 }, { id: 'new' }], gear: { items: [{ id: 'ball', qty: 1, futureField: true }] } } })
  })

  it('removes a record without erasing an independently inserted one and edits primitive arrays atomically', () => {
    const before = { ...original, tags: ['one'] }
    const after = { ...before, tags: ['two'], lubec: { ...original.lubec, effects: [] } }
    const entry = pending(before, after)
    expect(planSheetIntention(before, entry.intention).mutation?.sheet).toMatchObject(after)
    const conflicted = planSheetIntention({ ...before, tags: ['other'] }, entry.intention)
    expect(conflicted.outcome).toMatchObject({ status: 'repair', code: 'value-conflict', path: ['tags'] })
  })

  it('distinguishes missing fields from null, never persists protocol fields and records no-op edits as empty', () => {
    const after = { ...original, added: null, schemaVersion: 2, sheetRevision: 99, createdAt: 100, updatedAt: 200, schemaWrittenAt: 300 }
    expect(pending(original, after).intention.edits).toEqual([{ kind: 'set', path: ['added'], base: { exists: false }, value: null }])
    const without = { ...original } as Record<string, unknown>; delete without.name
    expect(pending(original, without).intention.edits).toEqual([{ kind: 'remove', path: ['name'], base: { exists: true, value: 'Ada' } }])
    expect(sheetRecordEdits(original, structuredClone(original))).toEqual([])
  })
})
