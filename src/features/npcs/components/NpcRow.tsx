import { Check, Circle, Trash2, UserRound } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import type { NpcRecord, Role } from '../../../types/app'
import type { NpcDragControls } from '../hooks/useNpcDrag'

export type NpcRowActions = {
  onSelect: (npcId: string) => void
  onToggleVisibility: (npc: NpcRecord) => void
  onDelete: (npc: NpcRecord) => void
}

type NpcRowProps = NpcRowActions & {
  npc: NpcRecord
  role: Role | null
  active: boolean
  placeholder: boolean
  drag: NpcDragControls
}

const rowClassName = (active: boolean, draggable: boolean, placeholder: boolean) => [
  'map-row',
  'npc-row',
  active ? 'active' : '',
  draggable ? 'npc-row-draggable' : '',
  placeholder ? 'npc-row-placeholder' : '',
].filter(Boolean).join(' ')

function selectOnKey(event: KeyboardEvent<HTMLElement>, select: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  select()
}

function NpcThumb({ npc }: { npc: NpcRecord }) {
  if (!npc.portraitUrl) {
    return (
      <div className="monster-portrait-empty small">
        <UserRound size={14} />
      </div>
    )
  }
  return (
    <img
      src={npc.portraitUrl}
      alt={`${npc.name} portrait`}
      className="map-thumb"
      draggable={false}
      style={{ objectPosition: `${npc.portraitFocusX}% 0%` }}
    />
  )
}

function NpcVisibilityToggle({ npc, onToggle }: { npc: NpcRecord; onToggle: (npc: NpcRecord) => void }) {
  return (
    <button
      type="button"
      className={npc.visibleToPlayers ? 'map-visibility-btn on' : 'map-visibility-btn'}
      onClick={(event) => {
        event.stopPropagation()
        onToggle(npc)
      }}
      aria-label={npc.visibleToPlayers ? 'Visible to players' : 'Hidden from players'}
    >
      {npc.visibleToPlayers ? <Check size={14} /> : <Circle size={14} />}
    </button>
  )
}

// The GM sees up to three of an NPC's tags on its row.
function NpcRowTags({ npc, role }: { npc: NpcRecord; role: Role | null }) {
  if (role !== 'gm' || npc.tags.length === 0) return null
  return (
    <div className="item-faction-tag-list">
      {npc.tags.slice(0, 3).map((tag) => (
        <span key={tag} className="item-tag">{tag}</span>
      ))}
    </div>
  )
}

function NpcRowMeta({ npc, role }: { npc: NpcRecord; role: Role | null }) {
  return (
    <div className="map-meta">
      <strong>{npc.name || 'Unnamed NPC'}</strong>
      <p className="monster-card-statline">{npc.title || 'No title'}</p>
      <NpcRowTags npc={npc} role={role} />
    </div>
  )
}

function NpcDeleteButton({ npc, onDelete }: { npc: NpcRecord; onDelete: (npc: NpcRecord) => void }) {
  return (
    <button
      type="button"
      className="map-delete-btn character-card-delete-btn"
      onClick={() => onDelete(npc)}
      aria-label={`Delete ${npc.name || 'NPC'}`}
    >
      <Trash2 size={14} />
    </button>
  )
}

function NpcRowContent({ npc, role, onSelect, onToggleVisibility, onDelete }: NpcRowActions & { npc: NpcRecord; role: Role | null }) {
  return (
    <>
      <div
        className="map-select"
        role="button"
        tabIndex={0}
        onClick={() => onSelect(npc.id)}
        onKeyDown={(event) => selectOnKey(event, () => onSelect(npc.id))}
      >
        <div className="map-thumb-column">
          <div className="map-thumb-wrap">
            <NpcThumb npc={npc} />
          </div>
          {role === 'gm' ? <NpcVisibilityToggle npc={npc} onToggle={onToggleVisibility} /> : null}
        </div>
        <NpcRowMeta npc={npc} role={role} />
      </div>
      {role === 'gm' ? <NpcDeleteButton npc={npc} onDelete={onDelete} /> : null}
    </>
  )
}

// One roster row. While dragged it stays in place as an empty placeholder of
// the row's height.
export function NpcRow({ npc, role, active, placeholder, drag, ...actions }: NpcRowProps) {
  const { dragHeight } = drag.drag
  return (
    <div
      className={rowClassName(active, drag.canReorder, placeholder)}
      style={placeholder && dragHeight ? { height: dragHeight } : undefined}
      draggable={drag.canReorder}
      onDragStart={(event) => drag.row.start(npc.id, event)}
      onDragOver={(event) => drag.row.over(npc.id, event)}
      onDrop={(event) => drag.row.drop(npc.id, event)}
      onDragEnd={() => drag.row.end()}
    >
      {placeholder ? null : <NpcRowContent npc={npc} role={role} {...actions} />}
    </div>
  )
}
