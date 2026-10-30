/** The add-carrier dialog's state, as B's `applyType`, `readPockets` and `pocketNote` work. */
import { describe, expect, it } from 'vitest'
import { lubecCarrierDraftOf, lubecCarrierFormOf, lubecNewPocketRow, lubecPocketNote, lubecReadPockets } from './carrierForm'

describe('the add-carrier form', () => {
  it('takes a preset\'s name and pockets, and starts on the first preset for an unknown one', () => {
    expect(lubecCarrierFormOf('locker')).toEqual({ type: 'locker', name: 'School locker', pockets: [{ name: 'Locker', slots: '6', max: 4 }, { name: 'Top shelf', slots: '2', max: 1 }], error: null })
    expect(lubecCarrierFormOf('other').name).toBe('')
    expect(lubecCarrierFormOf('wagon').type).toBe('school-bag')
    expect(lubecNewPocketRow()).toEqual({ name: 'Pocket', slots: '2', max: 1 })
  })

  it('reads a blank pocket name as "Pocket" and rounds the slots', () => {
    expect(lubecReadPockets([{ name: '  ', slots: '2.6', max: 2 }, { name: 'Hull', slots: '', max: 8 }])).toEqual([{ name: 'Pocket', slots: 3, max: 2 }, { name: 'Hull', slots: 0, max: 8 }])
    expect(lubecCarrierDraftOf({ ...lubecCarrierFormOf('duffel'), name: 'Kit bag' })).toEqual({ type: 'duffel', name: 'Kit bag', pockets: [{ name: 'Main', slots: 8, max: 8 }] })
  })

  it('totals the pockets, and says over 24 slots that it is effectively unlimited (Rule C4)', () => {
    expect(lubecPocketNote(lubecCarrierFormOf('school-bag').pockets)).toBe('5 slots in 2 pockets. A thing has to fit inside one pocket.')
    expect(lubecPocketNote([{ name: 'Box', slots: '1', max: 1 }])).toBe('1 slot in 1 pocket. A thing has to fit inside one pocket.')
    expect(lubecPocketNote(lubecCarrierFormOf('skiff').pockets)).toBe('40 slots in 1 pocket. A thing has to fit inside one pocket. Effectively unlimited; big things are settled at the table.')
    expect(lubecPocketNote([{ name: 'Box', slots: 'x', max: 1 }])).toBe('0 slots in 1 pocket. A thing has to fit inside one pocket.')
  })
})
