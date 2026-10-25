import { describe, expect, it } from 'vitest'
import type { NpcRecord } from '../../../types/app'
import {
  applySortOrders,
  canEditNpcTags,
  canReorderNpcs,
  collectTags,
  filterNpcs,
  groupDragView,
  groupNpcs,
  matchingTags,
  reorderChanges,
  tagsUsedBy,
} from './npcList'
import { makeNpc } from './npcRecords'

const npc = (id: string, overrides: Partial<NpcRecord> = {}): NpcRecord => ({ ...makeNpc(), id, name: id, ...overrides })

const ids = (npcs: NpcRecord[]) => npcs.map((entry) => entry.id)

const shownA = npc('a', { visibleToPlayers: true, sortOrder: 0, title: 'Smith', tags: ['merchant'] })
const shownB = npc('b', { visibleToPlayers: true, sortOrder: 1, tags: ['guard'] })
const hiddenC = npc('c', { visibleToPlayers: false, sortOrder: 2, tags: ['merchant', 'spy'] })
const hiddenD = npc('d', { visibleToPlayers: false, sortOrder: 3 })
const all = [hiddenD, shownB, hiddenC, shownA]

describe('who may organise NPCs', () => {
  it('lets the GM and players edit tags and reorder, and nobody else', () => {
    expect([canEditNpcTags('gm'), canEditNpcTags('player'), canEditNpcTags(null)]).toEqual([true, true, false])
    expect(canReorderNpcs).toBe(canEditNpcTags)
  })
})

describe('filterNpcs', () => {
  it('shows the GM everything in order, and a player only the shown NPCs', () => {
    expect(ids(filterNpcs(all, 'gm', '', 'all'))).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(filterNpcs(all, 'player', '', 'all'))).toEqual(['a', 'b'])
    expect(ids(filterNpcs(all, null, '', 'all'))).toEqual(['a', 'b'])
  })

  it('narrows by tag and by a trimmed, case-blind search over name, title and tags', () => {
    expect(ids(filterNpcs(all, 'gm', '', 'merchant'))).toEqual(['a', 'c'])
    expect(ids(filterNpcs(all, 'gm', '  SMITH ', 'all'))).toEqual(['a'])
    expect(ids(filterNpcs(all, 'gm', 'spy', 'merchant'))).toEqual(['c'])
    expect(ids(filterNpcs(all, 'gm', 'nobody', 'all'))).toEqual([])
  })
})

describe('groupNpcs', () => {
  it('splits the GM\'s list into shown and GM-only, dropping an empty group', () => {
    expect(groupNpcs([shownA, hiddenC], 'gm').map((group) => [group.label, ids(group.items)])).toEqual([
      ['Shown to Players', ['a']],
      ['GM Only', ['c']],
    ])
    expect(groupNpcs([hiddenC], 'gm').map((group) => group.key)).toEqual(['hidden'])
  })

  it('gives anyone else one unlabelled group', () => {
    expect(groupNpcs([shownA], 'player')).toEqual([{ key: 'all', label: '', items: [shownA] }])
  })
})

describe('tag lists', () => {
  it('collects the distinct tags in order, and keeps those used by the listed NPCs', () => {
    const tags = collectTags(all)
    expect(tags).toEqual(['guard', 'merchant', 'spy'])
    expect(tagsUsedBy(tags, [shownA, shownB])).toEqual(['guard', 'merchant'])
  })

  it('matches tags against a trimmed, lower-cased search, or returns them all', () => {
    const tags = ['guard', 'merchant', 'spy']
    expect(matchingTags(tags, ' ME ')).toEqual(['merchant'])
    expect(matchingTags(tags, '   ')).toBe(tags)
  })
})

describe('reorderChanges', () => {
  const groups = groupNpcs([shownA, shownB, hiddenC, hiddenD], 'gm')

  it('lists only the NPCs whose order changes', () => {
    expect(reorderChanges(groups, 'b', 'a')).toEqual([{ id: 'b', sortOrder: 0 }, { id: 'a', sortOrder: 1 }])
  })

  it('renumbers NPCs that had no order yet', () => {
    const unordered = groupNpcs([npc('x', { visibleToPlayers: true }), npc('y', { visibleToPlayers: true })], 'gm')
    expect(reorderChanges(unordered, 'y', 'x')).toEqual([{ id: 'y', sortOrder: 0 }, { id: 'x', sortOrder: 1 }])
  })

  it('refuses a move across groups, onto itself, or with an unknown NPC', () => {
    expect(reorderChanges(groups, 'a', 'c')).toEqual([])
    expect(reorderChanges(groups, 'a', 'a')).toEqual([])
    expect(reorderChanges(groups, 'x', 'a')).toEqual([])
    expect(reorderChanges(groups, 'a', 'x')).toEqual([])
  })

  it('reports nothing when the move leaves every order as it was', () => {
    expect(reorderChanges(groups, 'a', 'b')).toEqual([])
  })
})

describe('applySortOrders', () => {
  it('sets the new order on the changed NPCs only', () => {
    const list = [shownA, shownB]
    const applied = applySortOrders(list, [{ id: 'b', sortOrder: 7 }])
    expect(applied[0]).toBe(shownA)
    expect(applied[1]).toMatchObject({ id: 'b', sortOrder: 7 })
  })
})

describe('groupDragView', () => {
  const items = [shownA, shownB, npc('e', { visibleToPlayers: true })]

  it('previews the dragged NPC before the one it is over within this group', () => {
    expect(groupDragView(items, 'e', 'a')).toEqual({ draggingInGroup: true, items: [items[2], shownA, shownB] })
  })

  it('leaves the group as it is when the drag or the hover is elsewhere', () => {
    expect(groupDragView(items, 'c', 'a')).toEqual({ draggingInGroup: false, items })
    expect(groupDragView(items, 'a', 'c')).toEqual({ draggingInGroup: true, items })
    expect(groupDragView(items, null, null)).toEqual({ draggingInGroup: false, items })
  })
})
