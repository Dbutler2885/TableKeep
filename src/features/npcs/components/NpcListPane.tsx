import { Plus } from 'lucide-react'
import type { RefObject } from 'react'
import type { Role } from '../../../types/app'
import type { NpcDragControls } from '../hooks/useNpcDrag'
import type { NpcFilters } from '../hooks/useNpcFilters'
import type { NpcGroup } from '../lib/npcList'
import { groupDragView } from '../lib/npcList'
import type { NpcRowActions } from './NpcRow'
import { NpcRow } from './NpcRow'
import { NpcTagFilter } from './NpcTagFilter'

type NpcListGroupProps = NpcRowActions & {
  group: NpcGroup
  role: Role | null
  selectedNpcId: string
  drag: NpcDragControls
}

function NpcListGroup({ group, role, selectedNpcId, drag, ...actions }: NpcListGroupProps) {
  const { draggingNpcId, dragOverNpcId } = drag.drag
  const view = groupDragView(group.items, draggingNpcId, dragOverNpcId)
  return (
    <div className="npc-group-block">
      {group.label ? <p className="npc-group-label">{group.label}</p> : null}
      {view.items.map((npc) => (
        <NpcRow
          key={npc.id}
          npc={npc}
          role={role}
          active={npc.id === selectedNpcId}
          placeholder={view.draggingInGroup && draggingNpcId === npc.id}
          drag={drag}
          {...actions}
        />
      ))}
    </div>
  )
}

type NpcListPaneProps = NpcRowActions & {
  role: Role | null
  filters: NpcFilters
  selectedNpcId: string
  drag: NpcDragControls
  listRef: RefObject<HTMLDivElement | null>
  onAdd: () => void
}

// The roster: header, search and tag filter, and the grouped NPC rows.
export function NpcListPane({ role, filters, selectedNpcId, drag, listRef, onAdd, ...actions }: NpcListPaneProps) {
  return (
    <aside
      className="maps-sidebar monsters-sidebar characters-sidebar"
      onDragOver={drag.list.onDragOver}
      onDrop={drag.list.onDrop}
    >
      <div className="maps-sidebar-header">
        <h2>NPCs</h2>
        {role === 'gm' ? (
          <button
            type="button"
            className="monster-add-btn"
            onClick={onAdd}
            aria-label="Add NPC"
          >
            <Plus size={16} />
          </button>
        ) : null}
      </div>
      <div className="npc-filter-bar">
        <input
          type="search"
          value={filters.searchQuery}
          onChange={(event) => filters.setSearchQuery(event.target.value)}
          placeholder="Search NPCs"
          aria-label="Search NPCs"
        />
        <NpcTagFilter tagFilter={filters.tagFilter} tagsInUse={filters.tagsInUse} onChange={filters.setTagFilter} />
      </div>
      {filters.visibleNpcs.length === 0 ? <p>No NPCs match the current filters.</p> : null}
      <div className="monster-list-grid character-list-grid" ref={listRef}>
        {filters.groupedNpcs.map((group) => (
          <NpcListGroup key={group.key} group={group} role={role} selectedNpcId={selectedNpcId} drag={drag} {...actions} />
        ))}
      </div>
    </aside>
  )
}
