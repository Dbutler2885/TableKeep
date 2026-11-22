import { describe, expect, it } from 'vitest'
import fixture from '../../ruleSets/lubec/fixtures/stored-character.json'
import { planSheetIntention, readSheetRevision } from './sheetIntention'
import type { SheetEdit, SheetIntention, SheetPath, SheetRepairCode } from './sheetIntentionTypes'

const stress = ['lubec', 'counters', 'stress']
const effects = ['lubec', 'effects']
const effectName = [...effects, { recordId: 'effect-1' }, 'name']
const delta: SheetEdit = { kind: 'delta', path: stress, base: 4, amount: 2 }
const rename: SheetEdit = { kind: 'set', path: ['name'], base: { exists: true, value: 'Ada Mitchell' }, value: 'Ada' }
const intention = (edits: readonly SheetEdit[] = [delta], baseRevision = 0): SheetIntention => ({ operationId: 'edit-1', baseRevision, edits })
const repair = (code: SheetRepairCode, path: SheetPath = []) => ({ outcome: { status: 'repair', code, path } })

describe('revisioned sheet intentions on current stored sheets', () => {
  it('reads a missing revision as zero and retains the entire canonical sheet except the edit and revision', () => {
    const sheet = { ...structuredClone(fixture.data), schemaWrittenAt: new Date(123), future: { array: [1, 2] } }
    expect(readSheetRevision(sheet)).toBe(0)
    const plan = planSheetIntention(sheet, intention())
    expect(plan.mutation?.sheet).toEqual({
      ...sheet, sheetRevision: 1,
      lubec: { ...sheet.lubec, counters: { ...sheet.lubec.counters, stress: 6 } },
    })
    expect(plan.mutation?.receipt).toEqual({ intention: intention(), outcome: { status: 'committed', operationId: 'edit-1', revision: 1 } })
    expect(sheet).toEqual({ ...fixture.data, schemaWrittenAt: new Date(123), future: { array: [1, 2] } })
  })

  it('rebases independent scalar changes and real deltas, once per multi-edit mutation', () => {
    const sheet = { ...fixture.data, sheetRevision: 8, hidden: true }
    const plan = planSheetIntention(sheet, intention([delta, rename]))
    expect(plan.outcome).toEqual({ status: 'committed', operationId: 'edit-1', revision: 9 })
    expect(plan.mutation?.sheet).toMatchObject({ name: 'Ada', hidden: true, lubec: { counters: { stress: 6 } } })
    const changedCounter = { ...sheet, lubec: { ...sheet.lubec, counters: { ...sheet.lubec.counters, stress: 20 } } }
    expect(planSheetIntention(changedCounter, intention()).mutation?.sheet).toMatchObject({ lubec: { counters: { stress: 22 } } })
  })

  it('edits a stable record after collection reordering and preserves its unknown and untouched fields', () => {
    const sheet = structuredClone(fixture.data)
    sheet.lubec.effects.unshift({ ...sheet.lubec.effects[0], id: 'another-effect' })
    const edit: SheetEdit = { kind: 'set', path: effectName, base: { exists: true, value: 'Severe Concussion' }, value: 'Concussion' }
    const plan = planSheetIntention(sheet, intention([edit]))
    expect(plan.mutation?.sheet).toMatchObject({ lubec: { effects: [sheet.lubec.effects[0], { ...sheet.lubec.effects[1], name: 'Concussion' }] } })
  })

  it('inserts and removes identified records without replacing unrelated entries', () => {
    const sheet = structuredClone(fixture.data)
    const record = { id: 'new-effect', name: 'Bruised', unknown: { kept: true } }
    const edits: SheetEdit[] = [
      { kind: 'insert', path: effects, record },
      { kind: 'remove', path: [...effects, { recordId: 'effect-1' }], base: { exists: true, value: sheet.lubec.effects[0] } },
    ]
    expect(planSheetIntention(sheet, intention(edits)).mutation?.sheet).toMatchObject({ lubec: { effects: [record] } })
  })

  it('distinguishes absent fields from null, adds fields and removes only the touched field', () => {
    const edits: SheetEdit[] = [
      { kind: 'set', path: ['newField'], base: { exists: false }, value: null },
      { kind: 'remove', path: ['hidden'], base: { exists: true, value: false } },
    ]
    const plan = planSheetIntention(fixture.data, intention(edits))
    expect(plan.mutation?.sheet).toHaveProperty('newField', null)
    expect(plan.mutation?.sheet).not.toHaveProperty('hidden')
    expect(planSheetIntention({ ...fixture.data, newField: null }, intention([edits[0]]))).toEqual(repair('value-conflict', ['newField']))
  })

  it('returns the immutable committed outcome after a lost acknowledgement, even after deletion or later revisions', () => {
    const first = planSheetIntention(fixture.data, intention())
    const receipt = first.mutation!.receipt
    expect(planSheetIntention(undefined, intention(), receipt)).toEqual({ outcome: first.outcome })
    expect(planSheetIntention({ sheetRevision: 40 }, intention(), receipt)).toEqual({ outcome: first.outcome })
    expect(planSheetIntention(fixture.data, intention([rename]), receipt)).toEqual(repair('operation-id-reused'))
    expect(planSheetIntention(fixture.data, { ...intention(), baseRevision: 1 }, receipt)).toEqual(repair('operation-id-reused'))
  })

  it('compares receipt objects independent of key order, while retaining array order and exact values', () => {
    const edit: SheetEdit = { kind: 'set', path: ['new'], base: { exists: false }, value: { a: 1, b: [2, 3] } }
    const first = planSheetIntention(fixture.data, intention([edit]))
    const reordered: SheetEdit = { ...edit, value: { b: [2, 3], a: 1 } }
    expect(planSheetIntention(undefined, intention([reordered]), first.mutation!.receipt)).toEqual({ outcome: first.outcome })
    expect(planSheetIntention(undefined, intention([{ ...edit, value: { a: 1, b: [3, 2] } }]), first.mutation!.receipt)).toEqual(repair('operation-id-reused'))
  })

  it('refuses a changed value atomically, even after planning an earlier delta', () => {
    expect(planSheetIntention({ ...fixture.data, name: 'Renamed elsewhere' }, intention([delta, rename]))).toEqual(repair('value-conflict', ['name']))
    expect(fixture.data.lubec.counters.stress).toBe(4)
  })

  it.each([null, -1, 0.5, '1', NaN, Infinity, Number.MAX_SAFE_INTEGER])('refuses corrupt or exhausted stored revision %s', (sheetRevision) => {
    expect(planSheetIntention({ ...fixture.data, sheetRevision }, intention())).toEqual(repair('invalid-revision'))
  })

  it('refuses deleted sheets and future base revisions without resurrection', () => {
    expect(planSheetIntention(undefined, intention())).toEqual(repair('sheet-deleted'))
    expect(planSheetIntention(fixture.data, intention([rename], 1))).toEqual(repair('future-revision'))
  })

  it.each([
    { kind: 'set', path: effectName, base: { exists: true, value: 'wrong' }, value: 'Name' },
    { kind: 'delta', path: ['name'], base: 4, amount: 2 },
    { kind: 'delta', path: ['missing'], base: 4, amount: 2 },
    { kind: 'delta', path: ['huge'], base: 4, amount: Number.MAX_VALUE },
  ] satisfies SheetEdit[])('refuses incompatible values for $kind at $path', (edit) => {
    expect(planSheetIntention({ ...fixture.data, huge: Number.MAX_VALUE }, intention([edit]))).toEqual(repair('value-conflict', edit.path))
  })

  it('refuses missing or ambiguous stable record ids', () => {
    const edit: SheetEdit = { kind: 'delta', path: [...effects, { recordId: 'gone' }, 'amount'], base: 1, amount: 1 }
    expect(planSheetIntention(fixture.data, intention([edit]))).toEqual(repair('record-missing', edit.path))
    const duplicate = { ...fixture.data, lubec: { effects: [fixture.data.lubec.effects[0], fixture.data.lubec.effects[0]] } }
    expect(planSheetIntention(duplicate, intention([{ kind: 'set', path: effectName, base: { exists: false }, value: 'New' }])).outcome).toMatchObject({ code: 'record-missing' })
  })

  it('refuses record collisions and invalid collection targets', () => {
    const insert: SheetEdit = { kind: 'insert', path: effects, record: { id: 'effect-1' } }
    expect(planSheetIntention(fixture.data, intention([insert]))).toEqual(repair('record-exists', effects))
    for (const path of [['missing'], ['name']]) {
      expect(planSheetIntention(fixture.data, intention([{ ...insert, path }]))).toEqual(repair('invalid-path', path))
    }
    const twoRows = { ...fixture.data, lubec: { effects: [{ id: 'other' }, { id: 'effect-1' }] } }
    expect(planSheetIntention(twoRows, intention([insert]))).toEqual(repair('record-exists', effects))
  })

  it.each([[], ['schemaVersion'], ['sheetRevision'], ['schemaWrittenAt'], ['createdAt'], ['updatedAt'], ['__proto__'], ['constructor'], ['prototype'], [''], [{ recordId: 'x' }]])('refuses protected or invalid paths %j', (...path) => {
    const edit: SheetEdit = { ...rename, path: path as SheetPath }
    expect(planSheetIntention(fixture.data, intention([edit]))).toEqual(repair('invalid-path', edit.path))
  })

  it('refuses invalid ancestors, numeric indexing and whole-record replacement', () => {
    const paths: SheetPath[] = [['name', 'field'], ['lubec', 'effects', '0'], ['name', { recordId: 'x' }], [...effects, { recordId: 'effect-1' }]]
    for (const path of paths) {
      expect(planSheetIntention(fixture.data, intention([{ ...rename, path, base: { exists: true, value: fixture.data.lubec.effects[0] } }])).outcome).toMatchObject({ status: 'repair', code: 'invalid-path' })
    }
  })

  it.each(['', 'has/slash', '.', 'x'.repeat(129), 'ends-in-newline\n', 'space here'])('refuses unsafe operation id %s', (operationId) => {
    expect(planSheetIntention(fixture.data, { ...intention(), operationId })).toEqual(repair('invalid-intention'))
  })

  it('accepts the full operation id alphabet and the maximum id length', () => {
    expect(planSheetIntention(fixture.data, { ...intention(), operationId: 'Az09_-'.padEnd(128, 'x') }).outcome).toMatchObject({ status: 'committed' })
  })

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('refuses invalid base revision %s', (baseRevision) => {
    expect(planSheetIntention(fixture.data, intention([rename], baseRevision))).toEqual(repair('invalid-revision'))
  })

  it('refuses empty edits and values that cannot survive a receipt round trip', () => {
    expect(planSheetIntention(fixture.data, intention([]))).toEqual(repair('invalid-intention'))
    const invalid: SheetEdit[] = [
      { ...delta, base: NaN }, { ...delta, amount: Infinity },
      { kind: 'insert', path: effects, record: { id: '' } },
      { kind: 'insert', path: effects, record: { id: 'new', bad: undefined as never } },
      { ...rename, value: { invalid: [true, undefined as never] } },
      { ...rename, base: { exists: true, value: NaN } },
    ]
    for (const edit of invalid) expect(planSheetIntention(fixture.data, intention([edit]))).toEqual(repair('invalid-intention', edit.path))
  })

  it('refuses a counter that has become null or boolean instead of coercing it into a number', () => {
    for (const stress of [null, true, false]) {
      const sheet = { ...fixture.data, lubec: { counters: { stress } } }
      expect(planSheetIntention(sheet, intention())).toEqual(repair('value-conflict', delta.path))
    }
  })

  it('validates the entire nested path and stable record identity before editing', () => {
    const paths: SheetPath[] = [['lubec', '__proto__'], ['lubec', 'constructor'], ['lubec', 'prototype'], ['lubec', ''], ['lubec', { recordId: '' }]]
    for (const path of paths) expect(planSheetIntention(fixture.data, intention([{ ...rename, path }]))).toEqual(repair('invalid-path', path))
  })

  it('propagates unexpected data access errors rather than labeling them as an edit conflict', () => {
    const sheet = { get sheetRevision(): number { throw new Error('unexpected access failure') } }
    expect(() => planSheetIntention(sheet, intention())).toThrow('unexpected access failure')
  })
})
