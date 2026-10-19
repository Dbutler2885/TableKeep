import { describe, expect, it } from 'vitest'
import { campaignRuleSet, changedFieldPaths, migrationTarget, planCharacter, sameValue } from './plan.mjs'
import { migrateCharacter, oseCharacterVersioning } from '../../src/features/ruleSets/characterMigrations.ts'
import legacy from '../../src/features/ruleSets/ose/fixtures/legacy.json'
import filledVtmSheet from '../../src/features/ruleSets/vtm/fixtures/filled-sheet.json'

// A stand-in for an SDK value, such as a timestamp, that compares by `isEqual`.
class Stamp {
  constructor(millis) {
    this.millis = millis
  }

  isEqual(other) {
    return other instanceof Stamp && other.millis === this.millis
  }
}
const stamp = (millis) => new Stamp(millis)

describe('a campaign\'s rule set', () => {
  it.each([
    ['ose', 'ose', null],
    ['vtm', 'vtm', null],
    [undefined, 'ose', 'missing'],
    [null, 'ose', 'missing'],
    ['', 'ose', 'empty'],
    ['pathfinder', 'ose', 'unregistered'],
    [7, 'ose', 'unregistered'],
  ])('resolves %j to %s', (system, ruleSetId, implicit) => {
    expect(campaignRuleSet(system)).toEqual({ ruleSetId, implicit })
  })
})

describe('comparing stored values', () => {
  it('compares lists, maps and SDK values by content', () => {
    expect(sameValue([1, { a: 'x' }], [1, { a: 'x' }])).toBe(true)
    expect(sameValue([1], [1, 2])).toBe(false)
    expect(sameValue({ a: 1 }, { a: 1, b: undefined })).toBe(false)
    expect(sameValue({ a: 1 }, { b: 1 })).toBe(false)
    expect(sameValue(stamp(5), stamp(5))).toBe(true)
    expect(sameValue(stamp(5), stamp(6))).toBe(false)
    expect(sameValue('a', 'b')).toBe(false)
    expect(sameValue(null, {})).toBe(false)
  })
})

describe('the changed field paths', () => {
  it('follows maps down, treats a list as one field, and names removals', () => {
    const before = { name: 'A', at: stamp(1), details: { inventory: [{ id: 'a' }], weapons: [], hp: 3 } }
    const after = { name: 'A', at: stamp(1), details: { inventory: [{ id: 'b' }], hp: 3 }, schemaVersion: 1 }
    expect(changedFieldPaths(before, after)).toEqual([
      { path: 'details.inventory', removed: false },
      { path: 'details.weapons', removed: true },
      { path: 'schemaVersion', removed: false },
    ])
  })

  it('reports nothing for an unchanged document', () => {
    const document = () => ({ a: [1, { b: stamp(2) }], c: { d: 'e' } })
    expect(changedFieldPaths(document(), document())).toEqual([])
  })

  it('reports a map replaced by a value as one changed field', () => {
    expect(changedFieldPaths({ a: { b: 1 } }, { a: 2 })).toEqual([{ path: 'a', removed: false }])
  })
})

describe('the plan for one character', () => {
  const oldLists = legacy['old-lists']

  it('migrates an OSE character below the current version, naming its changes and old shapes', () => {
    const plan = planCharacter(oldLists.id, oldLists.data, 'ose')
    expect(plan).toEqual({
      ruleSetId: 'ose',
      version: 0,
      status: 'migrate',
      document: migrateCharacter(oseCharacterVersioning, oldLists.id, oldLists.data).document,
      changes: [
        { path: 'details.armour', removed: true },
        { path: 'details.inventory', removed: false },
        { path: 'details.weapons', removed: true },
        { path: 'schemaVersion', removed: false },
      ],
      shapes: ['oldListsWithoutInventory', 'rowsWithoutIds'],
    })
  })

  it('migrates a VtM character by stamping its version, with no old shapes', () => {
    const plan = planCharacter(filledVtmSheet.id, filledVtmSheet.data, 'vtm')
    expect(plan).toMatchObject({ status: 'migrate', version: 0, changes: [{ path: 'schemaVersion', removed: false }], shapes: [] })
  })

  it('leaves a current character alone', () => {
    expect(planCharacter('c1', { system: 'vtm', schemaVersion: 1 }, 'vtm')).toEqual({ ruleSetId: 'vtm', version: 1, status: 'current' })
  })

  it('flags a character above the current version', () => {
    expect(planCharacter('c1', { schemaVersion: 2 }, 'ose')).toEqual({
      ruleSetId: 'ose', version: 2, status: 'flagged', reason: 'version 2 is above the current version',
    })
  })

  it.each([
    ['a VtM character in an OSE campaign', { system: 'vtm' }, 'ose'],
    ['a character without a system in a VtM campaign', {}, 'vtm'],
  ])('flags %s', (_name, data, ruleSetId) => {
    expect(planCharacter('c1', data, ruleSetId)).toEqual({
      ruleSetId, version: 0, status: 'flagged', reason: 'its system disagrees with its campaign\'s rule set',
    })
  })

  it('flags a character a step cannot convert, and one whose version is not a whole number', () => {
    expect(planCharacter('c1', { details: { weapons: 'sword' } }, 'ose')).toMatchObject({
      version: 0, status: 'flagged', reason: 'a migration step failed: details.weapons is not a list',
    })
    expect(planCharacter('c1', { schemaVersion: '1' }, 'ose')).toMatchObject({
      version: null, status: 'flagged', reason: 'a migration step failed: schemaVersion is not a whole number: 1',
    })
  })

  it('notes a character deleted since it was listed', () => {
    expect(planCharacter('c1', undefined, 'ose')).toEqual({ status: 'gone', ruleSetId: 'ose' })
  })
})

describe('where the script may run', () => {
  it('uses the emulator when one is set, with or without a project', () => {
    const env = { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }
    expect(migrationTarget({}, env)).toEqual({ label: 'the emulator at 127.0.0.1:8080', projectId: undefined })
    expect(migrationTarget({ project: 'p' }, env)).toEqual({ label: 'the emulator at 127.0.0.1:8080', projectId: 'p' })
  })

  it('uses a real project only when named with --live and --project', () => {
    expect(migrationTarget({ live: true, project: 'p' }, {})).toEqual({ label: 'the live project p', projectId: 'p' })
  })

  it('refuses without an emulator or --live, --live with an emulator, and --live without a project', () => {
    expect(() => migrationTarget({ project: 'p' }, {})).toThrow('No emulator is running')
    expect(() => migrationTarget({ live: true }, { FIRESTORE_EMULATOR_HOST: 'x' })).toThrow('--live was given but FIRESTORE_EMULATOR_HOST is set')
    expect(() => migrationTarget({ live: true }, {})).toThrow('--live needs the project named with --project <id>')
  })
})
