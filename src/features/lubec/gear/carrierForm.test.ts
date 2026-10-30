/** The add-carrier dialog's state, as B's `applyType`, `readPockets` and `pocketNote` work. */
import { describe, expect, it } from 'vitest'
import { LUBEC_CARRIER_TYPES } from '../../ruleSets/lubec/gear/carriers'
import { lubecCarrierDraftOf, lubecCarrierFormAt, lubecCarrierFormOf, lubecNewPocketRow, lubecOfferedKind, lubecPocketNote, lubecReadPockets } from './carrierForm'

describe('the add-carrier form', () => {
  it('takes a preset\'s name and pockets, and starts on the first preset for an unknown one', () => {
    expect(lubecCarrierFormOf('locker')).toEqual({ type: 'locker', name: 'School locker', pockets: [{ name: 'Locker', slots: '6', max: 4 }, { name: 'Top shelf', slots: '2', max: 1 }], kind: 'personal', error: null })
    expect(lubecCarrierFormOf('other').name).toBe('')
    expect(lubecCarrierFormOf('wagon').type).toBe('school-bag')
    expect(lubecNewPocketRow()).toEqual({ name: 'Pocket', slots: '2', max: 1 })
  })

  it('offers Hidden first for the stash preset, and only that one', () => {
    expect(lubecCarrierFormOf('stash').kind).toBe('hidden')
    expect(LUBEC_CARRIER_TYPES.filter((t) => lubecCarrierFormOf(t.id).kind === 'hidden').map((t) => t.id)).toEqual(['stash'])
  })

  it('moves between presets as B does, and keeps a choice to share', () => {
    const stash = lubecCarrierFormOf('stash')
    expect(lubecCarrierFormAt(stash, 'duffel').kind).toBe('personal')
    expect(lubecCarrierFormAt({ ...stash, kind: 'shared' }, 'duffel').kind).toBe('shared')
    expect(lubecCarrierFormAt({ ...stash, kind: 'shared' }, 'stash').kind).toBe('hidden')
  })

  it('stands on the first kind offered where its preset\'s kind is not offered, as on an NPC', () => {
    expect(lubecOfferedKind(lubecCarrierFormOf('stash'), ['personal', 'hidden'])).toBe('hidden')
    expect(lubecOfferedKind(lubecCarrierFormOf('stash'), ['personal'])).toBe('personal')
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
