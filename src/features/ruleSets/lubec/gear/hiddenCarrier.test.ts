/** Finding the hidden carrier a place is in (spec 4.4). */
import { describe, expect, it } from 'vitest'
import { parseLubecCarrierRecord } from './gearRecord'
import { lubecHiddenAt } from './hiddenCarrier'

const stash = parseLubecCarrierRecord({ name: 'Cigar box', type: 'stash', pockets: [{ name: 'Box', slots: 2, max: 1 }] }, 'stash')

describe('a hidden carrier', () => {
  it('is found from a place in it, and a place on the character finds none', () => {
    expect(lubecHiddenAt([stash], 'stash')).toBe(stash)
    expect(lubecHiddenAt([stash], 'stash#1')).toBe(stash)
    expect(lubecHiddenAt([stash], 'backpack#0')).toBeNull()
    expect(lubecHiddenAt([], 'stash')).toBeNull()
  })
})
