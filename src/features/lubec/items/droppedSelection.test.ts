/**
 * Picking dropped items in the GM Items tab: only dropped items are picked,
 * the select-all checkbox reads all, some or none, a picked item that is no
 * longer dropped falls out, and deleting asks by name or by count.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecGmItem } from '../../ruleSets/lubec/gear/gmItem'
import { lubecBulkDeletedText, lubecBulkDeleteLine, lubecDroppedIds, lubecKeepDropped, lubecSelectAllState } from './droppedSelection'

const item = (id: string, status: string) => parseLubecGmItem({ id, kind: 'thing', name: `The ${id}`, size: 1, qty: 1, weight: 'normal', note: '', status }, id)

const rope = item('rope', 'library')
const anvil = item('anvil', 'dropped')
const cap = item('cap', 'dropped')

describe('which items can be picked', () => {
  it('is the dropped items only', () => {
    expect(lubecDroppedIds([rope, anvil, cap])).toEqual(['anvil', 'cap'])
  })

  it('forgets a picked item once it is no longer dropped', () => {
    expect(lubecKeepDropped(['anvil', 'cap', 'rope'], ['cap'])).toEqual(['cap'])
  })
})

describe('the select-all checkbox', () => {
  it('is ticked when every dropped item is, part-ticked when some are, and clear when none are', () => {
    expect(lubecSelectAllState(['anvil', 'cap'], ['cap', 'anvil'])).toBe('all')
    expect(lubecSelectAllState(['anvil', 'cap'], ['cap'])).toBe('some')
    expect(lubecSelectAllState(['anvil', 'cap'], [])).toBe('none')
  })

  it('counts only picks that are still dropped', () => {
    expect(lubecSelectAllState(['anvil'], ['anvil', 'gone'])).toBe('all')
    expect(lubecSelectAllState(['anvil'], ['gone'])).toBe('none')
    expect(lubecSelectAllState([], [])).toBe('none')
  })
})

describe('deleting the picked items', () => {
  it('asks by name for one and by count for several', () => {
    expect(lubecBulkDeleteLine([anvil])).toBe('The anvil leaves the game. Nobody can get it back.')
    expect(lubecBulkDeleteLine([anvil, cap])).toBe('2 dropped items leave the game. Nobody can get them back.')
  })

  it('says what went', () => {
    expect(lubecBulkDeletedText([anvil])).toBe('Deleted The anvil.')
    expect(lubecBulkDeletedText([anvil, cap])).toBe('Deleted 2 dropped items.')
  })
})
