import { useMemo, useState } from 'react'
import type { NpcRecord, Role } from '../../../types/app'
import { collectTags, filterNpcs, groupNpcs, tagsUsedBy } from '../lib/npcList'

// The roster's search text and tag filter, and what they leave listed.
export function useNpcFilters(npcs: NpcRecord[], role: Role | null) {
  const [searchQuery, setSearchQuery] = useState('')
  const [tagFilter, setTagFilter] = useState('all')
  const allTags = useMemo(() => collectTags(npcs), [npcs])
  const visibleNpcs = useMemo(
    () => filterNpcs(npcs, role, searchQuery, tagFilter),
    [npcs, role, searchQuery, tagFilter],
  )
  const groupedNpcs = useMemo(() => groupNpcs(visibleNpcs, role), [role, visibleNpcs])
  const tagsInUse = useMemo(() => tagsUsedBy(allTags, visibleNpcs), [allTags, visibleNpcs])
  return { searchQuery, setSearchQuery, tagFilter, setTagFilter, allTags, visibleNpcs, groupedNpcs, tagsInUse }
}

export type NpcFilters = ReturnType<typeof useNpcFilters>
