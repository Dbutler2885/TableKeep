import { describe, expect, it } from 'vitest'
import { lineageSupply, lineageWeapon } from './__tests__/itemLineageFixtures'
import { lubecCommandItemId } from './itemIdentity'
import { lubecImportItemSupplies, lubecReferencedSupplies } from './itemSupplyTransfer'

const command = { commandId: 'pickup', role: 'weapon', ordinal: 2 }
const conflict = { ...lineageSupply, name: 'Blue paint rounds' }

describe('referenced custom supplies', () => {
  it('carries only definitions named by takes or fits and keeps unknown definition fields', () => {
    expect(lubecReferencedSupplies(lineageWeapon, [lineageSupply, { id: 'unused', name: 'Other' }])).toEqual([lineageSupply])
    expect(lubecImportItemSupplies(lineageWeapon, [], [lineageSupply], command)).toEqual({ item: lineageWeapon, supplies: [lineageSupply] })
    expect(lubecImportItemSupplies(lineageWeapon, [lineageSupply], [lineageSupply], command).supplies).toEqual([lineageSupply])
    expect(lubecImportItemSupplies({ ...lineageWeapon, takes: undefined, fits: undefined }, [], [lineageSupply], command).supplies).toEqual([])
  })

  it('remaps both references together, deterministically, without altering existing items or supplies', () => {
    const before = structuredClone({ lineageWeapon, lineageSupply, conflict })
    const result = lubecImportItemSupplies(lineageWeapon, [conflict], [lineageSupply], command)
    const id = lubecCommandItemId({ ...command, role: 'supply:custom' }, 'supply:custom')
    expect(result.item).toEqual({ ...lineageWeapon, takes: id, fits: id })
    expect(result.supplies).toEqual([conflict, { ...lineageSupply, id }])
    expect(lubecImportItemSupplies(lineageWeapon, result.supplies, [lineageSupply], command)).toEqual(result)
    expect({ lineageWeapon, lineageSupply, conflict }).toEqual(before)
    expect(result.item).not.toHaveProperty('count')
  })

  it('compares structured data independently of object-key order', () => {
    const reordered = { future: { color: 'red' }, loose: [1, 4] as [number, number], name: lineageSupply.name, id: lineageSupply.id }
    expect(lubecImportItemSupplies(lineageWeapon, [reordered], [lineageSupply], command).supplies).toEqual([reordered])
  })

  it('preserves distinct takes and fits and avoids collisions with built-in supplies', () => {
    const supply = { id: 'water', name: 'Custom water', future: true }
    const result = lubecImportItemSupplies({ ...lineageWeapon, fits: 'water' }, [conflict], [lineageSupply, supply], command)
    expect(result.item.takes).not.toBe(result.item.fits)
    expect(result.item.takes).not.toBe('custom')
    expect(result.item.fits).not.toBe('water')
    expect(result.supplies).toHaveLength(3)
    expect(result.supplies[2]).toEqual({ ...supply, id: result.item.fits })
  })

  it('refuses a conflicting deterministic output id and inconsistent source definitions', () => {
    const id = lubecCommandItemId({ ...command, role: 'supply:custom' }, 'supply:custom')
    expect(() => lubecImportItemSupplies(lineageWeapon, [conflict, { ...conflict, id }], [lineageSupply], command)).toThrow('Conflicting item supply')
    expect(() => lubecImportItemSupplies(lineageWeapon, [], [lineageSupply, conflict], command)).toThrow('Conflicting item supply')
  })
})

it('leaves an undefined takes or fits absent and preserves unresolved references verbatim', () => {
  expect(lubecImportItemSupplies(lineageWeapon, [], [], command)).toEqual({ item: lineageWeapon, supplies: [] })
  expect(lubecImportItemSupplies({ ...lineageWeapon, takes: undefined }, [], [lineageSupply], command).item).toMatchObject({ takes: undefined, fits: 'custom' })
  expect(lubecImportItemSupplies({ ...lineageWeapon, fits: undefined }, [], [lineageSupply], command).item).toMatchObject({ takes: 'custom', fits: undefined })
})
