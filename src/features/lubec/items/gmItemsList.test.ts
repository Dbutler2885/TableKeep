/**
 * What the GM Items tab shows (spec 8.2): the two lists newest first, each
 * row's line and tags, the card's facts read off anyone, and the campaign
 * items as the picker's "This campaign" (spec 8.4).
 */
import { describe, expect, it } from 'vitest'
import { parseLubecGmItem } from '../../ruleSets/lubec/gear/gmItem'
import { lubecDroppedLine, lubecGmItemById, lubecGmItemFacts, lubecItemsGroups, lubecItemsRowLine, lubecItemsRowTags, lubecLibraryStock } from './gmItemsList'

const at = (seconds: number) => ({ createdAt: { seconds, nanoseconds: 0 } })
const item = (id: string, fields: Record<string, unknown>) => parseLubecGmItem({ id, kind: 'thing', name: id, size: 1, qty: 1, weight: 'normal', note: '', ...fields }, id)

const rope = item('rope', { status: 'library', stock: 'Coil of rope', ...at(1) })
const lantern = item('lantern', { status: 'library', size: 2, ...at(3) })
const anvil = item('anvil', { status: 'dropped', weight: 'heavy', droppedByCharacterName: 'Wayne Gardner', droppedFrom: 'backpack', ...at(2) })
const pending = item('cap', { status: 'dropped', qty: 3, size: 0 })

describe('the two lists', () => {
  it('shows the campaign items, then the dropped items, each newest first, with a write on its way as the newest', () => {
    expect(lubecItemsGroups([rope, anvil, lantern, pending], 'all').map((g) => [g.title, g.list.map((i) => i.id)])).toEqual([
      ['Campaign items', ['lantern', 'rope']],
      ['Dropped', ['cap', 'anvil']],
    ])
  })

  it('shows one list when its chip is picked', () => {
    expect(lubecItemsGroups([rope, anvil], 'dropped').map((g) => g.status)).toEqual(['dropped'])
    expect(lubecItemsGroups([rope, anvil], 'library').map((g) => g.status)).toEqual(['library'])
  })
})

describe('a row', () => {
  it('says who dropped a dropped item and from where, and where a campaign item came from', () => {
    expect(lubecItemsRowLine(anvil)).toBe('Dropped by Wayne Gardner, from backpack.')
    expect(lubecItemsRowLine(rope)).toBe('From stock: Coil of rope')
    expect(lubecItemsRowLine(lantern)).toBe('Made by hand')
  })

  it('leaves out who or where when the drop did not say', () => {
    expect(lubecDroppedLine(item('x', { status: 'dropped' }))).toBe('Dropped.')
    expect(lubecDroppedLine(item('x', { status: 'dropped', droppedFrom: 'hands' }))).toBe('Dropped, from hands.')
  })

  it('carries the kind, the size, a heavy weight and how many, in B\'s colors', () => {
    expect(lubecItemsRowTags(anvil)).toEqual([{ text: 'Thing', tone: 'blue' }, { text: '1 slot', tone: 'ghost' }, { text: 'Heavy', tone: 'red' }])
    expect(lubecItemsRowTags(lantern).map((t) => t.text)).toEqual(['Thing', '2 slots'])
    expect(lubecItemsRowTags(pending).map((t) => t.text)).toEqual(['Thing', 'Small', '×3'])
  })
})

describe('the card\'s facts', () => {
  it('say which list it is in, in place of where it is on a sheet', () => {
    expect(lubecGmItemFacts(anvil).map((f) => [f.term, f.text])).toEqual([
      ['Size', 'Normal, 1 slot'],
      ['Weight', 'Heavy, so it takes both hands to hold. No effect while it stays here.'],
      ['Where', 'Dropped'],
    ])
  })

  it('leave out what only a carrier has: a weapon\'s handling against their Strength, and how much more is on them', () => {
    const revolver = item('revolver', {
      status: 'library', kind: 'weapon', mode: 'firearm', impact: 1, table: 'gunshot', wounds: ['gun'], capacity: 6, loaded: 0, takes: 'a38', minStrength: 30,
    })
    const facts = lubecGmItemFacts(revolver)
    expect(facts.map((f) => f.term)).not.toContain('Handle')
    expect(facts.map((f) => f.term)).not.toContain('Penalty')
    expect(facts.find((f) => f.term === 'Strength')?.text).toBe('Needs 30.')
    expect(facts.find((f) => f.term === 'Takes')?.text).toBe('.38 rounds')
    expect(facts.some((f) => f.step || f.check || f.missing)).toBe(false)
  })
})

describe('the picker\'s "This campaign"', () => {
  it('is the campaign items only, oldest first, each under its own id', () => {
    expect(lubecLibraryStock([lantern, anvil, rope]).map((x) => [x.sid, x.name])).toEqual([['rope', 'rope'], ['lantern', 'lantern']])
  })
})

describe('finding the chosen item', () => {
  it('finds it by id, and is null while the items load, with none chosen, or once it is gone', () => {
    expect(lubecGmItemById([rope, anvil], 'anvil')).toBe(anvil)
    expect(lubecGmItemById(null, 'anvil')).toBeNull()
    expect(lubecGmItemById([rope], null)).toBeNull()
    expect(lubecGmItemById([rope], 'anvil')).toBeNull()
  })
})
