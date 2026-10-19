import { describe, expect, it } from 'vitest'
import { characterSchemaFloorDrift, readCharacterSchemaFloors, withCharacterSchemaFloors } from './floors.mjs'

const rules = [
  'service cloud.firestore {',
  '    function characterSchemaFloors() {',
  '      return {"ose": 0, "vtm": 0};',
  '    }',
  '    function other() { return {"a": 1}; }',
  '}',
].join('\n')

describe('character schema floors in a rules file', () => {
  it('reads each floor by rule-set id', () => {
    expect(readCharacterSchemaFloors(rules)).toEqual({ ose: 0, vtm: 0 })
  })

  it('replaces only the floors, keeping the rest of the file', () => {
    const raised = withCharacterSchemaFloors(rules, { ose: 1, vtm: 1, lubec: 1 })
    expect(readCharacterSchemaFloors(raised)).toEqual({ ose: 1, vtm: 1, lubec: 1 })
    expect(raised).toBe(rules.replace('{"ose": 0, "vtm": 0}', '{"ose": 1, "vtm": 1, "lubec": 1}'))
  })

  it('refuses a rules file without the floors function', () => {
    expect(() => readCharacterSchemaFloors('service cloud.firestore {}')).toThrow(/characterSchemaFloors/)
    expect(() => withCharacterSchemaFloors('service cloud.firestore {}', { ose: 1 })).toThrow(/characterSchemaFloors/)
  })
})

describe('character schema floor drift', () => {
  it('finds nothing when every floor is known and at or below its version', () => {
    expect(characterSchemaFloorDrift({ ose: 0, vtm: 1 }, { ose: 1, vtm: 1 })).toEqual([])
  })

  it('names a floor above its current version', () => {
    expect(characterSchemaFloorDrift({ ose: 2, vtm: 0 }, { ose: 1, vtm: 1 })).toEqual([
      '"ose" has floor 2, above its current version 1.',
    ])
  })

  it('names a rule set only one side knows', () => {
    expect(characterSchemaFloorDrift({ ose: 0, lubec: 1 }, { ose: 1, vtm: 1 })).toEqual([
      'firestore.rules has a floor for "lubec", which the registry does not know.',
      'firestore.rules has no floor for "vtm".',
    ])
  })
})
