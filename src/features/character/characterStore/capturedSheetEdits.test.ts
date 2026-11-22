import { expect, it } from 'vitest'
import { capturedSheetEdits } from '../../../../functions/src/sheets/capturedSheetEdits'
import { sheetRecordEdits } from '../../../../functions/src/sheets/sheetIntentionDiff'
import { planSheetIntention } from './sheetIntention'
const gear = (items: unknown[]) => ({ lubec: { gear: { items } } })
const apply = (raw: Record<string, unknown>, edits: ReturnType<typeof capturedSheetEdits>) => planSheetIntention(raw, { operationId: 'edit', baseRevision: 0, edits })
it('inserts into an existing stable array and initializes only the absent array when its parent already exists', () => {
  const before = gear([]), after = gear([{ id: 'new', name: 'Rock' }])
  expect(capturedSheetEdits(before, after, before)).toEqual([{ kind: 'insert', path: ['lubec', 'gear', 'items'], record: { id: 'new', name: 'Rock' } }])
  expect(capturedSheetEdits(before, after, { lubec: { gear: {} } })).toEqual([{ kind: 'set', path: ['lubec', 'gear', 'items'], base: { exists: false }, value: after.lubec.gear.items }])
})
it('edits a row by identity among malformed and differently ordered canonical neighbors', () => {
  const before = gear([{ id: 'row', name: 'Rock', qty: 1 }]), after = gear([{ id: 'row', name: 'Red rock', qty: 2 }])
  const raw = gear([null, 'legacy row', { id: 'other', name: 'Other' }, { id: 'row', name: 'Rock', qty: 1, future: true }])
  const edits = capturedSheetEdits(before, after, raw)
  expect(edits).toEqual([
    { kind: 'set', path: ['lubec', 'gear', 'items', { recordId: 'row' }, 'name'], base: { exists: true, value: 'Rock' }, value: 'Red rock' },
    { kind: 'set', path: ['lubec', 'gear', 'items', { recordId: 'row' }, 'qty'], base: { exists: true, value: 1 }, value: 2 },
  ])
  expect(apply(raw, edits).mutation?.sheet).toMatchObject(gear([null, 'legacy row', { id: 'other', name: 'Other' }, { id: 'row', name: 'Red rock', qty: 2, future: true }]))
})
it('removes the captured canonical row including its future fields and refuses a vanished row', () => {
  const before = gear([{ id: 'row', name: 'Rock' }]), raw = gear([{ id: 'row', name: 'Rock', future: true }])
  const edits = capturedSheetEdits(before, gear([]), raw)
  expect(edits[0]).toEqual({ kind: 'remove', path: ['lubec', 'gear', 'items', { recordId: 'row' }], base: { exists: true, value: raw.lubec.gear.items[0] } })
  expect(apply(raw, edits).mutation?.sheet).toMatchObject(gear([]))
  const vanished = capturedSheetEdits(before, gear([]), gear([]))
  expect(vanished[0]).toMatchObject({ base: { exists: false } })
  expect(apply(gear([]), vanished).outcome).toMatchObject({ status: 'repair', code: 'record-missing' })
})
it('does not initialize through a vanished row, malformed array or scalar parent', () => {
  const before = gear([{ id: 'row', nested: { value: 1 } }]), after = gear([{ id: 'row', nested: { value: 2 } }])
  for (const raw of [gear([]), gear([null, { id: 'other' }]), { lubec: { gear: { items: null } } }, { lubec: null }]) {
    const edits = capturedSheetEdits(before, after, raw)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toMatchObject({ kind: 'set', path: ['lubec', 'gear', 'items', { recordId: 'row' }, 'nested', 'value'], base: { exists: false }, value: 2 })
    expect(apply(raw, edits).outcome.status).toBe('repair')
  }
})
it('initializes a missing object inside an existing row without replacing its neighbors', () => {
  const before = gear([{ id: 'row', nested: { value: 1 } }]), after = gear([{ id: 'row', nested: { value: 2 } }]), raw = gear([{ id: 'other' }, { id: 'row' }])
  const edits = capturedSheetEdits(before, after, raw)
  expect(edits).toEqual([{ kind: 'set', path: ['lubec', 'gear', 'items', { recordId: 'row' }, 'nested'], base: { exists: false }, value: { value: 2 } }])
  expect(apply(raw, edits).mutation?.sheet).toMatchObject(gear([{ id: 'other' }, { id: 'row', nested: { value: 2 } }]))
})
it('converts nonnumeric stored counters to an exact-base set and preserves ordinary numeric sets', () => {
  const before = { lubec: { counters: { stress: 0 }, score: 1 }, counters: { stress: 1 }, score: 1 }
  const after = { lubec: { counters: { stress: 1 }, score: 2 }, counters: { stress: 2 }, score: 2 }
  const raw = { ...before, lubec: { ...before.lubec, counters: { stress: null } } }
  const edits = capturedSheetEdits(before, after, raw)
  expect(edits).toEqual([
    { kind: 'set', path: ['lubec', 'counters', 'stress'], base: { exists: true, value: null }, value: 1 },
    { kind: 'set', path: ['lubec', 'score'], base: { exists: true, value: 1 }, value: 2 },
    { kind: 'set', path: ['counters', 'stress'], base: { exists: true, value: 1 }, value: 2 },
    { kind: 'set', path: ['score'], base: { exists: true, value: 1 }, value: 2 },
  ])
  expect(apply(raw, edits).mutation?.sheet).toMatchObject(after)
})
it.each([[null, 1], [1, null], [{ key: 1 }, 'scalar'], ['scalar', { key: 1 }], [[{ id: 7 }], [{ id: 'row' }]], [[{ id: 'row' }], [null, { id: 'next' }]], [[{ id: 'row' }], { key: 1 }], [{ key: 1 }, ['row']]])('captures type changes and mixed or malformed lists atomically: %j to %j', (before, after) => {
  expect(sheetRecordEdits({ value: before }, { value: after })).toEqual([{ kind: 'set', path: ['value'], base: { exists: true, value: before }, value: after }])
})
it('does not mistake numeric-to-text or text-to-numeric counters for deltas', () => {
  for (const [before, after] of [[1, 'text'], ['text', 1]]) expect(sheetRecordEdits({ lubec: { counters: { stress: before } } }, { lubec: { counters: { stress: after } } })[0]).toMatchObject({ kind: 'set', value: after })
})
it('keeps clearing an already absent canonical field as a removal instead of setting undefined', () => {
  const edits = capturedSheetEdits({ name: 'Parser default' }, {}, {})
  expect(edits).toEqual([{ kind: 'remove', path: ['name'], base: { exists: false } }])
  expect(apply({}, edits).mutation?.sheet).toEqual({ sheetRevision: 1 })
})
it('keeps numeric counters in another namespace as compare-and-set fields', () => {
  expect(sheetRecordEdits({ other: { counters: { stress: 1 } } }, { other: { counters: { stress: 2 } } })).toEqual([{ kind: 'set', path: ['other', 'counters', 'stress'], base: { exists: true, value: 1 }, value: 2 }])
})
