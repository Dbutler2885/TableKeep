// What the roster shows: search and tag filtering, the GM's visibility groups,
// tag lists, and reordering. Pure functions over NpcRecords.
import type { NpcRecord, Role } from '../../../types/app'
import { byOrder, moveBefore } from './npcRecords'

export type NpcGroup = {
  key: string
  label: string
  items: NpcRecord[]
}

export type SortOrderChange = {
  id: string
  sortOrder: number
}

export const canEditNpcTags = (role: Role | null) => role === 'gm' || role === 'player'

// The same viewers may drag NPCs into a new order.
export const canReorderNpcs = canEditNpcTags

export const collectTags = (npcs: NpcRecord[]) =>
  Array.from(new Set(npcs.flatMap((npc) => npc.tags))).sort((a, b) => a.localeCompare(b))

// Tags containing the search text, or every tag when the search is blank.
export const matchingTags = (tags: string[], search: string) => {
  const needle = search.trim().toLowerCase()
  return needle ? tags.filter((tag) => tag.includes(needle)) : tags
}

const hiddenFrom = (npc: NpcRecord, role: Role | null) => role !== 'gm' && !npc.visibleToPlayers

const outsideTag = (npc: NpcRecord, tagFilter: string) => tagFilter !== 'all' && !npc.tags.includes(tagFilter)

const matchesQuery = (npc: NpcRecord, query: string) => {
  if (!query) return true
  return [npc.name, npc.title, npc.tags.join(' ')].join(' ').toLowerCase().includes(query)
}

export function filterNpcs(npcs: NpcRecord[], role: Role | null, searchQuery: string, tagFilter: string) {
  const query = searchQuery.trim().toLowerCase()
  return npcs
    .filter((npc) => !hiddenFrom(npc, role) && !outsideTag(npc, tagFilter) && matchesQuery(npc, query))
    .sort(byOrder)
}

export function groupNpcs(visibleNpcs: NpcRecord[], role: Role | null): NpcGroup[] {
  if (role !== 'gm') return [{ key: 'all', label: '', items: visibleNpcs }]
  return [
    { key: 'shown', label: 'Shown to Players', items: visibleNpcs.filter((npc) => npc.visibleToPlayers) },
    { key: 'hidden', label: 'GM Only', items: visibleNpcs.filter((npc) => !npc.visibleToPlayers) },
  ].filter((group) => group.items.length > 0)
}

export function tagsUsedBy(allTags: string[], npcs: NpcRecord[]) {
  const used = new Set(npcs.flatMap((npc) => npc.tags))
  return allTags.filter((tag) => used.has(tag))
}

// A drag only reorders within one visibility group.
const sameGroupPair = (sequence: NpcRecord[], sourceId: string, targetId: string) => {
  const source = sequence.find((npc) => npc.id === sourceId)
  const target = sequence.find((npc) => npc.id === targetId)
  return Boolean(source && target && source.visibleToPlayers === target.visibleToPlayers)
}

const changedSortOrders = (sequence: NpcRecord[], reordered: NpcRecord[]): SortOrderChange[] =>
  reordered
    .map((npc, index) => ({ id: npc.id, sortOrder: index }))
    .filter(({ id, sortOrder }) => sequence.find((npc) => npc.id === id)?.sortOrder !== sortOrder)

// The sort orders that change when `sourceId` moves before `targetId` in the
// displayed sequence (groups in display order).
export function reorderChanges(groups: NpcGroup[], sourceId: string, targetId: string): SortOrderChange[] {
  const sequence = groups.flatMap((group) => group.items)
  if (sourceId === targetId || !sameGroupPair(sequence, sourceId, targetId)) return []
  return changedSortOrders(sequence, moveBefore(sequence, sourceId, targetId))
}

const sortOrderFor = (changes: SortOrderChange[], npcId: string) => changes.find((change) => change.id === npcId)

export const applySortOrders = (npcs: NpcRecord[], changes: SortOrderChange[]) =>
  npcs.map((npc) => {
    const change = sortOrderFor(changes, npc.id)
    return change ? { ...npc, sortOrder: change.sortOrder } : npc
  })

// How one group renders mid-drag: the dragged NPC previewed before the row it
// is over, when both are in this group.
export function groupDragView(items: NpcRecord[], draggingNpcId: string | null, dragOverNpcId: string | null) {
  const draggingInGroup = items.some((npc) => npc.id === draggingNpcId)
  const overInGroup = items.some((npc) => npc.id === dragOverNpcId)
  return {
    draggingInGroup,
    items: draggingInGroup && overInGroup ? moveBefore(items, draggingNpcId, dragOverNpcId) : items,
  }
}
