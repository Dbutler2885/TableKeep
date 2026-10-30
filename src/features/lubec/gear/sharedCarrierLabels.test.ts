import { describe, expect, it } from 'vitest'
import { emptyLubecGear, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import type { LubecSharedCarrier } from '../../ruleSets/lubec/gear/sharedCarrier'
import { lubecCrossDest, lubecCrossToast, lubecFromCarrierGroups, lubecSharedDeleteText, lubecSharedMoveGroups } from './sharedCarrierLabels'

const carrier = (id: string, name: string, pockets = [{ name: 'Hull', slots: 3, max: 2 }]): LubecSharedCarrier =>
  ({ id, name, type: 'skiff', pockets, ownerCharacterId: 'wayne', items: [] })
const thing = (over: Partial<LubecItem> = {}) => ({ id: 'rope', kind: 'thing', name: 'Rope', note: '', size: 1, weight: 'normal', qty: 1, carrier: 'skiff', pocket: 0, ...over }) as LubecItem
const skiff = carrier('skiff', 'Skiff')

describe('lubecCrossDest', () => {
  it('reads which record a Move-list choice names', () => {
    expect(lubecCrossDest('sheet:backpack#0')).toEqual({ to: 'sheet', dest: 'backpack#0' })
    expect(lubecCrossDest('shared:skiff#1')).toEqual({ to: 'shared', carrierId: 'skiff', dest: 'skiff#1' })
  })

  it('leaves a place in the same record alone', () => {
    expect(lubecCrossDest('backpack#0')).toBeNull()
    expect(lubecCrossDest('skiff#1')).toBeNull()
    expect(lubecCrossDest('drop')).toBeNull()
  })
})

describe('lubecSharedMoveGroups', () => {
  it('is no group at all with no shared carriers', () => {
    expect(lubecSharedMoveGroups([])).toEqual([])
  })

  it('offers every pocket with the room it has', () => {
    const [group] = lubecSharedMoveGroups([skiff, carrier('van', 'Van', [{ name: 'Front', slots: 2, max: 1 }, { name: 'Back', slots: 4, max: 2 }])])
    expect(group.label).toBe('Shared carriers')
    expect(group.options.map((o) => [o.value, o.label])).toEqual([
      ['shared:skiff#0', 'Skiff (3 free)'], ['shared:van#0', 'Van: front (2 free)'], ['shared:van#1', 'Van: back (4 free)'],
    ])
  })
})

describe('lubecFromCarrierGroups', () => {
  const from = { sheet: emptyLubecGear(), open: carrier('skiff', 'Skiff', [{ name: 'Hull', slots: 3, max: 2 }, { name: 'Locker', slots: 1, max: 1 }]), others: [carrier('van', 'Van')] }

  it('reaches the sheet, the other pockets and carriers, and a drop, and not where the thing is', () => {
    const groups = lubecFromCarrierGroups(from, thing())
    expect(groups.map((g) => g.label)).toEqual(['On you', 'Shared carriers', 'Elsewhere'])
    expect(groups[0].options[0]).toMatchObject({ value: 'sheet:backpack#0', disabled: false })
    expect(groups[1].options.map((o) => [o.value, o.disabled])).toEqual([['skiff#0', true], ['skiff#1', false], ['shared:van#0', false]])
  })

  it('lists the sheet\'s personal carriers when it has any', () => {
    const sheet = { ...emptyLubecGear(), carriers: [{ id: 'bag', name: 'Bag', type: 'duffel', pockets: [{ name: 'Main', slots: 8, max: 8 }] }] }
    const groups = lubecFromCarrierGroups({ ...from, sheet }, thing())
    expect(groups[1]).toMatchObject({ label: 'Carriers', options: [{ value: 'sheet:bag#0' }] })
  })
})

describe('lubecCrossToast', () => {
  const gear = emptyLubecGear()

  it('says where the thing is on the sheet, as a move on the sheet does', () => {
    expect(lubecCrossToast(thing(), { to: 'sheet', dest: 'backpack#1' }, gear, [skiff])).toBe('Rope: Backpack, front pocket, left.')
    expect(lubecCrossToast(thing(), { to: 'sheet', dest: 'hands' }, gear, [skiff])).toBe('Rope: Left hand.')
    expect(lubecCrossToast(thing({ size: 0 }), { to: 'sheet', dest: 'backpack#small' }, gear, [skiff])).toBe('Rope: Backpack, small stuff.')
  })

  it('says which carrier it went into', () => {
    expect(lubecCrossToast(thing(), { to: 'shared', carrierId: 'skiff', dest: 'skiff#0' }, gear, [skiff])).toBe('Rope: Skiff.')
    expect(lubecCrossToast(thing(), { to: 'shared', carrierId: 'gone', dest: 'gone#0' }, gear, [skiff])).toBe('Rope: moved.')
  })
})

describe('lubecSharedDeleteText', () => {
  it('counts the things that go to the GM', () => {
    expect(lubecSharedDeleteText({ items: [thing()] })).toBe("1 thing in it will go to the GM's Items tab as dropped.")
    expect(lubecSharedDeleteText({ items: [thing(), thing({ id: 'b' })] })).toBe("2 things in it will go to the GM's Items tab as dropped.")
  })
})
